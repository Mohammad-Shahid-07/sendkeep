package com.sendkeep.app.network

import android.content.Context
import android.os.Build
import android.os.Environment
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.*
import java.io.*
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

object SendKeepServer {
    private const val PORT = 53317
    private val gson = Gson()
    private var serverSocket: ServerSocket? = null
    private var serverJob: Job? = null

    data class ReceivedBatch(
        val folderName: String,
        val folderDir: File?,
        val files: List<Pair<File, FileMetadataDto>>,
        val sender: String,
        val totalBytes: Long
    )

    private data class SessionData(
        val senderAlias: String,
        val files: Map<String, FileMetadataDto>,
        val tokens: ConcurrentHashMap<String, String>, // token -> fileId
        val receivedFiles: MutableList<Pair<File, FileMetadataDto>> = java.util.Collections.synchronizedList(mutableListOf()),
        val createdAt: Long = System.currentTimeMillis()
    )

    data class IncomingTransferRequest(
        val senderAlias: String,
        val senderMeta: String,
        val files: List<FileMetadataDto>,
        val onDecision: (approved: Boolean, alwaysTrust: Boolean) -> Unit
    )

    data class IncomingPairRequest(
        val request: PairRequestDto,
        val peerIp: String,
        val onDecision: (approved: Boolean, alwaysTrust: Boolean) -> Unit
    )

    private val sessions = ConcurrentHashMap<String, SessionData>()
    private val activeReceiveSockets = ConcurrentHashMap<String, Socket>()
    private val activePartialFiles = ConcurrentHashMap<String, File>()
    private val receiveCancelFlags = ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicBoolean>()

    fun cancelTransfer(sessionId: String) {
        receiveCancelFlags[sessionId]?.set(true)
        try {
            activeReceiveSockets[sessionId]?.close()
        } catch (ignored: Exception) {}
        activeReceiveSockets.remove(sessionId)

        val file = activePartialFiles.remove(sessionId)
        if (file != null && file.exists()) {
            try { file.delete() } catch (ignored: Exception) {}
        }

        onTransferProgress?.invoke(
            TransferProgressState(
                sessionId = sessionId,
                fileId = "",
                fileName = "Transfer",
                bytesCurrent = 0L,
                bytesTotal = 0L,
                speedBytesPerSec = 0L,
                direction = TransferDirection.RECEIVE,
                peerAlias = "PC",
                status = TransferStatus.CANCELLED,
                errorMessage = "Transfer cancelled"
            )
        )
    }

    data class WebShareItem(
        val id: String,
        val name: String,
        val path: String?,
        val uriString: String?,
        val size: Long,
        val mimeType: String
    )

    var webShareFilesProvider: (() -> List<WebShareItem>)? = null
    var onFileReceived: ((file: File, meta: FileMetadataDto, sender: String) -> Unit)? = null
    var onBatchReceived: ((ReceivedBatch) -> Unit)? = null
    var onIncomingTransferRequested: ((IncomingTransferRequest) -> Unit)? = null
    var onIncomingPairRequested: ((IncomingPairRequest) -> Unit)? = null
    var onTransferProgress: ((TransferProgressState) -> Unit)? = null

