# SendKeep Agent Guidelines & Architecture Rules

This file documents critical architectural decisions, packaging standards, and operational guidelines for AI agents working in this repository.

---

## 1. CRITICAL: Desktop Custom Installer (NEVER REMOVE OR REPLACE)

### 🚨 Core Rule
**SendKeep uses our own custom installer UI for the desktop application. NEVER use, distribute, or replace our installer with the generic Tauri NSIS installer.**

### How the Custom Installer Works
1. **Dual-Mode Binary Architecture**:
   - The compiled desktop binary `SendKeep.exe` is dual-mode.
   - When launched with `setup` or `installer` in its executable name (e.g., `SendKeep-Setup.exe` or `SendKeep-Installer.exe`), or when passed `--install` / `--setup` / `--mode=installer`:
     - Rust backend (`desktop/src-tauri/src/installer.rs`): `installer::is_installer_mode()` detects this automatically.
     - Window creation (`desktop/src-tauri/src/lib.rs`): Spawns a frameless, centered `620x440` setup window loading `/index.html?mode=installer`.
     - Frontend router (`desktop/src/App.tsx`): Renders `<InstallerApp />` (`desktop/src/InstallerApp.tsx`) with custom dark-mode aesthetics, custom directory picker, desktop/start-menu shortcut toggles, Windows boot autostart configuration, animated progress bar, and launch triggers.
   - When launched as `SendKeep.exe`, it runs the normal borderless desktop shelf application.

2. **Packaging & Release Rules**:
   - **Compilation Rule**: Always build desktop release binaries using `bun run tauri build --no-bundle` from the `desktop/` directory. NEVER compile with raw `cargo build --release`, because raw `cargo build` bypasses Tauri's frontend embedding pipeline and leaves `devUrl` (`localhost:53319`) baked into the binary, causing the app/installer to fail with "localhost refused to connect".
   - **`SendKeep-Setup.exe`** (in repository root) MUST be a copy of the release `SendKeep.exe` binary.
   - **`release/SendKeep-Installer.exe`** MUST be a copy of the release `SendKeep.exe` binary.
   - **`SendKeep-Setup-v1.0.0.exe`** MUST be a copy of the release `SendKeep.exe` binary.
   - **NEVER** copy Tauri's default NSIS bundle (`SendKeep_0.0.1_x64-setup.exe`, ~3.34 MB) over `SendKeep-Setup.exe` or `SendKeep-Installer.exe`. That replaces the custom installer with the legacy NSIS wizard and breaks the intended user experience.
   - **NEVER** remove `desktop/src/InstallerApp.tsx`, `desktop/src/components/installer/`, or `desktop/src-tauri/src/installer.rs`.

---

## 2. Package Management & Tooling

- **Always use `bun`**: Never use `npm`, `yarn`, or `pnpm` for package management, running scripts, or command-line execution when working on JavaScript/TypeScript.
- **Never access `.env` files directly**: Do not read, view, or parse `.env`, `.env.local`, `.env.production` files.
- **No Direct Install / Test Commands**: Do not run install commands (`bun install`, `npm install`) or test runners (`bun test`, `jest`) directly. Provide commands to the user when installation is needed.

---

## 3. Mobile (Android) Rules

- **Full Screen Edge-to-Edge**:
  - Always enforce transparent status and navigation bars.
  - In `styles-v29.xml` and runtime `MainActivity.kt`, always set `enforceNavigationBarContrast = false` and `window.isNavigationBarContrastEnforced = false`. Otherwise, Android 10+ automatically renders a solid black scrim/strip behind navigation buttons.
  - Always use `.navigationBarsPadding()` on bottom navigation rows, dialog action rows, and bottom sheet containers so UI elements float neatly above system gesture bars and 3-button navigation.

---

## 4. Desktop Sidebar & History Rules

- **Live Peers Filter**: The device popover in the desktop app must only display active, live/online peers discovered on the subnet. Offline or stale devices must never clutter the live devices list.
- **Isolated Device Streams**: History streams must be isolated per device. Clicking a specific device shows only the items exchanged with that device, while the Unified Stream displays all items.
