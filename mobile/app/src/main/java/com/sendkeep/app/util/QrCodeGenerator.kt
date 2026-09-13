package com.sendkeep.app.util

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Minimal, zero-dependency QR Code generator in pure Kotlin.
 * Generates ISO/IEC 18004 compliant QR code matrices (Versions 1-5, Byte mode, ECC Low).
 * Scannable by iOS Camera and Android Lens without external libraries.
 */
object QrCodeGenerator {

    private val EXP_TABLE = IntArray(512)
    private val LOG_TABLE = IntArray(256)

    init {
        var x = 1
        for (i in 0 until 255) {
            EXP_TABLE[i] = x
            EXP_TABLE[i + 255] = x
            LOG_TABLE[x] = i
            x = x shl 1
            if ((x and 0x100) != 0) x = x xor 0x11d
        }
    }

    private fun gfMul(x: Int, y: Int): Int {
        if (x == 0 || y == 0) return 0
        return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]]
    }

    private fun rsCompute(data: ByteArray, eccCount: Int): ByteArray {
        var gen = intArrayOf(1)
        for (i in 0 until eccCount) {
            val next = IntArray(gen.size + 1)
            val root = EXP_TABLE[i]
            for (j in gen.indices) {
                next[j] = next[j] xor gfMul(gen[j], root)
                next[j + 1] = next[j + 1] xor gen[j]
            }
            gen = next
        }

        val res = IntArray(eccCount)
        for (i in data.indices) {
            val b = data[i].toInt() and 0xFF
            val coef = b xor res[0]
            for (j in 0 until eccCount - 1) {
                res[j] = res[j + 1] xor gfMul(gen[j + 1], coef)
            }
            res[eccCount - 1] = gfMul(gen[eccCount], coef)
        }

        return ByteArray(eccCount) { res[it].toByte() }
    }

    private data class VersionInfo(
        val version: Int,
        val dataCapacity: Int,
        val eccBytes: Int,
        val alignmentPattern: Int
    )

    private val VERSIONS = listOf(
        VersionInfo(1, 17, 10, 0),
        VersionInfo(2, 32, 16, 18),
        VersionInfo(3, 53, 26, 22),
        VersionInfo(4, 78, 36, 26),
        VersionInfo(5, 106, 48, 30)
    )

    fun generate(text: String): Array<BooleanArray> {
        val rawBytes = text.toByteArray(Charsets.UTF_8)
        var targetVersion = VERSIONS[0]
        for (v in VERSIONS) {
            if (rawBytes.size + 3 <= v.dataCapacity) {
                targetVersion = v
                break
            }
        }

        val size = 17 + targetVersion.version * 4
        val matrix = Array(size) { BooleanArray(size) }
        val isReserved = Array(size) { BooleanArray(size) }

        // 1. Finder patterns
        fun addFinder(row: Int, col: Int) {
            for (r in -1..7) {
                for (c in -1..7) {
                    val tr = row + r
                    val tc = col + c
                    if (tr in 0 until size && tc in 0 until size) {
                        isReserved[tr][tc] = true
                        if (r in 0..6 && c in 0..6) {
                            matrix[tr][tc] = r == 0 || r == 6 || c == 0 || c == 6 || (r in 2..4 && c in 2..4)
                        } else {
                            matrix[tr][tc] = false
                        }
                    }
                }
            }
        }

        addFinder(0, 0)
        addFinder(0, size - 7)
        addFinder(size - 7, 0)

        // 2. Alignment pattern
        if (targetVersion.alignmentPattern > 0) {
            val pos = targetVersion.alignmentPattern
            for (r in -2..2) {
                for (c in -2..2) {
                    val tr = pos + r
                    val tc = pos + c
                    if (!isReserved[tr][tc]) {
                        isReserved[tr][tc] = true
                        matrix[tr][tc] = max(abs(r), abs(c)) != 1
                    }
                }
            }
        }

        // 3. Timing patterns
        for (i in 8 until size - 8) {
            if (!isReserved[6][i]) {
                isReserved[6][i] = true
                matrix[6][i] = i % 2 == 0
            }
            if (!isReserved[i][6]) {
                isReserved[i][6] = true
                matrix[i][6] = i % 2 == 0
            }
        }

        // 4. Dark module
        isReserved[size - 8][8] = true
        matrix[size - 8][8] = true

        // 5. Reserve format information areas
        for (i in 0..8) {
            isReserved[8][i] = true
            isReserved[i][8] = true
        }
        for (i in size - 8 until size) {
            isReserved[8][i] = true
            isReserved[i][8] = true
        }

        // 6. Encode Data bitstream (Byte mode)
        val bits = mutableListOf<Int>()
        fun pushBits(value: Int, len: Int) {
            for (i in len - 1 downTo 0) {
                bits.add((value ushr i) and 1)
            }
        }

        pushBits(4, 4) // Byte mode indicator
        pushBits(rawBytes.size, 8) // Length indicator
        for (b in rawBytes) {
            pushBits(b.toInt() and 0xFF, 8)
        }

        // Terminator
        val totalDataBits = targetVersion.dataCapacity * 8
        val padLen = min(4, totalDataBits - bits.size)
        for (i in 0 until padLen) bits.add(0)

        // Byte boundary pad
        while (bits.size % 8 != 0) bits.add(0)

        // Alternate padding (0xEC, 0x11)
        val padBytes = intArrayOf(0xEC, 0x11)
        var padIdx = 0
        while (bits.size < totalDataBits) {
            pushBits(padBytes[padIdx % 2], 8)
            padIdx++
        }

        val dataCodewords = ByteArray(targetVersion.dataCapacity)
        for (i in dataCodewords.indices) {
            var byteVal = 0
            for (b in 0..7) {
                byteVal = (byteVal shl 1) or bits[i * 8 + b]
            }
            dataCodewords[i] = byteVal.toByte()
        }

        val eccCodewords = rsCompute(dataCodewords, targetVersion.eccBytes)

        val finalBits = mutableListOf<Int>()
        for (byte in dataCodewords) {
            val v = byte.toInt() and 0xFF
            for (i in 7 downTo 0) finalBits.add((v ushr i) and 1)
        }
        for (byte in eccCodewords) {
            val v = byte.toInt() and 0xFF
            for (i in 7 downTo 0) finalBits.add((v ushr i) and 1)
        }

        // 7. Place into matrix using zigzag
        var bitIdx = 0
        var dir = -1
        var col = size - 1

        while (col > 0) {
            if (col == 6) col--
            for (step in 0 until size) {
                val row = if (dir == -1) size - 1 - step else step
                for (cOffset in 0..1) {
                    val c = col - cOffset
                    if (!isReserved[row][c]) {
                        val bit = if (bitIdx < finalBits.size) finalBits[bitIdx++] == 1 else false
                        // Standard mask 0: (row + col) % 2 == 0
                        matrix[row][c] = if ((row + c) % 2 == 0) !bit else bit
                    }
                }
            }
            col -= 2
            dir = -dir
        }

        // 8. Format Information (ECC Low, Mask 0 = 0x77c4)
        val formatBits = 0x77c4
        for (i in 0..14) {
            val bit = ((formatBits ushr (14 - i)) and 1) == 1
            if (i <= 5) matrix[8][i] = bit
            else if (i == 6) matrix[8][7] = bit
            else if (i == 7) matrix[8][8] = bit
            else if (i == 8) matrix[7][8] = bit
            else matrix[14 - i][8] = bit

            if (i < 8) matrix[size - 1 - i][8] = bit
            else matrix[8][size - 15 + i] = bit
        }

        return matrix
    }
}
