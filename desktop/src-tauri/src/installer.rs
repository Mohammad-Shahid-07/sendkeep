use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// Checks whether the application was launched in installer/setup mode.
pub fn is_installer_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| {
        let lower = a.to_lowercase();
        lower == "--install"
            || lower == "/install"
            || lower == "--setup"
            || lower == "-i"
            || lower == "--mode=installer"
            || lower.contains("mode=installer")
            || lower.contains("installer")
    }) {
        return true;
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(file_name) = current_exe.file_name().and_then(|n| n.to_str()) {
            let lower = file_name.to_lowercase();
            if lower.contains("setup") || lower.contains("installer") {
                return true;
            }
        }
    }

    false
}

/// Checks whether the application was launched with `--uninstall`.
pub fn is_uninstall_mode() -> bool {
    let args: Vec<String> = std::env::args().collect();
    args.iter().any(|a| {
        let lower = a.to_lowercase();
        lower == "--uninstall" || lower == "/uninstall"
    })
}

/// Returns the default installation directory: `%LOCALAPPDATA%\Programs\SendKeep`.
#[tauri::command]
pub fn get_default_install_dir() -> String {
    if let Some(local_app_data) = dirs::data_local_dir() {
        local_app_data
            .join("Programs")
            .join("SendKeep")
            .to_string_lossy()
            .to_string()
    } else {
        PathBuf::from("C:\\SendKeep")
            .to_string_lossy()
            .to_string()
    }
}

/// Tauri command to detect installer mode from the frontend.
#[tauri::command]
pub fn check_is_installer_mode() -> bool {
    is_installer_mode()
}

/// Folder picker for custom install directory selection.
#[tauri::command]
pub async fn pick_install_directory() -> Result<String, String> {
    #[cfg(windows)]
    {
        let mut cmd = tokio::process::Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-Command",
            "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; \
             $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; \
             $dialog.Description = 'Select SendKeep Installation Folder'; \
             $dialog.ShowNewFolderButton = $true; \
             if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { \
                 Write-Output $dialog.SelectedPath \
             }",
        ]);
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to open folder picker: {}", e))?;
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path_str.is_empty() {
            return Err("Cancelled by user".to_string());
        }
        Ok(path_str)
    }
    #[cfg(not(windows))]
    {
        Err("Folder picker only supported on Windows".to_string())
    }
}

/// Executes the full installation pipeline:
/// 1. Copies the executable to target_dir/SendKeep.exe
/// 2. Creates Desktop shortcut (.lnk) if requested
/// 3. Creates Start Menu shortcut (.lnk) if requested
/// 4. Configures autostart on Windows boot if requested
/// 5. Registers uninstaller in Windows Registry (HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\SendKeep)
#[tauri::command]
pub async fn execute_installer(
    install_dir: String,
    create_desktop_shortcut: bool,
    create_start_menu_shortcut: bool,
    autostart: bool,
) -> Result<(), String> {
    let target_dir = PathBuf::from(&install_dir);
    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| format!("Failed to create destination folder: {}", e))?;

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve current binary path: {}", e))?;
    let target_exe = target_dir.join("SendKeep.exe");

    // Copy executable to target location
    tokio::fs::copy(&current_exe, &target_exe)
        .await
        .map_err(|e| format!("Failed to copy binary to destination: {}", e))?;

    #[cfg(windows)]
    {
        let target_exe_str = target_exe.to_string_lossy().to_string();
        let target_dir_str = target_dir.to_string_lossy().to_string();

        // 1. Create Desktop Shortcut
        if create_desktop_shortcut {
            if let Some(desktop_dir) = dirs::desktop_dir() {
                let lnk_path = desktop_dir.join("SendKeep.lnk");
                create_windows_shortcut(
                    &lnk_path,
                    &target_exe_str,
                    &target_dir_str,
                    "SendKeep - Cross-Device Drop",
                ).await;
            }
        }

        // 2. Create Start Menu Shortcut
        if create_start_menu_shortcut {
            if let Some(roaming_data) = dirs::data_dir() {
                let start_menu_programs = roaming_data
                    .join("Microsoft")
                    .join("Windows")
                    .join("Start Menu")
                    .join("Programs");
                let _ = tokio::fs::create_dir_all(&start_menu_programs).await;
                let lnk_path = start_menu_programs.join("SendKeep.lnk");
                create_windows_shortcut(
                    &lnk_path,
                    &target_exe_str,
                    &target_dir_str,
                    "SendKeep - Cross-Device Drop",
                ).await;
            }
        }

        // 3. Register in Windows Registry (Add/Remove Programs)
        register_windows_uninstall(&target_dir_str, &target_exe_str).await?;

        // 4. Configure Autostart if enabled
        if autostart {
            let reg_cmd = format!(
                "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'SendKeep' -Value '\"{}\"'",
                target_exe_str
            );
            let _ = run_hidden_powershell(&reg_cmd).await;
        }
    }

    Ok(())
}

