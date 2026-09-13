package com.sendkeep.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.sendkeep.app.network.TransferDirection
import com.sendkeep.app.network.TransferProgressState
import com.sendkeep.app.network.TransferStatus
import java.io.File
import java.util.Locale

@Composable
fun TransferProgressCard(
    state: TransferProgressState?,
    onDismiss: () -> Unit,
    onCancel: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = state != null,
        enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
        modifier = modifier
    ) {
        if (state == null) return@AnimatedVisibility
        val context = LocalContext.current

        val isCompleted = state.status == TransferStatus.COMPLETED
        val isFailed = state.status == TransferStatus.FAILED
        val isCancelled = state.status == TransferStatus.CANCELLED
        val isInProgress = state.status == TransferStatus.IN_PROGRESS
        val isReceive = state.direction == TransferDirection.RECEIVE

        val progressFrac = if (state.bytesTotal > 0) {
            (state.bytesCurrent.toFloat() / state.bytesTotal.toFloat()).coerceIn(0f, 1f)
        } else {
            0f
        }
        val animatedProgress by animateFloatAsState(
            targetValue = if (isCompleted) 1f else progressFrac,
            label = "transfer_progress"
        )

        val speedFormatted = formatSpeed(state.speedBytesPerSec)
        val currentFormatted = formatBytes(state.bytesCurrent)
        val totalFormatted = formatBytes(state.bytesTotal)
        val percent = (animatedProgress * 100).toInt()

        val remainingSec = if (state.speedBytesPerSec > 0 && state.bytesTotal > state.bytesCurrent) {
            (state.bytesTotal - state.bytesCurrent) / state.speedBytesPerSec
        } else {
            0L
        }
        val etaString = when {
            isCompleted -> "Finished"
            isCancelled -> "Stopped by user"
            isFailed -> "Failed"
            remainingSec <= 0 -> "Calculating..."
            remainingSec < 60 -> "~${remainingSec}s left"
            else -> "~${remainingSec / 60}m ${remainingSec % 60}s left"
        }

        val accentColor = when {
            isCompleted -> Color(0xFF10B981) // Emerald
            isCancelled -> Color(0xFFF59E0B) // Amber
            isFailed -> Color(0xFFEF4444) // Red
            isReceive -> Color(0xFF06B6D4) // Cyan
            else -> Color(0xFF6366F1) // Indigo
        }

        Card(
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xF013151D)),
            elevation = CardDefaults.cardElevation(defaultElevation = 10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp)
                .border(1.dp, Color(0x2AFFFFFF), RoundedCornerShape(22.dp))
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                // Header row: Direction + Peer + Dismiss / Cancel
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .size(28.dp)
                                .clip(CircleShape)
                                .background(accentColor.copy(alpha = 0.15f))
                        ) {
                            Icon(
                                imageVector = when {
                                    isCompleted -> Icons.Default.Check
                                    isCancelled -> Icons.Default.Close
                                    isFailed -> Icons.Default.Close
                                    isReceive -> Icons.Default.ArrowDownward
                                    else -> Icons.Default.ArrowUpward
                                },
                                contentDescription = null,
                                tint = accentColor,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        Column {
                            Text(
                                text = when {
                                    isCompleted -> if (isReceive) "File Received" else "File Sent"
                                    isCancelled -> "Transfer Cancelled"
                                    isFailed -> "Transfer Failed"
                                    isReceive -> "Receiving from ${state.peerAlias}"
                                    else -> "Sending to ${state.peerAlias}"
                                },
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = if (isCompleted) "Saved to Downloads/SendKeep" else etaString,
                                color = Color(0x99FFFFFF),
                                fontSize = 11.sp
                            )
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (isInProgress) {
                            Button(
                                onClick = onCancel,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0x33EF4444)),
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier.height(28.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Cancel",
                                    tint = Color(0xFFF87171),
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(3.dp))
                                Text("Cancel", color = Color(0xFFF87171), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (isCompleted && state.localFilePath != null) {
                            Button(
                                onClick = { openFile(context, state.localFilePath) },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0x2210B981)),
                                shape = RoundedCornerShape(12.dp),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                modifier = Modifier.height(28.dp)
                            ) {
                                Text("Open", color = Color(0xFF34D399), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        IconButton(
                            onClick = if (isInProgress) onCancel else onDismiss,
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = if (isInProgress) "Cancel" else "Dismiss",
                                tint = Color(0x88FFFFFF),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // File Name & Size Row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0x12FFFFFF))
                    ) {
                        Icon(
                            imageVector = getFileIcon(state.fileName),
                            contentDescription = null,
                            tint = accentColor,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = state.fileName,
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "$currentFormatted / $totalFormatted ($percent%)",
                            color = Color(0x88FFFFFF),
                            fontSize = 11.sp
                        )
                    }

                    if (!isCompleted && !isFailed) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = accentColor.copy(alpha = 0.15f)
                        ) {
                            Text(
                                text = speedFormatted,
                                color = accentColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Progress Bar
                LinearProgressIndicator(
                    progress = { animatedProgress },
                    color = accentColor,
                    trackColor = Color(0x22FFFFFF),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .clip(RoundedCornerShape(3.dp))
                )
            }
        }
    }
}

private fun formatBytes(bytes: Long): String {
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

private fun formatSpeed(bytesPerSec: Long): String {
    if (bytesPerSec <= 0) return "0 KB/s"
    val kb = bytesPerSec / 1024.0
    val mb = kb / 1024.0
    return if (mb >= 1.0) {
        String.format(Locale.US, "%.1f MB/s", mb)
    } else {
        String.format(Locale.US, "%.0f KB/s", kb)
    }
}

private fun getFileIcon(fileName: String) = when {
    fileName.endsWith(".jpg", ignoreCase = true) ||
    fileName.endsWith(".jpeg", ignoreCase = true) ||
    fileName.endsWith(".png", ignoreCase = true) ||
    fileName.endsWith(".webp", ignoreCase = true) -> Icons.Default.Image

    fileName.endsWith(".mp4", ignoreCase = true) ||
    fileName.endsWith(".mkv", ignoreCase = true) ||
    fileName.endsWith(".mov", ignoreCase = true) -> Icons.Default.Movie

    fileName.endsWith(".mp3", ignoreCase = true) ||
    fileName.endsWith(".wav", ignoreCase = true) ||
    fileName.endsWith(".m4a", ignoreCase = true) -> Icons.Default.MusicNote

    fileName.endsWith(".apk", ignoreCase = true) -> Icons.Default.Android
    fileName.endsWith(".zip", ignoreCase = true) ||
    fileName.endsWith(".tar.gz", ignoreCase = true) ||
    fileName.endsWith(".rar", ignoreCase = true) -> Icons.Default.FolderZip

    else -> Icons.Default.Description
}

private fun openFile(context: Context, path: String) {
    try {
        val file = File(path)
        if (!file.exists()) return
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val mime = if (file.name.endsWith(".apk", ignoreCase = true)) {
            "application/vnd.android.package-archive"
        } else {
            context.contentResolver.getType(uri) ?: "*/*"
        }
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        val fallbackIntent = Intent(Intent.ACTION_VIEW).apply {
            val file = File(path)
            val uri = Uri.fromFile(file)
            setDataAndType(uri, "*/*")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(fallbackIntent)
        } catch (ignored: Exception) {}
    }
}
