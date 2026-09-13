use axum::{
    body::Body,
    extract::{ConnectInfo, Multipart, Path as AxumPath, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSharedFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub file_type: String,
}

#[derive(Clone, Default)]
pub struct CancellationRegistry {
    map: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>>,
}

impl CancellationRegistry {
    pub fn new() -> Self {
        Self {
            map: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register(&self, session_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.map.write().await.insert(session_id.to_string(), flag.clone());
        flag
    }

    pub async fn cancel(&self, session_id: &str) -> bool {
        let map = self.map.read().await;
        if let Some(flag) = map.get(session_id) {
            flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }

    pub async fn unregister(&self, session_id: &str) {
        self.map.write().await.remove(session_id);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub alias: String,
    pub version: String,
    pub device_model: Option<String>,
    pub device_type: String,
    pub fingerprint: String,
    pub port: u16,
    pub protocol: String,
    pub download: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    pub alias: String,
    pub version: Option<String>,
    pub device_model: Option<String>,
    pub device_type: Option<String>,
    pub fingerprint: String,
    pub port: Option<u16>,
    pub protocol: Option<String>,
    pub pin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    pub status: String, // "accepted" or "declined"
    pub alias: String,
    pub device_model: Option<String>,
    pub device_type: String,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub id: String,
    pub file_name: String,
    pub size: u64,
    pub file_type: String,
    pub sha256: Option<String>,
    pub preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareUploadRequest {
    pub info: DeviceInfo,
    pub files: HashMap<String, FileMetadata>,
    pub pin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareUploadResponse {
    pub session_id: String,
    pub files: HashMap<String, String>, // fileId -> token
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadQueryParams {
    pub session_id: Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id_camel: Option<String>,
    pub file_id: Option<String>,
    #[serde(rename = "fileId")]
    pub file_id_camel: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CancelQueryParams {
    pub session_id: Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id_camel: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedItemPayload {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub file_type: String,
    pub sender: String,
    pub sender_ip: Option<String>,
    pub source: String,
    pub timestamp: i64,
    pub content: Option<String>,
}

struct SessionData {
    sender_alias: String,
    sender_ip: String,
    sender_port: u16,
    files: HashMap<String, FileMetadata>,
    tokens: HashMap<String, String>, // token -> fileId
    created_at: std::time::Instant,
}

pub struct ServerState {
    pub app_handle: AppHandle,
    pub device_info: DeviceInfo,
    pub save_dir: Arc<RwLock<PathBuf>>,
    sessions: Arc<RwLock<HashMap<String, SessionData>>>,
    pub pending_pairs: Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
    pub cancellation_registry: CancellationRegistry,
    pub active_partial_files: Arc<RwLock<HashMap<String, PathBuf>>>,
    pub web_shared_files: Arc<RwLock<HashMap<String, WebSharedFile>>>,
}

impl ServerState {
    pub fn new(app_handle: AppHandle, device_info: DeviceInfo, save_dir: PathBuf) -> Self {
        Self {
            app_handle,
            device_info,
            save_dir: Arc::new(RwLock::new(save_dir)),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            pending_pairs: Arc::new(RwLock::new(HashMap::new())),
            cancellation_registry: CancellationRegistry::new(),
            active_partial_files: Arc::new(RwLock::new(HashMap::new())),
            web_shared_files: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn set_save_dir(&self, new_dir: PathBuf) {
        *self.save_dir.write().await = new_dir;
    }

    pub async fn set_web_shared_files(&self, files: Vec<WebSharedFile>) {
        let mut map = self.web_shared_files.write().await;
        map.clear();
        for f in files {
            map.insert(f.id.clone(), f);
        }
    }

    pub async fn get_web_shared_files(&self) -> Vec<WebSharedFile> {
        let map = self.web_shared_files.read().await;
        if !map.is_empty() {
            return map.values().cloned().collect();
        }
        // Fallback to reading persisted items from disk if no files are staged yet
        if let Ok(raw) = crate::persistence::load_persisted_items() {
            if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                let mut list = Vec::new();
                for it in items {
                    if let (Some(id), Some(name), Some(path)) = (
                        it.get("id").and_then(|v| v.as_str()),
                        it.get("name").and_then(|v| v.as_str()),
                        it.get("path").and_then(|v| v.as_str()),
                    ) {
                        let p = std::path::Path::new(path);
                        if p.exists() && p.is_file() {
                            let size = it.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                            let file_type = it.get("fileType").and_then(|v| v.as_str()).unwrap_or("file").to_string();
                            list.push(WebSharedFile {
                                id: id.to_string(),
                                name: name.to_string(),
                                path: path.to_string(),
                                size,
                                file_type,
                            });
                        }
                    }
                }
                return list;
            }
        }
        Vec::new()
    }
}

pub async fn start_server(state: Arc<ServerState>, port: u16) {
    let app = Router::new()
        // Web Share portal (Zero-install browser sharing)
        .route("/", get(web_portal_handler))
        .route("/web", get(web_portal_handler))
        .route("/web/api/files", get(web_files_handler))
        .route("/web/api/download/:id", get(web_download_handler))
        .route("/web/api/upload", post(web_upload_handler))
        // SendKeep native protocol routes
        .route("/api/sendkeep/v1/info", get(info_handler))
        .route("/api/sendkeep/v1/register", post(register_handler))
        .route("/api/sendkeep/v1/pair", post(pair_handler))
        .route("/api/sendkeep/v1/prepare-upload", post(prepare_upload_handler))
        .route("/api/sendkeep/v1/upload", post(upload_handler))
        .route("/api/sendkeep/v1/cancel", post(cancel_handler))
        .route("/api/sendkeep/v1/cli-drop", post(cli_drop_handler))
        // Interoperability fallback for standard LocalSend apps
        .route("/api/localsend/v2/info", get(info_handler))
        .route("/api/localsend/v2/register", post(register_handler))
        .route("/api/localsend/v2/prepare-upload", post(prepare_upload_handler))
        .route("/api/localsend/v2/upload", post(upload_handler))
        .route("/api/localsend/v2/cancel", post(cancel_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("[SendKeep Server] Listening on http://{}", addr);

    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        let _ = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await;
    } else {
        eprintln!("[SendKeep Server] Failed to bind TCP listener on port {}", port);
    }
}

async fn cancel_handler(
    State(state): State<Arc<ServerState>>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    Query(params): Query<CancelQueryParams>,
) -> impl IntoResponse {
    let session_id = params.session_id.or(params.session_id_camel);
    if let Some(sid) = session_id {
        println!("[SendKeep Server] Transfer cancellation requested for session {}", sid);
        state.cancellation_registry.cancel(&sid).await;
        let partial_path = state.active_partial_files.write().await.remove(&sid);
        if let Some(path) = partial_path {
            let _ = tokio::fs::remove_file(path).await;
        }
        let _ = state.app_handle.emit(
            "sendkeep:transfer-progress",
            serde_json::json!({
                "sessionId": sid,
                "fileId": "",
                "fileName": "Transfer",
                "bytesCurrent": 0,
                "bytesTotal": 0,
                "speedBytesPerSec": 0,
                "direction": "receive",
                "peerAlias": peer_addr.ip().to_string(),
                "status": "cancelled",
                "errorMessage": "Transfer cancelled by peer"
            }),
        );
    }
    StatusCode::OK
}

#[derive(serde::Deserialize)]
struct CliDropPayload {
    path: String,
}

async fn cli_drop_handler(
    State(state): State<Arc<ServerState>>,
    Json(payload): Json<CliDropPayload>,
) -> impl IntoResponse {
    println!("[SendKeep Server] CLI file drop received: {}", payload.path);
    let _ = state.app_handle.emit("sendkeep:cli-file-dropped", payload.path);
    StatusCode::OK
}

async fn info_handler(State(state): State<Arc<ServerState>>) -> impl IntoResponse {
    Json(state.device_info.clone())
}

async fn register_handler(
    State(state): State<Arc<ServerState>>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    Json(payload): Json<DeviceInfo>,
) -> impl IntoResponse {
    let sender_ip = peer_addr.ip().to_string();
    let _ = state.app_handle.emit("sendkeep:device-discovered", serde_json::json!({
        "name": payload.alias,
        "ip": sender_ip,
        "port": payload.port,
        "model": payload.device_model,
        "fingerprint": payload.fingerprint,
        "status": "online"
    }));
    Json(state.device_info.clone())
}

async fn pair_handler(
    State(state): State<Arc<ServerState>>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    Json(payload): Json<PairRequest>,
) -> impl IntoResponse {
    let sender_ip = peer_addr.ip().to_string();

    // 1. PIN verification
    let settings = crate::persistence::load_desktop_settings();
    if settings.require_pin {
        if let Some(expected_pin) = &settings.security_pin {
            let exp = expected_pin.trim();
            if !exp.is_empty() {
                let incoming = payload.pin.as_deref().unwrap_or("").trim();
                if incoming != exp {
                    println!("[SendKeep Server] Rejected pairing request from '{}' ({}) - PIN mismatch", payload.alias, sender_ip);
                    return Json(PairResponse {
                        status: "declined".to_string(),
                        alias: state.device_info.alias.clone(),
                        device_model: state.device_info.device_model.clone(),
                        device_type: state.device_info.device_type.clone(),
                        fingerprint: state.device_info.fingerprint.clone(),
                    }).into_response();
                }
            }
        }
    }

    let req_id = Uuid::new_v4().to_string();

    let (tx, rx) = tokio::sync::oneshot::channel();
    {
        let mut pending = state.pending_pairs.write().await;
        pending.insert(req_id.clone(), tx);
    }

    println!("[SendKeep Server] Incoming pairing request from '{}' ({})", payload.alias, sender_ip);

    let _ = state.app_handle.emit("sendkeep:pairing-requested", serde_json::json!({
        "requestId": req_id,
        "alias": payload.alias,
        "deviceModel": payload.device_model,
        "deviceType": payload.device_type,
        "fingerprint": payload.fingerprint,
        "ip": sender_ip,
        "port": payload.port.unwrap_or(53317),
        "pin": payload.pin
    }));

    // Wait up to 45 seconds for user approval from frontend
    let approved = match tokio::time::timeout(std::time::Duration::from_secs(45), rx).await {
        Ok(Ok(accept)) => accept,
        _ => false,
    };

    let status = if approved { "accepted" } else { "declined" };
    Json(PairResponse {
        status: status.to_string(),
        alias: state.device_info.alias.clone(),
        device_model: state.device_info.device_model.clone(),
        device_type: state.device_info.device_type.clone(),
        fingerprint: state.device_info.fingerprint.clone(),
    }).into_response()
}

async fn prepare_upload_handler(
    State(state): State<Arc<ServerState>>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    Json(payload): Json<PrepareUploadRequest>,
) -> impl IntoResponse {
    // 1. PIN verification
    let settings = crate::persistence::load_desktop_settings();
    if settings.require_pin {
        if let Some(expected_pin) = &settings.security_pin {
            let exp = expected_pin.trim();
            if !exp.is_empty() {
                let incoming = payload.pin.as_deref().unwrap_or("").trim();
                if incoming != exp {
                    println!("[SendKeep Server] Rejected prepare-upload from '{}' ({}) - PIN mismatch", payload.info.alias, peer_addr.ip());
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(serde_json::json!({
                            "error": "Invalid PIN",
                            "message": "This device requires a matching security PIN to transfer files."
                        })),
                    ).into_response();
                }
            }
        }
    }

    let session_id = Uuid::new_v4().to_string();
    let mut files_tokens = HashMap::new();
    let mut token_to_file = HashMap::new();

    for (file_id, _) in &payload.files {
        let token = Uuid::new_v4().to_string();
        files_tokens.insert(file_id.clone(), token.clone());
        token_to_file.insert(token, file_id.clone());
    }

    let sender_ip = peer_addr.ip().to_string();
    let sender_port = payload.info.port;
    let sender_name = payload.info.alias.clone();
    let sender_model = payload.info.device_model.clone().unwrap_or_else(|| "Mobile Device".to_string());

    let session = SessionData {
        sender_alias: sender_name.clone(),
        sender_ip: sender_ip.clone(),
        sender_port,
        files: payload.files,
        tokens: token_to_file,
        created_at: std::time::Instant::now(),
    };

    let mut sessions = state.sessions.write().await;
    // Prune expired sessions older than 10 minutes
    sessions.retain(|_, s| s.created_at.elapsed().as_secs() < 600);
    sessions.insert(session_id.clone(), session);

    println!(
        "[SendKeep Server] Auto-accepted transfer session {} from '{}' ({}:{}) ({} files)",
        session_id, sender_name, sender_ip, sender_port, files_tokens.len()
    );

    // Live update UI: A genuine device is actively connecting to send files!
    let _ = state.app_handle.emit("sendkeep:device-discovered", serde_json::json!({
        "name": sender_name,
        "ip": sender_ip,
        "port": sender_port,
        "model": sender_model,
        "fingerprint": payload.info.fingerprint,
        "status": "online"
    }));

    Json(PrepareUploadResponse {
        session_id,
        files: files_tokens,
    }).into_response()
}

async fn upload_handler(
    State(state): State<Arc<ServerState>>,
    Query(params): Query<UploadQueryParams>,
    body: Body,
) -> Result<StatusCode, StatusCode> {
    let session_id = params
        .session_id
        .or(params.session_id_camel)
        .ok_or(StatusCode::BAD_REQUEST)?;

    let token = params.token.ok_or(StatusCode::BAD_REQUEST)?;

    let (file_meta, sender_alias, sender_ip, sender_port) = {
        let sessions = state.sessions.read().await;
        let session = sessions.get(&session_id).ok_or(StatusCode::NOT_FOUND)?;
        let file_id = session.tokens.get(&token).ok_or(StatusCode::UNAUTHORIZED)?;
        let meta = session.files.get(file_id).ok_or(StatusCode::NOT_FOUND)?.clone();
        (meta, session.sender_alias.clone(), session.sender_ip.clone(), session.sender_port)
    };

    // 1. Sanitize relative path for folder structures and prevent directory traversal
    let mut safe_rel_path = std::path::PathBuf::new();
    let normalized = file_meta.file_name.replace('\\', "/");
    for comp in normalized.split('/') {
        let trimmed = comp.trim();
        if trimmed.is_empty() || trimmed == "." || trimmed == ".." || trimmed.contains(':') {
            continue;
        }
        let safe_comp: String = trimmed
            .chars()
            .map(|c| match c {
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
                c if c.is_control() => '_',
                c => c,
            })
            .collect();
        let safe_clean = safe_comp.trim();
        if !safe_clean.is_empty() {
            safe_rel_path.push(safe_clean);
        }
    }
    if safe_rel_path.as_os_str().is_empty() {
        safe_rel_path.push("received_file");
    }

    let safe_name = file_meta.file_name.clone();
    let save_dir = state.save_dir.read().await.clone();
    let mut target_path = save_dir.join(&safe_rel_path);

    // Ensure parent directories exist for folder hierarchies
    if let Some(parent) = target_path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    // 2. Collision handling strategy (Rename, Overwrite, Skip)
    let settings = crate::persistence::load_desktop_settings();
    let collision_mode = settings.collision_strategy.to_lowercase();

    if target_path.exists() {
        if collision_mode == "skip" {
            println!("[SendKeep Server] Skipping existing file: {:?}", target_path);
            let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
                "sessionId": session_id,
                "fileId": file_meta.id,
                "fileName": file_meta.file_name,
                "bytesCurrent": file_meta.size,
                "bytesTotal": file_meta.size,
                "speedBytesPerSec": 0,
                "direction": "receive",
                "peerAlias": sender_alias,
                "status": "completed",
                "localFilePath": target_path.to_string_lossy().to_string(),
                "errorMessage": "Skipped (already exists)"
            }));
            return Ok(StatusCode::OK);
        } else if collision_mode == "overwrite" {
            // Overwrite: keep target_path as is
        } else {
            // "rename" (default): auto-numbering file (1).ext
            let parent = target_path.parent().unwrap_or(&save_dir).to_path_buf();
            let stem = target_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file")
                .to_string();
            let ext = target_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string());

            let mut counter = 1;
            while target_path.exists() {
                let new_name = match &ext {
                    Some(e) => format!("{} ({}).{}", stem, counter, e),
                    None => format!("{} ({})", stem, counter),
                };
                target_path = parent.join(new_name);
                counter += 1;
            }
        }
    }

    let cancel_flag = state.cancellation_registry.register(&session_id).await;
    state.active_partial_files.write().await.insert(session_id.clone(), target_path.clone());

    let file = File::create(&target_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut writer = tokio::io::BufWriter::with_capacity(512 * 1024, file);

    let mut stream = body.into_data_stream();
    let mut total_bytes = 0u64;
    let start_time = std::time::Instant::now();
    let mut last_emit_time = std::time::Instant::now();

    // Initial progress notification
    let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
        "sessionId": session_id,
        "fileId": file_meta.id,
        "fileName": safe_name,
        "bytesCurrent": 0,
        "bytesTotal": file_meta.size,
        "speedBytesPerSec": 0,
        "direction": "receive",
        "peerAlias": sender_alias,
        "status": "in_progress"
    }));

    let mut aborted = false;

    while let Some(chunk_res) = stream.next().await {
        if cancel_flag.load(Ordering::Relaxed) {
            aborted = true;
            break;
        }

        let chunk = match chunk_res {
            Ok(c) => c,
            Err(_) => {
                aborted = true;
                break;
            }
        };

        total_bytes += chunk.len() as u64;
        if writer.write_all(&chunk).await.is_err() {
            aborted = true;
            break;
        }

        if last_emit_time.elapsed().as_millis() >= 120 || total_bytes >= file_meta.size {
            last_emit_time = std::time::Instant::now();
            let elapsed_sec = start_time.elapsed().as_secs_f64().max(0.001);
            let speed = (total_bytes as f64 / elapsed_sec) as u64;
            let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
                "sessionId": session_id,
                "fileId": file_meta.id,
                "fileName": safe_name,
                "bytesCurrent": total_bytes,
                "bytesTotal": file_meta.size,
                "speedBytesPerSec": speed,
                "direction": "receive",
                "peerAlias": sender_alias,
                "status": "in_progress"
            }));
        }
    }

    if aborted || cancel_flag.load(Ordering::Relaxed) {
        drop(writer);
        let _ = tokio::fs::remove_file(&target_path).await;
        state.active_partial_files.write().await.remove(&session_id);
        state.cancellation_registry.unregister(&session_id).await;
        let is_cancelled = cancel_flag.load(Ordering::Relaxed);
        let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
            "sessionId": session_id,
            "fileId": file_meta.id,
            "fileName": safe_name,
            "bytesCurrent": total_bytes,
            "bytesTotal": file_meta.size,
            "speedBytesPerSec": 0,
            "direction": "receive",
            "peerAlias": sender_alias,
            "status": if is_cancelled { "cancelled" } else { "failed" },
            "errorMessage": if is_cancelled { "Transfer cancelled" } else { "Connection interrupted during transfer" }
        }));
        return Err(if is_cancelled { StatusCode::OK } else { StatusCode::INTERNAL_SERVER_ERROR });
    }

    writer.flush()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    state.active_partial_files.write().await.remove(&session_id);
    state.cancellation_registry.unregister(&session_id).await;

    let final_name = target_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| safe_name.clone());

    let elapsed_sec = start_time.elapsed().as_secs_f64().max(0.001);
    let speed = (total_bytes as f64 / elapsed_sec) as u64;

    // Completed progress notification
    let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
        "sessionId": session_id,
        "fileId": file_meta.id,
        "fileName": final_name,
        "bytesCurrent": total_bytes,
        "bytesTotal": total_bytes,
        "speedBytesPerSec": speed,
        "direction": "receive",
        "peerAlias": sender_alias,
        "status": "completed",
        "localFilePath": target_path.to_string_lossy().to_string()
    }));

    println!(
        "[SendKeep Server] Received file '{}' ({} bytes) from '{}' ({})",
        final_name, total_bytes, sender_alias, sender_ip
    );

    let is_txt = final_name.to_lowercase().ends_with(".txt")
        || file_meta.file_type.to_lowercase().contains("text");
    let content = if is_txt && total_bytes < 64 * 1024 {
        tokio::fs::read_to_string(&target_path).await.ok()
    } else {
        None
    };

    let item_payload = ReceivedItemPayload {
        id: Uuid::new_v4().to_string(),
        name: final_name,
        path: target_path.to_string_lossy().to_string(),
        size: total_bytes,
        file_type: file_meta.file_type.clone(),
        sender: sender_alias.clone(),
        sender_ip: Some(sender_ip.clone()),
        source: "device".to_string(),
        timestamp: chrono_or_epoch(),
        content,
    };

    // Emit event to Tauri frontend
    let _ = state.app_handle.emit("sendkeep:item-received", &item_payload);
    let _ = state.app_handle.emit("sendkeep:device-discovered", serde_json::json!({
        "name": sender_alias,
        "ip": sender_ip,
        "port": sender_port,
        "status": "online"
    }));

    // 3. Clean up consumed token and empty session
    {
        let mut sessions = state.sessions.write().await;
        if let Some(session) = sessions.get_mut(&session_id) {
            session.tokens.remove(&token);
            if session.tokens.is_empty() {
                sessions.remove(&session_id);
            }
        }
    }

    Ok(StatusCode::OK)
}

