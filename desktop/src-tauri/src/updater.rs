use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use futures_util::StreamExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResponse {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_notes: String,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<u64>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressEvent {
    pub percentage: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

fn parse_version(v: &str) -> (u32, u32, u32) {
    let clean = v.trim().trim_start_matches('v').trim_start_matches('V');
    let mut parts = clean.split('.').map(|s| s.parse::<u32>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

fn is_newer(latest: &str, current: &str) -> bool {
    let l = parse_version(latest);
    let c = parse_version(current);
    l > c
}

#[tauri::command]
pub async fn check_for_desktop_update() -> Result<UpdateCheckResponse, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = "https://api.github.com/repos/Mohammad-Shahid-07/sendkeep/releases/latest";

    let client = reqwest::Client::builder()
        .user_agent(format!("SendKeep-Desktop/{}", current_version))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let resp = client
        .get(url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await;

    let response = match resp {
        Ok(r) => r,
        Err(e) => {
            return Ok(UpdateCheckResponse {
                current_version: current_version.clone(),
                latest_version: current_version,
                has_update: false,
                release_notes: format!("Could not reach update server: {}", e),
                download_url: None,
                asset_name: None,
                asset_size: None,
                published_at: None,
            });
        }
    };

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheckResponse {
            current_version: current_version.clone(),
            latest_version: current_version,
            has_update: false,
            release_notes: "You are running the initial release. No newer releases published on GitHub yet.".into(),
            download_url: None,
            asset_name: None,
            asset_size: None,
            published_at: None,
        });
    }

    if !response.status().is_success() {
        return Ok(UpdateCheckResponse {
            current_version: current_version.clone(),
            latest_version: current_version,
            has_update: false,
            release_notes: format!("Server returned status code: {}", response.status()),
            download_url: None,
            asset_name: None,
            asset_size: None,
            published_at: None,
        });
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release info: {}", e))?;

    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let has_update = is_newer(&latest_version, &current_version);

    // Find the Windows setup executable asset
    let exe_asset = release.assets.iter().find(|a| {
        let n = a.name.to_lowercase();
        n.ends_with(".exe") && (n.contains("setup") || n.contains("sendkeep"))
    }).or_else(|| {
        release.assets.iter().find(|a| a.name.to_lowercase().ends_with(".exe"))
    });

    Ok(UpdateCheckResponse {
        current_version,
        latest_version,
        has_update,
        release_notes: release.body.unwrap_or_else(|| "No release notes provided.".into()),
        download_url: exe_asset.map(|a| a.browser_download_url.clone()),
        asset_name: exe_asset.map(|a| a.name.clone()),
        asset_size: exe_asset.map(|a| a.size),
        published_at: release.published_at,
    })
}

#[tauri::command]
pub async fn download_and_install_desktop_update(
    download_url: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("SendKeep-Desktop-Updater")
        .build()
        .map_err(|e| format!("Failed to initialize download client: {}", e))?;

    let res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    let total_size = res.content_length().unwrap_or(0);
    let temp_dir = std::env::temp_dir();
    let installer_path: PathBuf = temp_dir.join("SendKeep-Update-Setup.exe");

    let mut file = File::create(&installer_path)
        .map_err(|e| format!("Failed to create temporary installer file: {}", e))?;

    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error during download stream: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            (downloaded as f32 / total_size as f32) * 100.0
        } else {
            0.0
        };

        let _ = app_handle.emit(
            "update-download-progress",
            DownloadProgressEvent {
                percentage,
                downloaded_bytes: downloaded,
                total_bytes: total_size,
            },
        );
    }

    file.flush().map_err(|e| format!("Failed to flush installer file: {}", e))?;
    drop(file);

    // Launch the downloaded installer
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new(&installer_path)
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;

        // Gracefully terminate the current app process so installer can replace binaries
        app_handle.exit(0);
    }

    Ok(())
}
