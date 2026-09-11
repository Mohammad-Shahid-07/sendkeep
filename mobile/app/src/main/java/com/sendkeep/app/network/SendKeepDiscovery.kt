package com.sendkeep.app.network

import android.content.Context
import android.net.wifi.WifiManager
import com.google.gson.Gson
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.MulticastSocket
import java.util.UUID
import java.util.concurrent.TimeUnit

object SendKeepDiscovery {
    private const val MULTICAST_IP = "224.0.0.167"
    private const val PORT = 53317

    private val gson = Gson()
    val myFingerprint: String = "sk_android_" + UUID.randomUUID().toString().substring(0, 8)

    private val _discoveredPeers = MutableStateFlow<List<PeerAnnouncementDto>>(emptyList())
    val discoveredPeers: StateFlow<List<PeerAnnouncementDto>> = _discoveredPeers.asStateFlow()

    private var multicastLock: WifiManager.MulticastLock? = null

    suspend fun startListening(context: Context) = withContext(Dispatchers.IO) {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        multicastLock = wifiManager?.createMulticastLock("SendKeepMulticastLock")?.apply {
            setReferenceCounted(true)
            acquire()
        }

        // Run smart subnet probe periodically (LocalSend fallback mechanism for Hotspot / AP isolation)
        CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                if (_discoveredPeers.value.isEmpty()) {
                    probeSubnet(context)
                }
                delay(2500)
            }
        }

        try {
            val group = InetAddress.getByName(MULTICAST_IP)
            val socket = MulticastSocket(PORT)
            socket.joinGroup(group)

            val buffer = ByteArray(4096)
            println("[SendKeep Mobile] Joined multicast $MULTICAST_IP:$PORT")

            while (isActive) {
                val packet = DatagramPacket(buffer, buffer.size)
                socket.receive(packet)

                val json = String(packet.data, 0, packet.length)
                try {
                    val peer = gson.fromJson(json, PeerAnnouncementDto::class.java)
                    if (peer.fingerprint != myFingerprint) {
                        val senderIp = packet.address.hostAddress
                        val peerWithIp = peer.copy(ip = senderIp)

                        val currentList = _discoveredPeers.value.toMutableList()
                        currentList.removeAll { it.fingerprint == peer.fingerprint }
                        currentList.add(peerWithIp)
                        _discoveredPeers.value = currentList
                    }
                } catch (ignored: Exception) {}
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun probeSubnet(context: Context) = withContext(Dispatchers.IO) {
        val client = okhttp3.OkHttpClient.Builder()
            .connectTimeout(300, TimeUnit.MILLISECONDS)
            .readTimeout(300, TimeUnit.MILLISECONDS)
            .build()

        val localIp = getLocalIpAddress() ?: "10.134.244.1"
        val prefix = localIp.substringBeforeLast(".") + "."

        val targets = mutableListOf("127.0.0.1", "10.134.244.37")
        for (i in 1..254) {
            val ip = prefix + i
            if (!targets.contains(ip) && ip != localIp) {
                targets.add(ip)
            }
        }

        coroutineScope {
            targets.map { targetIp ->
                async {
                    if (true) {
                        try {
                            val req = okhttp3.Request.Builder()
                                .url("http://$targetIp:$PORT/api/sendkeep/v1/info")
                                .get()
                                .build()

                            val res = client.newCall(req).execute()
                            if (res.isSuccessful) {
                                val body = res.body?.string()
                                if (body != null) {
                                    val info = gson.fromJson(body, DeviceInfoDto::class.java)
                                    val peer = PeerAnnouncementDto(
                                        alias = info.alias,
                                        version = info.version,
                                        deviceModel = info.deviceModel,
                                        deviceType = info.deviceType,
                                        fingerprint = info.fingerprint,
                                        port = info.port,
                                        protocol = info.protocol,
                                        ip = targetIp
                                    )
                                    val currentList = _discoveredPeers.value.toMutableList()
                                    currentList.removeAll { it.fingerprint == peer.fingerprint }
                                    currentList.add(peer)
                                    _discoveredPeers.value = currentList

                                    context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                                        .edit()
                                        .putString("last_laptop_ip", targetIp)
                                        .apply()
                                }
                            }
                        } catch (ignored: Exception) {}
                    }
                }
            }.awaitAll()
        }
    }

    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                val addresses = iface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val addr = addresses.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (ignored: Exception) {}
        return null
    }

    suspend fun broadcastAnnouncement(alias: String) = withContext(Dispatchers.IO) {
        try {
            val announcement = PeerAnnouncementDto(
                alias = alias,
                version = "2.1",
                deviceModel = android.os.Build.MODEL,
                deviceType = "mobile",
                fingerprint = myFingerprint,
                port = PORT,
                protocol = "http"
            )
            val json = gson.toJson(announcement)
            val bytes = json.toByteArray()

            val group = InetAddress.getByName(MULTICAST_IP)
            val socket = MulticastSocket()
            val packet = DatagramPacket(bytes, bytes.size, group, PORT)
            socket.send(packet)
            socket.close()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
