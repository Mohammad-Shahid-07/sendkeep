#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, POINT};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};

#[cfg(target_os = "windows")]
pub fn set_window_interactive(hwnd: isize, interactive: bool) {
    unsafe {
        let hwnd_val = HWND(hwnd as *mut std::ffi::c_void);
        let ex_style = GetWindowLongW(hwnd_val, GWL_EXSTYLE);
        
        let new_style = if interactive {
            // Remove click-through
            ex_style & !WS_EX_TRANSPARENT.0 as i32
        } else {
            // Enable click-through
            ex_style | (WS_EX_TRANSPARENT.0 as i32) | (WS_EX_LAYERED.0 as i32)
        };

        SetWindowLongW(hwnd_val, GWL_EXSTYLE, new_style);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set_window_interactive(_hwnd: isize, _interactive: bool) {}

#[cfg(target_os = "windows")]
pub fn get_cursor_position() -> Option<(i32, i32)> {
    unsafe {
        let mut pt = POINT::default();
        if GetCursorPos(&mut pt).is_ok() {
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_cursor_position() -> Option<(i32, i32)> {
    None
}
