mod discovery;
mod server;
mod window_hooks;

use discovery::DiscoveryService;
use server::{start_server, DeviceInfo, ServerState};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

#[tauri::command]
fn set_interactive(app: AppHandle, interactive: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(hwnd) = window.hwnd() {
            window_hooks::set_window_interactive(hwnd.0 as isize, interactive);
        }
    }
}

#[tauri::command]
fn open_file_in_folder(path: String) {
    let p = std::path::Path::new(&path);
    if p.exists() {
        let _ = std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn();
    }
}

#[tauri::command]
fn open_downloads_folder() {
    let dir = dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("SendKeep");
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::process::Command::new("explorer")
        .arg(&dir)
        .spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            set_interactive,
            open_file_in_folder,
            open_downloads_folder,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Generate or load unique fingerprint
            let fingerprint = format!("sk_win_{}", &Uuid::new_v4().to_string()[..8]);
            let alias = hostname::get()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|_| "Windows Laptop".to_string());

            let port = 53317;

            let device_info = DeviceInfo {
                alias: alias.clone(),
                version: "2.1".to_string(),
                device_model: Some("Windows PC".to_string()),
                device_type: "desktop".to_string(),
                fingerprint: fingerprint.clone(),
                port,
                protocol: "http".to_string(),
                download: false,
            };

            // Configure save directory (Downloads/SendKeep)
            let downloads_dir = dirs::download_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("SendKeep");

            let server_state = ServerState::new(app_handle.clone(), device_info.clone(), downloads_dir);

            // 1. Start HTTP Server
            tauri::async_runtime::spawn(async move {
                start_server(server_state, port).await;
            });

            // 2. Start Multicast Discovery
            let discovery = Arc::new(DiscoveryService::new(alias, fingerprint, port));
            tauri::async_runtime::spawn(async move {
                discovery.start().await;
            });

            // 3. Start 16ms Screen Edge Cursor Tracking
            let edge_app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(16));
                loop {
                    interval.tick().await;
                    if let Some((x, y)) = window_hooks::get_cursor_position() {
                        let _ = edge_app.emit("sendkeep:cursor-pos", (x, y));
                    }
                }
            });

            // Set initial click-through state
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(hwnd) = window.hwnd() {
                    window_hooks::set_window_interactive(hwnd.0 as isize, false);
                }
            }

            println!("[SendKeep] Initialized successfully. Background daemon active.");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
