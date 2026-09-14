#[cfg(target_os = "windows")]
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState,
    QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
};

#[cfg(target_os = "windows")]
pub fn is_fullscreen_active() -> bool {
    unsafe {
        if let Ok(state) = SHQueryUserNotificationState() {
            state == QUNS_RUNNING_D3D_FULL_SCREEN
                || state == QUNS_PRESENTATION_MODE
        } else {
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_fullscreen_active() -> bool {
    false
}

#[tauri::command]
pub fn check_fullscreen() -> bool {
    is_fullscreen_active()
}