fn chrono_or_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn apply_collision_strategy(mut target_path: PathBuf, save_dir: &PathBuf, collision_mode: &str) -> Option<PathBuf> {
    if target_path.exists() {
        if collision_mode == "skip" {
            return None;
        } else if collision_mode == "overwrite" {
            // Keep target_path as is
        } else {
            // "rename" (default): auto-numbering file (1).ext
            let parent = target_path.parent().unwrap_or(save_dir).to_path_buf();
            let stem = target_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file")
                .to_string();
            let ext = target_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string());

            let mut counter = 1;
            while target_path.exists() {
                let new_name = match &ext {
                    Some(e) => format!("{} ({}).{}", stem, counter, e),
                    None => format!("{} ({})", stem, counter),
                };
                target_path = parent.join(new_name);
                counter += 1;
            }
        }
    }
    Some(target_path)
}

pub fn get_mime_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "pdf" => "application/pdf",
        "txt" => "text/plain; charset=utf-8",
        "json" => "application/json",
        "html" | "htm" => "text/html; charset=utf-8",
        "zip" => "application/zip",
        "apk" => "application/vnd.android.package-archive",
        _ => "application/octet-stream",
    }
}

async fn web_portal_handler() -> Html<&'static str> {
    Html(WEB_PORTAL_HTML)
}

