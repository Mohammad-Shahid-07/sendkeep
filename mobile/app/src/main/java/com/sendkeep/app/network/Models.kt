package com.sendkeep.app.network

import com.google.gson.annotations.SerializedName

data class DeviceInfoDto(
    val alias: String,
    val version: String = "2.1",
    val deviceModel: String? = "Android Device",
    val deviceType: String = "mobile",
    val fingerprint: String,
    val port: Int = 53317,
    val protocol: String = "http",
    val download: Boolean = false
)

data class FileMetadataDto(
    val id: String,
    val fileName: String,
    val size: Long,
    val fileType: String,
    val sha256: String? = null,
    val preview: String? = null
)

data class PrepareUploadRequestDto(
    val info: DeviceInfoDto,
    val files: Map<String, FileMetadataDto>
)

data class PrepareUploadResponseDto(
    @SerializedName("sessionId")
    val sessionId: String,
    val files: Map<String, String> // fileId -> token
)

data class PeerAnnouncementDto(
    val alias: String,
    val version: String,
    val deviceModel: String?,
    val deviceType: String,
    val fingerprint: String,
    val port: Int,
    val protocol: String,
    val ip: String? = null
)
