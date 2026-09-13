package com.sendkeep.app.data

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale

data class RecentItem(
    val uri: Uri,
    val name: String,
    val sizeBytes: Long,
    val mimeType: String,
    val formattedSize: String,
    val itemType: ItemType,
    val localFile: File? = null
)

enum class ItemType {
    APK,
    IMAGE,
    VIDEO,
    DOCUMENT,
    ARCHIVE,
    GENERIC
}

object RecentMediaScanner {

    suspend fun getLatestDownload(context: Context): RecentItem? = withContext(Dispatchers.IO) {
        val list = getDeviceDownloads(context, limit = 1)
        list.firstOrNull()
    }

    suspend fun getRecentPhotos(context: Context, limit: Int = 5): List<RecentItem> = withContext(Dispatchers.IO) {
        getDevicePhotos(context, limit = limit)
    }

    suspend fun getDevicePhotos(context: Context, limit: Int = 40): List<RecentItem> = withContext(Dispatchers.IO) {
        val items = mutableListOf<RecentItem>()
        try {
            val contentUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.SIZE,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.DATE_ADDED
            )
            val sortOrder = "${MediaStore.Images.Media.DATE_ADDED} DESC"

            context.contentResolver.query(contentUri, projection, null, null, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE)
                val mimeCol = cursor.getColumnIndex(MediaStore.Images.Media.MIME_TYPE)

                var count = 0
                while (cursor.moveToNext() && count < limit) {
                    val id = cursor.getLong(idCol)
                    val name = cursor.getString(nameCol) ?: "photo_$count.jpg"
                    val size = cursor.getLong(sizeCol)
                    val mime = if (mimeCol != -1) cursor.getString(mimeCol) ?: "image/jpeg" else "image/jpeg"
                    val itemUri = Uri.withAppendedPath(contentUri, id.toString())

                    items.add(
                        RecentItem(
                            uri = itemUri,
                            name = name,
                            sizeBytes = size,
                            mimeType = mime,
                            formattedSize = formatFileSize(size),
                            itemType = ItemType.IMAGE
                        )
                    )
                    count++
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        items
    }

    suspend fun getDeviceDownloads(context: Context, limit: Int = 40): List<RecentItem> = withContext(Dispatchers.IO) {
        val items = mutableListOf<RecentItem>()
        try {
            // First check SendKeep download directory directly
            val sendKeepDir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "SendKeep")
            if (sendKeepDir.exists() && sendKeepDir.isDirectory) {
                sendKeepDir.listFiles()?.sortedByDescending { it.lastModified() }?.take(limit)?.forEach { f ->
                    val mime = resolveMimeFromName(f.name)
                    items.add(
                        RecentItem(
                            uri = Uri.fromFile(f),
                            name = f.name,
                            sizeBytes = f.length(),
                            mimeType = mime,
                            formattedSize = formatFileSize(f.length()),
                            itemType = resolveItemType(f.name, mime),
                            localFile = f
                        )
                    )
                }
            }

            // Also query MediaStore Downloads
            val contentUri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Downloads.EXTERNAL_CONTENT_URI
            } else {
                MediaStore.Files.getContentUri("external")
            }

            val projection = arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.MIME_TYPE,
                MediaStore.MediaColumns.DATE_MODIFIED
            )
            val sortOrder = "${MediaStore.MediaColumns.DATE_MODIFIED} DESC"

            context.contentResolver.query(contentUri, projection, null, null, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                val mimeCol = cursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)

