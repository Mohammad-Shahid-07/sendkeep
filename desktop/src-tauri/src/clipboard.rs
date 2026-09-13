use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItemPayload {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: usize,
    pub file_type: String,
    pub sender: String,
    pub source: String,
    pub timestamp: u64,
    pub content: Option<String>,
    pub preview_url: Option<String>,
    pub pinned: Option<bool>,
    pub hit_count: Option<u32>,
    pub is_stack: Option<bool>,
    pub is_expanded: Option<bool>,
    pub bundle_items: Option<Vec<ClipboardItemPayload>>,
}

#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;

    pub const CF_DIB: u32 = 8;
    pub const CF_UNICODETEXT: u32 = 13;
    pub const CF_HDROP: u32 = 15;

    #[link(name = "user32")]
    extern "system" {
        pub fn GetClipboardSequenceNumber() -> u32;
        pub fn OpenClipboard(hWndNewOwner: *mut c_void) -> i32;
        pub fn CloseClipboard() -> i32;
        pub fn IsClipboardFormatAvailable(format: u32) -> i32;
        pub fn GetClipboardData(uFormat: u32) -> *mut c_void;
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GlobalLock(hMem: *mut c_void) -> *mut c_void;
        pub fn GlobalUnlock(hMem: *mut c_void) -> i32;
        pub fn GlobalSize(hMem: *mut c_void) -> usize;
    }

    #[link(name = "shell32")]
    extern "system" {
        pub fn DragQueryFileW(hDrop: *mut c_void, iFile: u32, lpszFile: *mut u16, cch: u32) -> u32;
    }
}

