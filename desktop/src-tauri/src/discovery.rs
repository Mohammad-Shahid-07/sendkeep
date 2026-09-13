use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::RwLock;

pub const MULTICAST_IP: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 167);
pub const MULTICAST_PORT: u16 = 53317;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerAnnouncement {
    pub alias: String,
    pub version: String,
    pub device_model: Option<String>,
    pub device_type: String,
    pub fingerprint: String,
    pub port: u16,
    pub protocol: String,
    #[serde(default)]
    pub announcement: bool,
    #[serde(default)]
    pub announce: bool,
    #[serde(default)]
    pub download: bool,
}

#[derive(Clone)]
pub struct DiscoveryService {
    app_handle: AppHandle,
    alias: String,
    fingerprint: String,
    port: u16,
    active_peers: Arc<RwLock<Vec<(SocketAddr, PeerAnnouncement)>>>,
}

async fn probe_peer_http(ip: Ipv4Addr, port: u16) -> Option<PeerAnnouncement> {
    let addr = SocketAddr::new(IpAddr::V4(ip), port);
    let connect_timeout = Duration::from_millis(250);
    let mut stream = tokio::time::timeout(connect_timeout, TcpStream::connect(addr))
        .await
        .ok()?
        .ok()?;

    let req = format!(
        "GET /api/sendkeep/v1/info HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
        ip, port
    );
    let _ = tokio::time::timeout(Duration::from_millis(250), stream.write_all(req.as_bytes()))
        .await
        .ok()?
        .ok();

    let mut buf = Vec::new();
    let mut temp = [0u8; 1024];
    while let Ok(Ok(n)) =
        tokio::time::timeout(Duration::from_millis(250), stream.read(&mut temp)).await
    {
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&temp[..n]);
        if buf.len() > 8192 {
            break;
        }
    }

    let res_str = String::from_utf8_lossy(&buf);
    let body = res_str.split("\r\n\r\n").nth(1)?;
    serde_json::from_str::<PeerAnnouncement>(body).ok()
}

async fn send_mutual_register_http(target_ip: Ipv4Addr, port: u16, announcement: &PeerAnnouncement) {
    let addr = SocketAddr::new(IpAddr::V4(target_ip), port);
    if let Ok(Ok(mut stream)) =
        tokio::time::timeout(Duration::from_millis(300), TcpStream::connect(addr)).await
    {
        if let Ok(body) = serde_json::to_string(announcement) {
            let req = format!(
                "POST /api/sendkeep/v1/register HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                target_ip, port, body.len(), body
            );
            let _ = tokio::time::timeout(Duration::from_millis(300), stream.write_all(req.as_bytes())).await;
        }
    }
}