async fn web_files_handler(
    State(state): State<Arc<ServerState>>,
) -> impl IntoResponse {
    let files = state.get_web_shared_files().await;
    Json(serde_json::json!({
        "alias": state.device_info.alias,
        "deviceModel": state.device_info.device_model,
        "count": files.len(),
        "files": files
    }))
}

async fn web_download_handler(
    State(state): State<Arc<ServerState>>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    AxumPath(file_id): AxumPath<String>,
) -> impl IntoResponse {
    let files = state.get_web_shared_files().await;
    let file_entry = files.into_iter().find(|f| f.id == file_id);

    let file_info = match file_entry {
        Some(f) => f,
        None => return (StatusCode::NOT_FOUND, "File not found in share list").into_response(),
    };

    let path = PathBuf::from(&file_info.path);
    if !path.exists() || !path.is_file() {
        return (StatusCode::NOT_FOUND, "File does not exist on disk").into_response();
    }

    let file = match File::open(&path).await {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to open file: {}", e)).into_response(),
    };

    let meta = match file.metadata().await {
        Ok(m) => m,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read file metadata: {}", e)).into_response(),
    };
    let file_len = meta.len();

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mime = get_mime_type(ext);

    let stream = futures_util::stream::unfold(file, |mut file| async move {
        let mut buf = vec![0u8; 64 * 1024];
        match file.read(&mut buf).await {
            Ok(0) => None,
            Ok(n) => {
                buf.truncate(n);
                Some((Ok::<_, std::io::Error>(buf), file))
            }
            Err(e) => Some((Err(e), file)),
        }
    });

    let body = Body::from_stream(stream);
    let clean_name = file_info.name.replace('"', "\\\"");
    let content_disposition = format!("attachment; filename=\"{}\"", clean_name);

    let mut headers = HeaderMap::new();
    if let Ok(ct) = mime.parse() {
        headers.insert(header::CONTENT_TYPE, ct);
    }
    if let Ok(cl) = file_len.to_string().parse() {
        headers.insert(header::CONTENT_LENGTH, cl);
    }
    if let Ok(cd) = content_disposition.parse() {
        headers.insert(header::CONTENT_DISPOSITION, cd);
    }

    let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
        "sessionId": format!("web_dl_{}", &Uuid::new_v4().to_string()[..8]),
        "fileId": file_info.id,
        "fileName": file_info.name,
        "bytesCurrent": file_len,
        "bytesTotal": file_len,
        "speedBytesPerSec": 0,
        "direction": "send",
        "peerAlias": format!("Browser ({})", peer_addr.ip()),
        "status": "completed",
        "localFilePath": file_info.path
    }));

    (headers, body).into_response()
}

