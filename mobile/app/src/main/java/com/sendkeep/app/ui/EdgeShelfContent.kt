package com.sendkeep.app.ui

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.InsertDriveFile
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sendkeep.app.data.ItemType
import com.sendkeep.app.data.RecentItem
import com.sendkeep.app.data.RecentMediaScanner
import com.sendkeep.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun EdgeShelfOverlay(
    isVisible: Boolean,
    isLeftEdge: Boolean = false,
    targetDeviceName: String?,
    isConnected: Boolean,
    isTransferring: Boolean,
    transferProgress: Float = 0f,
    transferStatus: String = "",
    transferSpeed: String = "",
    onCancelTransfer: () -> Unit = {},
    onSendRecentItem: (RecentItem) -> Unit,
    onSendRecentPhotos: (List<RecentItem>) -> Unit,
    onSendClipboardText: (String) -> Unit,
    onPickFiles: () -> Unit,
    onPickFolder: () -> Unit,
    onClose: () -> Unit
) {
    val backdropAlpha by animateFloatAsState(
        targetValue = if (isVisible) 0.35f else 0f,
        animationSpec = tween(durationMillis = 240, easing = FastOutSlowInEasing),
        label = "backdropAlpha"
    )

    if (backdropAlpha > 0.01f || isVisible) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = backdropAlpha))
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() }
                ) {
                    onClose()
                },
            contentAlignment = if (isLeftEdge) Alignment.CenterStart else Alignment.CenterEnd
        ) {
            AnimatedVisibility(
                visible = isVisible,
                enter = slideInHorizontally(
                    initialOffsetX = { if (isLeftEdge) -it else it },
                    animationSpec = spring(dampingRatio = 0.82f, stiffness = 420f)
                ) + fadeIn(animationSpec = tween(180)),
                exit = slideOutHorizontally(
                    targetOffsetX = { if (isLeftEdge) -it else it },
                    animationSpec = tween(200, easing = FastOutLinearInEasing)
                ) + fadeOut(animationSpec = tween(160))
            ) {
                Box(
                    modifier = Modifier.clickable(
                        indication = null,
                        interactionSource = remember { MutableInteractionSource() }
                    ) { /* Prevent dismissing when clicking inside shelf */ }
                ) {
                    EdgeShelfContent(
                        isLeftEdge = isLeftEdge,
                        targetDeviceName = targetDeviceName,
                        isConnected = isConnected,
                        isTransferring = isTransferring,
                        transferProgress = transferProgress,
                        transferStatus = transferStatus,
                        transferSpeed = transferSpeed,
                        onCancelTransfer = onCancelTransfer,
                        onSendRecentItem = onSendRecentItem,
                        onSendRecentPhotos = onSendRecentPhotos,
                        onSendClipboardText = onSendClipboardText,
                        onPickFiles = onPickFiles,
                        onPickFolder = onPickFolder,
                        onClose = onClose
                    )
                }
            }
        }
    }
}

