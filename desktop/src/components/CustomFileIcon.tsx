import { useId, useEffect, useState, type SVGProps, type JSX } from 'react'
import { getFileKind, getFileKindByExt, extOf, type FileKind } from '../lib/fileType'

export interface CustomFileIconProps extends SVGProps<SVGSVGElement> {
  ext?: string
  path?: string
  kind?: FileKind
  isDirectory?: boolean
  isFolder?: boolean
  width?: number | string
  height?: number | string
}

/** Micro-mode simplified outline icons for tiny sizes (width <= 16px) */
function renderMicroIcon(kind: FileKind, color: string): JSX.Element {
  switch (kind) {
    case 'folder':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </g>
      )
    case 'image':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" fill={color} />
          <path d="m21 15-5-5L5 21" />
        </g>
      )
    case 'video':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <polygon points="10,8 16,12 10,16" fill={color} />
        </g>
      )
    case 'audio':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill={color} />
          <circle cx="18" cy="16" r="3" fill={color} />
        </g>
      )
    case 'code':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </g>
      )
    case 'archive':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
          <rect x="10" y="8" width="4" height="5" rx="1" fill={color} />
        </g>
      )
    case 'excel':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </g>
      )
    case 'apk':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M5 13a7 7 0 0 1 14 0Z" />
          <line x1="8.5" y1="9" x2="7" y2="6.5" />
          <line x1="15.5" y1="9" x2="17" y2="6.5" />
          <circle cx="9" cy="11.5" r="0.8" fill={color} />
          <circle cx="15" cy="11.5" r="0.8" fill={color} />
          <rect x="5" y="14" width="14" height="6" rx="2" />
        </g>
      )
    case 'executable':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" fill={color} />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
        </g>
      )
    case 'database':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </g>
      )
    case 'font':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <polyline points="4 20 12 4 20 20" />
          <line x1="6.5" y1="15" x2="17.5" y2="15" />
        </g>
      )
    case 'markdown':
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <polyline points="7 14 7 10 9 12 11 10 11 14" />
          <line x1="15" y1="10" x2="15" y2="14" />
          <polyline points="13 12 15 14 17 12" />
        </g>
      )
    case 'pdf':
    case 'word':
    case 'powerpoint':
    case 'text':
    case 'file':
    default:
      return (
        <g stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="12" y2="17" />
        </g>
      )
  }
}

/**
 * SendKeep Prism & Glass File Icon System
 * Features authentic 3:4 vertical document cards with origami corner folds,
 * developer terminal cards, media glass tiles, and dedicated Android APK & Archive tiles.
 */
