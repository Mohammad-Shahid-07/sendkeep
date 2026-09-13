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
}

fn default_context_menu_enabled() -> bool {
    true
}

fn default_collision_strategy() -> String {
    "rename".to_string()
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