/// Spawns the newly installed application process and terminates the installer.
#[tauri::command]
pub fn launch_installed_app(install_dir: String, app: AppHandle) -> Result<(), String> {
    let target_dir = PathBuf::from(install_dir);
    let target_exe = target_dir.join("SendKeep.exe");

    if target_exe.exists() {
        std::process::Command::new(&target_exe)
            .spawn()
            .map_err(|e| format!("Failed to spawn installed application: {}", e))?;

        // Gracefully exit the setup process
        app.exit(0);
        Ok(())
    } else {
        Err("Installed binary not found at destination".to_string())
    }
}

/// Exits the installer process.
#[tauri::command]
pub fn exit_installer(app: AppHandle) {
    app.exit(0);
}

/// Performs a clean Windows uninstallation when launched with `--uninstall`.
pub fn handle_uninstallation() {
    #[cfg(windows)]
    {
        // 1. Remove Desktop Shortcut
        if let Some(desktop_dir) = dirs::desktop_dir() {
            let lnk = desktop_dir.join("SendKeep.lnk");
            let _ = std::fs::remove_file(lnk);
        }

        // 2. Remove Start Menu Shortcut
        if let Some(roaming_data) = dirs::data_dir() {
            let lnk = roaming_data
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
                .join("SendKeep.lnk");
            let _ = std::fs::remove_file(lnk);
        }

        // 3. Remove Registry Run Key (Autostart)
        let _ = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'SendKeep' -ErrorAction SilentlyContinue",
            ])
            .output();

        // 4. Remove Uninstall Registry Key
        let _ = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Remove-Item -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SendKeep' -Recurse -Force -ErrorAction SilentlyContinue",
            ])
            .output();

        // 5. Native Message Box notifying user
        let _ = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; \
                 [System.Windows.Forms.MessageBox]::Show('SendKeep has been successfully removed from your computer.', 'SendKeep Uninstall', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)",
            ])
            .output();

        // 6. Schedule self-deletion of install folder
        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(parent_dir) = current_exe.parent() {
                let dir_str = parent_dir.to_string_lossy();
                let _ = std::process::Command::new("cmd")
                    .args([
                        "/C",
                        &format!("timeout /t 2 /nobreak > NUL && rmdir /S /Q \"{}\"", dir_str),
                    ])
                    .spawn();
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Internal Helper Functions
// -----------------------------------------------------------------------------

#[cfg(windows)]
async fn create_windows_shortcut(lnk_path: &Path, target_exe: &str, target_dir: &str, description: &str) {
    let lnk_str = lnk_path.to_string_lossy();
    let script = format!(
        "$ws = New-Object -ComObject WScript.Shell; \
         $s = $ws.CreateShortcut('{lnk}'); \
         $s.TargetPath = '{target}'; \
         $s.WorkingDirectory = '{dir}'; \
         $s.IconLocation = '{target},0'; \
         $s.Description = '{desc}'; \
         $s.Save();",
        lnk = lnk_str,
        target = target_exe,
        dir = target_dir,
        desc = description
    );
    let _ = run_hidden_powershell(&script).await;
}

#[cfg(windows)]
async fn register_windows_uninstall(install_dir: &str, target_exe: &str) -> Result<(), String> {
    let script = format!(
        "$regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\SendKeep'; \
         New-Item -Path $regPath -Force | Out-Null; \
         Set-ItemProperty -Path $regPath -Name 'DisplayName' -Value 'SendKeep'; \
         Set-ItemProperty -Path $regPath -Name 'DisplayVersion' -Value '1.0.0'; \
         Set-ItemProperty -Path $regPath -Name 'Publisher' -Value 'SendKeep'; \
         Set-ItemProperty -Path $regPath -Name 'DisplayIcon' -Value '{target},0'; \
         Set-ItemProperty -Path $regPath -Name 'InstallLocation' -Value '{dir}'; \
         Set-ItemProperty -Path $regPath -Name 'UninstallString' -Value '\"{target}\" --uninstall'; \
         Set-ItemProperty -Path $regPath -Name 'NoModify' -Value 1 -Type DWord; \
         Set-ItemProperty -Path $regPath -Name 'NoRepair' -Value 1 -Type DWord; \
         Set-ItemProperty -Path $regPath -Name 'EstimatedSize' -Value 5500 -Type DWord;",
        target = target_exe,
        dir = install_dir
    );
    run_hidden_powershell(&script).await
}

#[cfg(windows)]
async fn run_hidden_powershell(command: &str) -> Result<(), String> {
    let mut cmd = tokio::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", command]);
    #[allow(unused_imports)]
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("PowerShell execution failed: {}", e))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
