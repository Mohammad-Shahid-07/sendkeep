#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HWND, POINT, RECT};
#[cfg(target_os = "windows")]
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
};
#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongW, SetForegroundWindow, SetWindowLongW,
    SetWindowPos, GWL_EXSTYLE, HWND_TOPMOST,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TRANSPARENT,
};

#[cfg(target_os = "windows")]
pub fn set_window_interactive(hwnd: isize, interactive: bool) {
    unsafe {
        let hwnd_val = HWND(hwnd as *mut std::ffi::c_void);
        let ex_style = GetWindowLongW(hwnd_val, GWL_EXSTYLE);
        
        let new_style = if interactive {
            // Remove click-through AND remove WS_EX_NOACTIVATE so user can focus and type into inputs
            (ex_style & !(WS_EX_TRANSPARENT.0 as i32)) & !(WS_EX_NOACTIVATE.0 as i32)
        } else {
            // Enable click-through and suppress activation
            ex_style | (WS_EX_TRANSPARENT.0 as i32) | (WS_EX_LAYERED.0 as i32) | (WS_EX_NOACTIVATE.0 as i32)
        };

        if ex_style != new_style {
            SetWindowLongW(hwnd_val, GWL_EXSTYLE, new_style);
            // Always retain HWND_TOPMOST so SendKeep never gets buried behind other windows
            let _ = SetWindowPos(
                hwnd_val,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
        if interactive {
            let _ = SetForegroundWindow(hwnd_val);
        }
    }
}

#[cfg(target_os = "windows")]
pub fn get_monitor_and_work_rect(hwnd: isize) -> Option<(RECT, RECT)> {
    unsafe {
        let hwnd_val = HWND(hwnd as *mut std::ffi::c_void);
        let hmon = MonitorFromWindow(hwnd_val, MONITOR_DEFAULTTOPRIMARY);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            Some((mi.rcMonitor, mi.rcWork))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_monitor_and_work_rect(_hwnd: isize) -> Option<()> {
    None
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