export function CustomFileIcon({
  ext,
  path,
  kind: explicitKind,
  isDirectory,
  isFolder,
  width = 32,
  height,
  style,
  className,
  ...rest
}: CustomFileIconProps): JSX.Element {
  const uid = useId().replace(/:/g, '')
  const numericWidth = typeof width === 'number' ? width : parseInt(String(width), 10) || 32
  const resolvedHeight = height ?? width

  const isDir = Boolean(isDirectory || isFolder)
  const resolvedExt = (ext ?? (path ? extOf(path) : '')).toLowerCase()

  const info = explicitKind
    ? { kind: explicitKind, color: getFileKindByExt(explicitKind, isDir).color, label: explicitKind.toUpperCase() }
    : isDir || resolvedExt === 'folder'
      ? getFileKindByExt('folder', true)
      : resolvedExt
        ? getFileKindByExt(resolvedExt)
        : path
          ? getFileKind(path, isDir)
          : { kind: 'file' as FileKind, color: '#94A3B8', label: 'FILE' }

  const kind: FileKind = explicitKind ?? info.kind

  // Micro size fallback for 11px–16px badges
  if (numericWidth <= 16) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={width}
        height={resolvedHeight}
        fill="none"
        className={className}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style
        }}
        {...rest}
      >
        {renderMicroIcon(kind, info.color)}
      </svg>
    )
  }

  const shadowId = `prismShadow-${uid}`
  const foldShadowId = `foldShadow-${uid}`
  const gradId = `cardGrad-${uid}`
  const strokeGradId = `strokeGrad-${uid}`

  // Common SVG wrapper props
  const svgProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 512 512',
    width,
    height: resolvedHeight,
    fill: 'none',
    className,
    style: {
      display: 'inline-block',
      verticalAlign: 'middle',
      flexShrink: 0,
      ...style
    },
    ...rest
  }

  // 3:4 Document Sheet Silhouette (Corner Fold from 336,40 to 424,128)
  const docSheetPath =
    'M 120 40 L 336 40 L 424 128 L 424 440 C 424 457.6 410.4 472 392 472 L 120 472 C 102.4 472 88 457.6 88 440 L 88 72 C 88 54.4 102.4 40 120 40 Z'

  // Corner Dog-Ear Fold Polygon
  const dogEarPath = 'M 336 40 L 336 104 C 336 117.2 346.8 128 360 128 L 424 128 Z'

  // 0. FOLDERS & DIRECTORIES - Modern Amber & Gold 3D Glass Folder
  if (kind === 'folder') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="88" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
          <linearGradient id={`${gradId}-front`} x1="56" y1="190" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#D97706" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={strokeGradId} x1="56" y1="88" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#B45309" stopOpacity="0.3" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#78350F" floodOpacity="0.45" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          {/* Back Folder Body & Tab */}
          <path
            d="M 80 110 C 80 96 92 84 106 84 L 188 84 C 200 84 212 92 218 102 L 236 128 L 406 128 C 420 128 432 140 432 154 L 432 410 C 432 424 420 436 406 436 L 106 436 C 92 436 80 424 80 410 Z"
            fill={`url(#${gradId})`}
            stroke={`url(#${strokeGradId})`}
            strokeWidth="3"
          />

          {/* Tucked Document Sheet */}
          <rect x="116" y="112" width="280" height="240" rx="14" fill="#FFFFFF" fillOpacity="0.9" />
          <line x1="146" y1="146" x2="270" y2="146" stroke="#94A3B8" strokeWidth="5" strokeLinecap="round" />
          <line x1="146" y1="172" x2="356" y2="172" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
          <line x1="146" y1="194" x2="310" y2="194" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />

          {/* Front Translucent Glass Flap */}
          <path
            d="M 64 200 C 64 186 76 174 90 174 L 422 174 C 436 174 448 186 448 200 L 434 408 C 433 424 420 436 404 436 L 108 436 C 92 436 79 424 78 408 Z"
            fill={`url(#${gradId}-front)`}
            stroke="#FEF3C7"
            strokeWidth="2"
            strokeOpacity="0.6"
          />

          {/* Folder Tag Badge */}
          <rect x="156" y="380" width="80" height="26" rx="8" fill="#78350F" fillOpacity="0.35" />
          <text x="196" y="398" fill="#FFFFFF" fontSize="12" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            FOLDER
          </text>
        </g>
      </svg>
    )
  }

  // 1. WORD DOCUMENTS (.doc, .docx, .odt) - Deep Royal Cobalt & Sapphire Prism Sheet
  if (kind === 'word') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E40AF" />
            <stop offset="50%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
          <linearGradient id={strokeGradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.2" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#1E3A8A" floodOpacity="0.35" />
          </filter>
          <filter id={foldShadowId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="-4" dy="6" stdDeviation="8" floodColor="#0F172A" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <path d={docSheetPath} fill={`url(#${gradId})`} stroke={`url(#${strokeGradId})`} strokeWidth="3" />
          <path d={dogEarPath} fill="#93C5FD" filter={`url(#${foldShadowId})`} />
          <path d={dogEarPath} fill="#BFDBFE" />

          <path d="M 120 42 L 334 42" stroke="#FFFFFF" strokeWidth="2.5" strokeOpacity="0.4" strokeLinecap="round" />

          <g stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="7" strokeLinecap="round">
            <line x1="140" y1="170" x2="310" y2="170" />
            <line x1="140" y1="200" x2="370" y2="200" />
            <line x1="280" y1="260" x2="370" y2="260" />
            <line x1="280" y1="290" x2="350" y2="290" />
            <line x1="140" y1="380" x2="370" y2="380" />
            <line x1="140" y1="410" x2="310" y2="410" />
          </g>

          <rect x="130" y="235" width="124" height="106" rx="20" fill="#FFFFFF" />
          <path
            d="M 152 263 L 169 315 L 192 273 L 215 315 L 232 263"
            fill="none"
            stroke="#1D4ED8"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <rect x="306" y="416" width="76" height="26" rx="7" fill="#FFFFFF" fillOpacity="0.2" />
          <text x="344" y="434" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.05em">
            DOCX
          </text>
        </g>
      </svg>
    )
  }

  // 2. ANDROID PACKAGE (.apk, .aab, .xapk) - Emerald Bugdroid Package
  if (kind === 'apk') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#064E3B" />
            <stop offset="40%" stopColor="#059669" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="22" floodColor="#047857" floodOpacity="0.38" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#6EE7B7" strokeWidth="2.5" strokeOpacity="0.4" />

          {/* Android Bugdroid Robot Silhouette */}
          {/* Antennae */}
          <line x1="224" y1="172" x2="204" y2="136" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
          <line x1="288" y1="172" x2="308" y2="136" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />

          {/* Head */}
          <path d="M 196 226 A 60 60 0 0 1 316 226 Z" fill="#FFFFFF" />
          <circle cx="230" cy="202" r="5" fill="#059669" />
          <circle cx="282" cy="202" r="5" fill="#059669" />

          {/* Torso */}
          <rect x="196" y="236" width="120" height="96" rx="14" fill="#FFFFFF" />

          {/* Left & Right Arms */}
          <rect x="168" y="242" width="18" height="74" rx="9" fill="#FFFFFF" />
          <rect x="326" y="242" width="18" height="74" rx="9" fill="#FFFFFF" />

          {/* Legs */}
          <rect x="220" y="340" width="18" height="40" rx="9" fill="#FFFFFF" />
          <rect x="274" y="340" width="18" height="40" rx="9" fill="#FFFFFF" />

          {/* Bottom Capsule Pill */}
          <rect x="196" y="394" width="120" height="28" rx="8" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="256" y="413" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            ANDROID APK
          </text>
        </g>
      </svg>
    )
  }

  // 3. ARCHIVES (.zip, .rar, .7z) - Golden Vault Capsule
  if (kind === 'archive') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#78350F" />
            <stop offset="45%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#78350F" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#FDE68A" strokeWidth="2.5" strokeOpacity="0.4" />

          {/* Compression Straps Across Box */}
          <rect x="56" y="160" width="400" height="20" fill="#451A03" opacity="0.4" />
          <rect x="56" y="340" width="400" height="20" fill="#451A03" opacity="0.4" />

          {/* Central Zipper Column */}
          <rect x="224" y="56" width="64" height="400" fill="#451A03" opacity="0.6" />
          
          {/* Interlocking Teeth */}
          <g fill="#FEF3C7">
            <rect x="238" y="80" width="16" height="12" rx="3" />
            <rect x="258" y="98" width="16" height="12" rx="3" />
            <rect x="238" y="116" width="16" height="12" rx="3" />
            <rect x="258" y="134" width="16" height="12" rx="3" />
            <rect x="238" y="152" width="16" height="12" rx="3" />
            <rect x="258" y="170" width="16" height="12" rx="3" />
            <rect x="238" y="188" width="16" height="12" rx="3" />
            <rect x="258" y="206" width="16" height="12" rx="3" />
          </g>

          {/* Heavy Zipper Slider Head & Pull Ring */}
          <rect x="226" y="230" width="60" height="52" rx="12" fill="#FFFFFF" />
          <rect x="246" y="244" width="20" height="24" rx="6" fill="#B45309" />
          <rect x="242" y="280" width="28" height="66" rx="10" fill="#FFFFFF" stroke="#B45309" strokeWidth="5" />
          <circle cx="256" cy="326" r="6" fill="#B45309" />

          <rect x="196" y="390" width="120" height="28" rx="8" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="256" y="409" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            ZIP ARCHIVE
          </text>
        </g>
      </svg>
    )
  }

  // 4. AUDIO FILES (.mp3, .wav, .flac) - Cosmic Purple Acoustic Tile with Soundwaves
  if (kind === 'audio') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3B0764" />
            <stop offset="50%" stopColor="#7E22CE" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="22" floodColor="#6B21A8" floodOpacity="0.38" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#E9D5FF" strokeWidth="2.5" strokeOpacity="0.4" />
          
          {/* Subtle Acoustic Radial Soundwaves */}
          <circle cx="256" cy="240" r="140" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.1" fill="none" />
          <circle cx="256" cy="240" r="105" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.15" fill="none" />

          {/* Equalizer Waveform Bars on Sides */}
          <g fill="#FFFFFF" opacity="0.3">
            <rect x="120" y="240" width="12" height="50" rx="6" />
            <rect x="142" y="220" width="12" height="90" rx="6" />
            <rect x="164" y="200" width="12" height="130" rx="6" />
            <rect x="336" y="200" width="12" height="130" rx="6" />
            <rect x="358" y="220" width="12" height="90" rx="6" />
            <rect x="380" y="240" width="12" height="50" rx="6" />
          </g>

          {/* Immaculate Geometric Beamed Double Musical Notes */}
          <g fill="#FFFFFF">
            {/* Noteheads */}
            <ellipse cx="214" cy="286" rx="26" ry="20" transform="rotate(-20 214 286)" />
            <ellipse cx="304" cy="260" rx="26" ry="20" transform="rotate(-20 304 260)" />
            {/* Vertical Stems */}
            <rect x="230" y="152" width="12" height="134" rx="6" />
            <rect x="320" y="126" width="12" height="134" rx="6" />
            {/* Connecting Double Beams */}
            <polygon points="230,152 332,126 332,148 230,174" />
            <polygon points="230,186 332,160 332,182 230,208" />
          </g>

          <rect x="196" y="390" width="120" height="28" rx="8" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="256" y="409" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            AUDIO
          </text>
        </g>
      </svg>
    )
  }

  // 5. FONTS & TYPOGRAPHY (.ttf, .otf, .woff, .woff2) - Radiant Berry Card
  if (kind === 'font') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#831843" />
            <stop offset="50%" stopColor="#BE185D" />
            <stop offset="100%" stopColor="#F43F5E" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="22" floodColor="#9D174D" floodOpacity="0.38" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#FECDD3" strokeWidth="2.5" strokeOpacity="0.4" />

          {/* Typographic Baseline Guide Lines */}
          <line x1="100" y1="180" x2="412" y2="180" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.2" strokeDasharray="6 6" />
          <line x1="100" y1="300" x2="412" y2="300" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.35" />

          {/* Stylized Serif "Aa" Glyphs */}
          <text x="200" y="295" fill="#FFFFFF" fontSize="125" fontWeight="700" textAnchor="middle" fontFamily="'Times New Roman', Georgia, serif">
            A
          </text>
          <text x="310" y="295" fill="#FFFFFF" fontSize="90" fontWeight="700" textAnchor="middle" fontFamily="system-ui, sans-serif" opacity="0.9">
            a
          </text>

          <rect x="196" y="390" width="120" height="28" rx="8" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="256" y="409" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            FONT
          </text>
        </g>
      </svg>
    )
  }

  // 6. DATABASES & SQL (.sql, .db, .sqlite) - Deep Teal Cylinder Stack
  if (kind === 'database') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#134E4A" />
            <stop offset="50%" stopColor="#0D9488" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="22" floodColor="#0F766E" floodOpacity="0.38" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#67E8F9" strokeWidth="2.5" strokeOpacity="0.4" />

          {/* 3-Tier Database Cylinder Stack */}
          {/* Bottom Cylinder */}
          <path d="M 166 260 C 166 280, 206 296, 256 296 C 306 296, 346 280, 346 260 L 346 315 C 346 335, 306 350, 256 350 C 206 350, 166 335, 166 315 Z" fill="#FFFFFF" opacity="0.85" />
          {/* Middle Cylinder */}
          <path d="M 166 205 C 166 225, 206 240, 256 240 C 306 240, 346 225, 346 205 L 346 255 C 346 275, 306 290, 256 290 C 206 290, 166 275, 166 255 Z" fill="#FFFFFF" opacity="0.9" />
          {/* Top Cylinder Head */}
          <path d="M 166 150 C 166 170, 206 185, 256 185 C 306 185, 346 170, 346 150 L 346 195 C 346 215, 306 230, 256 230 C 206 230, 166 215, 166 195 Z" fill="#FFFFFF" />
          <ellipse cx="256" cy="150" rx="90" ry="32" fill="#E0F2FE" />

          {/* Active Data LED Dots */}
          <circle cx="316" cy="190" r="5" fill="#0D9488" />
          <circle cx="316" cy="245" r="5" fill="#0D9488" />
          <circle cx="316" cy="305" r="5" fill="#0D9488" />

          <rect x="196" y="390" width="120" height="28" rx="8" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="256" y="409" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            DATABASE
          </text>
        </g>
      </svg>
    )
  }

  // 7. MARKDOWN (.md, .markdown) - Indigo Slate Document Sheet
  if (kind === 'markdown') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E1B4B" />
            <stop offset="50%" stopColor="#312E81" />
            <stop offset="100%" stopColor="#4338CA" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#1E1B4B" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <path d={docSheetPath} fill={`url(#${gradId})`} stroke="#A5B4FC" strokeWidth="2.5" strokeOpacity="0.5" />
          <path d={dogEarPath} fill="#C7D2FE" />

          {/* Markdown Emblem Card */}
          <rect x="135" y="210" width="242" height="120" rx="20" fill="#FFFFFF" />
          <g fill="none" stroke="#312E81" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 160 295 L 160 245 L 190 275 L 220 245 L 220 295" />
            <line x1="280" y1="245" x2="280" y2="295" />
            <polyline points="260,275 280,295 300,275" />
          </g>

          <g stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="7" strokeLinecap="round">
            <line x1="140" y1="165" x2="310" y2="165" />
            <line x1="140" y1="365" x2="370" y2="365" />
            <line x1="140" y1="395" x2="290" y2="395" />
          </g>

          <rect x="306" y="416" width="76" height="26" rx="7" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="344" y="434" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif">
            MD
          </text>
        </g>
      </svg>
    )
  }

  // 8. CODE & DEV FILES (.js, .ts, .py, .html, etc.) - Obsidian Developer Terminal Card
  if (kind === 'code') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0B0F19" />
            <stop offset="50%" stopColor="#111827" />
            <stop offset="100%" stopColor="#1F2937" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="22" floodColor="#0284C7" floodOpacity="0.25" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#38BDF8" strokeWidth="2.5" strokeOpacity="0.35" />
          
          <line x1="56" y1="124" x2="456" y2="124" stroke="#374151" strokeWidth="2" />
          <circle cx="98" cy="90" r="7" fill="#EF4444" />
          <circle cx="122" cy="90" r="7" fill="#F59E0B" />
          <circle cx="146" cy="90" r="7" fill="#10B981" />

          <g fill="none" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="190,205 130,265 190,325" stroke="#38BDF8" />
            <line x1="282" y1="185" x2="230" y2="345" stroke="#06B6D4" />
            <polyline points="322,205 382,265 322,325" stroke="#38BDF8" />
          </g>

          <rect x="196" y="394" width="120" height="28" rx="8" fill="#38BDF8" fillOpacity="0.15" />
          <text x="256" y="413" fill="#38BDF8" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">
            &lt;DEV /&gt;
          </text>
        </g>
      </svg>
    )
  }

  // 9. IMAGES (.png, .jpg, .webp, .svg, etc.) - Sunset Aurora Photo Canvas
  if (kind === 'image') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#431407" />
            <stop offset="40%" stopColor="#9A3412" />
            <stop offset="80%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#C2410C" floodOpacity="0.3" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#FDBA74" strokeWidth="2.5" strokeOpacity="0.4" />
          
          <circle cx="210" cy="210" r="36" fill="#FEF08A" opacity="0.95" />

          <path d="M 96 380 L 195 255 L 265 330 L 325 275 L 416 380 Z" fill="#1C1917" fillOpacity="0.75" />
          <path d="M 160 380 L 250 280 L 320 350 L 370 305 L 416 380 Z" fill="#292524" fillOpacity="0.85" />

          <rect x="96" y="96" width="48" height="48" rx="14" fill="#FFFFFF" fillOpacity="0.15" stroke="#FFFFFF" strokeWidth="2" strokeOpacity="0.3" />
          <circle cx="120" cy="120" r="8" fill="#FFFFFF" opacity="0.8" />
        </g>
      </svg>
    )
  }

  // 10. VIDEO & CINEMA (.mp4, .mkv, .mov) - Midnight Cinema Slate
  if (kind === 'video') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0F172A" />
            <stop offset="50%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#0F172A" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#64748B" strokeWidth="2.5" strokeOpacity="0.35" />

          <rect x="86" y="86" width="340" height="44" rx="12" fill="#020617" />
          <g fill="#FFFFFF" opacity="0.8">
            <rect x="106" y="98" width="28" height="20" rx="4" />
            <rect x="154" y="98" width="28" height="20" rx="4" />
            <rect x="202" y="98" width="28" height="20" rx="4" />
            <rect x="250" y="98" width="28" height="20" rx="4" />
            <rect x="298" y="98" width="28" height="20" rx="4" />
            <rect x="346" y="98" width="28" height="20" rx="4" />
          </g>

          <circle cx="256" cy="275" r="54" fill="#3B82F6" />
          <polygon points="244,250 280,275 244,300" fill="#FFFFFF" />

          <rect x="196" y="388" width="120" height="28" rx="8" fill="#3B82F6" fillOpacity="0.2" />
          <text x="256" y="407" fill="#93C5FD" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            MEDIA
          </text>
        </g>
      </svg>
    )
  }

  // 11. PDF DOCUMENTS (.pdf) - Crimson Ruby & Coral Glow Sheet
  if (kind === 'pdf') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#991B1B" />
            <stop offset="50%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#EF4444" />
          </linearGradient>
          <linearGradient id={strokeGradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FCA5A5" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#7F1D1D" stopOpacity="0.2" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#7F1D1D" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <path d={docSheetPath} fill={`url(#${gradId})`} stroke={`url(#${strokeGradId})`} strokeWidth="3" />
          <path d={dogEarPath} fill="#FCA5A5" />

          <path d="M 120 42 L 334 42" stroke="#FFFFFF" strokeWidth="2.5" strokeOpacity="0.4" strokeLinecap="round" />

          <rect x="140" y="210" width="232" height="110" rx="20" fill="#FFFFFF" />
          <text x="256" y="278" fill="#DC2626" fontSize="46" fontWeight="900" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.06em">
            PDF
          </text>

          <g stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="7" strokeLinecap="round">
            <line x1="140" y1="165" x2="310" y2="165" />
            <line x1="140" y1="360" x2="370" y2="360" />
            <line x1="140" y1="390" x2="290" y2="390" />
          </g>
        </g>
      </svg>
    )
  }

  // 12. SPREADSHEETS (.xlsx, .xls, .csv) - Emerald Jade Sheet with Matrix
  if (kind === 'excel') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#065F46" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#064E3B" floodOpacity="0.38" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <path d={docSheetPath} fill={`url(#${gradId})`} stroke="#6EE7B7" strokeWidth="2" strokeOpacity="0.4" />
          <path d={dogEarPath} fill="#A7F3D0" />

          <rect x="135" y="195" width="242" height="170" rx="16" fill="#FFFFFF" />
          <rect x="135" y="195" width="242" height="42" rx="16" fill="#059669" />
          <rect x="135" y="222" width="242" height="15" fill="#059669" />

          <line x1="135" y1="282" x2="377" y2="282" stroke="#E2E8F0" strokeWidth="3" />
          <line x1="135" y1="324" x2="377" y2="324" stroke="#E2E8F0" strokeWidth="3" />
          <line x1="215" y1="195" x2="215" y2="365" stroke="#E2E8F0" strokeWidth="3" />
          <line x1="295" y1="195" x2="295" y2="365" stroke="#E2E8F0" strokeWidth="3" />

          <rect x="219" y="241" width="72" height="38" fill="#D1FAE5" />

          <rect x="306" y="416" width="76" height="26" rx="7" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="344" y="434" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif">
            XLSX
          </text>
        </g>
      </svg>
    )
  }

  // 13. PRESENTATION SLIDES (.ppt, .pptx, .key) - Sunset Tangerine Presentation Sheet
  if (kind === 'powerpoint') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9A3412" />
            <stop offset="50%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#7C2D12" floodOpacity="0.4" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <path d={docSheetPath} fill={`url(#${gradId})`} stroke="#FDBA74" strokeWidth="2" strokeOpacity="0.4" />
          <path d={dogEarPath} fill="#FED7AA" />

          <rect x="135" y="190" width="242" height="160" rx="18" fill="#FFFFFF" />
          <circle cx="210" cy="270" r="42" fill="#F97316" />
          <path d="M 210 270 L 246 248 A 42 42 0 0 0 210 228 Z" fill="#EF4444" />
          <g stroke="#94A3B8" strokeWidth="6" strokeLinecap="round">
            <line x1="275" y1="245" x2="350" y2="245" />
            <line x1="275" y1="270" x2="340" y2="270" />
            <line x1="275" y1="295" x2="320" y2="295" />
          </g>

          <rect x="306" y="416" width="76" height="26" rx="7" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="344" y="434" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif">
            PPTX
          </text>
        </g>
      </svg>
    )
  }

  // 14. EXECUTABLES (.exe, .msi, .app) - Silicon Microchip Tile
  if (kind === 'executable') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="56" y1="56" x2="456" y2="456" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E1B4B" />
            <stop offset="50%" stopColor="#312E81" />
            <stop offset="100%" stopColor="#4338CA" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#3730A3" floodOpacity="0.35" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <rect x="56" y="56" width="400" height="400" rx="44" fill={`url(#${gradId})`} stroke="#818CF8" strokeWidth="2.5" strokeOpacity="0.4" />

          <g stroke="#C7D2FE" strokeWidth="8" strokeLinecap="round">
            <line x1="210" y1="140" x2="210" y2="175" />
            <line x1="256" y1="140" x2="256" y2="175" />
            <line x1="302" y1="140" x2="302" y2="175" />
            <line x1="210" y1="337" x2="210" y2="372" />
            <line x1="256" y1="337" x2="256" y2="372" />
            <line x1="302" y1="337" x2="302" y2="372" />
            <line x1="140" y1="210" x2="175" y2="210" />
            <line x1="140" y1="256" x2="175" y2="256" />
            <line x1="140" y1="302" x2="175" y2="302" />
            <line x1="337" y1="210" x2="372" y2="210" />
            <line x1="337" y1="256" x2="372" y2="256" />
            <line x1="337" y1="302" x2="372" y2="302" />
          </g>

          <rect x="175" y="175" width="162" height="162" rx="28" fill="#FFFFFF" />
          <rect x="200" y="200" width="112" height="112" rx="18" fill="#4338CA" />
          <polygon points="244,235 272,256 244,277" fill="#38BDF8" />

          <rect x="196" y="390" width="120" height="28" rx="8" fill="#818CF8" fillOpacity="0.22" />
          <text x="256" y="409" fill="#C7D2FE" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
            APP
          </text>
        </g>
      </svg>
    )
  }

  // 15. PLAIN TEXT (.txt, .log) - Pine Green Editorial Sheet
  if (kind === 'text') {
    return (
      <svg {...svgProps}>
        <defs>
          <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#14532D" />
            <stop offset="50%" stopColor="#15803D" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
          <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#14532D" floodOpacity="0.35" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`}>
          <path d={docSheetPath} fill={`url(#${gradId})`} stroke="#86EFAC" strokeWidth="2" strokeOpacity="0.4" />
          <path d={dogEarPath} fill="#BBF7D0" />

          <g stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="8" strokeLinecap="round">
            <line x1="140" y1="180" x2="250" y2="180" />
            <line x1="140" y1="216" x2="370" y2="216" />
            <line x1="140" y1="252" x2="370" y2="252" />
            <line x1="140" y1="288" x2="330" y2="288" />
            <line x1="140" y1="336" x2="370" y2="336" />
            <line x1="140" y1="372" x2="270" y2="372" />
          </g>

          <rect x="306" y="416" width="76" height="26" rx="7" fill="#FFFFFF" fillOpacity="0.22" />
          <text x="344" y="434" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif">
            TXT
          </text>
        </g>
      </svg>
    )
  }

  // 17. GENERIC FILE FALLBACK - Titanium Slate Glass Document Sheet
  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id={gradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="50%" stopColor="#475569" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
        <linearGradient id={strokeGradId} x1="88" y1="40" x2="424" y2="472" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CBD5E1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#1E293B" stopOpacity="0.3" />
        </linearGradient>
        <filter id={shadowId} x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#0F172A" floodOpacity="0.4" />
        </filter>
        <filter id={foldShadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="-4" dy="6" stdDeviation="8" floodColor="#020617" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter={`url(#${shadowId})`}>
        <path d={docSheetPath} fill={`url(#${gradId})`} stroke={`url(#${strokeGradId})`} strokeWidth="3" />
        <path d={dogEarPath} fill="#94A3B8" filter={`url(#${foldShadowId})`} />
        <path d={dogEarPath} fill="#CBD5E1" />

        <path d="M 120 42 L 334 42" stroke="#FFFFFF" strokeWidth="2.5" strokeOpacity="0.4" strokeLinecap="round" />

        <g stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="8" strokeLinecap="round">
          <line x1="140" y1="180" x2="260" y2="180" />
          <line x1="140" y1="215" x2="370" y2="215" />
          <line x1="140" y1="250" x2="370" y2="250" />
          <line x1="140" y1="285" x2="330" y2="285" />
          <line x1="140" y1="320" x2="370" y2="320" />
          <line x1="140" y1="355" x2="280" y2="355" />
        </g>

        <rect x="140" y="408" width="68" height="28" rx="8" fill="#FFFFFF" fillOpacity="0.18" />
        <text x="174" y="427" fill="#FFFFFF" fontSize="13" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.08em">
          FILE
        </text>
      </g>
    </svg>
  )
}