impl DiscoveryService {
    pub fn new(app_handle: AppHandle, alias: String, fingerprint: String, port: u16) -> Self {
        Self {
            app_handle,
            alias,
            fingerprint,
            port,
            active_peers: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn build_announcement(&self, is_reply: bool) -> PeerAnnouncement {
        PeerAnnouncement {
            alias: self.alias.clone(),
            version: "2.1".to_string(),
            device_model: Some("Windows PC".to_string()),
            device_type: "desktop".to_string(),
            fingerprint: self.fingerprint.clone(),
            port: self.port,
            protocol: "http".to_string(),
            announcement: !is_reply,
            announce: !is_reply,
            download: false,
        }
    }

    pub async fn scan_subnets(&self) {
        let mut subnets: Vec<Ipv4Addr> = Vec::new();
        if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
            for (_name, ip) in interfaces {
                if let IpAddr::V4(ipv4) = ip {
                    if !ipv4.is_loopback() {
                        let octets = ipv4.octets();
                        let is_private = octets[0] == 10
                            || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                            || (octets[0] == 192 && octets[1] == 168);
                        if is_private && !subnets.contains(&ipv4) {
                            subnets.push(ipv4);
                        }
                    }
                }
            }
        }

        for local_ip in subnets {
            let octets = local_ip.octets();
            let mut targets = Vec::with_capacity(254);
            for host in 1..=254 {
                if host != octets[3] {
                    targets.push(Ipv4Addr::new(octets[0], octets[1], octets[2], host));
                }
            }

            let my_announcement = self.build_announcement(true);
            let my_fingerprint = self.fingerprint.clone();
            let app_handle = self.app_handle.clone();
            let active_peers = self.active_peers.clone();

            futures_util::stream::iter(targets)
                .map(|target_ip| {
                    let my_ann = my_announcement.clone();
                    let my_fp = my_fingerprint.clone();
                    let app = app_handle.clone();
                    let peers_lock = active_peers.clone();
                    async move {
                        if let Some(peer) = probe_peer_http(target_ip, MULTICAST_PORT).await {
                            if peer.fingerprint != my_fp {
                                println!(
                                    "[SendKeep Discovery] Subnet probe found peer: {} ({}) at {}:{}",
                                    peer.alias, peer.device_type, target_ip, peer.port
                                );
                                let socket_addr = SocketAddr::new(IpAddr::V4(target_ip), peer.port);
                                {
                                    let mut peers = peers_lock.write().await;
                                    peers.retain(|(addr, p)| p.fingerprint != peer.fingerprint && addr.ip() != IpAddr::V4(target_ip));
                                    peers.push((socket_addr, peer.clone()));
                                }

                                let _ = app.emit(
                                    "sendkeep:device-discovered",
                                    serde_json::json!({
                                        "name": peer.alias,
                                        "ip": target_ip.to_string(),
                                        "port": peer.port,
                                        "status": "connected",
                                        "fingerprint": peer.fingerprint
                                    }),
                                );

                                send_mutual_register_http(target_ip, peer.port, &my_ann).await;
                            }
                        }
                    }
                })
                .buffer_unordered(40)
                .collect::<Vec<()>>()
                .await;
        }
    }

    pub async fn start(self: Arc<Self>) {
        let listen_addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, MULTICAST_PORT);

        let socket = match UdpSocket::bind(listen_addr).await {
            Ok(s) => Arc::new(s),
            Err(e) => {
                eprintln!("[SendKeep Discovery] Failed to bind UDP socket: {}", e);
                return;
            }
        };

        if let Err(e) = socket.join_multicast_v4(MULTICAST_IP, Ipv4Addr::UNSPECIFIED) {
            eprintln!("[SendKeep Discovery] Failed to join multicast group: {}", e);
        }

        let _ = socket.set_broadcast(true);

        println!(
            "[SendKeep Discovery] Listening on multicast {}:{}",
            MULTICAST_IP, MULTICAST_PORT
        );

        // Periodically broadcast multicast & subnet broadcast announcements every 2 seconds
        let bcast_socket = socket.clone();
        let bcast_this = self.clone();
        tokio::spawn(async move {
            let mcast_target = SocketAddr::V4(SocketAddrV4::new(MULTICAST_IP, MULTICAST_PORT));
            let bcast_target =
                SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::BROADCAST, MULTICAST_PORT));
            loop {
                let announcement = bcast_this.build_announcement(false);
                if let Ok(bytes) = serde_json::to_vec(&announcement) {
                    let _ = bcast_socket.send_to(&bytes, mcast_target).await;
                    let _ = bcast_socket.send_to(&bytes, bcast_target).await;
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }
        });

        // Periodic LocalSend-style HTTP Subnet Scanning for Hotspots and AP-isolated Wi-Fi
        let scan_this = self.clone();
        tokio::spawn(async move {
            loop {
                scan_this.scan_subnets().await;
                tokio::time::sleep(Duration::from_secs(4)).await;
            }
        });

        let mut buf = [0u8; 4096];
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, peer_addr)) => {
                    if let Ok(announcement) =
                        serde_json::from_slice::<PeerAnnouncement>(&buf[..len])
                    {
                        if announcement.fingerprint != self.fingerprint {
                            println!(
                                "[SendKeep Discovery] Discovered peer: {} ({}) at {}",
                                announcement.alias, announcement.device_type, peer_addr
                            );
                            let mut peers = self.active_peers.write().await;
                            peers.retain(|(addr, p)| p.fingerprint != announcement.fingerprint && addr.ip() != peer_addr.ip());
                            peers.push((peer_addr, announcement.clone()));

                            let ip_str = peer_addr.ip().to_string();
                            let _ = self.app_handle.emit(
                                "sendkeep:device-discovered",
                                serde_json::json!({
                                    "name": announcement.alias,
                                    "ip": ip_str,
                                    "port": announcement.port,
                                    "status": "connected",
                                    "fingerprint": announcement.fingerprint
                                }),
                            );

                            // If this was an initial announcement (not an answer), auto-reply unicast
                            if announcement.announcement || announcement.announce {
                                let reply = self.build_announcement(true);
                                if let Ok(reply_bytes) = serde_json::to_vec(&reply) {
                                    let reply_addr =
                                        SocketAddr::new(peer_addr.ip(), announcement.port);
                                    let _ = socket.send_to(&reply_bytes, reply_addr).await;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[SendKeep Discovery] Recv error: {}", e);
                }
            }
        }
    }
}

