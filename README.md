# SendKeep

<div align="center">

<img src="desktop/src-tauri/icons/128x128.png" alt="SendKeep Logo" width="96" height="96" />

### The Zero-Friction Cross-Device Drop Environment for Windows & Android

[![Platform: Windows](https://img.shields.io/badge/Platform-Windows_10%2F11-0078D6?logo=windows&logoColor=white)](https://github.com/Mohammad-Shahid-07/sendkeep)
[![Platform: Android](https://img.shields.io/badge/Platform-Android_8.0+-3DDC84?logo=android&logoColor=white)](https://github.com/Mohammad-Shahid-07/sendkeep)
[![Desktop: Tauri v2 + Rust](https://img.shields.io/badge/Desktop-Tauri_v2_%2B_Rust-FFC131?logo=tauri&logoColor=black)](https://github.com/Mohammad-Shahid-07/sendkeep)
[![Mobile: Native Kotlin](https://img.shields.io/badge/Mobile-Native_Kotlin_%2B_Compose-7F52FF?logo=kotlin&logoColor=white)](https://github.com/Mohammad-Shahid-07/sendkeep)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*An invisible slide-out shelf, instant P2P local file transfer, and encrypted clipboard sync—built without Electron or Flutter bloat.*

</div>

---

## 📦 Downloads (v0.0.1)

| Platform | Package | Size | Download |
| :--- | :--- | :--- | :--- |
| **Windows 10/11** | **`SendKeep_0.0.1_x64-setup.exe`** | **~3.3 MB** | [⬇️ Download for Windows](https://github.com/Mohammad-Shahid-07/sendkeep/releases/latest/download/SendKeep_0.0.1_x64-setup.exe) |
| **Android 8.0+** | **`SendKeep-v0.0.1.apk`** | **~1.9 MB** | [⬇️ Download APK](https://github.com/Mohammad-Shahid-07/sendkeep/releases/latest/download/SendKeep-v0.0.1.apk) |

> 💡 *Or view all assets on the [Official GitHub Releases Page](https://github.com/Mohammad-Shahid-07/sendkeep/releases).*

---

## ✨ Features

* **Invisible Slide-Out Edge Shelf (Windows)**:
  * Lives invisibly on your Windows screen border.
  * Hover or glide your cursor against the screen border or hit **`Alt + C`** to reveal with fluid spring physics.
  * Drag files from your desktop onto the shelf to beam them instantly to your phone.
* **Zero-Prompt Auto-Accept**:
  * Stream photos, 4K videos, and archives directly from your phone to your PC over local Wi-Fi with zero clicks required on Windows.
* **Instant Android Share Sheet & Quick Settings**:
  * Translucent Android share target to beam media directly from any app in under 1 second, plus a Quick Settings tile for instant access.
* **Background Clipboard Sync**:
  * Seamless clipboard synchronization between your phone and laptop shelf.
  * **Privacy Guard**: Automatically redacts sensitive passwords and credentials (evaluates 1Password, Bitwarden, KeePass, and Android 13+ `EXTRA_IS_SENSITIVE`).
* **Ultra-Lightweight Footprint**:
  * Windows Desktop: **~15–25 MB RAM** (Tauri v2 + WebView2, eliminating the 200MB+ Electron runtime).
  * Android Mobile: **~10–15 MB RAM** (Native Kotlin + Jetpack Compose, eliminating the 80MB+ Flutter runtime).
  * Combined bundle footprint: **Under 4 MB total**!
* **Windows Boot Integration**:
  * Option in Settings to automatically launch SendKeep silently in the system tray on Windows startup.

---

## 🔒 Security & Privacy Guarantees

* **100% Local Peer-to-Peer**: All file discovery and streaming occurs purely over your local Wi-Fi network (`UDP:53317` multicast discovery + streaming HTTP).
* **Zero Cloud Relays**: Your files, photos, and clipboard contents NEVER pass through any external server or third-party cloud.
* **Device Pairing & PIN Protection**: Secure mutual fingerprint authentication prevents unauthorized devices from sending files.

---

## 🛡️ Note on Windows SmartScreen (First-Time Run)

Because SendKeep is an open-source binary without an expensive commercial EV certificate, Microsoft Defender SmartScreen may display:
> *"Windows protected your PC: Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

To run:
1. Click **More info**.
2. Click **Run anyway**.

---

## 🛠️ Developer Setup

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+)
- [Rust](https://www.rust-lang.org/) (v1.75+)
- [Android Studio](https://developer.android.com/studio) (API 26+)

### Desktop (Windows)
```bash
cd desktop
bun install
bun run tauri dev
```

To build production installers:
```bash
bun run tauri build
```

### Mobile (Android)
```bash
cd mobile
.\gradlew assembleDebug
```

To build signed release packages:
```bash
.\gradlew assembleRelease bundleRelease
```

---

## 📄 License
MIT License. Copyright (c) 2026 SendKeep.
