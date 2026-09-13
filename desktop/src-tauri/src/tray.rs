use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open_i = MenuItem::with_id(app, "toggle_shelf", "Toggle Shelf", true, None::<&str>)?;
    let downloads_i = MenuItem::with_id(app, "open_downloads", "Open Downloads Folder", true, None::<&str>)?;
    let clear_i = MenuItem::with_id(app, "clear_history", "Clear Unpinned History", true, None::<&str>)?;
    let incognito_i = MenuItem::with_id(app, "toggle_incognito", "Toggle Incognito Mode", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit SendKeep", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_i,
            &downloads_i,
            &clear_i,
            &incognito_i,
            &quit_i,
        ],
    )?;

    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::new(&[], 0, 0)
    });

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("SendKeep — Edge Shelf & Beam")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle_shelf" => {
                let _ = app.emit("sendkeep:toggle-shelf", ());
            }
            "open_downloads" => {
                let dir = dirs::download_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("SendKeep");
                let _ = std::process::Command::new("explorer").arg(&dir).spawn();
            }
            "clear_history" => {
                let _ = app.emit("sendkeep:clear-unpinned", ());
            }
            "toggle_incognito" => {
                let _ = app.emit("sendkeep:toggle-incognito", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let _ = app.emit("sendkeep:toggle-shelf", ());
            }
        })
        .build(app)?;

    Ok(())
}