#[cfg(target_os = "windows")]
fn check_clipboard(clips_dir: &PathBuf, last_hash: &mut String) -> Option<ClipboardItemPayload> {
    unsafe {
        if win32::OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }

        let mut item = None;

        // 1. Check for Files Copied in Explorer (CF_HDROP = 15)
        if win32::IsClipboardFormatAvailable(win32::CF_HDROP) != 0 {
            let handle = win32::GetClipboardData(win32::CF_HDROP);
            if !handle.is_null() {
                let count = win32::DragQueryFileW(handle, 0xFFFFFFFF, std::ptr::null_mut(), 0);
                if count > 0 {
                    let mut file_paths = Vec::new();
                    for i in 0..count {
                        let mut buf = [0u16; 1024];
                        let len = win32::DragQueryFileW(handle, i, buf.as_mut_ptr(), buf.len() as u32);
                        if len > 0 {
                            let path_str = String::from_utf16_lossy(&buf[..len as usize]);
                            file_paths.push(path_str);
                        }
                    }

                    if !file_paths.is_empty() {
                        let hash = file_paths.join("|");
                        if &hash != last_hash {
                            *last_hash = hash;
                            let now = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            if file_paths.len() == 1 {
                                let path = &file_paths[0];
                                let p = std::path::Path::new(path);
                                let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| path.clone());
                                let size = std::fs::metadata(path).map(|m| m.len() as usize).unwrap_or(0);
                                let ext = p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
                                let is_img = ["png", "jpg", "jpeg", "webp", "gif", "bmp"].contains(&ext.to_lowercase().as_str());

                                item = Some(ClipboardItemPayload {
                                    id: format!("clip-file-{}", now),
                                    name,
                                    path: path.clone(),
                                    size,
                                    file_type: if is_img { format!("image/{}", ext) } else { "application/octet-stream".to_string() },
                                    sender: "Windows Explorer".to_string(),
                                    source: "clipboard".to_string(),
                                    timestamp: now,
                                    content: None,
                                    preview_url: None,
                                    pinned: Some(false),
                                    hit_count: Some(1),
                                    is_stack: Some(false),
                                    is_expanded: Some(false),
                                    bundle_items: None,
                                });
                            } else {
                                let mut total_size = 0;
                                let sub_items: Vec<ClipboardItemPayload> = file_paths.iter().enumerate().map(|(idx, path)| {
                                    let p = std::path::Path::new(path);
                                    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| path.clone());
                                    let sz = std::fs::metadata(path).map(|m| m.len() as usize).unwrap_or(0);
                                    total_size += sz;
                                    let ext = p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
                                    let is_img = ["png", "jpg", "jpeg", "webp", "gif", "bmp"].contains(&ext.to_lowercase().as_str());

                                    ClipboardItemPayload {
                                        id: format!("clip-sub-{}-{}", now, idx),
                                        name,
                                        path: path.clone(),
                                        size: sz,
                                        file_type: if is_img { format!("image/{}", ext) } else { "application/octet-stream".to_string() },
                                        sender: "Windows Explorer".to_string(),
                                        source: "clipboard".to_string(),
                                        timestamp: now,
                                        content: None,
                                        preview_url: None,
                                        pinned: Some(false),
                                        hit_count: Some(1),
                                        is_stack: Some(false),
                                        is_expanded: Some(false),
                                        bundle_items: None,
                                    }
                                }).collect();

                                item = Some(ClipboardItemPayload {
                                    id: format!("clip-stack-{}", now),
                                    name: format!("Copied Collection ({} files)", sub_items.len()),
                                    path: String::new(),
                                    size: total_size,
                                    file_type: "bundle/files".to_string(),
                                    sender: "Windows Explorer".to_string(),
                                    source: "clipboard".to_string(),
                                    timestamp: now,
                                    content: None,
                                    preview_url: None,
                                    pinned: Some(false),
                                    hit_count: Some(1),
                                    is_stack: Some(true),
                                    is_expanded: Some(false),
                                    bundle_items: Some(sub_items),
                                });
                            }
                        }
                    }
                }
            }
        }
        // 2. Check for Images / Screenshots (CF_DIB = 8)
        else if win32::IsClipboardFormatAvailable(win32::CF_DIB) != 0 {
            let handle = win32::GetClipboardData(win32::CF_DIB);
            if !handle.is_null() {
                let ptr = win32::GlobalLock(handle);
                if !ptr.is_null() {
                    let size = win32::GlobalSize(handle);
                    if size > 40 {
                        let slice = std::slice::from_raw_parts(ptr as *const u8, size);
                        // Fingerprint using sample bytes and length
                        let sample_len = size.min(256);
                        let checksum = slice[..sample_len].iter().fold(0u32, |acc, &b| acc.wrapping_add(b as u32));
                        let hash = format!("dib-{}-{}", size, checksum);

                        if &hash != last_hash {
                            *last_hash = hash;
                            let now = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            let _ = std::fs::create_dir_all(clips_dir);
                            let file_name = format!("Screenshot_{}.bmp", now);
                            let out_path = clips_dir.join(&file_name);

                            let header_size = u32::from_le_bytes(slice[0..4].try_into().unwrap_or([40, 0, 0, 0]));
                            let bit_count = u16::from_le_bytes(slice[14..16].try_into().unwrap_or([24, 0]));
                            let clr_used = u32::from_le_bytes(slice[32..36].try_into().unwrap_or([0, 0, 0, 0]));

                            let palette_colors = if clr_used > 0 {
                                clr_used
                            } else if bit_count <= 8 {
                                1 << bit_count
                            } else {
                                0
                            };

                            let off_bits = 14 + header_size + palette_colors * 4;
                            let file_size = 14 + size as u32;

                            let mut bmp_bytes = Vec::with_capacity(14 + size);
                            bmp_bytes.extend_from_slice(&0x4D42u16.to_le_bytes());
                            bmp_bytes.extend_from_slice(&file_size.to_le_bytes());
                            bmp_bytes.extend_from_slice(&0u16.to_le_bytes());
                            bmp_bytes.extend_from_slice(&0u16.to_le_bytes());
                            bmp_bytes.extend_from_slice(&off_bits.to_le_bytes());
                            bmp_bytes.extend_from_slice(slice);

                            let b64_url = if size <= 5 * 1024 * 1024 {
                                use base64::Engine;
                                let b64 = base64::engine::general_purpose::STANDARD.encode(&bmp_bytes);
                                Some(format!("data:image/bmp;base64,{}", b64))
                            } else {
                                None
                            };

                            if std::fs::write(&out_path, bmp_bytes).is_ok() {
                                let abs_path = out_path.to_string_lossy().to_string();
                                item = Some(ClipboardItemPayload {
                                    id: format!("clip-img-{}", now),
                                    name: file_name,
                                    path: abs_path,
                                    size,
                                    file_type: "image/bmp".to_string(),
                                    sender: "Windows Snipping Tool".to_string(),
                                    source: "clipboard".to_string(),
                                    timestamp: now,
                                    content: None,
                                    preview_url: b64_url,
                                    pinned: Some(false),
                                    hit_count: Some(1),
                                    is_stack: Some(false),
                                    is_expanded: Some(false),
                                    bundle_items: None,
                                });
                            }
                        }
                    }
                    win32::GlobalUnlock(handle);
                }
            }
        }
        // 3. Check for Text / Code / Links (CF_UNICODETEXT = 13)
        else if win32::IsClipboardFormatAvailable(win32::CF_UNICODETEXT) != 0 {
            let handle = win32::GetClipboardData(win32::CF_UNICODETEXT);
            if !handle.is_null() {
                let ptr = win32::GlobalLock(handle);
                if !ptr.is_null() {
                    let u16_ptr = ptr as *const u16;
                    let mut len = 0;
                    while *u16_ptr.add(len) != 0 {
                        len += 1;
                    }
                    if len > 0 {
                        let slice = std::slice::from_raw_parts(u16_ptr, len);
                        let text = String::from_utf16_lossy(slice);
                        let trimmed = text.trim();

                        if !trimmed.is_empty() && trimmed != last_hash.as_str() {
                            *last_hash = trimmed.to_string();
                            let now = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            let is_link = trimmed.starts_with("http://") || trimmed.starts_with("https://");
                            let is_color = trimmed.starts_with('#') && (trimmed.len() == 4 || trimmed.len() == 7);

                            let name = if is_link {
                                "Web Link".to_string()
                            } else if is_color {
                                format!("Color ({})", trimmed)
                            } else {
                                let first_line = trimmed.lines().next().unwrap_or("Text Note");
                                if first_line.len() > 32 {
                                    format!("{}...", &first_line[..32])
                                } else {
                                    first_line.to_string()
                                }
                            };

                            item = Some(ClipboardItemPayload {
                                id: format!("clip-txt-{}", now),
                                name,
                                path: String::new(),
                                size: text.len(),
                                file_type: if is_link { "text/uri-list".to_string() } else { "text/plain".to_string() },
                                sender: "Windows Clipboard".to_string(),
                                source: "clipboard".to_string(),
                                timestamp: now,
                                content: Some(text),
                                preview_url: None,
                                pinned: Some(false),
                                hit_count: Some(1),
                                is_stack: Some(false),
                                is_expanded: Some(false),
                                bundle_items: None,
                            });
                        }
                    }
                    win32::GlobalUnlock(handle);
                }
            }
        }

        win32::CloseClipboard();
        item
    }
}