/** Card silhouette body used for thumbnail masking. */
const FILE_ICON_BODY =
  'M 120 40 L 336 40 L 424 128 L 424 440 C 424 457.6 410.4 472 392 472 L 120 472 C 102.4 472 88 457.6 88 440 L 88 72 C 88 54.4 102.4 40 120 40 Z'

const FILE_ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="white" d="${FILE_ICON_BODY}"/></svg>`
)}")`

export function FileStackPhoto({
  src,
  filePath,
  width = 112,
  height,
  fallbackSrc,
}: {
  src: string
  filePath?: string
  width?: number | string
  height?: number | string
  fallbackSrc?: string
}) {
  const resolvedHeight = height ?? width
  const [activeSrc, setActiveSrc] = useState(src)
  useEffect(() => { setActiveSrc(src) }, [src])

  const handleError = () => {
    if (fallbackSrc && activeSrc !== fallbackSrc) {
      setActiveSrc(fallbackSrc)
    } else if (filePath && !activeSrc.startsWith('data:')) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke<string>('read_image_base64', { path: filePath })
          .then((b64) => setActiveSrc(b64))
          .catch(() => {})
      }).catch(() => {})
    }
  }

  return (
    <img
      src={activeSrc}
      alt=""
      draggable={false}
      width={typeof width === 'number' ? width : undefined}
      height={typeof resolvedHeight === 'number' ? resolvedHeight : undefined}
      onError={handleError}
      style={{
        width,
        height: resolvedHeight,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
        WebkitMaskImage: FILE_ICON_MASK,
        maskImage: FILE_ICON_MASK,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center'
      }}
    />
  )
}
