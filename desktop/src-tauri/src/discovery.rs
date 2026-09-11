use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::sync::Arc;
use tokio::net::UdpSocket;
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
}

#[derive(Clone)]
pub struct DiscoveryService {
    alias: String,
    fingerprint: String,
    port: u16,
    active_peers: Arc<RwLock<Vec<(SocketAddr, PeerAnnouncement)>>>,
}

impl DiscoveryService {
    pub fn new(alias: String, fingerprint: String, port: u16) -> Self {
        Self {
            alias,
            fingerprint,
            port,
            active_peers: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn build_announcement(&self) -> PeerAnnouncement {
        PeerAnnouncement {
            alias: self.alias.clone(),
            version: "2.1".to_string(),
            device_model: Some("Windows PC".to_string()),
            device_type: "desktop".to_string(),
            fingerprint: self.fingerprint.clone(),
            port: self.port,
            protocol: "http".to_string(),
            announcement: true,
            announce: true,
        }
    }

    pub async fn start(self: Arc<Self>) {
        let listen_addr = SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, MULTICAST_PORT);
        
        let socket = match UdpSocket::bind(listen_addr).await {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[SendKeep Discovery] Failed to bind UDP socket: {}", e);
                return;
            }
        };

        if let Err(e) = socket.join_multicast_v4(MULTICAST_IP, Ipv4Addr::UNSPECIFIED) {
            eprintln!("[SendKeep Discovery] Failed to join multicast group: {}", e);
        }

        println!("[SendKeep Discovery] Listening on multicast {}:{}", MULTICAST_IP, MULTICAST_PORT);

        let mut buf = [0u8; 4096];
        loop {
            match socket.recv_from(&mut buf).await {
                Ok((len, peer_addr)) => {
                    if let Ok(announcement) = serde_json::from_slice::<PeerAnnouncement>(&buf[..len]) {
                        if announcement.fingerprint != self.fingerprint {
                            println!("[SendKeep Discovery] Discovered peer: {} ({}) at {}", announcement.alias, announcement.device_type, peer_addr);
                            let mut peers = self.active_peers.write().await;
                            peers.retain(|(_, p)| p.fingerprint != announcement.fingerprint);
                            peers.push((peer_addr, announcement));
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
