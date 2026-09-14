mod clipboard;
mod discovery;
mod fullscreen;
mod paste;
mod persistence;
mod server;
mod tray;
mod window_hooks;

use discovery::DiscoveryService;
use server::{start_server, DeviceInfo, ServerState};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn set_interactive(app: AppHandle, interactive: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(hwnd) = window.hwnd() {
            window_hooks::set_window_interactive(hwnd.0 as isize, interactive);
            if interactive {
                let _ = window.set_focus();
            }
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
async fn open_downloads_folder(server_state: tauri::State<'_, Arc<server::ServerState>>) -> Result<(), String> {
    let dir = server_state.save_dir.read().await.clone();
    let _ = tokio::fs::create_dir_all(&dir).await;
    let _ = std::process::Command::new("explorer")
        .arg(&dir)
        .spawn();
    Ok(())
}

#[tauri::command]
async fn pick_save_directory(
    server_state: tauri::State<'_, Arc<server::ServerState>>,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        let mut cmd = tokio::process::Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-Command",
            "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; \
             $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; \
             $dialog.Description = 'Select SendKeep Download Directory'; \
             $dialog.ShowNewFolderButton = $true; \
             if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { \
                 Write-Output $dialog.SelectedPath \
             }",
        ]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let output = cmd.output().await.map_err(|e| format!("Failed to open folder picker: {}", e))?;
        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path_str.is_empty() {
            return Err("Cancelled by user".to_string());
        }

        let new_path = PathBuf::from(&path_str);
        let _ = tokio::fs::create_dir_all(&new_path).await;
        server_state.set_save_dir(new_path).await;

        let mut current_settings = persistence::load_desktop_settings();
        current_settings.save_directory = path_str.clone();
        let _ = persistence::save_desktop_settings_to_disk(&current_settings);

        Ok(path_str)
    }
    #[cfg(not(windows))]
    {
        Err("Folder picker is only supported on Windows".to_string())
    }
}

#[tauri::command]
async fn update_desktop_settings(
    server_state: tauri::State<'_, Arc<server::ServerState>>,
    settings: persistence::DesktopSettings,
) -> Result<(), String> {
    let new_dir = PathBuf::from(&settings.save_directory);
    let _ = tokio::fs::create_dir_all(&new_dir).await;
    server_state.set_save_dir(new_dir).await;
    persistence::save_desktop_settings_to_disk(&settings)
}

#[tauri::command]
async fn set_windows_context_menu(enabled: bool) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe_path.to_string_lossy().to_string();
        if enabled {
            // Register for individual files
            let _ = tokio::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\*\shell\SendKeep", "/ve", "/d", "Send with SendKeep", "/f"])
                .creation_flags(0x08000000)
                .output().await;
            let _ = tokio::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\*\shell\SendKeep", "/v", "Icon", "/d", &exe_str, "/f"])
                .creation_flags(0x08000000)
                .output().await;
            let _ = tokio::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\*\shell\SendKeep\command", "/ve", "/d", &format!("\"{}\" \"%1\"", exe_str), "/f"])
                .creation_flags(0x08000000)
                .output().await;

            // Register for directories
            let _ = tokio::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\shell\SendKeep", "/ve", "/d", "Send with SendKeep", "/f"])
                .creation_flags(0x08000000)
                .output().await;
            let _ = tokio::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\shell\SendKeep", "/v", "Icon", "/d", &exe_str, "/f"])
                .creation_flags(0x08000000)
                .output().await;
            let _ = tokio::process::Command::new("reg")
                .args(["add", r"HKCU\Software\Classes\Directory\shell\SendKeep\command", "/ve", "/d", &format!("\"{}\" \"%1\"", exe_str), "/f"])
                .creation_flags(0x08000000)
                .output().await;

            // Register in Windows Explorer "Send to" submenu
            if let Some(data_dir) = dirs::data_dir() {
                let sendto_dir = data_dir.join(r"Microsoft\Windows\SendTo");
                let _ = std::fs::create_dir_all(&sendto_dir);
                let lnk_path = sendto_dir.join("Send with SendKeep.lnk");
                let lnk_str = lnk_path.to_string_lossy().to_string();
                let ps_cmd = format!(
                    "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{}'); $s.TargetPath = '{}'; $s.Save()",
                    lnk_str.replace('\'', "''"),
                    exe_str.replace('\'', "''")
                );
                let _ = tokio::process::Command::new("powershell")
                    .args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
                    .creation_flags(0x08000000)
                    .output().await;
            }
        } else {
            let _ = tokio::process::Command::new("reg")
                .args(["delete", r"HKCU\Software\Classes\*\shell\SendKeep", "/f"])
                .creation_flags(0x08000000)
                .output().await;
            let _ = tokio::process::Command::new("reg")
                .args(["delete", r"HKCU\Software\Classes\Directory\shell\SendKeep", "/f"])
                .creation_flags(0x08000000)
                .output().await;
            if let Some(data_dir) = dirs::data_dir() {
                let lnk_path = data_dir.join(r"Microsoft\Windows\SendTo\Send with SendKeep.lnk");
                let _ = std::fs::remove_file(lnk_path);
            }
        }

        let mut settings = persistence::load_desktop_settings();
        settings.context_menu_enabled = enabled;
        let _ = persistence::save_desktop_settings_to_disk(&settings);

        Ok(enabled)
    }
    #[cfg(not(windows))]
    {
        Err("Context menu is only supported on Windows".to_string())
    }
}

