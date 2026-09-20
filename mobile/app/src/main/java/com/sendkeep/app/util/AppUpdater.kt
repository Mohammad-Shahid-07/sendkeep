package com.sendkeep.app.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.sendkeep.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val currentVersion: String,
    val latestVersion: String,
    val hasUpdate: Boolean,
    val releaseNotes: String,
    val apkUrl: String?,
    val apkName: String?,
    val apkSize: Long?,
    val publishedAt: String?
)

object AppUpdater {

    private const val GITHUB_REPO = "Mohammad-Shahid-07/sendkeep"
    private const val RELEASES_API = "https://api.github.com/repos/$GITHUB_REPO/releases/latest"

    private fun parseVersion(v: String): Triple<Int, Int, Int> {
        val clean = v.trim().removePrefix("v").removePrefix("V")
        val parts = clean.split(".").map { it.toIntOrNull() ?: 0 }
        return Triple(
            parts.getOrElse(0) { 0 },
            parts.getOrElse(1) { 0 },
            parts.getOrElse(2) { 0 }
        )
    }

    fun isNewer(latest: String, current: String): Boolean {
        val (lMaj, lMin, lPat) = parseVersion(latest)
        val (cMaj, cMin, cPat) = parseVersion(current)
        if (lMaj != cMaj) return lMaj > cMaj
        if (lMin != cMin) return lMin > cMin
        return lPat > cPat
    }

    suspend fun checkForUpdates(currentVersion: String = BuildConfig.VERSION_NAME): AppUpdateInfo =
        withContext(Dispatchers.IO) {
            try {
                val url = URL(RELEASES_API)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    setRequestProperty("Accept", "application/vnd.github.v3+json")
                    setRequestProperty("User-Agent", "SendKeep-Android/$currentVersion")
                    connectTimeout = 8000
                    readTimeout = 8000
                }

                if (conn.responseCode == 404) {
                    return@withContext AppUpdateInfo(
                        currentVersion = currentVersion,
                        latestVersion = currentVersion,
                        hasUpdate = false,
                        releaseNotes = "You are on the initial release v$currentVersion.",
                        apkUrl = null,
                        apkName = null,
                        apkSize = null,
                        publishedAt = null
                    )
                }

                if (conn.responseCode != 200) {
                    return@withContext AppUpdateInfo(
                        currentVersion = currentVersion,
                        latestVersion = currentVersion,
                        hasUpdate = false,
                        releaseNotes = "Status code ${conn.responseCode} from update server.",
                        apkUrl = null,
                        apkName = null,
                        apkSize = null,
                        publishedAt = null
                    )
                }

                val responseStr = conn.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(responseStr)

                val tagName = json.optString("tag_name", "0.0.1")
                val cleanLatest = tagName.removePrefix("v").removePrefix("V")
                val hasUpdate = isNewer(cleanLatest, currentVersion)
                val body = json.optString("body", "Bug fixes and performance enhancements.")
                val publishedAt = json.optString("published_at", null)

                var apkUrl: String? = null
                var apkName: String? = null
                var apkSize: Long? = null

                val assets = json.optJSONArray("assets")
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        val name = asset.optString("name", "")
                        if (name.endsWith(".apk", ignoreCase = true)) {
                            apkUrl = asset.optString("browser_download_url", "")
                            apkName = name
                            apkSize = asset.optLong("size", 0L)
                            break
                        }
                    }
                }

                AppUpdateInfo(
                    currentVersion = currentVersion,
                    latestVersion = cleanLatest,
                    hasUpdate = hasUpdate,
                    releaseNotes = body,
                    apkUrl = apkUrl,
                    apkName = apkName,
                    apkSize = apkSize,
                    publishedAt = publishedAt
                )
            } catch (e: Exception) {
                AppUpdateInfo(
                    currentVersion = currentVersion,
                    latestVersion = currentVersion,
                    hasUpdate = false,
                    releaseNotes = "Check failed: ${e.localizedMessage ?: "Unknown network error"}",
                    apkUrl = null,
                    apkName = null,
                    apkSize = null,
                    publishedAt = null
                )
            }
        }

    suspend fun downloadAndInstallApk(
        context: Context,
        apkUrl: String,
        onProgress: (progress: Float, downloaded: Long, total: Long) -> Unit,
        onError: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        try {
            val url = URL(apkUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("User-Agent", "SendKeep-Android-Updater")
                instanceFollowRedirects = true
                connectTimeout = 15000
                readTimeout = 30000
            }

            val totalBytes = conn.contentLengthLong
            val updateDir = File(context.cacheDir, "updates").apply { mkdirs() }
            val destFile = File(updateDir, "SendKeep-update.apk")
            if (destFile.exists()) destFile.delete()

            conn.inputStream.use { input ->
                FileOutputStream(destFile).use { output ->
                    val buffer = ByteArray(16384)
                    var bytesRead: Int
                    var totalRead = 0L

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalRead += bytesRead

                        val prog = if (totalBytes > 0) {
                            (totalRead.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
                        } else {
                            0f
                        }
                        withContext(Dispatchers.Main) {
                            onProgress(prog, totalRead, totalBytes)
                        }
                    }
                    output.flush()
                }
            }

            // Launch package installer on Main thread
            withContext(Dispatchers.Main) {
                installApk(context, destFile)
            }

        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                onError(e.localizedMessage ?: "Failed to download update APK")
            }
        }
    }

    fun installApk(context: Context, apkFile: File) {
        if (!apkFile.exists() || apkFile.length() == 0L) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.packageManager.canRequestPackageInstalls()) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
        }

        val apkUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )

        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        context.startActivity(installIntent)
    }
}