                var count = items.size
                while (cursor.moveToNext() && count < limit) {
                    val id = cursor.getLong(idCol)
                    val name = cursor.getString(nameCol) ?: "download_item"
                    val size = cursor.getLong(sizeCol)
                    val mime = if (mimeCol != -1) cursor.getString(mimeCol) ?: "application/octet-stream" else "application/octet-stream"
                    val itemUri = Uri.withAppendedPath(contentUri, id.toString())

                    if (items.none { it.name == name }) {
                        items.add(
                            RecentItem(
                                uri = itemUri,
                                name = name,
                                sizeBytes = size,
                                mimeType = mime,
                                formattedSize = formatFileSize(size),
                                itemType = resolveItemType(name, mime)
                            )
                        )
                        count++
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        items
    }

    suspend fun getDeviceDocuments(context: Context, limit: Int = 40): List<RecentItem> = withContext(Dispatchers.IO) {
        val items = mutableListOf<RecentItem>()
        try {
            val contentUri = MediaStore.Files.getContentUri("external")
            val projection = arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.MIME_TYPE,
                MediaStore.MediaColumns.DATE_MODIFIED
            )

            val mimeCondition = "${MediaStore.MediaColumns.MIME_TYPE} LIKE 'application/pdf%' OR " +
                    "${MediaStore.MediaColumns.MIME_TYPE} LIKE 'text/%' OR " +
                    "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE '%.pdf' OR " +
                    "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE '%.docx' OR " +
                    "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE '%.txt'"

            val sortOrder = "${MediaStore.MediaColumns.DATE_MODIFIED} DESC"

            context.contentResolver.query(contentUri, projection, mimeCondition, null, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
                val mimeCol = cursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)

                var count = 0
                while (cursor.moveToNext() && count < limit) {
                    val id = cursor.getLong(idCol)
                    val name = cursor.getString(nameCol) ?: "document"
                    val size = cursor.getLong(sizeCol)
                    val mime = if (mimeCol != -1) cursor.getString(mimeCol) ?: "application/pdf" else "application/pdf"
                    val itemUri = Uri.withAppendedPath(contentUri, id.toString())

                    items.add(
                        RecentItem(
                            uri = itemUri,
                            name = name,
                            sizeBytes = size,
                            mimeType = mime,
                            formattedSize = formatFileSize(size),
                            itemType = ItemType.DOCUMENT
                        )
                    )
                    count++
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        items
    }

    suspend fun getInstalledApks(context: Context): List<RecentItem> = withContext(Dispatchers.IO) {
        val items = mutableListOf<RecentItem>()
        try {
            val pm = context.packageManager
            val installedApps = pm.getInstalledApplications(PackageManager.GET_META_DATA)

            for (app in installedApps) {
                // Filter out core Android OS stubs with no public source directory
                val apkPath = app.publicSourceDir ?: app.sourceDir
                if (apkPath.isNullOrBlank()) continue

                val apkFile = File(apkPath)
                if (!apkFile.exists() || apkFile.length() <= 0) continue

                val isSystem = (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                // Include user installed apps or prominent updated system apps
                val label = try {
                    pm.getApplicationLabel(app).toString()
                } catch (e: Exception) {
                    app.packageName
                }

                val cleanName = "${label.replace("[^a-zA-Z0-9._-]".toRegex(), "_")}.apk"
                val size = apkFile.length()

                items.add(
                    RecentItem(
                        uri = Uri.fromFile(apkFile),
                        name = cleanName,
                        sizeBytes = size,
                        formattedSize = formatFileSize(size),
                        mimeType = "application/vnd.android.package-archive",
                        itemType = ItemType.APK,
                        localFile = apkFile
                    )
                )
            }
            items.sortByDescending { it.sizeBytes }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        items.take(40)
    }

    fun openFile(context: Context, uri: Uri, mimeType: String? = null, localFile: File? = null) {
        try {
            val viewUri = if (localFile != null && localFile.exists()) {
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", localFile)
            } else if (uri.scheme == "file") {
                val f = File(uri.path ?: "")
                if (f.exists()) {
                    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
                } else uri
            } else {
                uri
            }

            val fileName = localFile?.name ?: uri.lastPathSegment ?: ""
            val resolvedMime = if (fileName.endsWith(".apk", ignoreCase = true)) {
                "application/vnd.android.package-archive"
            } else {
                mimeType ?: context.contentResolver.getType(viewUri) ?: "*/*"
            }
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(viewUri, resolvedMime)
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Cannot open file: ${e.message ?: "No app found"}", Toast.LENGTH_SHORT).show()
        }
    }

    fun resolveItemType(name: String, mime: String): ItemType {
        val lowerName = name.lowercase(Locale.ROOT)
        return when {
            lowerName.endsWith(".apk") || mime == "application/vnd.android.package-archive" -> ItemType.APK
            mime.startsWith("image/") || lowerName.endsWith(".jpg") || lowerName.endsWith(".png") || lowerName.endsWith(".webp") -> ItemType.IMAGE
            mime.startsWith("video/") || lowerName.endsWith(".mp4") || lowerName.endsWith(".mkv") -> ItemType.VIDEO
            lowerName.endsWith(".zip") || lowerName.endsWith(".rar") || lowerName.endsWith(".7z") || lowerName.endsWith(".tar.gz") -> ItemType.ARCHIVE
            lowerName.endsWith(".pdf") || lowerName.endsWith(".docx") || lowerName.endsWith(".txt") || mime.startsWith("text/") -> ItemType.DOCUMENT
            else -> ItemType.GENERIC
        }
    }

    private fun resolveMimeFromName(name: String): String {
        val lower = name.lowercase(Locale.ROOT)
        return when {
            lower.endsWith(".apk") -> "application/vnd.android.package-archive"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".mp4") -> "video/mp4"
            lower.endsWith(".pdf") -> "application/pdf"
            lower.endsWith(".zip") -> "application/zip"
            lower.endsWith(".txt") -> "text/plain"
            else -> "application/octet-stream"
        }
    }

    fun formatFileSize(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val kb = bytes / 1024.0
        val mb = kb / 1024.0
        val gb = mb / 1024.0
        return when {
            gb >= 1.0 -> String.format(Locale.US, "%.1f GB", gb)
            mb >= 1.0 -> String.format(Locale.US, "%.1f MB", mb)
            kb >= 1.0 -> String.format(Locale.US, "%.0f KB", kb)
            else -> "$bytes B"
        }
    }
}