#[tauri::command]
async fn is_windows_context_menu_enabled() -> Result<bool, String> {
    #[cfg(windows)]
    {
        let output = tokio::process::Command::new("reg")
            .args(["query", r"HKCU\Software\Classes\*\shell\SendKeep"])
            .creation_flags(0x08000000)
            .output().await;
        match output {
            Ok(out) => Ok(out.status.success()),
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 64 * 1024 {
        return Err("File too large for snippet preview".to_string());
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    Ok(content)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub file_type: String,
    pub is_directory: bool,
    pub text_preview: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredFile {
    pub name: String,
    pub relative_path: String,
    pub full_path: String,
    pub size: u64,
    pub file_type: String,
}

#[tauri::command]
fn collect_folder_files(folder_path: String) -> Result<Vec<DiscoveredFile>, String> {
    let root = std::path::Path::new(&folder_path);
    if !root.exists() || !root.is_dir() {
        return Err("Not a directory".to_string());
    }

    let root_name = root.file_name().and_then(|n| n.to_str()).unwrap_or("folder");
    let mut results = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.is_file() {
                    if let Ok(meta) = path.metadata() {
                        let rel = path.strip_prefix(root).unwrap_or(&path);
                        let rel_str = format!("{}/{}", root_name, rel.to_string_lossy().replace('\\', "/"));
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
                        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                        let mime = match ext.as_str() {
                            "bmp" => "image/bmp",
                            "png" => "image/png",
                            "jpg" | "jpeg" => "image/jpeg",
                            "webp" => "image/webp",
                            "gif" => "image/gif",
                            "svg" => "image/svg+xml",
                            "mp4" | "mov" | "mkv" => "video/mp4",
                            "mp3" | "wav" | "flac" | "m4a" => "audio/mpeg",
                            "pdf" => "application/pdf",
                            "txt" => "text/plain",
                            "json" => "application/json",
                            "md" => "text/markdown",
                            "zip" | "rar" | "7z" | "tar" | "gz" => "application/zip",
                            _ => "application/octet-stream",
                        }.to_string();

                        results.push(DiscoveredFile {
                            name,
                            relative_path: rel_str,
                            full_path: path.to_string_lossy().to_string(),
                            size: meta.len(),
                            file_type: mime,
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebShareInfo {
    pub ip: String,
    pub port: u16,
    pub url: String,
    pub alias: String,
}

#[tauri::command]
async fn get_web_share_info(
    server_state: tauri::State<'_, Arc<server::ServerState>>,
) -> Result<WebShareInfo, String> {
    let ip = local_ip_address::local_ip()
        .map(|i| i.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = 53317;
    let url = format!("http://{}:{}/web", ip, port);
    let alias = server_state.device_info.alias.clone();
    Ok(WebShareInfo {
        ip,
        port,
        url,
        alias,
    })
}

#[tauri::command]
async fn sync_web_share_files(
    server_state: tauri::State<'_, Arc<server::ServerState>>,
    files: Vec<server::WebSharedFile>,
) -> Result<(), String> {
    server_state.set_web_shared_files(files).await;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub ip: String,
}

#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterfaceInfo> {
    let mut list = Vec::new();
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (name, ip) in interfaces {
            if let std::net::IpAddr::V4(ipv4) = ip {
                if !ipv4.is_loopback() {
                    list.push(NetworkInterfaceInfo {
                        name,
                        ip: ipv4.to_string(),
                    });
                }
            }
        }
    }
    list
}

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_info(path: String) -> Result<FileInfo, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("File does not exist".to_string());
    }
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let is_directory = p.is_dir();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let file_type = if is_directory {
        "folder".to_string()
    } else {
        match ext.as_str() {
            "bmp" => "image/bmp",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "mp4" | "mov" | "mkv" => "video/mp4",
            "mp3" | "wav" | "flac" | "m4a" => "audio/mpeg",
            "pdf" => "application/pdf",
            "txt" => "text/plain",
            "json" => "application/json",
            "md" => "text/markdown",
            "zip" | "rar" | "7z" | "tar" | "gz" => "application/zip",
            _ => "application/octet-stream",
        }
        .to_string()
    };

    let text_preview = if !is_directory && (ext == "txt" || ext == "json" || ext == "md") && metadata.len() < 64 * 1024 {
        std::fs::read_to_string(p).ok()
    } else {
        None
    };

    Ok(FileInfo {
        name,
        path,
        size: metadata.len(),
        file_type,
        is_directory,
        text_preview,
    })
}

fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        "Note".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
fn stage_drag_text(content: String, name: Option<String>) -> Result<String, String> {
    let staging_dir = std::env::temp_dir().join("SendKeep").join("staged");
    let _ = std::fs::create_dir_all(&staging_dir);

    let is_url = content.trim().starts_with("http://") || content.trim().starts_with("https://");
    let (file_name, file_content) = if is_url {
        let base_title = name.unwrap_or_else(|| "Link".to_string());
        let clean_name = sanitize_filename(&base_title);
        let fname = if clean_name.ends_with(".url") {
            clean_name
        } else {
            format!("{}.url", clean_name)
        };
        let url_shortcut = format!("[InternetShortcut]\r\nURL={}\r\n", content.trim());
        (fname, url_shortcut.into_bytes())
    } else {
        let base_title = name.unwrap_or_else(|| {
            let first_line = content.lines().next().unwrap_or("Note");
            let snippet: String = first_line.chars().take(24).collect();
            if snippet.trim().is_empty() {
                "Note".to_string()
            } else {
                snippet.trim().to_string()
            }
        });
        let clean_name = sanitize_filename(&base_title);
        let fname = if clean_name.ends_with(".txt") {
            clean_name
        } else {
            format!("{}.txt", clean_name)
        };
        (fname, content.into_bytes())
    };

    let target_path = staging_dir.join(&file_name);
    std::fs::write(&target_path, file_content).map_err(|e| e.to_string())?;

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn start_drag(app: AppHandle, paths: Vec<String>, preview_path: Option<String>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let file_paths: Vec<std::path::PathBuf> = paths
            .iter()
            .map(std::path::PathBuf::from)
            .filter(|p| p.exists())
            .collect();

        if file_paths.is_empty() {
            return Err("No existing files to drag".to_string());
        }

        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let item = drag::DragItem::Files(file_paths.clone());
            
            // Resolve drag image for Windows OLE drag:
            // 1. Explicit preview_path if provided and valid
            // 2. If first file is an image, drag its thumbnail directly
            let image = if let Some(ref p) = preview_path {
                let pb = std::path::PathBuf::from(p);
                if pb.exists() {
                    drag::Image::File(pb)
                } else {
                    drag::Image::Raw(vec![])
                }
            } else if let Some(first) = file_paths.first() {
                let ext = first.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp" | "gif" | "ico") {
                    drag::Image::File(first.clone())
                } else {
                    drag::Image::Raw(vec![])
                }
            } else {
                drag::Image::Raw(vec![])
            };

            let _ = drag::start_drag(
                &window,
                item,
                image,
                move |_result, pos| {
                    let _ = handle.emit("sendkeep:internal-drop", (pos.x, pos.y));
                },
                drag::Options::default(),
            );
        });
    }
    Ok(())
}

#[tauri::command]
async fn respond_pairing_request(
    state: tauri::State<'_, Arc<ServerState>>,
    request_id: String,
    accept: bool,
) -> Result<(), String> {
    if let Some(tx) = state.pending_pairs.write().await.remove(&request_id) {
        let _ = tx.send(accept);
    }
    Ok(())
}

#[tauri::command]
async fn cancel_transfer(
    app: AppHandle,
    server_state: tauri::State<'_, Arc<server::ServerState>>,
    session_id: String,
) -> Result<(), String> {
    println!("[SendKeep] User requested cancellation for session {}", session_id);
    server_state.cancellation_registry.cancel(&session_id).await;
    let partial_path = server_state.active_partial_files.write().await.remove(&session_id);
    if let Some(path) = partial_path {
        let _ = tokio::fs::remove_file(path).await;
    }
    let _ = app.emit(
        "sendkeep:transfer-progress",
        serde_json::json!({
            "sessionId": session_id,
            "fileId": "",
            "fileName": "Transfer",
            "bytesCurrent": 0,
            "bytesTotal": 0,
            "speedBytesPerSec": 0,
            "direction": "send",
            "peerAlias": "",
            "status": "cancelled",
            "errorMessage": "Transfer cancelled"
        }),
    );
    Ok(())
}

#[tauri::command]
async fn stream_file_to_peer(
    app: AppHandle,
    server_state: tauri::State<'_, Arc<server::ServerState>>,
    target_ip: String,
    port: u16,
    api_path: String,
    session_id: String,
    file_id: String,
    token: String,
    file_path: String,
    file_name: String,
    peer_alias: String,
) -> Result<(), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let p = std::path::Path::new(&file_path);
    if !p.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    let meta = tokio::fs::metadata(p).await.map_err(|e| e.to_string())?;
    let file_size = meta.len();

    let mut file = tokio::fs::File::open(p).await.map_err(|e| e.to_string())?;

    let addr = format!("{}:{}", target_ip, port);
    let socket = match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    {
        Ok(Ok(s)) => {
            let _ = s.set_nodelay(true);
            s
        }
        Ok(Err(e)) => {
            let err_msg = format!("Failed to connect to {}: {}", addr, e);
            let _ = app.emit(
                "sendkeep:transfer-progress",
                serde_json::json!({
                    "sessionId": session_id,
                    "fileId": file_id,
                    "fileName": file_name,
                    "bytesCurrent": 0,
                    "bytesTotal": file_size,
                    "speedBytesPerSec": 0,
                    "direction": "send",
                    "peerAlias": peer_alias,
                    "status": "failed",
                    "errorMessage": err_msg,
                    "localFilePath": file_path
                }),
            );
            return Err(err_msg);
        }
        Err(_) => {
            let err_msg = format!("Connection to {} timed out", addr);
            let _ = app.emit(
                "sendkeep:transfer-progress",
                serde_json::json!({
                    "sessionId": session_id,
                    "fileId": file_id,
                    "fileName": file_name,
                    "bytesCurrent": 0,
                    "bytesTotal": file_size,
                    "speedBytesPerSec": 0,
                    "direction": "send",
                    "peerAlias": peer_alias,
                    "status": "failed",
                    "errorMessage": err_msg,
                    "localFilePath": file_path
                }),
            );
            return Err(err_msg);
        }
    };

    let cancel_flag = server_state.cancellation_registry.register(&session_id).await;

    let (mut reader, mut writer) = socket.into_split();

    // Initial progress event
    let _ = app.emit(
        "sendkeep:transfer-progress",
        serde_json::json!({
            "sessionId": session_id,
            "fileId": file_id,
            "fileName": file_name,
            "bytesCurrent": 0,
            "bytesTotal": file_size,
            "speedBytesPerSec": 0,
            "direction": "send",
            "peerAlias": peer_alias,
            "status": "in_progress",
            "localFilePath": file_path
        }),
    );

    // Build HTTP/1.1 POST header
    let query_path = format!(
        "{}?sessionId={}&fileId={}&token={}",
        api_path, session_id, file_id, token
    );
    let headers = format!(
        "POST {} HTTP/1.1\r\n\
         Host: {}:{}\r\n\
         Content-Length: {}\r\n\
         Content-Type: application/octet-stream\r\n\
         Connection: close\r\n\
         \r\n",
        query_path, target_ip, port, file_size
    );

    if let Err(e) = writer.write_all(headers.as_bytes()).await {
        server_state.cancellation_registry.unregister(&session_id).await;
        let err_msg = format!("Failed writing headers: {}", e);
        let _ = app.emit(
            "sendkeep:transfer-progress",
            serde_json::json!({
                "sessionId": session_id,
                "fileId": file_id,
                "fileName": file_name,
                "bytesCurrent": 0,
                "bytesTotal": file_size,
                "speedBytesPerSec": 0,
                "direction": "send",
                "peerAlias": peer_alias,
                "status": "failed",
                "errorMessage": err_msg,
                "localFilePath": file_path
            }),
        );
        return Err(err_msg);
    }

    // 512KB buffer matching LocalSend high-speed chunk size
    let mut buf = vec![0u8; 512 * 1024];
    let mut sent_bytes: u64 = 0;
    let start_time = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();
    let mut last_sent: u64 = 0;

    while sent_bytes < file_size {
        if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
            // Notify peer receiver via HTTP cancel endpoint
            let target_addr = format!("{}:{}", target_ip, port);
            let session_id_clone = session_id.clone();
            tokio::spawn(async move {
                if let Ok(mut cs) = tokio::net::TcpStream::connect(&target_addr).await {
                    let cancel_req = format!(
                        "POST /api/localsend/v2/cancel?sessionId={} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
                        session_id_clone, target_addr
                    );
                    let _ = cs.write_all(cancel_req.as_bytes()).await;
                }
            });

            server_state.cancellation_registry.unregister(&session_id).await;
            let _ = app.emit(
                "sendkeep:transfer-progress",
                serde_json::json!({
                    "sessionId": session_id,
                    "fileId": file_id,
                    "fileName": file_name,
                    "bytesCurrent": sent_bytes,
                    "bytesTotal": file_size,
                    "speedBytesPerSec": 0,
                    "direction": "send",
                    "peerAlias": peer_alias,
                    "status": "cancelled",
                    "errorMessage": "Transfer cancelled",
                    "localFilePath": file_path
                }),
            );
            return Err("Transfer cancelled by user".to_string());
        }

        let to_read = std::cmp::min(buf.len() as u64, file_size - sent_bytes) as usize;
        let n = match file.read(&mut buf[..to_read]).await {
            Ok(n) => n,
            Err(e) => {
                server_state.cancellation_registry.unregister(&session_id).await;
                let err_msg = format!("Failed reading file: {}", e);
                let _ = app.emit(
                    "sendkeep:transfer-progress",
                    serde_json::json!({
                        "sessionId": session_id,
                        "fileId": file_id,
                        "fileName": file_name,
                        "bytesCurrent": sent_bytes,
                        "bytesTotal": file_size,
                        "speedBytesPerSec": 0,
                        "direction": "send",
                        "peerAlias": peer_alias,
                        "status": "failed",
                        "errorMessage": err_msg,
                        "localFilePath": file_path
                    }),
                );
                return Err(err_msg);
            }
        };

        if n == 0 {
            break;
        }

        if let Err(e) = writer.write_all(&buf[..n]).await {
            server_state.cancellation_registry.unregister(&session_id).await;
            let is_cancelled = cancel_flag.load(std::sync::atomic::Ordering::Relaxed);
            let _ = app.emit(
                "sendkeep:transfer-progress",
                serde_json::json!({
                    "sessionId": session_id,
                    "fileId": file_id,
                    "fileName": file_name,
                    "bytesCurrent": sent_bytes,
                    "bytesTotal": file_size,
                    "speedBytesPerSec": 0,
                    "direction": "send",
                    "peerAlias": peer_alias,
                    "status": if is_cancelled { "cancelled" } else { "failed" },
                    "errorMessage": if is_cancelled { "Transfer cancelled" } else { "Connection broken during upload" },
                    "localFilePath": file_path
                }),
            );
            return Err(if is_cancelled { "Transfer cancelled".to_string() } else { format!("Connection broken: {}", e) });
        }

        sent_bytes += n as u64;

        let now = std::time::Instant::now();
        if now.duration_since(last_emit).as_millis() >= 120 || sent_bytes == file_size {
            let delta_sec = now.duration_since(last_emit).as_secs_f64();
            let speed = if delta_sec > 0.05 {
                ((sent_bytes - last_sent) as f64 / delta_sec) as u64
            } else {
                (sent_bytes as f64 / now.duration_since(start_time).as_secs_f64().max(0.001)) as u64
            };
            last_emit = now;
            last_sent = sent_bytes;

            let is_done = sent_bytes == file_size;
            let _ = app.emit(
                "sendkeep:transfer-progress",
                serde_json::json!({
                    "sessionId": session_id,
                    "fileId": file_id,
                    "fileName": file_name,
                    "bytesCurrent": sent_bytes,
                    "bytesTotal": file_size,
                    "speedBytesPerSec": speed,
                    "direction": "send",
                    "peerAlias": peer_alias,
                    "status": if is_done { "completed" } else { "in_progress" },
                    "localFilePath": file_path
                }),
            );
        }
    }

    let _ = writer.flush().await;
    server_state.cancellation_registry.unregister(&session_id).await;

    // Read peer confirmation response (e.g. 200 OK)
    let mut resp_buf = [0u8; 512];
    let read_res = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        reader.read(&mut resp_buf),
    )
    .await;

    match read_res {
        Ok(Ok(n)) if n > 0 => {
            let resp_str = String::from_utf8_lossy(&resp_buf[..n]);
            if !resp_str.contains("200") && !resp_str.contains("204") {
                let err_msg = format!("Peer rejected file: {}", resp_str.lines().next().unwrap_or(""));
                let _ = app.emit(
                    "sendkeep:transfer-progress",
                    serde_json::json!({
                        "sessionId": session_id,
                        "fileId": file_id,
                        "fileName": file_name,
                        "bytesCurrent": sent_bytes,
                        "bytesTotal": file_size,
                        "speedBytesPerSec": 0,
                        "direction": "send",
                        "peerAlias": peer_alias,
                        "status": "failed",
                        "errorMessage": err_msg,
                        "localFilePath": file_path
                    }),
                );
                return Err(err_msg);
            }
        }
        Ok(Ok(_)) => {}
        Ok(Err(e)) => eprintln!("[StreamFile] Warning reading response: {}", e),
        Err(_) => eprintln!("[StreamFile] Timeout awaiting peer response confirmation"),
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.len() > 1 {
            let target_arg = args[1].clone();
            let p = std::path::PathBuf::from(&target_arg);
            if p.exists() {
                // If a SendKeep instance is already running on port 53317, forward the dropped path and exit immediately
                if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
                    &std::net::SocketAddr::from(([127, 0, 0, 1], 53317)),
                    std::time::Duration::from_millis(400),
                ) {
                    use std::io::Write;
                    let payload = serde_json::json!({ "path": target_arg }).to_string();
                    let http_req = format!(
                        "POST /api/sendkeep/v1/cli-drop HTTP/1.1\r\nHost: 127.0.0.1:53317\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        payload.len(),
                        payload
                    );
                    if stream.write_all(http_req.as_bytes()).is_ok() {
                        let _ = stream.flush();
                        return;
                    }
                }
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            set_interactive,
            open_file_in_folder,
            open_downloads_folder,
            start_drag,
            stage_drag_text,
            read_image_base64,
            read_text_file,
            read_file_bytes,
            get_file_info,
            get_local_ip,
            respond_pairing_request,
            fullscreen::check_fullscreen,
            persistence::load_persisted_items,
            persistence::save_persisted_items,
            persistence::get_device_fingerprint,
            persistence::get_desktop_settings,
            persistence::save_desktop_settings,
            update_desktop_settings,
            pick_save_directory,
            collect_folder_files,
            paste::simulate_paste,
            paste::copy_item_native,
            paste::copy_files_native,
            paste::paste_item_directly,
            discovery::send_pair_request,
            discovery::probe_peer,
            stream_file_to_peer,
            cancel_transfer,
            get_web_share_info,
            sync_web_share_files,
            set_windows_context_menu,
            is_windows_context_menu_enabled,
            get_network_interfaces,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Handle Explorer right-click / CLI file arguments on clean cold boot
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let target_arg = args[1].clone();
                let p = std::path::PathBuf::from(&target_arg);
                if p.exists() {
                    let app_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                        let _ = app_clone.emit("sendkeep:cli-file-dropped", target_arg);
                    });
                }
            }

            // Set up system tray icon and menu
            let _ = tray::setup_tray(&app_handle);
            
            // Load or initialize persistent unique fingerprint
            let fingerprint = persistence::get_or_create_device_fingerprint();
            // Load persistent desktop settings
            let desktop_settings = persistence::load_desktop_settings();

            // Ensure Windows Explorer "Send to" shortcut and context menu verbs are synchronized
            if desktop_settings.context_menu_enabled {
                tauri::async_runtime::spawn(async move {
                    let _ = set_windows_context_menu(true).await;
                });
            }
            let downloads_dir = PathBuf::from(&desktop_settings.save_directory);
            let alias = if !desktop_settings.device_alias.trim().is_empty() {
                desktop_settings.device_alias.trim().to_string()
            } else {
                hostname::get()
                    .map(|h| h.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "Windows Laptop".to_string())
            };

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

            let server_state = Arc::new(ServerState::new(app_handle.clone(), device_info.clone(), downloads_dir));
            app.manage(server_state.clone());

            // 1. Start HTTP Server
            let server_state_clone = server_state.clone();
            tauri::async_runtime::spawn(async move {
                start_server(server_state_clone, port).await;
            });

            // 2. Start Multicast Discovery
            let discovery = Arc::new(DiscoveryService::new(app_handle.clone(), alias, fingerprint, port));
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

            // 4. Start Real Windows Clipboard Watcher
            clipboard::start_clipboard_watcher(app_handle.clone());

            // Set initial click-through state and fit to work area (excluding taskbar)
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    if let Ok(hwnd) = window.hwnd() {
                        if let Some((rc_monitor, _rc_work)) = window_hooks::get_monitor_and_work_rect(hwnd.0 as isize) {
                            let scale = window.scale_factor().unwrap_or(1.0);
                            let mon_h = (rc_monitor.bottom - rc_monitor.top) as f64;

                            // 100vh: Spans the full height of the display monitor
                            let (phys_width, phys_height, phys_x, phys_y) = if mon_h >= 1000.0 {
                                (
                                    (350.0 * scale).round() as u32,
                                    mon_h.round() as u32,
                                    rc_monitor.left,
                                    rc_monitor.top,
                                )
                            } else {
                                (
                                    (350.0 * scale).round() as u32,
                                    (mon_h * scale).round() as u32,
                                    (rc_monitor.left as f64 * scale).round() as i32,
                                    (rc_monitor.top as f64 * scale).round() as i32,
                                )
                            };

                            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                                width: phys_width,
                                height: phys_height,
                            }));
                            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                x: phys_x,
                                y: phys_y,
                            }));
                        }
                    }
                }
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
