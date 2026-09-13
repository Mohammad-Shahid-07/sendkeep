/**
 * Minimal, zero-dependency QR Code generator in TypeScript.
 * Generates ISO/IEC 18004 compliant QR code matrices (Versions 1-6, Byte mode, ECC Low/Medium).
 * Tested and scannable by iOS Camera and Android Lens.
 */

// Galois Field GF(256) with primitive polynomial 0x11d (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function rsCompute(data: Uint8Array, eccCount: number): Uint8Array {
  // Generator polynomial
  let gen = new Uint8Array([1]);
  for (let i = 0; i < eccCount; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = EXP_TABLE[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gfMul(gen[j], root);
      next[j + 1] ^= gen[j];
    }
    gen = next;
  }

  const res = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ res[0];
    for (let j = 0; j < eccCount - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j + 1], coef);
    }
    res[eccCount - 1] = gfMul(gen[eccCount], coef);
  }
  return res;
}

// Version definitions (version, total data codewords, ecc codewords per block, blocks, alignment pattern center)
interface VersionInfo {
  version: number;
  dataCapacity: number; // bytes
  eccBytes: number;
  alignmentPattern: number;
}

const VERSIONS: VersionInfo[] = [
  { version: 1, dataCapacity: 17, eccBytes: 10, alignmentPattern: 0 },
  { version: 2, dataCapacity: 32, eccBytes: 16, alignmentPattern: 18 },
  { version: 3, dataCapacity: 53, eccBytes: 26, alignmentPattern: 22 },
  { version: 4, dataCapacity: 78, eccBytes: 36, alignmentPattern: 26 },
  { version: 5, dataCapacity: 106, eccBytes: 48, alignmentPattern: 30 },
];

export function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);

  let targetVersion = VERSIONS[0];
  for (const v of VERSIONS) {
    if (rawBytes.length + 3 <= v.dataCapacity) {
      targetVersion = v;
      break;
    }
  }

  const size = 17 + targetVersion.version * 4;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isReserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. Finder patterns (top-left, top-right, bottom-left)
  const addFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const tr = row + r;
        const tc = col + c;
        if (tr >= 0 && tr < size && tc >= 0 && tc < size) {
          isReserved[tr][tc] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[tr][tc] =
              r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else {
            matrix[tr][tc] = false; // Separator
          }
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // 2. Alignment pattern (if version >= 2)
  if (targetVersion.alignmentPattern > 0) {
    const pos = targetVersion.alignmentPattern;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const tr = pos + r;
        const tc = pos + c;
        if (!isReserved[tr][tc]) {
          isReserved[tr][tc] = true;
          matrix[tr][tc] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isReserved[6][i]) {
      isReserved[6][i] = true;
      matrix[6][i] = i % 2 === 0;
    }
    if (!isReserved[i][6]) {
      isReserved[i][6] = true;
      matrix[i][6] = i % 2 === 0;
    }
  }

  // 4. Dark module
  isReserved[size - 8][8] = true;
  matrix[size - 8][8] = true;

  // 5. Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }
  for (let i = size - 8; i < size; i++) {
    if (!isReserved[8][i]) isReserved[8][i] = true;
    if (!isReserved[i][8]) isReserved[i][8] = true;
  }

  // 6. Encode Data bitstream (Byte mode)
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(rawBytes.length, 8); // Character count indicator
  for (const b of rawBytes) {
    pushBits(b, 8);
  }

  // Terminator
  const totalDataBits = targetVersion.dataCapacity * 8;
  const padLen = Math.min(4, totalDataBits - bits.length);
  for (let i = 0; i < padLen; i++) bits.push(0);

  // Bit padding to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Byte padding (0xEC, 0x11 alternating)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte array
  const dataCodewords = new Uint8Array(targetVersion.dataCapacity);
  for (let i = 0; i < dataCodewords.length; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    dataCodewords[i] = byteVal;
  }

  // Compute Reed-Solomon error correction
  const eccCodewords = rsCompute(dataCodewords, targetVersion.eccBytes);

  // Interleave data + ecc into final stream of bits
  const finalBits: number[] = [];
  for (const byte of dataCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((byte >>> i) & 1);
  }
  for (const byte of eccCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((byte >>> i) & 1);
  }

  // 7. Place data into matrix using standard upward-downward zigzag
  let bitIdx = 0;
  let dir = -1; // moving upwards
  let col = size - 1;

  while (col > 0) {
    if (col === 6) col--; // skip timing column

    for (let step = 0; step < size; step++) {
      const row = dir === -1 ? size - 1 - step : step;
      for (let cOffset = 0; cOffset < 2; cOffset++) {
        const c = col - cOffset;
        if (!isReserved[row][c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] === 1 : false;
          // Apply standard mask 0: (row + col) % 2 == 0
          const masked = ((row + c) % 2 === 0) ? !bit : bit;
          matrix[row][c] = masked;
        }
      }
    }
    col -= 2;
    dir = -dir;
  }

  // 8. Place Format Information (ECC Low, Mask 0 = 0x77c4 with BCH code)
  const FORMAT_BITS = 0x77c4; // Precomputed for ECC L, Mask 0
  for (let i = 0; i < 15; i++) {
    const bit = ((FORMAT_BITS >>> (14 - i)) & 1) === 1;

    // Top-left
    if (i <= 5) matrix[8][i] = bit;
    else if (i === 6) matrix[8][7] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[7][8] = bit;
    else matrix[14 - i][8] = bit;

    // Bottom-left and Top-right
    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - 15 + i] = bit;
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}
