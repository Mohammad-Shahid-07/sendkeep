package com.sendkeep.app.network

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import com.google.gson.Gson
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.MulticastSocket
import java.util.UUID
import java.util.concurrent.TimeUnit

object SendKeepDiscovery {
    private const val MULTICAST_IP = "224.0.0.167"
    private const val BROADCAST_IP = "255.255.255.255"
    private const val PORT = 53317

    private val gson = Gson()
    var myFingerprint: String = "sk_android_" + UUID.randomUUID().toString().substring(0, 8)
        private set

    fun initFingerprint(context: Context) {
        val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
        var fp = prefs.getString("device_fingerprint", null)
        if (fp.isNullOrBlank()) {
            fp = "sk_android_" + UUID.randomUUID().toString().substring(0, 8)
            prefs.edit().putString("device_fingerprint", fp).apply()
        }
        myFingerprint = fp
    }

    private val _discoveredPeers = MutableStateFlow<List<PeerAnnouncementDto>>(emptyList())
    val discoveredPeers: StateFlow<List<PeerAnnouncementDto>> = _discoveredPeers.asStateFlow()

    private var multicastLock: WifiManager.MulticastLock? = null

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(2500, TimeUnit.MILLISECONDS)
        .readTimeout(2500, TimeUnit.MILLISECONDS)
        .build()

    fun registerDiscoveredPeer(info: DeviceInfoDto, ip: String) {
        if (info.fingerprint == myFingerprint || ip.isBlank()) return

        val peer = PeerAnnouncementDto(
            alias = info.alias,
            version = info.version,
            deviceModel = info.deviceModel,
            deviceType = info.deviceType,
            fingerprint = info.fingerprint,
            port = info.port,
            protocol = info.protocol,
            ip = ip,
            lastSeen = System.currentTimeMillis()
        )

        val currentList = _discoveredPeers.value.toMutableList()
        currentList.removeAll { 
            (it.fingerprint.isNotBlank() && it.fingerprint == peer.fingerprint) || 
            it.ip == peer.ip 
        }
        currentList.add(0, peer)
        _discoveredPeers.value = currentList
    }

    suspend fun pingPeerHttp(ip: String, port: Int, context: Context): Boolean = withContext(Dispatchers.IO) {
        if (ip.isBlank()) return@withContext false
        try {
            val req = Request.Builder()
                .url("http://$ip:$port/api/sendkeep/v1/info")
                .get()
                .build()
            val res = httpClient.newCall(req).execute()
            if (res.isSuccessful) {
                val body = res.body?.string()
                if (!body.isNullOrBlank()) {
                    val info = gson.fromJson(body, DeviceInfoDto::class.java)
                    if (info != null) {
                        registerDiscoveredPeer(info, ip)
                        return@withContext true
                    }
                }
            }
        } catch (ignored: Exception) {
            try {
                val req2 = Request.Builder()
                    .url("http://$ip:$port/api/localsend/v2/info")
                    .get()
                    .build()
                val res2 = httpClient.newCall(req2).execute()
                if (res2.isSuccessful) {
                    val body2 = res2.body?.string()
                    if (!body2.isNullOrBlank()) {
                        val info2 = gson.fromJson(body2, DeviceInfoDto::class.java)
                        if (info2 != null) {
                            registerDiscoveredPeer(info2, ip)
                            return@withContext true
                        }
                    }
                }
            } catch (ignored2: Exception) {}
        }
        return@withContext false
    }

