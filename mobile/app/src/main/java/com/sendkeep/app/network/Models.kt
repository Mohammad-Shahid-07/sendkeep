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
    val files: Map<String, FileMetadataDto>,
    val pin: String? = null
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
    val ip: String? = null,
    val lastSeen: Long = System.currentTimeMillis()
)

typealias PeerDto = PeerAnnouncementDto

data class PairRequestDto(
    val alias: String,
    val version: String = "2.1",
    val deviceModel: String? = null,
    val deviceType: String = "desktop",
    val fingerprint: String,
    val port: Int = 53317,
    val protocol: String = "http",
    val pin: String? = null
)

data class PairResponseDto(
    val status: String, // "accepted" or "declined"
    val alias: String,
    val deviceModel: String? = null,
    val deviceType: String = "mobile",
    val fingerprint: String
)

data class TrustedDeviceEntity(
    val id: String,
    val alias: String,
    val ip: String,
    val port: Int = 53317,
    val deviceModel: String? = null,
    val deviceType: String = "desktop",
    val fingerprint: String,
    val addedAt: Long = System.currentTimeMillis()
)

enum class TransferDirection {
    SEND,
    RECEIVE
}

enum class TransferStatus {
    PREPARING,
    IN_PROGRESS,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class TransferProgressState(
    val sessionId: String,
    val fileId: String,
    val fileName: String,
    val bytesCurrent: Long,
    val bytesTotal: Long,
    val speedBytesPerSec: Long,
    val direction: TransferDirection,
    val peerAlias: String,
    val status: TransferStatus,
    val localFilePath: String? = null,
    val errorMessage: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)

