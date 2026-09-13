package com.sendkeep.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.sendkeep.app.BundledFileItem
import com.sendkeep.app.ShelfStreamItem
import com.sendkeep.app.ui.theme.*
import java.io.File

@Composable
fun FolderStackDialog(
    isOpen: Boolean,
    item: ShelfStreamItem?,
    onDismiss: () -> Unit,
    onOpenFile: (BundledFileItem) -> Unit,
    onOpenInFileManager: (File) -> Unit,
    onShareAll: (List<File>) -> Unit
) {
    if (!isOpen || item == null) return

    val folderDir = item.localFilePath?.let { File(it) }
    
    // Resolve bundled files: prefer explicit bundledFiles, otherwise scan local directory on disk
    val filesList: List<BundledFileItem> = remember(item) {
        if (!item.bundledFiles.isNullOrEmpty()) {
            item.bundledFiles
        } else if (folderDir != null && folderDir.exists() && folderDir.isDirectory) {
            folderDir.walkTopDown().filter { it.isFile }.map { f ->
                val rel = try {
                    f.relativeTo(folderDir).path.replace('\\', '/')
                } catch (e: Exception) {
                    f.name
                }
                val sz = f.length()
                val szStr = if (sz >= 1024 * 1024) {
                    String.format("%.1f MB", sz / (1024.0 * 1024.0))
                } else {
                    String.format("%.0f KB", sz / 1024.0)
                }
                BundledFileItem(
                    name = f.name,
                    relativePath = rel,
                    size = sz,
                    formattedSize = szStr,
                    path = f.absolutePath,
                    mimeType = null
                )
            }.toList()
        } else {
            emptyList()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0x99000000))
                .clickable(onClick = onDismiss),
            contentAlignment = Alignment.BottomCenter
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 20.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .clickable(enabled = false) {}, // Prevent dismiss when tapping dialog body
                shape = RoundedCornerShape(24.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp)
                ) {
                    // Top Drag Indicator
                    Box(
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .size(width = 36.dp, height = 4.dp)
                            .background(Color(0x33FFFFFF), RoundedCornerShape(2.dp))
                    )
                    Spacer(Modifier.height(16.dp))

                    // Header: Folder Icon + Title + Meta
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        // Amber Glassmorphic Folder Icon Box
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(Color(0x26F59E0B), RoundedCornerShape(14.dp))
                                .border(BorderStroke(1.dp, Color(0x4DF59E0B)), RoundedCornerShape(14.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Folder,
                                contentDescription = "Folder",
                                tint = Color(0xFFFBBF24),
                                modifier = Modifier.size(26.dp)
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = item.name,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextMain,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = "${filesList.size} items • ${item.size}",
                                fontSize = 12.sp,
                                color = TextSub
                            )
                        }

                        // Close "✕" Button
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(IconBoxBg)
                                .clickable(onClick = onDismiss),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Close,
                                contentDescription = "Close",
                                tint = TextSub,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    // Quick Action Buttons (Open in Files & Share)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Surface(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    if (folderDir != null && folderDir.exists()) {
                                        onOpenInFileManager(folderDir)
                                    }
                                },
                            shape = RoundedCornerShape(12.dp),
                            color = IconBoxBg,
                            border = BorderStroke(1.dp, IconBoxBorder)
                        ) {
                            Row(
                                modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.FolderOpen,
                                    contentDescription = null,
                                    tint = ElectricLime,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    text = "Open in Files",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextMain
                                )
                            }
                        }

                        if (filesList.isNotEmpty()) {
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable {
                                        val physicalFiles = filesList.map { File(it.path) }.filter { it.exists() }
                                        if (physicalFiles.isNotEmpty()) {
                                            onShareAll(physicalFiles)
                                        }
                                    },
                                shape = RoundedCornerShape(12.dp),
                                color = IconBoxBg,
                                border = BorderStroke(1.dp, IconBoxBorder)
                            ) {
                                Row(
                                    modifier = Modifier.padding(vertical = 10.dp, horizontal = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Outlined.Share,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        text = "Share All",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = TextMain
                                    )
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    // Section Title
                    Text(
                        text = "FOLDER CONTENTS",
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextDim,
                        letterSpacing = 0.8.sp
                    )
                    Spacer(Modifier.height(8.dp))

                    // Scrollable File List
                    if (filesList.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No files found in folder",
                                fontSize = 12.sp,
                                color = TextDim
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 320.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            items(filesList) { fileItem ->
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .clickable { onOpenFile(fileItem) },
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFF0F130F),
                                    border = BorderStroke(1.dp, Color(0x0FFFFFFF))
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(horizontal = 12.dp, vertical = 9.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        // File Icon Box
                                        Box(
                                            modifier = Modifier
                                                .size(32.dp)
                                                .background(IconBoxBg, RoundedCornerShape(8.dp))
                                                .border(BorderStroke(1.dp, IconBoxBorder), RoundedCornerShape(8.dp)),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = resolveFileIcon(fileItem.name),
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(15.dp)
                                            )
                                        }

                                        Column(
                                            modifier = Modifier.weight(1f),
                                            verticalArrangement = Arrangement.spacedBy(1.dp)
                                        ) {
                                            Text(
                                                text = fileItem.name,
                                                fontSize = 12.5.sp,
                                                fontWeight = FontWeight.Medium,
                                                color = TextMain,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            if (fileItem.relativePath.contains('/')) {
                                                Text(
                                                    text = fileItem.relativePath,
                                                    fontSize = 10.5.sp,
                                                    color = TextDim,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }

                                        Text(
                                            text = fileItem.formattedSize,
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace,
                                            color = TextDim
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    // Full-width Close Button
                    Button(
                        onClick = onDismiss,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(44.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = ElectricLime,
                            contentColor = LimeText
                        )
                    ) {
                        Text(
                            text = "Done",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

private fun resolveFileIcon(fileName: String): ImageVector {
    val lower = fileName.lowercase()
    return when {
        lower.endsWith(".jpg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".svg") -> Icons.Outlined.Image
        lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv") || lower.endsWith(".webm") -> Icons.Outlined.Videocam
        lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".flac") || lower.endsWith(".aac") -> Icons.Outlined.MusicNote
        lower.endsWith(".apk") || lower.endsWith(".aab") -> Icons.Outlined.Inventory2
        lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".tar.gz") || lower.endsWith(".7z") -> Icons.Outlined.FolderZip
        lower.endsWith(".pdf") -> Icons.Outlined.PictureAsPdf
        lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".doc") || lower.endsWith(".docx") -> Icons.Outlined.Description
        lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".html") || lower.endsWith(".css") || lower.endsWith(".kt") || lower.endsWith(".rs") -> Icons.Outlined.Code
        else -> Icons.Outlined.InsertDriveFile
    }
}
