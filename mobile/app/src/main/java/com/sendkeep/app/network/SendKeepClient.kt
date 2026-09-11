package com.sendkeep.app.network

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

class SendKeepClient {
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
        onProgress: ((current: Int, total: Int, fileName: String) -> Unit)? = null
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            val filesMap = mutableMapOf<String, FileMetadataDto>()
            val uriMap = mutableMapOf<String, Uri>()

            for (uri in uris) {
                val fileId = UUID.randomUUID().toString()
                val (name, size) = queryFileDetails(context, uri)
                val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"

                filesMap[fileId] = FileMetadataDto(
                    id = fileId,
                    fileName = name,
                    size = size,
                    fileType = mime
                )
                uriMap[fileId] = uri
            }

            // 1. Prepare Upload
            val prepareDto = PrepareUploadRequestDto(
                info = DeviceInfoDto(
                    alias = android.os.Build.MODEL,
                    fingerprint = SendKeepDiscovery.myFingerprint,
                    port = port
                ),
                files = filesMap
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

            // 2. Stream Each File
            var currentIndex = 0
            for ((fileId, token) in session.files) {
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
                            inputStream.source().use { source ->
                                sink.writeAll(source)
                            }
                        } ?: throw IOException("Could not open stream for URI: $uri")
                    }
                }

                val uploadReq = Request.Builder()
                    .url(uploadUrl)
                    .post(streamBody)
                    .build()

                val uploadRes = client.newCall(uploadReq).execute()
                if (!uploadRes.isSuccessful) {
                    println("[SendKeep Client] File upload failed for ${meta.fileName}: ${uploadRes.code}")
                    return@withContext false
                }
            }

            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    suspend fun sendText(
        targetIp: String,
        port: Int,
        text: String
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
                files = filesMap
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
}
