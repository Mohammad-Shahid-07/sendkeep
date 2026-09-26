use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    pub save_directory: String,
    pub device_alias: String,
    pub sound_effects_enabled: bool,
    pub auto_accept_trusted: bool,
    #[serde(default = "default_collision_strategy")]
    pub collision_strategy: String, // "rename", "overwrite", "skip"
    #[serde(default)]
    pub require_pin: bool,
    pub security_pin: Option<String>,
    #[serde(default = "default_context_menu_enabled")]
    pub context_menu_enabled: bool,
    #[serde(default = "default_stick_position")]
    pub stick_position: String,
    #[serde(default)]
    pub stick_display_id: Option<String>,
    #[serde(default = "default_vertical_offset")]
    pub vertical_offset: f64,
    #[serde(default = "default_trigger_alignment")]
    pub trigger_alignment: String,
    #[serde(default = "default_hot_zone_height")]
    pub hot_zone_height: f64,
    #[serde(default = "default_hot_zone_width")]
    pub hot_zone_width: f64,
    #[serde(default = "default_panel_height")]
    pub panel_height: f64,
    #[serde(default = "default_true")]
    pub show_copy_indicator: bool,
    #[serde(default = "default_copy_indicator_style")]
    pub copy_indicator_style: String,
    #[serde(default = "default_true")]
    pub hover_activation: bool,
    #[serde(default = "default_toggle_hotkey")]
    pub toggle_hotkey: String,
    #[serde(default = "default_true")]
    pub suppress_in_fullscreen: bool,
    #[serde(default = "default_font_size_scale")]
    pub font_size_scale: f64,
    #[serde(default = "default_true")]
    pub show_edge_location_hint: bool,
    #[serde(default)]
    pub auto_delete_hours: u32,
    #[serde(default = "default_history_limit")]
    pub history_limit: usize,
    #[serde(default = "default_true")]
    pub autostart_enabled: bool,
    #[serde(default = "default_hover_dwell_ms")]
    pub hover_dwell_ms: u32,
}

fn default_hover_dwell_ms() -> u32 {
    50
}

fn default_context_menu_enabled() -> bool {
    true
}

fn default_collision_strategy() -> String {
    "rename".to_string()
}

fn default_stick_position() -> String {
    "left".to_string()
}

fn default_vertical_offset() -> f64 {
    0.5
}

fn default_trigger_alignment() -> String {
    "center".to_string()
}

fn default_hot_zone_height() -> f64 {
    0.4
}

fn default_hot_zone_width() -> f64 {
    3.0
}

fn default_panel_height() -> f64 {
    0.65
}

fn default_true() -> bool {
    true
}

fn default_copy_indicator_style() -> String {
    "logo".to_string()
}

fn default_toggle_hotkey() -> String {
    "Alt+C".to_string()
}

fn default_font_size_scale() -> f64 {
    1.0
}

fn default_history_limit() -> usize {
    500
}

impl Default for DesktopSettings {
    fn default() -> Self {
        let default_save = dirs::download_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("SendKeep")
            .to_string_lossy()
            .to_string();
        let default_alias = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "Windows PC".to_string());

        Self {
            save_directory: default_save,
            device_alias: default_alias,
            sound_effects_enabled: true,
            auto_accept_trusted: true,
            collision_strategy: "rename".to_string(),
            require_pin: false,
            security_pin: None,
            context_menu_enabled: true,
            stick_position: "left".to_string(),
            stick_display_id: None,
            vertical_offset: 0.5,
            trigger_alignment: "center".to_string(),
            hot_zone_height: 0.4,
            hot_zone_width: 4.0,
            panel_height: 0.65,
            show_copy_indicator: true,
            copy_indicator_style: "logo".to_string(),
            hover_activation: true,
            toggle_hotkey: "Alt+C".to_string(),
            suppress_in_fullscreen: true,
            font_size_scale: 1.0,
            show_edge_location_hint: true,
            auto_delete_hours: 0,
            history_limit: 500,
            autostart_enabled: true,
            hover_dwell_ms: 50,
        }
    }
}

fn get_storage_path() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("SendKeep")
}

pub fn load_desktop_settings() -> DesktopSettings {
    let dir = get_storage_path();
    let file_path = dir.join("settings.json");
    if let Ok(content) = fs::read_to_string(&file_path) {
        if let Ok(settings) = serde_json::from_str::<DesktopSettings>(&content) {
            return settings;
        }
    }
    DesktopSettings::default()
}

pub fn save_desktop_settings_to_disk(settings: &DesktopSettings) -> Result<(), String> {
    let dir = get_storage_path();
    let _ = fs::create_dir_all(&dir);
    let file_path = dir.join("settings.json");
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(file_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_desktop_settings() -> Result<DesktopSettings, String> {
    Ok(load_desktop_settings())
}

#[tauri::command]
pub fn save_desktop_settings(settings: DesktopSettings) -> Result<(), String> {
    save_desktop_settings_to_disk(&settings)
}

pub fn get_or_create_device_fingerprint() -> String {
    let dir = get_storage_path();
    let fp_file = dir.join("device_id");
    if let Ok(fp) = fs::read_to_string(&fp_file) {
        let trimmed = fp.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    let new_fp = format!("sk_win_{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let _ = fs::create_dir_all(&dir);
    let _ = fs::write(&fp_file, &new_fp);
    new_fp
}

#[tauri::command]
pub fn get_device_fingerprint() -> Result<String, String> {
    Ok(get_or_create_device_fingerprint())
}

#[tauri::command]
pub fn load_persisted_items() -> Result<String, String> {
    let dir = get_storage_path();
    let file_path = dir.join("history.json");
    if !file_path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_persisted_items(json_data: String) -> Result<(), String> {
    let dir = get_storage_path();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let file_path = dir.join("history.json");
    let tmp_path = dir.join("history.json.tmp");

    // Atomic write: write to temp file then rename
    fs::write(&tmp_path, json_data).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &file_path).map_err(|e| e.to_string())?;

    Ok(())
}