    fun getTrustedDevices(context: Context): List<TrustedDeviceEntity> {
        val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
        val json = prefs.getString("sendkeep_trusted_devices_v2", null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<TrustedDeviceEntity>>() {}.type
            val raw: List<TrustedDeviceEntity>? = gson.fromJson(json, type)
            if (raw.isNullOrEmpty()) return emptyList()
            val seen = mutableSetOf<String>()
            val deduped = mutableListOf<TrustedDeviceEntity>()
            for (d in raw) {
                val key = if (d.fingerprint.isNotBlank()) d.fingerprint else d.ip
                if (seen.add(key)) {
                    deduped.add(d)
                }
            }
            deduped
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveTrustedDevices(context: Context, list: List<TrustedDeviceEntity>) {
        val json = gson.toJson(list)
        context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE).edit()
            .putString("sendkeep_trusted_devices_v2", json)
            .apply()
    }

    fun addTrustedDevice(context: Context, device: TrustedDeviceEntity) {
        val current = getTrustedDevices(context).toMutableList()
        current.removeAll { 
            (device.fingerprint.isNotBlank() && it.fingerprint == device.fingerprint) || 
            it.id == device.id || 
            it.ip == device.ip 
        }
        current.add(0, device)
        saveTrustedDevices(context, current)
    }

    fun removeTrustedDevice(context: Context, id: String) {
        val current = getTrustedDevices(context).toMutableList()
        current.removeAll { it.id == id }
        saveTrustedDevices(context, current)
    }

    fun isDeviceTrusted(context: Context, fingerprint: String, alias: String, clientIp: String = ""): Boolean {
        val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
        if (prefs.getBoolean("auto_accept_trusted", false)) return true
        val trustedList = getTrustedDevices(context)
        if (trustedList.any { it.fingerprint == fingerprint || (clientIp.isNotEmpty() && it.ip == clientIp) }) return true
        val trustedSet = prefs.getStringSet("trusted_senders", emptySet()) ?: emptySet()
        return trustedSet.contains(alias)
    }

    fun start(context: Context) {
        if (serverJob?.isActive == true) return

        serverJob = CoroutineScope(Dispatchers.IO).launch {
            try {
                serverSocket = ServerSocket(PORT).apply {
                    reuseAddress = true
                }
                println("[SendKeep Mobile Server] Listening on port $PORT")

                while (isActive) {
                    val client = try {
                        serverSocket?.accept() ?: break
                    } catch (e: Exception) {
                        break
                    }

                    launch(Dispatchers.IO) {
                        handleClient(context, client)
                    }
                }
            } catch (e: Exception) {
                println("[SendKeep Mobile Server] Server failed: ${e.message}")
            }
        }
    }

    fun stop() {
        serverJob?.cancel()
        serverJob = null
        try {
            serverSocket?.close()
        } catch (ignored: Exception) {}
        serverSocket = null
        sessions.clear()
    }

    private suspend fun handleClient(context: Context, socket: Socket) = withContext(Dispatchers.IO) {
        try {
            socket.soTimeout = 30000
            socket.tcpNoDelay = true
            try {
                socket.receiveBufferSize = 512 * 1024
                socket.sendBufferSize = 512 * 1024
            } catch (ignored: Exception) {}
            val input = BufferedInputStream(socket.getInputStream(), 256 * 1024)
            val output = BufferedOutputStream(socket.getOutputStream(), 64 * 1024)

            // Read HTTP request line and headers byte-by-byte up to \r\n\r\n without consuming any binary payload
            val headerBytes = ByteArrayOutputStream()
            var state = 0
            while (true) {
                val b = input.read()
                if (b == -1) break
                headerBytes.write(b)
                if (state == 0 && b == '\r'.code) state = 1
                else if (state == 1 && b == '\n'.code) state = 2
                else if (state == 2 && b == '\r'.code) state = 3
                else if (state == 3 && b == '\n'.code) break
                else state = if (b == '\r'.code) 1 else 0
            }

            val headerText = headerBytes.toString(Charsets.UTF_8.name())
            val lines = headerText.split("\r\n")
            if (lines.isEmpty() || lines[0].isEmpty()) return@withContext

            val requestLine = lines[0]
            val parts = requestLine.split(" ")
            if (parts.size < 2) return@withContext

            val method = parts[0].uppercase()
            val rawUri = parts[1]
            val uriParts = rawUri.split("?")
            val path = uriParts[0]
            val queryString = if (uriParts.size > 1) uriParts[1] else ""
            val queryParams = parseQueryParams(queryString)

            var contentLength = 0L
            for (i in 1 until lines.size) {
                val line = lines[i]
                if (line.isEmpty()) break
                val headerParts = line.split(":", limit = 2)
                if (headerParts.size == 2 && headerParts[0].trim().equals("Content-Length", ignoreCase = true)) {
                    contentLength = headerParts[1].trim().toLongOrNull() ?: 0L
                }
            }

            val clientIp = (socket.remoteSocketAddress as? java.net.InetSocketAddress)?.address?.hostAddress ?: ""

            when {
                // Handle CORS preflight for all endpoints
                method == "OPTIONS" -> {
                    sendResponse(output, 204, "No Content", "text/plain", ByteArray(0))
                }

                // 0. Web Share Portal & APIs
                method == "GET" && (path == "/" || path == "/web") -> {
                    val html = getWebPortalHtml(Build.MODEL)
                    sendResponse(output, 200, "OK", "text/html; charset=utf-8", html.toByteArray(Charsets.UTF_8))
                }

                method == "GET" && path == "/web/api/files" -> {
                    val items = webShareFilesProvider?.invoke() ?: emptyList()
                    val data = mapOf(
                        "alias" to Build.MODEL,
                        "deviceModel" to Build.MODEL,
                        "count" to items.size,
                        "files" to items.map {
                            mapOf(
                                "id" to it.id,
                                "name" to it.name,
                                "size" to it.size,
                                "fileType" to it.mimeType
                            )
                        }
                    )
                    sendResponse(output, 200, "OK", "application/json", gson.toJson(data).toByteArray(Charsets.UTF_8))
                }

                method == "GET" && (path.startsWith("/web/api/download/") || path == "/web/api/download") -> {
                    val fileId = if (path.startsWith("/web/api/download/")) {
                        path.removePrefix("/web/api/download/").trim()
                    } else {
                        queryParams["id"] ?: ""
                    }

                    val items = webShareFilesProvider?.invoke() ?: emptyList()
                    val item = items.find { it.id == fileId }

                    if (item == null) {
                        sendResponse(output, 404, "Not Found", "text/plain", "File not found".toByteArray())
                        return@withContext
                    }

                    val inputStream: InputStream? = if (!item.path.isNullOrBlank() && File(item.path).exists()) {
                        FileInputStream(File(item.path))
                    } else if (!item.uriString.isNullOrBlank()) {
                        try { context.contentResolver.openInputStream(android.net.Uri.parse(item.uriString)) } catch (e: Exception) { null }
                    } else null

                    if (inputStream == null) {
                        sendResponse(output, 404, "Not Found", "text/plain", "Cannot open file content".toByteArray())
                        return@withContext
                    }

                    try {
                        val header = "HTTP/1.1 200 OK\r\n" +
                                "Content-Type: ${item.mimeType}\r\n" +
                                "Content-Length: ${item.size}\r\n" +
                                "Content-Disposition: attachment; filename=\"${item.name.replace("\"", "\\\"")}\"\r\n" +
                                "Access-Control-Allow-Origin: *\r\n" +
                                "Connection: close\r\n\r\n"
                        output.write(header.toByteArray(Charsets.UTF_8))
                        inputStream.use { fis ->
                            val buf = ByteArray(64 * 1024)
                            var read: Int
                            while (fis.read(buf).also { read = it } != -1) {
                                output.write(buf, 0, read)
                            }
                        }
                        output.flush()
                    } catch (e: Exception) {
                        println("[SendKeep Web] Download stream error: ${e.message}")
                    }
                    return@withContext
                }

                method == "POST" && path == "/web/api/upload" -> {
                    val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                    val baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    val targetDir = File(baseDir, "SendKeep")
                    if (!targetDir.exists()) targetDir.mkdirs()

                    val uploadName = queryParams["filename"]?.takeIf { it.isNotBlank() } ?: "web_upload_${System.currentTimeMillis()}"
                    val safeName = File(uploadName).name
                    var targetFile = File(targetDir, safeName)

                    val collisionStrategy = prefs.getString("collision_strategy", "rename") ?: "rename"
                    if (targetFile.exists()) {
                        if (collisionStrategy == "skip") {
                            sendResponse(output, 200, "OK", "application/json", "{\"status\":\"skipped\"}".toByteArray())
                            return@withContext
                        } else if (collisionStrategy == "rename") {
                            val dotIndex = safeName.lastIndexOf('.')
                            val stem = if (dotIndex != -1) safeName.substring(0, dotIndex) else safeName
                            val ext = if (dotIndex != -1) safeName.substring(dotIndex) else ""
                            var counter = 1
                            while (targetFile.exists()) {
                                targetFile = File(targetDir, "$stem ($counter)$ext")
                                counter++
                            }
                        }
                    }

                    val fos = FileOutputStream(targetFile)
                    var totalRead = 0L
                    try {
                        val buffer = ByteArray(64 * 1024)
                        var read: Int
                        while (totalRead < contentLength) {
                            val toRead = minOf(buffer.size.toLong(), contentLength - totalRead).toInt()
                            read = input.read(buffer, 0, toRead)
                            if (read == -1) break
                            fos.write(buffer, 0, read)
                            totalRead += read
                        }
                        fos.flush()
                    } finally {
                        try { fos.close() } catch (ignored: Exception) {}
                    }

                    android.media.MediaScannerConnection.scanFile(
                        context,
                        arrayOf(targetFile.absolutePath),
                        null
                    ) { _, _ -> }

                    val meta = FileMetadataDto(
                        id = UUID.randomUUID().toString(),
                        fileName = targetFile.name,
                        size = targetFile.length(),
                        fileType = "application/octet-stream",
                        sha256 = null,
                        preview = null
                    )

                    onFileReceived?.invoke(targetFile, meta, "Browser ($clientIp)")
                    val resp = mapOf("status" to "ok", "saved" to listOf(targetFile.name))
                    sendResponse(output, 200, "OK", "application/json", gson.toJson(resp).toByteArray(Charsets.UTF_8))
                    return@withContext
                }

                // 1. Info endpoint
                method == "GET" && (path == "/api/sendkeep/v1/info" || path == "/api/localsend/v2/info") -> {
                    val info = DeviceInfoDto(
                        alias = Build.MODEL,
                        version = "2.1",
                        deviceModel = Build.MODEL,
                        deviceType = "mobile",
                        fingerprint = SendKeepDiscovery.myFingerprint,
                        port = PORT,
                        protocol = "http",
                        download = true
                    )
                    val json = gson.toJson(info)
                    sendResponse(output, 200, "OK", "application/json", json.toByteArray(Charsets.UTF_8))
                }

                // 2. Mutual Register endpoint (LocalSend & SendKeep)
                method == "POST" && (path == "/api/sendkeep/v1/register" || path == "/api/localsend/v2/register") -> {
                    val bodyString = readBodyString(input, contentLength)
                    try {
                        val peerInfo = gson.fromJson(bodyString, DeviceInfoDto::class.java)
                        if (peerInfo != null && clientIp.isNotEmpty()) {
                            SendKeepDiscovery.registerDiscoveredPeer(peerInfo, clientIp)
                        }
                    } catch (ignored: Exception) {}

                    val myInfo = DeviceInfoDto(
                        alias = Build.MODEL,
                        version = "2.1",
                        deviceModel = Build.MODEL,
                        deviceType = "mobile",
                        fingerprint = SendKeepDiscovery.myFingerprint,
                        port = PORT,
                        protocol = "http",
                        download = true
                    )
                    sendResponse(output, 200, "OK", "application/json", gson.toJson(myInfo).toByteArray(Charsets.UTF_8))
                }

                // 3. Mutual Pair endpoint
                method == "POST" && path == "/api/sendkeep/v1/pair" -> {
                    val bodyString = readBodyString(input, contentLength)
                    val pairReq = gson.fromJson(bodyString, PairRequestDto::class.java)

                    val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                    val requirePin = prefs.getBoolean("require_pin", false)
                    val securityPin = prefs.getString("security_pin", "") ?: ""
                    if (requirePin && securityPin.isNotBlank()) {
                        if (pairReq.pin.isNullOrBlank() || pairReq.pin != securityPin) {
                            val resp = PairResponseDto(
                                status = "declined",
                                alias = Build.MODEL,
                                deviceModel = Build.MODEL,
                                deviceType = "mobile",
                                fingerprint = SendKeepDiscovery.myFingerprint
                            )
                            sendResponse(output, 401, "Unauthorized", "application/json", gson.toJson(resp).toByteArray(Charsets.UTF_8))
                            return@withContext
                        }
                    }

                    // Only skip prompt if user explicitly enabled auto_accept_trusted in preferences
                    val autoAccept = prefs.getBoolean("auto_accept_trusted", false)
                    if (autoAccept) {
                        addTrustedDevice(context, TrustedDeviceEntity(
                            id = pairReq.fingerprint,
                            alias = pairReq.alias,
                            ip = clientIp,
                            port = pairReq.port,
                            deviceModel = pairReq.deviceModel,
                            deviceType = pairReq.deviceType,
                            fingerprint = pairReq.fingerprint
                        ))
                        val resp = PairResponseDto(
                            status = "accepted",
                            alias = Build.MODEL,
                            deviceModel = Build.MODEL,
                            deviceType = "mobile",
                            fingerprint = SendKeepDiscovery.myFingerprint
                        )
                        sendResponse(output, 200, "OK", "application/json", gson.toJson(resp).toByteArray(Charsets.UTF_8))
                        return@withContext
                    }

                    if (onIncomingPairRequested != null) {
                        val deferred = CompletableDeferred<Boolean>()
                        val incoming = IncomingPairRequest(
                            request = pairReq,
                            peerIp = clientIp,
                            onDecision = { approved, alwaysTrust ->
                                if (approved) {
                                    addTrustedDevice(context, TrustedDeviceEntity(
                                        id = pairReq.fingerprint,
                                        alias = pairReq.alias,
                                        ip = clientIp,
                                        port = pairReq.port,
                                        deviceModel = pairReq.deviceModel,
                                        deviceType = pairReq.deviceType,
                                        fingerprint = pairReq.fingerprint
                                    ))
                                }
                                deferred.complete(approved)
                            }
                        )
                        withContext(Dispatchers.Main) {
                            onIncomingPairRequested?.invoke(incoming)
                        }

                        // Await user decision with 45s timeout
                        val approved = withTimeoutOrNull(45_000) { deferred.await() } ?: false
                        val resp = PairResponseDto(
                            status = if (approved) "accepted" else "declined",
                            alias = Build.MODEL,
                            deviceModel = Build.MODEL,
                            deviceType = "mobile",
                            fingerprint = SendKeepDiscovery.myFingerprint
                        )
                        val code = if (approved) 200 else 403
                        val status = if (approved) "OK" else "Forbidden"
                        sendResponse(output, code, status, "application/json", gson.toJson(resp).toByteArray(Charsets.UTF_8))
                    } else {
                        // Fallback auto-trust if UI listener is not attached
                        addTrustedDevice(context, TrustedDeviceEntity(
                            id = pairReq.fingerprint,
                            alias = pairReq.alias,
                            ip = clientIp,
                            port = pairReq.port,
                            deviceModel = pairReq.deviceModel,
                            deviceType = pairReq.deviceType,
                            fingerprint = pairReq.fingerprint
                        ))
                        val resp = PairResponseDto(
                            status = "accepted",
                            alias = Build.MODEL,
                            deviceModel = Build.MODEL,
                            deviceType = "mobile",
                            fingerprint = SendKeepDiscovery.myFingerprint
                        )
                        sendResponse(output, 200, "OK", "application/json", gson.toJson(resp).toByteArray(Charsets.UTF_8))
                    }
                }

                // 4. Prepare upload endpoint
                method == "POST" && (path == "/api/sendkeep/v1/prepare-upload" || path == "/api/localsend/v2/prepare-upload") -> {
                    val bodyString = readBodyString(input, contentLength)
                    val req = gson.fromJson(bodyString, PrepareUploadRequestDto::class.java)

                    val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                    val requirePin = prefs.getBoolean("require_pin", false)
                    val securityPin = prefs.getString("security_pin", "") ?: ""
                    if (requirePin && securityPin.isNotBlank()) {
                        if (req.pin.isNullOrBlank() || req.pin != securityPin) {
                            val resp = mapOf("message" to "Invalid or missing security PIN")
                            sendResponse(output, 401, "Unauthorized", "application/json", gson.toJson(resp).toByteArray(Charsets.UTF_8))
                            return@withContext
                        }
                    }

                    val isTrusted = isDeviceTrusted(context, req.info.fingerprint, req.info.alias, clientIp)

                    if (!isTrusted && onIncomingTransferRequested != null) {
                        val deferred = CompletableDeferred<Boolean>()
                        val incomingReq = IncomingTransferRequest(
                            senderAlias = req.info.alias,
                            senderMeta = "${req.info.deviceModel ?: "Peer"} • Port ${req.info.port}",
                            files = req.files.values.toList(),
                            onDecision = { approved, alwaysTrust ->
                                if (alwaysTrust && approved) {
                                    addTrustedDevice(context, TrustedDeviceEntity(
                                        id = "dev-${clientIp}-${req.info.port}",
                                        alias = req.info.alias,
                                        ip = clientIp,
                                        port = req.info.port,
                                        deviceModel = req.info.deviceModel,
                                        deviceType = req.info.deviceType,
                                        fingerprint = req.info.fingerprint
                                    ))
                                }
                                deferred.complete(approved)
                            }
                        )
                        withContext(Dispatchers.Main) {
                            onIncomingTransferRequested?.invoke(incomingReq)
                        }

                        // Await user decision with 45s timeout
                        val approved = withTimeoutOrNull(45_000) { deferred.await() } ?: false
                        if (!approved) {
                            sendResponse(output, 403, "Forbidden", "text/plain", "Transfer declined".toByteArray())
                            return@withContext
                        }
                    }

                    val sessionId = UUID.randomUUID().toString()
                    val filesTokens = mutableMapOf<String, String>()
                    val tokenToFile = ConcurrentHashMap<String, String>()

                    for ((fileId, _) in req.files) {
                        val token = UUID.randomUUID().toString()
                        filesTokens[fileId] = token
                        tokenToFile[token] = fileId
                    }

                    val sessionData = SessionData(
                        senderAlias = req.info.alias,
                        files = req.files,
                        tokens = tokenToFile
                    )
                    sessions[sessionId] = sessionData

                    val response = PrepareUploadResponseDto(
                        sessionId = sessionId,
                        files = filesTokens
                    )
                    val json = gson.toJson(response)
                    sendResponse(output, 200, "OK", "application/json", json.toByteArray(Charsets.UTF_8))
                }

                // 4b. Cancel endpoint (LocalSend & SendKeep)
                method == "POST" && (path == "/api/sendkeep/v1/cancel" || path == "/api/localsend/v2/cancel") -> {
                    val sessionId = queryParams["sessionId"]
                    if (sessionId != null) {
                        println("[SendKeep Mobile Server] Cancel requested for session $sessionId")
                        cancelTransfer(sessionId)
                    }
                    sendResponse(output, 200, "OK", "text/plain", "OK".toByteArray())
                }

                // 5. Binary upload endpoint
                method == "POST" && (path == "/api/sendkeep/v1/upload" || path == "/api/localsend/v2/upload") -> {
                    val sessionId = queryParams["sessionId"]
                    val fileId = queryParams["fileId"]
                    val token = queryParams["token"]

                    if (sessionId == null || fileId == null || token == null) {
                        sendResponse(output, 400, "Bad Request", "text/plain", "Missing query parameters".toByteArray())
                        return@withContext
                    }

                    val session = sessions[sessionId]
                    if (session == null || session.tokens[token] != fileId) {
                        sendResponse(output, 403, "Forbidden", "text/plain", "Invalid session or token".toByteArray())
                        return@withContext
                    }

                    val meta = session.files[fileId]
                    if (meta == null) {
                        sendResponse(output, 400, "Bad Request", "text/plain", "Unknown fileId".toByteArray())
                        return@withContext
                    }

                    // Write to public Downloads/SendKeep or user configured directory
                    val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                    val baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    val customPath = prefs.getString("storage_path", null)
                    val saveDir = if (!customPath.isNullOrBlank() && !customPath.contains(":") && !customPath.startsWith("/")) {
                        File(Environment.getExternalStorageDirectory(), customPath)
                    } else if (!customPath.isNullOrBlank() && customPath.startsWith("/") && File(customPath).canWrite()) {
                        File(customPath)
                    } else {
                        File(baseDir, "SendKeep")
                    }.apply { mkdirs() }

                    // Handle relative sub-paths safely for folder structures
                    val normalizedRel = meta.fileName.replace('\\', '/')
                    val safeParts = normalizedRel.split('/').filter {
                        it.isNotBlank() && it != "." && it != ".." && !it.contains(':')
                    }.map { part ->
                        part.replace(Regex("[\\\\/:*?\"<>|]"), "_")
                    }

                    val relPath = if (safeParts.isNotEmpty()) safeParts.joinToString(File.separator) else "received_${System.currentTimeMillis()}"
                    var targetFile = File(saveDir, relPath)
                    targetFile.parentFile?.mkdirs()

                    val collisionMode = prefs.getString("collision_strategy", "rename") ?: "rename"

                    if (targetFile.exists()) {
                        when (collisionMode.lowercase()) {
                            "skip" -> {
                                println("[SendKeep Mobile Server] Skipping existing file: ${targetFile.absolutePath}")
                                onTransferProgress?.invoke(
                                    TransferProgressState(
                                        sessionId = sessionId,
                                        fileId = fileId,
                                        fileName = targetFile.name,
                                        bytesCurrent = contentLength,
                                        bytesTotal = contentLength,
                                        speedBytesPerSec = 0L,
                                        direction = TransferDirection.RECEIVE,
                                        peerAlias = session.senderAlias,
                                        status = TransferStatus.COMPLETED,
                                        localFilePath = targetFile.absolutePath
                                    )
                                )
                                var remaining = contentLength
                                val buf = ByteArray(65536)
                                while (remaining > 0) {
                                    val toRead = minOf(buf.size.toLong(), remaining).toInt()
                                    val count = input.read(buf, 0, toRead)
                                    if (count <= 0) break
                                    remaining -= count
                                }
                                session.tokens.remove(token)
                                if (session.tokens.isEmpty()) sessions.remove(sessionId)
                                sendResponse(output, 200, "OK", "text/plain", "OK".toByteArray())
                                return@withContext
                            }
                            "overwrite" -> {
                                // Overwrite: keep targetFile as is
                            }
                            else -> {
                                val parent = targetFile.parentFile ?: saveDir
                                val name = targetFile.name
                                val dotIndex = name.lastIndexOf('.')
                                val base = if (dotIndex != -1) name.substring(0, dotIndex) else name
                                val ext = if (dotIndex != -1) name.substring(dotIndex) else ""
                                var count = 1
                                while (targetFile.exists()) {
                                    targetFile = File(parent, "$base ($count)$ext")
                                    count++
                                }
                            }
                        }
                    }

                    val startTime = System.currentTimeMillis()
                    var lastEmitTime = 0L
                    var totalRead = 0L

                    val cancelFlag = java.util.concurrent.atomic.AtomicBoolean(false)
                    receiveCancelFlags[sessionId] = cancelFlag
                    activeReceiveSockets[sessionId] = socket
                    activePartialFiles[sessionId] = targetFile

                    // Initial progress emit
                    onTransferProgress?.invoke(
                        TransferProgressState(
                            sessionId = sessionId,
                            fileId = fileId,
                            fileName = targetFile.name,
                            bytesCurrent = 0L,
                            bytesTotal = contentLength,
                            speedBytesPerSec = 0L,
                            direction = TransferDirection.RECEIVE,
                            peerAlias = session.senderAlias,
                            status = TransferStatus.IN_PROGRESS
                        )
                    )

                    var transferSuccess = false
                    try {
                        BufferedOutputStream(FileOutputStream(targetFile), 256 * 1024).use { fos ->
                            var remaining = contentLength
                            val buf = ByteArray(262144) // 256KB buffer for max speed
                            while (remaining > 0) {
                                if (cancelFlag.get()) break
                                val toRead = minOf(buf.size.toLong(), remaining).toInt()
                                val count = input.read(buf, 0, toRead)
                                if (count == -1) break
                                fos.write(buf, 0, count)
                                remaining -= count
                                totalRead += count

                                val now = System.currentTimeMillis()
                                if (now - lastEmitTime >= 120 || remaining == 0L) {
                                    lastEmitTime = now
                                    val elapsedSec = maxOf(0.001, (now - startTime) / 1000.0)
                                    val speed = (totalRead / elapsedSec).toLong()
                                    onTransferProgress?.invoke(
                                        TransferProgressState(
                                            sessionId = sessionId,
                                            fileId = fileId,
                                            fileName = targetFile.name,
                                            bytesCurrent = totalRead,
                                            bytesTotal = contentLength,
                                            speedBytesPerSec = speed,
                                            direction = TransferDirection.RECEIVE,
                                            peerAlias = session.senderAlias,
                                            status = if (remaining == 0L) TransferStatus.COMPLETED else TransferStatus.IN_PROGRESS,
                                            localFilePath = if (remaining == 0L) targetFile.absolutePath else null
                                        )
                                    )
                                }
                            }
                            fos.flush()
                        }
                        if (totalRead == contentLength && !cancelFlag.get()) {
                            transferSuccess = true
                        }
                    } finally {
                        activeReceiveSockets.remove(sessionId)
                        receiveCancelFlags.remove(sessionId)
                        activePartialFiles.remove(sessionId)
                    }

                    if (!transferSuccess) {
                        if (targetFile.exists()) {
                            try { targetFile.delete() } catch (ignored: Exception) {}
                        }
                        val isCancelled = cancelFlag.get()
                        onTransferProgress?.invoke(
                            TransferProgressState(
                                sessionId = sessionId,
                                fileId = fileId,
                                fileName = targetFile.name,
                                bytesCurrent = totalRead,
                                bytesTotal = contentLength,
                                speedBytesPerSec = 0L,
                                direction = TransferDirection.RECEIVE,
                                peerAlias = session.senderAlias,
                                status = if (isCancelled) TransferStatus.CANCELLED else TransferStatus.FAILED,
                                errorMessage = if (isCancelled) "Transfer cancelled" else "Connection broken"
                            )
                        )
                        sendResponse(output, if (isCancelled) 200 else 500, if (isCancelled) "Cancelled" else "Failed", "text/plain", "Transfer terminated".toByteArray())
                        return@withContext
                    }

                    println("[SendKeep Mobile Server] Saved ${targetFile.name} (${targetFile.length()} bytes)")
                    try {
                        android.media.MediaScannerConnection.scanFile(
                            context,
                            arrayOf(targetFile.absolutePath),
                            arrayOf(meta.fileType),
                            null
                        )
                    } catch (ignored: Exception) {}

                    session.receivedFiles.add(targetFile to meta)
                    session.tokens.remove(token)

                    val isBatchOrFolder = session.files.size > 1 || session.files.values.any { 
                        it.fileName.contains('/') || it.fileName.contains('\\') 
                    }

                    if (!isBatchOrFolder) {
                        onFileReceived?.invoke(targetFile, meta, session.senderAlias)
                    }

                    // Clean up consumed token and empty session
                    if (session.tokens.isEmpty()) {
                        sessions.remove(sessionId)
                        if (isBatchOrFolder) {
                            val firstRel = session.files.values.firstOrNull()?.fileName?.replace('\\', '/') ?: ""
                            val folderName = if (firstRel.contains('/')) {
                                firstRel.substringBefore('/')
                            } else {
                                "Folder (${session.receivedFiles.size} items)"
                            }
                            val folderDir = session.receivedFiles.firstOrNull()?.first?.parentFile
                            val totalBytes = session.receivedFiles.sumOf { it.first.length() }
                            onBatchReceived?.invoke(
                                ReceivedBatch(
                                    folderName = folderName,
                                    folderDir = folderDir,
                                    files = session.receivedFiles.toList(),
                                    sender = session.senderAlias,
                                    totalBytes = totalBytes
                                )
                            )
                        }
                    }

                    sendResponse(output, 200, "OK", "text/plain", "OK".toByteArray())
                }

                else -> {
                    sendResponse(output, 404, "Not Found", "text/plain", "Not Found".toByteArray())
                }
            }
        } catch (e: Exception) {
            println("[SendKeep Mobile Server] Client handler error: ${e.message}")
        } finally {
            try { socket.close() } catch (ignored: Exception) {}
        }
    }

    private fun readBodyString(input: InputStream, length: Long): String {
        if (length <= 0) return ""
        val bytes = ByteArray(length.toInt())
        var totalRead = 0
        while (totalRead < length) {
            val read = input.read(bytes, totalRead, (length - totalRead).toInt())
            if (read == -1) break
            totalRead += read
        }
        return String(bytes, 0, totalRead, Charsets.UTF_8)
    }

    private fun sendResponse(output: OutputStream, code: Int, msg: String, contentType: String, body: ByteArray) {
        val header = "HTTP/1.1 $code $msg\r\n" +
                "Content-Type: $contentType\r\n" +
                "Content-Length: ${body.size}\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: *\r\n" +
                "Connection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.UTF_8))
        output.write(body)
        output.flush()
    }

    private fun parseQueryParams(query: String): Map<String, String> {
        if (query.isEmpty()) return emptyMap()
        return query.split("&").associate { param ->
            val parts = param.split("=", limit = 2)
            val key = URLDecoder.decode(parts[0], "UTF-8")
            val value = if (parts.size > 1) URLDecoder.decode(parts[1], "UTF-8") else ""
            key to value
        }
    }

    private fun getWebPortalHtml(alias: String): String {
        return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>SendKeep Mobile - Web Share</title>
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
          <h1 id="host-name">$alias</h1>
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
        <span>Send to Device</span>
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
            <p>No files currently staged on SendKeep.<br>Items sent to this device will appear here.</p>
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
          <div class="drop-sub">Send photos, videos, and documents directly to $alias</div>
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
      title.innerText = 'Available Files (' + files.length + ')';
      dlAll.style.display = files.length > 1 ? 'flex' : 'none';

      if (files.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <p>No files currently staged on SendKeep.<br>Items sent to this device will appear here.</p>
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
              <div class="file-name" title="${'$'}{f.name}">${'$'}{f.name}</div>
              <div class="file-meta">${'$'}{formatBytes(f.size)}</div>
            </div>
          </div>
          <a class="btn-dl" href="/web/api/download/${'$'}{f.id}" download="${'$'}{f.name}">
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
          a.href = `/web/api/download/${'$'}{f.id}`;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, idx * 300);
      });
    }

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
          <span style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${'$'}{file.name}</span>
          <span id="status-${'$'}{file.name}" style="color:var(--text-muted)">0%</span>
        </div>
        <div class="prog-bar-bg">
          <div class="prog-bar-fill" id="bar-${'$'}{file.name}"></div>
        </div>
      `;
      queue.prepend(item);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/web/api/upload?filename=' + encodeURIComponent(file.name), true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          const bar = document.getElementById('bar-' + file.name);
          const status = document.getElementById('status-' + file.name);
          if (bar) bar.style.width = pct + '%';
          if (status) status.innerText = pct + '%';
        }
      };

      xhr.onload = () => {
        const status = document.getElementById('status-' + file.name);
        const bar = document.getElementById('bar-' + file.name);
        if (xhr.status === 200) {
          if (status) { status.innerText = 'Saved!'; status.style.color = 'var(--success)'; }
          if (bar) bar.style.background = 'var(--success)';
          setTimeout(fetchFiles, 600);
        } else {
          if (status) { status.innerText = 'Failed'; status.style.color = '#ef4444'; }
        }
      };

      xhr.onerror = () => {
        const status = document.getElementById('status-' + file.name);
        if (status) { status.innerText = 'Error'; status.style.color = '#ef4444'; }
      };

      xhr.send(file);
    }

    fetchFiles();
    setInterval(fetchFiles, 4000);
  </script>
</body>
</html>
        """.trimIndent()
    }
}