fn prune_old_files(dir: &PathBuf, max_age_secs: u64) {
    let now = SystemTime::now();
    let max_age = std::time::Duration::from_secs(max_age_secs);

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    if let Ok(age) = now.duration_since(modified) {
                        if age > max_age {
                            let _ = std::fs::remove_file(entry.path());
                        }
                    }
                }
            }
        }
    }
}

pub fn start_clipboard_watcher(app_handle: AppHandle) {
    let clips_dir = dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("SendKeep")
        .join("Clips");

    // Clean up temporary clipboard snapshots and staged drag files older than 48 hours
    prune_old_files(&clips_dir, 48 * 3600);
    let staging_dir = std::env::temp_dir().join("SendKeep").join("staged");
    prune_old_files(&staging_dir, 48 * 3600);

    tauri::async_runtime::spawn(async move {
        #[cfg(target_os = "windows")]
        {
            let mut last_seq = 0u32;
            let mut last_hash = String::new();
            let mut interval = tokio::time::interval(std::time::Duration::from_millis(250));

            loop {
                interval.tick().await;
                let seq = unsafe { win32::GetClipboardSequenceNumber() };
                if seq != last_seq && seq != 0 {
                    last_seq = seq;
                    if let Some(item) = check_clipboard(&clips_dir, &mut last_hash) {
                        println!("[SendKeep Clipboard] Captured: {} ({})", item.name, item.file_type);
                        let _ = app_handle.emit("sendkeep:clipboard-item", item);
                    }
                }
            }
        }
    });
}