@Composable
fun EdgeShelfContent(
    isLeftEdge: Boolean = false,
    targetDeviceName: String?,
    isConnected: Boolean,
    isTransferring: Boolean,
    transferProgress: Float = 0f,
    transferStatus: String = "",
    transferSpeed: String = "",
    onCancelTransfer: () -> Unit = {},
    onSendRecentItem: (RecentItem) -> Unit,
    onSendRecentPhotos: (List<RecentItem>) -> Unit,
    onSendClipboardText: (String) -> Unit,
    onPickFiles: () -> Unit,
    onPickFolder: () -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var latestDownload by remember { mutableStateOf<RecentItem?>(null) }
    var recentPhotos by remember { mutableStateOf<List<RecentItem>>(emptyList()) }
    var clipboardText by remember { mutableStateOf<String?>(null) }
    var noteText by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        scope.launch {
            latestDownload = RecentMediaScanner.getLatestDownload(context)
            recentPhotos = RecentMediaScanner.getRecentPhotos(context, limit = 2)

            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            val clip = clipboard?.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val text = clip.getItemAt(0).text?.toString()
                if (!text.isNullOrBlank()) {
                    clipboardText = text
                }
            }
        }
    }

    val totalDetectedCount = recentPhotos.size + (if (latestDownload != null) 1 else 0)

    val shelfShape = if (isLeftEdge) {
        RoundedCornerShape(topStart = 0.dp, bottomStart = 0.dp, topEnd = 16.dp, bottomEnd = 16.dp)
    } else {
        RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp, topEnd = 0.dp, bottomEnd = 0.dp)
    }

    // EXACT 216dp WIDTH THUMB-LEVEL SHELF DOCKED FLUSH
    Box(
        modifier = Modifier
            .width(216.dp)
            .heightIn(max = 440.dp)
            .background(color = Color(0xF20D110D), shape = shelfShape)
            .border(BorderStroke(1.dp, CardBorder), shape = shelfShape)
    ) {
        // Subtle Vertical Green Bezel Tick
        Box(
            modifier = Modifier
                .align(if (isLeftEdge) Alignment.CenterStart else Alignment.CenterEnd)
                .width(3.5.dp)
                .height(36.dp)
                .background(
                    ElectricLime,
                    if (isLeftEdge) RoundedCornerShape(topEnd = 2.dp, bottomEnd = 2.dp)
                    else RoundedCornerShape(topStart = 2.dp, bottomStart = 2.dp)
                )
        )

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = if (isLeftEdge) 4.dp else 0.dp, end = if (isLeftEdge) 0.dp else 4.dp)
        ) {
            // SECTION 1: HEADER
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 9.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(if (targetDeviceName != null) ElectricLime else TextDim, CircleShape)
                    )
                    Column {
                        Text(
                            text = targetDeviceName ?: "No PC Connected",
                            color = TextMain,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = if (isLeftEdge) "5GHz • Flush Left" else "5GHz • Flush Right",
                            color = TextSub,
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .background(Color(0x1AFFFFFF), RoundedCornerShape(6.dp))
                        .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(6.dp))
                        .clickable { onClose() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = TextSub,
                        modifier = Modifier.size(11.dp)
                    )
                }
            }

            HorizontalDivider(color = Color(0x1AFFFFFF), thickness = 0.8.dp)

            // SCROLLABLE COMPACT BODY
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 7.dp, vertical = 5.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                // SECTION 2: REAL DETECTED MEDIA
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = "DETECTED",
                            color = TextSub,
                            fontSize = 8.5.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                        Box(
                            modifier = Modifier
                                .size(13.dp)
                                .background(ElectricLime, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "$totalDetectedCount",
                                color = LimeText,
                                fontSize = 8.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                        }
                    }

                    if (recentPhotos.isNotEmpty()) {
                        Box(
                            modifier = Modifier
                                .background(Color(0x0DFFFFFF), RoundedCornerShape(5.dp))
                                .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(5.dp))
                                .clickable { onSendRecentPhotos(recentPhotos) }
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                Icon(Icons.Default.Bolt, contentDescription = null, tint = ElectricLime, modifier = Modifier.size(8.dp))
                                Text("All", color = ElectricLime, fontSize = 8.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                            }
                        }
                    }
                }

                // Real Device Media Rows
                if (recentPhotos.isEmpty() && latestDownload == null) {
                    Text(
                        text = "No recent photos or downloads",
                        color = TextDim,
                        fontSize = 8.5.sp,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                } else {
                    recentPhotos.forEach { photo ->
                        CompactMediaRow(
                            name = photo.name,
                            meta = "${photo.formattedSize} • Photo",
                            icon = Icons.Outlined.Image,
                            onBeam = { onSendRecentItem(photo) }
                        )
                    }

                    latestDownload?.let { download ->
                        CompactMediaRow(
                            name = download.name,
                            meta = "${download.formattedSize} • ${download.itemType.name}",
                            icon = when (download.itemType) {
                                ItemType.APK -> Icons.Outlined.Inventory2
                                ItemType.VIDEO -> Icons.Outlined.Videocam
                                ItemType.ARCHIVE -> Icons.Outlined.FolderZip
                                else -> Icons.AutoMirrored.Filled.InsertDriveFile
                            },
                            isApk = download.itemType == ItemType.APK,
                            onBeam = { onSendRecentItem(download) }
                        )
                    }
                }

                // SECTION 3: CLIPBOARD & NOTE
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF141A14), RoundedCornerShape(9.dp))
                        .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(9.dp))
                        .padding(5.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = clipboardText ?: "Clipboard is empty",
                            color = if (clipboardText != null) Color(0xFFC4D4C4) else TextDim,
                            fontSize = 8.5.sp,
                            fontFamily = FontFamily.Monospace,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        if (clipboardText != null) {
                            Box(
                                modifier = Modifier
                                    .background(ElectricLime, RoundedCornerShape(5.dp))
                                    .clickable { clipboardText?.let { onSendClipboardText(it) } }
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text("BEAM", color = LimeText, fontSize = 7.5.sp, fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }

                    // Inline note input
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0x66000000), RoundedCornerShape(6.dp))
                            .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(6.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        BasicTextField(
                            value = noteText,
                            onValueChange = { noteText = it },
                            textStyle = TextStyle(color = Color.White, fontSize = 8.5.sp),
                            cursorBrush = SolidColor(ElectricLime),
                            modifier = Modifier.weight(1f),
                            decorationBox = { innerTextField ->
                                if (noteText.isEmpty()) {
                                    Text("Note to PC...", color = TextDim, fontSize = 8.5.sp)
                                }
                                innerTextField()
                            }
                        )
                        Box(
                            modifier = Modifier
                                .size(15.dp)
                                .background(Color(0x1AFFFFFF), RoundedCornerShape(4.dp))
                                .clickable {
                                    if (noteText.isNotBlank()) {
                                        onSendClipboardText(noteText)
                                        noteText = ""
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = TextSub, modifier = Modifier.size(9.dp))
                        }
                    }
                }

                // SECTION 4: QUICK TOOLS DOCK (3 Buttons)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    QuickToolButton("Files", Icons.AutoMirrored.Filled.InsertDriveFile, Modifier.weight(1f)) { onPickFiles() }
                    QuickToolButton("Folder", Icons.Rounded.Folder, Modifier.weight(1f)) { onPickFolder() }
                    QuickToolButton("Snip", Icons.Outlined.ContentCut, Modifier.weight(1f)) { onPickFiles() }
                }

                // SECTION 5: REAL LIVE TRANSFER TELEMETRY HUD (Only shown during active beam)
                if (isTransferring) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xF20E140E), RoundedCornerShape(8.dp))
                            .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(8.dp))
                            .padding(5.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Box(modifier = Modifier.size(5.dp).background(ElectricLime, RoundedCornerShape(1.dp)))
                                Text(
                                    text = transferStatus.ifEmpty { "Streaming payload..." },
                                    color = Color.White,
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(Color(0x33EF4444))
                                    .clickable { onCancelTransfer() }
                                    .padding(horizontal = 4.dp, vertical = 1.dp)
                            ) {
                                Text(
                                    text = "Cancel",
                                    color = Color(0xFFF87171),
                                    fontSize = 7.sp,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        LinearProgressIndicator(
                            progress = { transferProgress.coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)),
                            color = ElectricLime,
                            trackColor = Color(0x1AFFFFFF)
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "${(transferProgress * 100).toInt()}%",
                                color = ElectricLime,
                                fontSize = 8.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace
                            )
                            if (transferSpeed.isNotBlank()) {
                                Text(
                                    text = transferSpeed,
                                    color = TextSub,
                                    fontSize = 8.sp,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CompactMediaRow(
    name: String,
    meta: String,
    icon: ImageVector,
    isApk: Boolean = false,
    onBeam: () -> Unit
) {
    var sent by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(CardBg, RoundedCornerShape(9.dp))
            .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(9.dp))
            .padding(horizontal = 6.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .background(IconBoxBg, RoundedCornerShape(6.dp))
                .border(BorderStroke(1.dp, IconBoxBorder), RoundedCornerShape(6.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(14.dp)
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(name, color = TextMain, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(meta, color = TextSub, fontSize = 7.5.sp, maxLines = 1)
        }

        Box(
            modifier = Modifier
                .background(if (sent) LimeDim else ElectricLime, RoundedCornerShape(5.dp))
                .clickable {
                    sent = true
                    onBeam()
                }
                .padding(horizontal = 7.dp, vertical = 2.5.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = if (sent) "✓" else "BEAM",
                color = if (sent) ElectricLime else LimeText,
                fontSize = 7.5.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

@Composable
private fun QuickToolButton(
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Column(
        modifier = modifier
            .background(CardBg, RoundedCornerShape(7.dp))
            .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(7.dp))
            .clickable { onClick() }
            .padding(vertical = 5.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Icon(icon, contentDescription = label, tint = TextSub, modifier = Modifier.size(12.dp))
        Text(label, color = Color(0xFFC4D4C4), fontSize = 8.sp, fontWeight = FontWeight.SemiBold)
    }
}
