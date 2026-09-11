use axum::{
    body::Body,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use uuid::Uuid;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedItemPayload {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub file_type: String,
    pub sender: String,
    pub timestamp: i64,
}

struct SessionData {
    sender_alias: String,
    files: HashMap<String, FileMetadata>,
    tokens: HashMap<String, String>, // token -> fileId
}

#[derive(Clone)]
pub struct ServerState {
    pub app_handle: AppHandle,
    pub device_info: DeviceInfo,
    pub save_dir: PathBuf,
    sessions: Arc<RwLock<HashMap<String, SessionData>>>,
}

impl ServerState {
    pub fn new(app_handle: AppHandle, device_info: DeviceInfo, save_dir: PathBuf) -> Self {
        Self {
            app_handle,
            device_info,
            save_dir,
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

pub async fn start_server(state: ServerState, port: u16) {
    let app = Router::new()
        // SendKeep routes
        .route("/api/sendkeep/v1/info", get(info_handler))
        .route("/api/sendkeep/v1/prepare-upload", post(prepare_upload_handler))
        .route("/api/sendkeep/v1/upload", post(upload_handler))
        // Interoperability fallback for standard LocalSend apps
        .route("/api/localsend/v2/info", get(info_handler))
        .route("/api/localsend/v2/prepare-upload", post(prepare_upload_handler))
        .route("/api/localsend/v2/upload", post(upload_handler))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("[SendKeep Server] Listening on http://{}", addr);

    if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
        let _ = axum::serve(listener, app).await;
    } else {
        eprintln!("[SendKeep Server] Failed to bind TCP listener on port {}", port);
    }
}

async fn info_handler(State(state): State<ServerState>) -> impl IntoResponse {
    Json(state.device_info)
}

async fn prepare_upload_handler(
    State(state): State<ServerState>,
    Json(payload): Json<PrepareUploadRequest>,
) -> impl IntoResponse {
    let session_id = Uuid::new_v4().to_string();
    let mut files_tokens = HashMap::new();
    let mut token_to_file = HashMap::new();

    for (file_id, _) in &payload.files {
        let token = Uuid::new_v4().to_string();
        files_tokens.insert(file_id.clone(), token.clone());
        token_to_file.insert(token, file_id.clone());
    }

    let session = SessionData {
        sender_alias: payload.info.alias.clone(),
        files: payload.files,
        tokens: token_to_file,
    };

    state.sessions.write().await.insert(session_id.clone(), session);

    println!(
        "[SendKeep Server] Auto-accepted transfer session {} from '{}' ({} files)",
        session_id, payload.info.alias, files_tokens.len()
    );

    Json(PrepareUploadResponse {
        session_id,
        files: files_tokens,
    })
}

async fn upload_handler(
    State(state): State<ServerState>,
    Query(params): Query<UploadQueryParams>,
    body: Body,
) -> Result<StatusCode, StatusCode> {
    let session_id = params
        .session_id
        .or(params.session_id_camel)
        .ok_or(StatusCode::BAD_REQUEST)?;

    let token = params.token.ok_or(StatusCode::BAD_REQUEST)?;

    let (file_meta, sender_alias) = {
        let sessions = state.sessions.read().await;
        let session = sessions.get(&session_id).ok_or(StatusCode::NOT_FOUND)?;
        let file_id = session.tokens.get(&token).ok_or(StatusCode::UNAUTHORIZED)?;
        let meta = session.files.get(file_id).ok_or(StatusCode::NOT_FOUND)?.clone();
        (meta, session.sender_alias.clone())
    };

    // Ensure save directory exists
    let _ = tokio::fs::create_dir_all(&state.save_dir).await;
    let target_path = state.save_dir.join(&file_meta.file_name);

    let mut file = File::create(&target_path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut stream = body.into_data_stream();
    let mut total_bytes = 0u64;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        total_bytes += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    file.flush()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    println!(
        "[SendKeep Server] Received file '{}' ({} bytes) from '{}'",
        file_meta.file_name, total_bytes, sender_alias
    );

    let item_payload = ReceivedItemPayload {
        id: Uuid::new_v4().to_string(),
        name: file_meta.file_name.clone(),
        path: target_path.to_string_lossy().to_string(),
        size: total_bytes,
        file_type: file_meta.file_type.clone(),
        sender: sender_alias,
        timestamp: chrono_or_epoch(),
    };

    // Emit event to Tauri frontend
    let _ = state.app_handle.emit("sendkeep:item-received", &item_payload);

    Ok(StatusCode::OK)
}

fn chrono_or_epoch() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
