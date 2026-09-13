#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, VK_CONTROL, VIRTUAL_KEY,
};

#[cfg(target_os = "windows")]
pub fn copy_native(path: Option<&str>, content: Option<&str>, is_image: bool) -> Result<(), String> {
    use std::ffi::c_void;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hWndNewOwner: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn SetClipboardData(uFormat: u32, hMem: *mut c_void) -> *mut c_void;
        fn RegisterClipboardFormatW(lpszFormat: *const u16) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(uFlags: u32, dwBytes: usize) -> *mut c_void;
        fn GlobalLock(hMem: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(hMem: *mut c_void) -> i32;
    }

    const GMEM_MOVEABLE: u32 = 0x0002;
    const GMEM_ZEROINIT: u32 = 0x0040;
    const CF_DIB: u32 = 8;
    const CF_UNICODETEXT: u32 = 13;
    const CF_HDROP: u32 = 15;

    #[repr(C)]
    struct DROPFILES {
        p_files: u32,
        pt_x: i32,
        pt_y: i32,
        f_nc: i32,
        f_wide: i32,
    }

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err("Failed to open clipboard".to_string());
        }
        EmptyClipboard();

        // 1. If path is provided and exists on disk
        if let Some(p_str) = path {
            let p = Path::new(p_str);
            if p.exists() {
                // If it's an image, set rich visual bitmap formats
                if is_image {
                    if let Ok(bytes) = std::fs::read(p) {
                        // Check if it's a BMP file (starts with "BM" and > 14 bytes)
                        if bytes.len() > 14 && &bytes[0..2] == b"BM" {
                            let dib_bytes = &bytes[14..];
                            let h_dib = GlobalAlloc(GMEM_MOVEABLE, dib_bytes.len());
                            if !h_dib.is_null() {
                                let ptr = GlobalLock(h_dib);
                                if !ptr.is_null() {
                                    std::ptr::copy_nonoverlapping(dib_bytes.as_ptr(), ptr as *mut u8, dib_bytes.len());
                                    GlobalUnlock(h_dib);
                                    SetClipboardData(CF_DIB, h_dib);
                                }
                            }
                        } else {
                            // Register PNG clipboard format for high quality PNG copying
                            let png_fmt_name: Vec<u16> = std::ffi::OsStr::new("PNG")
                                .encode_wide()
                                .chain(std::iter::once(0))
                                .collect();
                            let cf_png = RegisterClipboardFormatW(png_fmt_name.as_ptr());
                            if cf_png != 0 {
                                let h_png = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
                                if !h_png.is_null() {
                                    let ptr = GlobalLock(h_png);
                                    if !ptr.is_null() {
                                        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr as *mut u8, bytes.len());
                                        GlobalUnlock(h_png);
                                        SetClipboardData(cf_png, h_png);
                                    }
                                }
                            }
                        }
                    }
                }

                // In all file cases (images, clips, docs, archives), set CF_HDROP!
                // CF_HDROP instructs Windows Explorer, Desktop, Discord, Slack, email clients to paste the actual file!
                let wide_path: Vec<u16> = std::ffi::OsStr::new(p_str)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .chain(std::iter::once(0)) // double null terminated
                    .collect();

                let df_size = std::mem::size_of::<DROPFILES>();
                let total_size = df_size + (wide_path.len() * 2);

                let h_drop = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size);
                if !h_drop.is_null() {
                    let ptr = GlobalLock(h_drop);
                    if !ptr.is_null() {
                        let df = DROPFILES {
                            p_files: df_size as u32,
                            pt_x: 0,
                            pt_y: 0,
                            f_nc: 0,
                            f_wide: 1, // UTF-16
                        };
                        std::ptr::copy_nonoverlapping(&df as *const _ as *const u8, ptr as *mut u8, df_size);
                        let dest = (ptr as usize + df_size) as *mut u16;
                        std::ptr::copy_nonoverlapping(wide_path.as_ptr(), dest, wide_path.len());
                        GlobalUnlock(h_drop);
                        SetClipboardData(CF_HDROP, h_drop);
                    }
                }
            }
        }

        // 2. CF_UNICODETEXT fallback
        let text_candidate = content.unwrap_or_else(|| path.unwrap_or(""));
        if !text_candidate.is_empty() {
            let wide_text: Vec<u16> = std::ffi::OsStr::new(text_candidate)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let h_text = GlobalAlloc(GMEM_MOVEABLE, wide_text.len() * 2);
            if !h_text.is_null() {
                let ptr = GlobalLock(h_text);
                if !ptr.is_null() {
                    std::ptr::copy_nonoverlapping(wide_text.as_ptr(), ptr as *mut u16, wide_text.len());
                    GlobalUnlock(h_text);
                    SetClipboardData(CF_UNICODETEXT, h_text);
                }
            }
        }

        CloseClipboard();
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn copy_native(_path: Option<&str>, _content: Option<&str>, _is_image: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub async fn send_ctrl_v() -> Result<(), String> {
    // Settle delay to allow target window to take foreground focus
    tokio::time::sleep(std::time::Duration::from_millis(90)).await;

    unsafe {
        let inputs = [
            // Ctrl Down
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_CONTROL,
                        wScan: 0,
                        dwFlags: KEYBD_EVENT_FLAGS(0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            // 'V' Down (0x56)
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0x56),
                        wScan: 0,
                        dwFlags: KEYBD_EVENT_FLAGS(0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            // 'V' Up
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0x56),
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            // Ctrl Up
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VK_CONTROL,
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];

        let sent = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err("Failed to send keystroke input".to_string())
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn send_ctrl_v() -> Result<(), String> {
    Err("Not supported on this platform".to_string())
}

#[tauri::command]
pub async fn simulate_paste() -> Result<(), String> {
    send_ctrl_v().await
}

#[tauri::command]
pub async fn copy_item_native(
    path: Option<String>,
    content: Option<String>,
    is_image: bool,
) -> Result<(), String> {
    copy_native(path.as_deref(), content.as_deref(), is_image)
}

#[tauri::command]
pub async fn paste_item_directly(
    path: Option<String>,
    content: Option<String>,
    is_image: bool,
) -> Result<(), String> {
    copy_native(path.as_deref(), content.as_deref(), is_image)?;
    send_ctrl_v().await
}