    suspend fun sendMutualRegister(targetIp: String, targetPort: Int) = withContext(Dispatchers.IO) {
        try {
            val myInfo = DeviceInfoDto(
                alias = Build.MODEL,
                version = "2.1",
                deviceModel = Build.MODEL,
                deviceType = "mobile",
                fingerprint = myFingerprint,
                port = PORT,
                protocol = "http",
                download = true
            )
            val json = gson.toJson(myInfo)
            val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())

            val req = Request.Builder()
                .url("http://$targetIp:$targetPort/api/sendkeep/v1/register")
                .post(body)
                .build()

            val res = httpClient.newCall(req).execute()
            if (res.isSuccessful) {
                val resBody = res.body?.string()
                if (!resBody.isNullOrBlank()) {
                    val peerInfo = gson.fromJson(resBody, DeviceInfoDto::class.java)
                    if (peerInfo != null) {
                        registerDiscoveredPeer(peerInfo, targetIp)
                    }
                }
            }
        } catch (ignored: Exception) {}
    }

    suspend fun sendPairRequest(targetIp: String, port: Int = PORT, pin: String? = null): PairResponseDto? = withContext(Dispatchers.IO) {
        try {
            val pairReq = PairRequestDto(
                alias = Build.MODEL,
                version = "2.1",
                deviceModel = Build.MODEL,
                deviceType = "mobile",
                fingerprint = myFingerprint,
                port = PORT,
                protocol = "http",
                pin = pin
            )
            val json = gson.toJson(pairReq)
            val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())

            val req = Request.Builder()
                .url("http://$targetIp:$port/api/sendkeep/v1/pair")
                .post(body)
                .build()

            val res = httpClient.newCall(req).execute()
            if (res.isSuccessful) {
                val resBody = res.body?.string()
                if (!resBody.isNullOrBlank()) {
                    return@withContext gson.fromJson(resBody, PairResponseDto::class.java)
                }
            }
        } catch (e: Exception) {
            println("[SendKeep Discovery] Pair request to $targetIp:$port failed: ${e.message}")
        }
        return@withContext null
    }

    suspend fun startListening(context: Context) = withContext(Dispatchers.IO) {
        initFingerprint(context)
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        multicastLock = wifiManager?.createMulticastLock("SendKeepMulticastLock")?.apply {
            setReferenceCounted(true)
            acquire()
        }

        // 1. Proactive Keepalive & Probe: Keeps trusted/known peers stably connected
        // and checks health using unicast HTTP so Wi-Fi multicast packet drops never cause glitches
        CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                try {
                    val trusted = SendKeepServer.getTrustedDevices(context)
                    val currentPeers = _discoveredPeers.value
                    val now = System.currentTimeMillis()

                    // Probe trusted devices that haven't been seen recently or aren't in peer list yet
                    for (td in trusted) {
                        val matched = currentPeers.firstOrNull { it.fingerprint == td.fingerprint || it.ip == td.ip }
                        if (matched == null || (now - matched.lastSeen >= 6000)) {
                            launch {
                                pingPeerHttp(td.ip, td.port, context)
                            }
                        }
                    }

                    // Also ping any active discovered peer if nearing expiration
                    for (peer in currentPeers) {
                        val peerIp = peer.ip
                        if (!peerIp.isNullOrBlank() && now - peer.lastSeen >= 8000) {
                            launch {
                                pingPeerHttp(peerIp, peer.port, context)
                            }
                        }
                    }

                    // Fallback subnet probe if no peers found
                    if (_discoveredPeers.value.isEmpty()) {
                        probeSubnet(context)
                    }
                } catch (ignored: Exception) {}
                delay(4000)
            }
        }

        // 2. Periodic pruner: remove peers that went offline (no heartbeat/ping in last 30 seconds)
        CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                delay(4000)
                val now = System.currentTimeMillis()
                val current = _discoveredPeers.value
                val fresh = current.filter { now - it.lastSeen < 30000 }
                if (fresh.size != current.size) {
                    _discoveredPeers.value = fresh
                }
            }
        }

        try {
            val group = InetAddress.getByName(MULTICAST_IP)
            val socket = MulticastSocket(PORT).apply {
                reuseAddress = true
                joinGroup(group)
            }

            val buffer = ByteArray(4096)
            println("[SendKeep Mobile] Joined multicast $MULTICAST_IP:$PORT")

            while (isActive) {
                val packet = DatagramPacket(buffer, buffer.size)
                socket.receive(packet)

                val json = String(packet.data, 0, packet.length)
                try {
                    val peer = gson.fromJson(json, PeerAnnouncementDto::class.java)
                    if (peer.fingerprint != myFingerprint) {
                        val senderIp = packet.address.hostAddress ?: continue
                        registerDiscoveredPeer(
                            DeviceInfoDto(
                                alias = peer.alias,
                                version = peer.version,
                                deviceModel = peer.deviceModel,
                                deviceType = peer.deviceType,
                                fingerprint = peer.fingerprint,
                                port = peer.port,
                                protocol = peer.protocol
                            ),
                            senderIp
                        )

                        // Trigger mutual registration
                        CoroutineScope(Dispatchers.IO).launch {
                            sendMutualRegister(senderIp, peer.port)
                        }
                    }
                } catch (ignored: Exception) {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun probeSubnet(context: Context) = withContext(Dispatchers.IO) {
        val localIps = getActiveLocalIps()
        if (localIps.isEmpty()) return@withContext

        val fastProbeClient = OkHttpClient.Builder()
            .connectTimeout(300, TimeUnit.MILLISECONDS)
            .readTimeout(300, TimeUnit.MILLISECONDS)
            .build()

        coroutineScope {
            for (localIp in localIps) {
                val prefix = localIp.substringBeforeLast(".") + "."
                val tasks = (1..254).map { i ->
                    val targetIp = prefix + i
                    if (targetIp == localIp) return@map null
                    async {
                        try {
                            val req = Request.Builder()
                                .url("http://$targetIp:$PORT/api/sendkeep/v1/info")
                                .get()
                                .build()
                            val res = fastProbeClient.newCall(req).execute()
                            if (res.isSuccessful) {
                                val body = res.body?.string()
                                if (!body.isNullOrBlank()) {
                                    val info = gson.fromJson(body, DeviceInfoDto::class.java)
                                    registerDiscoveredPeer(info, targetIp)
                                    context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                                        .edit()
                                        .putString("last_laptop_ip", targetIp)
                                        .putString("last_laptop_name", info.alias)
                                        .putInt("last_laptop_port", info.port)
                                        .apply()

                                    // Immediately trigger mutual registration so peer also registers us
                                    launch {
                                        sendMutualRegister(targetIp, info.port)
                                    }
                                }
                            }
                        } catch (ignored: Exception) {}
                    }
                }
                tasks.filterNotNull().awaitAll()
            }
        }
    }

    fun getLocalIpAddress(): String? {
        return getActiveLocalIps().firstOrNull()
    }

    fun getActiveLocalIps(): List<String> {
        val candidates = mutableListOf<Pair<String, Int>>()
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces() ?: return emptyList()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val name = iface.name.lowercase()
                // Filter out cellular modems, virtual and tunnel interfaces
                if (name.startsWith("rmnet") || name.startsWith("pdp") || name.startsWith("ccmni") ||
                    name.startsWith("dummy") || name.startsWith("tun") || name.startsWith("ppp")) {
                    continue
                }

                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        val host = addr.hostAddress ?: continue
                        var priority = 0
                        // Prioritize Wi-Fi, Hotspot (swlan/ap), Tethering, Ethernet
                        if (name.startsWith("swlan") || name.startsWith("wlan") || name.startsWith("ap") ||
                            name.startsWith("rndis") || name.startsWith("eth")) {
                            priority += 10
                        }
                        // Prioritize private RFC 1918 addresses
                        if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
                            priority += 5
                        }
                        candidates.add(Pair(host, priority))
                    }
                }
            }
        } catch (ignored: Exception) {}
        return candidates.sortedByDescending { it.second }.map { it.first }
    }

    suspend fun broadcastAnnouncement(alias: String) = withContext(Dispatchers.IO) {
        try {
            val announcement = PeerAnnouncementDto(
                alias = alias,
                version = "2.1",
                deviceModel = Build.MODEL,
                deviceType = "mobile",
                fingerprint = myFingerprint,
                port = PORT,
                protocol = "http"
            )
            val json = gson.toJson(announcement)
            val bytes = json.toByteArray()

            // 1. Multicast Group
            try {
                val group = InetAddress.getByName(MULTICAST_IP)
                val socket = MulticastSocket()
                val packet = DatagramPacket(bytes, bytes.size, group, PORT)
                socket.send(packet)
                socket.close()
            } catch (ignored: Exception) {}

            // 2. Global Broadcast (255.255.255.255)
            try {
                val bcastAddr = InetAddress.getByName(BROADCAST_IP)
                val bcastSocket = java.net.DatagramSocket()
                bcastSocket.broadcast = true
                val bcastPacket = DatagramPacket(bytes, bytes.size, bcastAddr, PORT)
                bcastSocket.send(bcastPacket)
                bcastSocket.close()
            } catch (ignored: Exception) {}

            // 3. Directed Subnet Broadcasts for each active interface (e.g. 10.134.244.255)
            for (ip in getActiveLocalIps()) {
                try {
                    val subnetBcast = ip.substringBeforeLast(".") + ".255"
                    val bcastAddr = InetAddress.getByName(subnetBcast)
                    val bcastSocket = java.net.DatagramSocket()
                    bcastSocket.broadcast = true
                    val bcastPacket = DatagramPacket(bytes, bytes.size, bcastAddr, PORT)
                    bcastSocket.send(bcastPacket)
                    bcastSocket.close()
                } catch (ignored: Exception) {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun rescan(context: Context) = withContext(Dispatchers.IO) {
        broadcastAnnouncement(Build.MODEL)
        probeSubnet(context)
    }
}