#[tauri::command]
pub async fn send_pair_request(
    target_ip: String,
    port: u16,
    pin: Option<String>,
) -> Result<serde_json::Value, String> {
    let clean_ip: Ipv4Addr = target_ip
        .trim()
        .parse()
        .map_err(|e| format!("Invalid IPv4 address: {}", e))?;

    let addr = SocketAddr::new(IpAddr::V4(clean_ip), port);
    let mut stream = tokio::time::timeout(Duration::from_millis(2500), TcpStream::connect(addr))
        .await
        .map_err(|_| format!("Connection to {}:{} timed out", clean_ip, port))?
        .map_err(|e| format!("Failed to connect to {}:{}: {}", clean_ip, port, e))?;

    let fingerprint = crate::persistence::get_or_create_device_fingerprint();
    let alias = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Windows Laptop".to_string());

    let payload = serde_json::json!({
        "alias": alias,
        "version": "2.1",
        "deviceModel": "Windows PC",
        "deviceType": "desktop",
        "fingerprint": fingerprint,
        "port": 53317,
        "protocol": "http",
        "pin": pin
    });

    let body = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let req = format!(
        "POST /api/sendkeep/v1/pair HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        clean_ip, port, body.len(), body
    );

    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    // Wait up to 45 seconds for mobile user acceptance
    let mut buf = Vec::new();
    let mut temp = [0u8; 1024];
    loop {
        match tokio::time::timeout(Duration::from_secs(45), stream.read(&mut temp)).await {
            Ok(Ok(n)) => {
                if n == 0 {
                    break;
                }
                buf.extend_from_slice(&temp[..n]);
                if buf.len() > 8192 {
                    break;
                }
            }
            Ok(Err(e)) => return Err(format!("Socket read error: {}", e)),
            Err(_) => return Err("Pairing request timed out waiting for phone approval".to_string()),
        }
    }

    let res_str = String::from_utf8_lossy(&buf);
    let body_part = res_str
        .split("\r\n\r\n")
        .nth(1)
        .ok_or_else(|| "Invalid HTTP response from peer".to_string())?;

    let json_resp: serde_json::Value =
        serde_json::from_str(body_part).map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    Ok(json_resp)
}

#[tauri::command]
pub async fn probe_peer(ip: String, port: u16) -> Result<Option<serde_json::Value>, String> {
    let clean_ip: Ipv4Addr = match ip.trim().parse() {
        Ok(addr) => addr,
        Err(_) => return Ok(None),
    };
    let addr = SocketAddr::new(IpAddr::V4(clean_ip), port);
    let Ok(Ok(mut stream)) = tokio::time::timeout(Duration::from_millis(1000), TcpStream::connect(addr)).await else {
        return Ok(None);
    };

    let req = format!(
        "GET /api/sendkeep/v1/info HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
        clean_ip, port
    );
    let _ = stream.write_all(req.as_bytes()).await;

    let mut buf = Vec::new();
    let mut temp = [0u8; 1024];
    while let Ok(Ok(n)) = tokio::time::timeout(Duration::from_millis(1000), stream.read(&mut temp)).await {
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&temp[..n]);
        if buf.len() > 8192 {
            break;
        }
    }

    let res_str = String::from_utf8_lossy(&buf);
    let Some(body_part) = res_str.split("\r\n\r\n").nth(1) else {
        return Ok(None);
    };

    let json_resp: Option<serde_json::Value> = serde_json::from_str(body_part).ok();
    Ok(json_resp)
}

