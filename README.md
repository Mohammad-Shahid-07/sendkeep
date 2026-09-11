# SendKeep

> A seamless, zero-friction cross-device drop environment connecting Windows and Android. Built with **Tauri v2 (Rust)** on desktop and **100% Native Kotlin** on Android.

---

## Features

* **Invisible Slide-Out Shelf**: Lives hidden on your Windows screen edge; hover or drag to reveal with fluid spring physics.
* **Zero-Prompt Auto-Accept**: Files stream directly from your phone to your laptop over local Wi-Fi with zero clicks required on Windows.
* **Instant Android Share Sheet**: Native Android translucent target to beam photos, videos, and files directly to your laptop in under a second.
* **Background Clipboard Sync**: Optional native Android service that automatically beams copied text and links to your laptop shelf.
* **Ultra-Low Memory Footprint**:
  * Windows Desktop: **~15–25 MB RAM** (Tauri v2 + WebView2, eliminating the 200MB+ Electron runtime).
  * Android Mobile: **~10–15 MB RAM** (Native Kotlin + Jetpack Compose, eliminating the 80MB+ Flutter runtime).

---

## Project Structure

```
sendkeep/
├── desktop/       # Windows App (Tauri v2 + Rust daemon + React 18 / Framer Motion shelf)
└── mobile/        # Android App (100% Native Kotlin + Jetpack Compose)
```

---

## Getting Started

### Windows Desktop

```bash
cd desktop
bun install
bun run tauri dev
```

### Android Mobile

```bash
cd mobile
.\gradlew assembleDebug
```
The APK will be generated at `mobile/app/build/outputs/apk/debug/app-debug.apk`.
