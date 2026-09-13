package com.sendkeep.app.network

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.documentfile.provider.DocumentFile
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

class SendKeepClient {
    companion object {
        var onTransferProgress: ((TransferProgressState) -> Unit)? = null
        val activeCalls = java.util.concurrent.ConcurrentHashMap<String, okhttp3.Call>()
        val cancelFlags = java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicBoolean>()

        fun cancelTransfer(sessionId: String, targetIp: String? = null, port: Int = 53317) {
            cancelFlags[sessionId]?.set(true)
            activeCalls[sessionId]?.cancel()
            activeCalls.remove(sessionId)

            onTransferProgress?.invoke(
                TransferProgressState(
                    sessionId = sessionId,
                    fileId = "",
                    fileName = "Transfer",
                    bytesCurrent = 0L,
                    bytesTotal = 0L,
                    speedBytesPerSec = 0L,
                    direction = TransferDirection.SEND,
                    peerAlias = "Desktop",
                    status = TransferStatus.CANCELLED,
                    errorMessage = "Cancelled by user"
                )
            )

            if (!targetIp.isNullOrBlank()) {
                kotlinx.coroutines.CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val fastClient = OkHttpClient.Builder()
                            .connectTimeout(1500, TimeUnit.MILLISECONDS)
                            .readTimeout(1500, TimeUnit.MILLISECONDS)
                            .build()
                        val cancelReq = Request.Builder()
                            .url("http://$targetIp:$port/api/localsend/v2/cancel?sessionId=$sessionId")
                            .post(RequestBody.create(null, ByteArray(0)))
                            .build()
                        fastClient.newCall(cancelReq).execute().close()
                    } catch (ignored: Exception) {}
                }
            }
        }
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .writeTimeout(300, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    suspend fun sendFiles(
        context: Context,
        targetIp: String,
        port: Int,
        uris: List<Uri>,
        pin: String? = null,
        onProgress: ((current: Int, total: Int, fileName: String) -> Unit)? = null
    ): Boolean = withContext(Dispatchers.IO) {
        var activeSessionId: String? = null
        try {
            val filesToSend = mutableListOf<DiscoveredFileToSend>()

            for (uri in uris) {
                val isTree = (uri.scheme == "content" && (uri.path?.contains("/tree/") == true || uri.toString().contains("/tree/")))
                if (isTree) {
                    val rootDoc = DocumentFile.fromTreeUri(context, uri)
                    if (rootDoc != null && rootDoc.isDirectory) {
                        val rootName = rootDoc.name ?: "Folder"
                        collectTreeFiles(context, rootDoc, rootName, filesToSend)
                        continue
                    }
                }

                if (uri.scheme == "file") {
                    val f = File(uri.path ?: "")
                    if (f.exists() && f.isDirectory) {
                        val rootName = f.name
                        collectLocalDirectoryFiles(f, rootName, filesToSend)
                        continue
                    }
                }

                // Standard single file
                val (name, size) = queryFileDetails(context, uri)
                val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                filesToSend.add(
                    DiscoveredFileToSend(
                        uri = uri,
                        relativePath = name,
                        size = size,
                        mimeType = mime
                    )
                )
            }

            if (filesToSend.isEmpty()) {
                println("[SendKeep Client] No files found to send")
                return@withContext false
            }

            val filesMap = mutableMapOf<String, FileMetadataDto>()
            val uriMap = mutableMapOf<String, Uri>()

            for (item in filesToSend) {
                val fileId = UUID.randomUUID().toString()
                filesMap[fileId] = FileMetadataDto(
                    id = fileId,
                    fileName = item.relativePath,
                    size = item.size,
                    fileType = item.mimeType
                )
                uriMap[fileId] = item.uri
            }

            val effectivePin = pin ?: context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                .getString("security_pin", null)?.takeIf { it.isNotBlank() }

            // 1. Prepare Upload
            val prepareDto = PrepareUploadRequestDto(
                info = DeviceInfoDto(
                    alias = android.os.Build.MODEL,
                    fingerprint = SendKeepDiscovery.myFingerprint,
                    port = port
                ),
                files = filesMap,
                pin = effectivePin
            )

            val prepareJson = gson.toJson(prepareDto)
            val prepareReq = Request.Builder()
                .url("http://$targetIp:$port/api/sendkeep/v1/prepare-upload")
                .post(RequestBody.create("application/json".toMediaTypeOrNull(), prepareJson))
                .build()

            val prepareRes = client.newCall(prepareReq).execute()
            if (!prepareRes.isSuccessful) {
                println("[SendKeep Client] Prepare-upload failed with ${prepareRes.code}")
                return@withContext false
            }

            val resBody = prepareRes.body?.string() ?: return@withContext false
            val session = gson.fromJson(resBody, PrepareUploadResponseDto::class.java)
            activeSessionId = session.sessionId

            val cancelFlag = java.util.concurrent.atomic.AtomicBoolean(false)
            cancelFlags[session.sessionId] = cancelFlag

            // 2. Stream Each File
            var currentIndex = 0
            for ((fileId, token) in session.files) {
                if (cancelFlag.get()) {
                    return@withContext false
                }

                val meta = filesMap[fileId] ?: continue
                val uri = uriMap[fileId] ?: continue

                currentIndex++
                onProgress?.invoke(currentIndex, session.files.size, meta.fileName)

                val uploadUrl = "http://$targetIp:$port/api/sendkeep/v1/upload?sessionId=${session.sessionId}&fileId=$fileId&token=$token"

                val streamBody = object : RequestBody() {
                    override fun contentType() = meta.fileType.toMediaTypeOrNull()
                    override fun contentLength() = meta.size

                    override fun writeTo(sink: BufferedSink) {
                        context.contentResolver.openInputStream(uri)?.use { inputStream ->
                            // 256KB buffer for ultra-fast throughput without memory pressure
                            val buf = ByteArray(262144)
                            var totalWritten = 0L
                            val startTime = System.currentTimeMillis()
                            var lastEmitTime = 0L

                            // Initial progress emit
                            onTransferProgress?.invoke(
                                TransferProgressState(
                                    sessionId = session.sessionId,
                                    fileId = fileId,
                                    fileName = meta.fileName,
                                    bytesCurrent = 0L,
                                    bytesTotal = meta.size,
                                    speedBytesPerSec = 0L,
                                    direction = TransferDirection.SEND,
                                    peerAlias = "Desktop",
                                    status = TransferStatus.IN_PROGRESS
                                )
                            )

                            while (true) {
                                if (cancelFlag.get()) {
                                    throw IOException("Transfer cancelled by user")
                                }
                                val read = inputStream.read(buf)
                                if (read == -1) break
                                sink.write(buf, 0, read)
                                // Do NOT call sink.flush() on every chunk; let Okio buffer and stream at max network speed!
                                totalWritten += read

                                val now = System.currentTimeMillis()
                                if (now - lastEmitTime >= 120 || totalWritten == meta.size) {
                                    lastEmitTime = now
                                    val elapsedSec = maxOf(0.001, (now - startTime) / 1000.0)
                                    val speed = (totalWritten / elapsedSec).toLong()
                                    onTransferProgress?.invoke(
                                        TransferProgressState(
                                            sessionId = session.sessionId,
                                            fileId = fileId,
                                            fileName = meta.fileName,
                                            bytesCurrent = totalWritten,
                                            bytesTotal = meta.size,
                                            speedBytesPerSec = speed,
                                            direction = TransferDirection.SEND,
                                            peerAlias = "Desktop",
                                            status = if (totalWritten >= meta.size) TransferStatus.COMPLETED else TransferStatus.IN_PROGRESS
                                        )
                                    )
                                }
                            }
                            sink.flush()
                        } ?: throw IOException("Could not open stream for URI: $uri")
                    }
                }

                val uploadReq = Request.Builder()
                    .url(uploadUrl)
                    .post(streamBody)
                    .build()

                val call = client.newCall(uploadReq)
                activeCalls[session.sessionId] = call

                val uploadRes = try {
                    call.execute()
                } catch (e: Exception) {
                    if (cancelFlag.get()) {
                        println("[SendKeep Client] Upload cancelled by user")
                        return@withContext false
                    }
                    throw e
                } finally {
                    activeCalls.remove(session.sessionId)
                }

                if (!uploadRes.isSuccessful) {
                    println("[SendKeep Client] File upload failed for ${meta.fileName}: ${uploadRes.code}")
                    return@withContext false
                }
            }

            true
        } catch (e: Exception) {
            if (activeSessionId != null && cancelFlags[activeSessionId]?.get() == true) {
                println("[SendKeep Client] Transfer session $activeSessionId ended due to cancellation")
                return@withContext false
            }
            e.printStackTrace()
            false
        } finally {
            activeSessionId?.let { sid ->
                activeCalls.remove(sid)
                cancelFlags.remove(sid)
            }
        }
    }

    suspend fun sendText(
        targetIp: String,
        port: Int,
        text: String,
        pin: String? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val fileId = UUID.randomUUID().toString()
            val textBytes = text.toByteArray()
            val fileName = "Text Note (${System.currentTimeMillis() / 1000}).txt"

            val filesMap = mapOf(
                fileId to FileMetadataDto(
                    id = fileId,
                    fileName = fileName,
                    size = textBytes.size.toLong(),
                    fileType = "text/plain"
                )
            )

            val prepareDto = PrepareUploadRequestDto(
                info = DeviceInfoDto(
                    alias = android.os.Build.MODEL,
                    fingerprint = SendKeepDiscovery.myFingerprint,
                    port = port
                ),
                files = filesMap,
                pin = pin
            )

            val prepareReq = Request.Builder()
                .url("http://$targetIp:$port/api/sendkeep/v1/prepare-upload")
                .post(RequestBody.create("application/json".toMediaTypeOrNull(), gson.toJson(prepareDto)))
                .build()

            val prepareRes = client.newCall(prepareReq).execute()
            if (!prepareRes.isSuccessful) return@withContext false

            val session = gson.fromJson(prepareRes.body?.string(), PrepareUploadResponseDto::class.java)
            val token = session.files[fileId] ?: return@withContext false

            val uploadUrl = "http://$targetIp:$port/api/sendkeep/v1/upload?sessionId=${session.sessionId}&fileId=$fileId&token=$token"
            val uploadReq = Request.Builder()
                .url(uploadUrl)
                .post(RequestBody.create("text/plain".toMediaTypeOrNull(), textBytes))
                .build()

            client.newCall(uploadReq).execute().isSuccessful
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    private fun queryFileDetails(context: Context, uri: Uri): Pair<String, Long> {
        var name = "file_${System.currentTimeMillis()}"
        var size = 0L

        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)

            if (cursor.moveToFirst()) {
                if (nameIndex != -1) name = cursor.getString(nameIndex)
                if (sizeIndex != -1) size = cursor.getLong(sizeIndex)
            }
        }
        return Pair(name, size)
    }

    private data class DiscoveredFileToSend(
        val uri: Uri,
        val relativePath: String,
        val size: Long,
        val mimeType: String
    )

    private fun collectTreeFiles(
        context: Context,
        dirDoc: DocumentFile,
        currentPath: String,
        outList: MutableList<DiscoveredFileToSend>
    ) {
        val children = dirDoc.listFiles()
        for (child in children) {
            val childName = child.name ?: "file"
            val nextRel = if (currentPath.isEmpty()) childName else "$currentPath/$childName"
            if (child.isDirectory) {
                collectTreeFiles(context, child, nextRel, outList)
            } else if (child.isFile) {
                val mime = child.type ?: "application/octet-stream"
                outList.add(
                    DiscoveredFileToSend(
                        uri = child.uri,
                        relativePath = nextRel,
                        size = child.length(),
                        mimeType = mime
                    )
                )
            }
        }
    }

    private fun collectLocalDirectoryFiles(
        dir: File,
        rootName: String,
        outList: MutableList<DiscoveredFileToSend>
    ) {
        dir.walkTopDown().filter { it.isFile }.forEach { child ->
            val rel = child.relativeTo(dir).path.replace('\\', '/')
            val fullRel = "$rootName/$rel"
            val mime = "application/octet-stream"
            outList.add(
                DiscoveredFileToSend(
                    uri = Uri.fromFile(child),
                    relativePath = fullRel,
                    size = child.length(),
                    mimeType = mime
                )
            )
        }
    }
}
