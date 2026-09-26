# Custom Desktop Installer Rule

## CRITICAL: SendKeep Custom Installer Architecture

**SendKeep uses its own custom installer UI for the desktop application. NEVER use, distribute, or replace our installer with the generic Tauri NSIS installer.**

### Key Points:
1. `SendKeep.exe` is dual-mode:
   - When named `SendKeep-Setup.exe`, `SendKeep-Installer.exe`, or launched with `--install`/`--setup`, it automatically launches `<InstallerApp />` (`desktop/src/InstallerApp.tsx`) with dark neon styling, frameless titlebar, folder picker, and direct self-installation to `%LOCALAPPDATA%\Programs\SendKeep\SendKeep.exe`.
   - When named `SendKeep.exe`, it launches the desktop shelf.
2. Therefore:
   - **`SendKeep-Setup.exe`** = copy of the release `SendKeep.exe` binary.
   - **`release/SendKeep-Installer.exe`** = copy of the release `SendKeep.exe` binary.
   - **`SendKeep-Setup-v1.0.0.exe`** = copy of the release `SendKeep.exe` binary.
3. **NEVER** overwrite `SendKeep-Setup.exe` or `release/SendKeep-Installer.exe` with Tauri's NSIS bundle file (`SendKeep_0.0.1_x64-setup.exe`, ~3.34 MB).
4. **NEVER** remove `desktop/src/InstallerApp.tsx` or `desktop/src-tauri/src/installer.rs`.