async fn web_upload_handler(
    State(state): State<Arc<ServerState>>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let save_dir = state.save_dir.read().await.clone();
    let _ = tokio::fs::create_dir_all(&save_dir).await;
    let settings = crate::persistence::load_desktop_settings();
    let collision_mode = settings.collision_strategy;

    let mut saved_files = Vec::new();

    while let Ok(Some(mut field)) = multipart.next_field().await {
        let raw_name = field.file_name().unwrap_or("uploaded_file").to_string();
        let safe_name = std::path::Path::new(&raw_name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("uploaded_file")
            .to_string();

        let initial_path = save_dir.join(&safe_name);
        let final_path = match apply_collision_strategy(initial_path, &save_dir, &collision_mode) {
            Some(p) => p,
            None => continue,
        };

        let out_file = match File::create(&final_path).await {
            Ok(f) => f,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create file: {}", e)).into_response(),
        };
        let mut writer = tokio::io::BufWriter::with_capacity(256 * 1024, out_file);

        let mut total_bytes = 0u64;
        while let Ok(Some(chunk)) = field.chunk().await {
            total_bytes += chunk.len() as u64;
            if writer.write_all(&chunk).await.is_err() {
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed writing file data").into_response();
            }
        }
        let _ = writer.flush().await;

        let final_name = final_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| safe_name.clone());

        let ext = final_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        let mime = get_mime_type(ext).to_string();

        let is_txt = final_name.to_lowercase().ends_with(".txt") || mime.contains("text");
        let content = if is_txt && total_bytes < 64 * 1024 {
            tokio::fs::read_to_string(&final_path).await.ok()
        } else {
            None
        };

        let item_payload = ReceivedItemPayload {
            id: Uuid::new_v4().to_string(),
            name: final_name.clone(),
            path: final_path.to_string_lossy().to_string(),
            size: total_bytes,
            file_type: mime,
            sender: format!("Browser ({})", peer_addr.ip()),
            sender_ip: Some(peer_addr.ip().to_string()),
            source: "device".to_string(),
            timestamp: chrono_or_epoch(),
            content,
        };

        let _ = state.app_handle.emit("sendkeep:item-received", &item_payload);
        let _ = state.app_handle.emit("sendkeep:transfer-progress", serde_json::json!({
            "sessionId": format!("web_up_{}", &Uuid::new_v4().to_string()[..8]),
            "fileId": item_payload.id,
            "fileName": final_name,
            "bytesCurrent": total_bytes,
            "bytesTotal": total_bytes,
            "speedBytesPerSec": 0,
            "direction": "receive",
            "peerAlias": format!("Browser ({})", peer_addr.ip()),
            "status": "completed",
            "localFilePath": final_path.to_string_lossy().to_string()
        }));

        saved_files.push(final_name);
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "ok",
            "saved": saved_files
        })),
    )
        .into_response()
}

pub const WEB_PORTAL_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>SendKeep - Web Share</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: rgba(17, 24, 39, 0.85);
      --card-hover: rgba(30, 41, 59, 0.9);
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(99, 102, 241, 0.4);
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --accent-glow: rgba(99, 102, 241, 0.25);
      --cyan: #06b6d4;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      background: radial-gradient(circle at 50% 0%, #172033 0%, var(--bg) 70%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
      overflow-x: hidden;
    }
    .container {
      width: 100%;
      max-width: 600px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-box {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #4f46e5, #06b6d4);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px var(--accent-glow);
    }
    .brand-text h1 {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-text p {
      font-size: 12px;
      color: var(--text-muted);
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #34d399;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 500;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      background: #34d399;
      border-radius: 50%;
      box-shadow: 0 0 8px #34d399;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .tabs {
      display: flex;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      padding: 4px;
      border-radius: 14px;
      gap: 6px;
    }
    .tab-btn {
      flex: 1;
      padding: 10px 16px;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 600;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .badge {
      font-size: 10px;
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 7px;
      border-radius: 10px;
    }
    .tab-content { display: none; flex-direction: column; gap: 14px; }
    .tab-content.active { display: flex; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      backdrop-filter: blur(16px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.25);
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .toolbar-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .btn-download-all {
      padding: 7px 14px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid var(--accent);
      color: #818cf8;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-download-all:hover {
      background: var(--accent);
      color: #fff;
    }
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .file-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--border);
      border-radius: 12px;
      transition: all 0.2s;
    }
    .file-row:hover {
      background: var(--card-hover);
      border-color: var(--border-focus);
      transform: translateY(-1px);
    }
    .file-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }
    .file-icon {
      width: 38px;
      height: 38px;
      background: rgba(99, 102, 241, 0.15);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #818cf8;
      flex-shrink: 0;
    }
    .file-details {
      min-width: 0;
      flex: 1;
    }
    .file-name {
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text);
    }
    .file-meta {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .btn-dl {
      padding: 8px 14px;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .btn-dl:hover {
      background: var(--accent-hover);
      box-shadow: 0 4px 12px var(--accent-glow);
    }
    .empty-state {
      padding: 40px 20px;
      text-align: center;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .dropzone {
      border: 2px dashed rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: rgba(15, 23, 42, 0.3);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .dropzone.dragover {
      border-color: var(--accent);
      background: rgba(99, 102, 241, 0.08);
      transform: scale(1.01);
    }
    .drop-icon {
      width: 48px;
      height: 48px;
      color: #818cf8;
    }
    .drop-title {
      font-size: 15px;
      font-weight: 600;
    }
    .drop-sub {
      font-size: 12px;
      color: var(--text-muted);
    }
    .upload-queue {
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .upload-item {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .upload-header {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 500;
    }
    .prog-bar-bg {
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    .prog-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #4f46e5, #06b6d4);
      width: 0%;
      transition: width 0.15s ease-out;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </div>
        <div class="brand-text">
          <h1 id="host-name">SendKeep Web</h1>
          <p id="host-sub">Direct Wi-Fi Portal</p>
        </div>
      </div>
      <div class="status-badge">
        <div class="status-dot"></div>
        <span>Connected</span>
      </div>
    </header>

    <div class="tabs">
      <button class="tab-btn active" id="tab-btn-download" onclick="switchTab('download')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <span>Download Files</span>
        <span class="badge" id="files-badge">0</span>
      </button>
      <button class="tab-btn" id="tab-btn-upload" onclick="switchTab('upload')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        <span>Send to Host</span>
      </button>
    </div>

    <!-- TAB 1: DOWNLOAD -->
    <div class="tab-content active" id="tab-download">
      <div class="card">
        <div class="toolbar">
          <span class="toolbar-title" id="toolbar-title">Available Files (0)</span>
          <button class="btn-download-all" id="btn-dl-all" onclick="downloadAll()" style="display:none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download All
          </button>
        </div>
        <div class="file-list" id="file-list">
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <p>No files currently staged on SendKeep.<br>Drop items onto the PC shelf to share here.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: UPLOAD -->
    <div class="tab-content" id="tab-upload">
      <div class="card">
        <div class="dropzone" id="dropzone" onclick="document.getElementById('file-input').click()">
          <input type="file" id="file-input" multiple style="display:none" onchange="handleFileSelect(this.files)">
          <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <div class="drop-title">Drag & drop files here, or tap to browse</div>
          <div class="drop-sub">Send photos, videos, and documents directly to host</div>
        </div>
        <div class="upload-queue" id="upload-queue"></div>
      </div>
    </div>
  </div>

  <script>
    let currentFiles = [];

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      if (tab === 'download') {
        document.getElementById('tab-btn-download').classList.add('active');
        document.getElementById('tab-download').classList.add('active');
      } else {
        document.getElementById('tab-btn-upload').classList.add('active');
        document.getElementById('tab-upload').classList.add('active');
      }
    }

    async function fetchFiles() {
      try {
        const res = await fetch('/web/api/files');
        if (!res.ok) return;
        const data = await res.json();
        if (data.alias) {
          document.getElementById('host-name').innerText = data.alias;
          document.getElementById('host-sub').innerText = 'Direct Wi-Fi Portal';
        }
        currentFiles = data.files || [];
        renderFiles(currentFiles);
      } catch (err) {
        console.warn('Sync failed:', err);
      }
    }

    function renderFiles(files) {
      const list = document.getElementById('file-list');
      const badge = document.getElementById('files-badge');
      const title = document.getElementById('toolbar-title');
      const dlAll = document.getElementById('btn-dl-all');

      badge.innerText = files.length;
      title.innerText = `Available Files (${files.length})`;
      dlAll.style.display = files.length > 1 ? 'flex' : 'none';

      if (files.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <p>No files currently staged on SendKeep.<br>Drop items onto the PC shelf to share here.</p>
          </div>
        `;
        return;
      }

      list.innerHTML = files.map(f => `
        <div class="file-row">
          <div class="file-info">
            <div class="file-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            </div>
            <div class="file-details">
              <div class="file-name" title="${f.name}">${f.name}</div>
              <div class="file-meta">${formatBytes(f.size)}</div>
            </div>
          </div>
          <a class="btn-dl" href="/web/api/download/${f.id}" download="${f.name}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </a>
        </div>
      `).join('');
    }

    function downloadAll() {
      currentFiles.forEach((f, idx) => {
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = `/web/api/download/${f.id}`;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, idx * 300);
      });
    }

    // Drag and Drop
    const dropzone = document.getElementById('dropzone');
    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    });

    function handleFileSelect(fileList) {
      if (!fileList || fileList.length === 0) return;
      Array.from(fileList).forEach(file => uploadFile(file));
    }

    function uploadFile(file) {
      const queue = document.getElementById('upload-queue');
      const item = document.createElement('div');
      item.className = 'upload-item';
      item.innerHTML = `
        <div class="upload-header">
          <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</span>
          <span id="status-${file.name}" style="color:var(--text-muted)">0%</span>
        </div>
        <div class="prog-bar-bg">
          <div class="prog-bar-fill" id="bar-${file.name}"></div>
        </div>
      `;
      queue.prepend(item);

      const formData = new FormData();
      formData.append('file', file, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/web/api/upload', true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          const bar = document.getElementById(`bar-${file.name}`);
          const status = document.getElementById(`status-${file.name}`);
          if (bar) bar.style.width = pct + '%';
          if (status) status.innerText = pct + '%';
        }
      };

      xhr.onload = () => {
        const status = document.getElementById(`status-${file.name}`);
        const bar = document.getElementById(`bar-${file.name}`);
        if (xhr.status === 200) {
          if (status) { status.innerText = 'Saved!'; status.style.color = 'var(--success)'; }
          if (bar) bar.style.background = 'var(--success)';
          setTimeout(fetchFiles, 600);
        } else {
          if (status) { status.innerText = 'Failed'; status.style.color = '#ef4444'; }
        }
      };

      xhr.onerror = () => {
        const status = document.getElementById(`status-${file.name}`);
        if (status) { status.innerText = 'Error'; status.style.color = '#ef4444'; }
      };

      xhr.send(formData);
    }

    fetchFiles();
    setInterval(fetchFiles, 4000);
  </script>
</body>
</html>
"#;
