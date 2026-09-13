package com.sendkeep.app

import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.outlined.*
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
import androidx.lifecycle.lifecycleScope
import android.os.Environment
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.sendkeep.app.data.ItemType
import com.sendkeep.app.data.RecentMediaScanner
import com.sendkeep.app.network.PeerAnnouncementDto
import com.sendkeep.app.network.PairRequestDto
import com.sendkeep.app.network.TrustedDeviceEntity
import com.sendkeep.app.network.SendKeepClient
import com.sendkeep.app.network.SendKeepDiscovery
import com.sendkeep.app.network.SendKeepServer
import com.sendkeep.app.service.EdgeShelfService
import com.sendkeep.app.network.TransferProgressState
import com.sendkeep.app.network.TransferStatus
import com.sendkeep.app.network.TransferDirection
import com.sendkeep.app.ui.IncomingPairDialog
import com.sendkeep.app.ui.IncomingTransferDialog
import com.sendkeep.app.ui.ManualIpPairDialog
import com.sendkeep.app.ui.MediaPickerDrawer
import com.sendkeep.app.ui.RadarScanView
import com.sendkeep.app.ui.SettingsSheet
import com.sendkeep.app.ui.TransferProgressCard
import com.sendkeep.app.ui.WebShareDialog
import com.sendkeep.app.ui.FolderStackDialog
import com.sendkeep.app.ui.theme.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.io.File

data class BundledFileItem(
    val name: String,
    val relativePath: String,
    val size: Long,
    val formattedSize: String,
    val path: String,
    val mimeType: String? = null
)

data class ShelfStreamItem(
    val id: String,
    val name: String,
    val subtitle: String,
    val size: String,
    val isSent: Boolean,
    val category: String,
    val iconName: String = "file",
    val uriString: String? = null,
    val localFilePath: String? = null,
    val mimeType: String? = null,
    val bundledFiles: List<BundledFileItem>? = null
) {
    val icon: ImageVector
        get() = when (iconName) {
            "photo" -> Icons.Outlined.Image
            "apk" -> Icons.Outlined.Inventory2
            "zip", "archive" -> Icons.Outlined.FolderZip
            "folder" -> Icons.Outlined.Folder
            else -> Icons.Outlined.Description
        }
}

class MainActivity : ComponentActivity() {
    private val client = SendKeepClient()
    private val triggerPickerState = mutableStateOf(false)
    private val streamItemsState = mutableStateListOf<ShelfStreamItem>()
    private val gson = Gson()

    private fun saveHistory(items: List<ShelfStreamItem>) {
        try {
            val json = gson.toJson(items.take(40))
            getSharedPreferences("sendkeep_prefs", MODE_PRIVATE).edit()
                .putString("shelf_history_json", json)
                .apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun loadHistory(): List<ShelfStreamItem> {
        try {
            val json = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
                .getString("shelf_history_json", null)
            if (!json.isNullOrBlank()) {
                val type = object : TypeToken<List<ShelfStreamItem>>() {}.type
                val list: List<ShelfStreamItem>? = gson.fromJson(json, type)
                if (!list.isNullOrEmpty()) return list
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return emptyList()
    }

    private fun parseSizeStringToBytes(sizeStr: String): Long {
        val clean = sizeStr.trim().uppercase()
        val number = clean.replace(Regex("[^0-9.]"), "").toDoubleOrNull() ?: 0.0
        return when {
            clean.endsWith("GB") -> (number * 1024 * 1024 * 1024).toLong()
            clean.endsWith("MB") -> (number * 1024 * 1024).toLong()
            clean.endsWith("KB") -> (number * 1024).toLong()
            else -> number.toLong()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)

        // Load persistent history or seed with real device files
        val saved = loadHistory()
        if (saved.isNotEmpty()) {
            streamItemsState.addAll(saved)
        } else {
            lifecycleScope.launch {
                val realDownloads = RecentMediaScanner.getDeviceDownloads(this@MainActivity, limit = 4)
                val realPhotos = RecentMediaScanner.getDevicePhotos(this@MainActivity, limit = 2)
                val seed = mutableListOf<ShelfStreamItem>()

                realDownloads.forEach { d ->
                    val cat = when (d.itemType) {
                        ItemType.APK -> "APKs"
                        ItemType.IMAGE -> "Photos"
                        ItemType.ARCHIVE -> "Files"
                        else -> "Files"
                    }
                    val iconName = when (d.itemType) {
                        ItemType.APK -> "apk"
                        ItemType.IMAGE -> "photo"
                        ItemType.ARCHIVE -> "zip"
                        else -> "file"
                    }
                    seed.add(
                        ShelfStreamItem(
                            id = d.uri.toString(),
                            name = d.name,
                            subtitle = "Local • ${d.itemType.name}",
                            size = d.formattedSize,
                            isSent = false,
                            category = cat,
                            iconName = iconName,
                            uriString = d.uri.toString(),
                            localFilePath = d.localFile?.absolutePath,
                            mimeType = d.mimeType
                        )
                    )
                }

                realPhotos.forEach { p ->
                    if (seed.none { it.name == p.name }) {
                        seed.add(
                            ShelfStreamItem(
                                id = p.uri.toString(),
                                name = p.name,
                                subtitle = "Camera / Gallery",
                                size = p.formattedSize,
                                isSent = false,
                                category = "Photos",
                                iconName = "photo",
                                uriString = p.uri.toString(),
                                localFilePath = p.localFile?.absolutePath,
                                mimeType = p.mimeType
                            )
                        )
                    }
                }

                if (streamItemsState.isEmpty()) {
                    streamItemsState.addAll(seed)
                    saveHistory(streamItemsState)
                }
            }
        }

        // Start embedded HTTP server to receive transfers from PC
        SendKeepServer.start(this)
        SendKeepServer.onFileReceived = { file, meta, sender ->
            runOnUiThread {
                Toast.makeText(this@MainActivity, "✓ Received ${meta.fileName} from $sender", Toast.LENGTH_LONG).show()
                val isApk = meta.fileName.endsWith(".apk", ignoreCase = true)
                val isPhoto = meta.fileType.startsWith("image/") || meta.fileName.endsWith(".jpg", ignoreCase = true) || meta.fileName.endsWith(".png", ignoreCase = true) || meta.fileName.endsWith(".webp", ignoreCase = true)
                val isVideo = meta.fileType.startsWith("video/") || meta.fileName.endsWith(".mp4", ignoreCase = true) || meta.fileName.endsWith(".mov", ignoreCase = true) || meta.fileName.endsWith(".mkv", ignoreCase = true)
                val isZip = meta.fileName.endsWith(".zip", ignoreCase = true) || meta.fileName.endsWith(".tar.gz", ignoreCase = true)

                // 1. Android MediaStore Auto-Indexing: Register photos/videos immediately with Google Photos & System Gallery
                if (isPhoto || isVideo) {
                    try {
                        android.media.MediaScannerConnection.scanFile(
                            this@MainActivity,
                            arrayOf(file.absolutePath),
                            arrayOf(meta.fileType),
                            null
                        )
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                val cat = when {
                    isApk -> "APKs"
                    isPhoto -> "Photos"
                    isVideo -> "Media"
                    isZip -> "Files"
                    else -> "Files"
                }
                val iconName = when {
                    isApk -> "apk"
                    isPhoto -> "photo"
                    isVideo -> "photo"
                    isZip -> "zip"
                    else -> "file"
                }
                val sizeStr = String.format("%.1f MB", file.length() / (1024.0 * 1024.0))

                streamItemsState.add(
                    0,
                    ShelfStreamItem(
                        id = System.currentTimeMillis().toString(),
                        name = meta.fileName,
                        subtitle = "Received from $sender",
                        size = sizeStr,
                        isSent = false,
                        category = cat,
                        iconName = iconName,
                        uriString = Uri.fromFile(file).toString(),
                        localFilePath = file.absolutePath,
                        mimeType = meta.fileType
                    )
                )
                saveHistory(streamItemsState)
            }
        }

        SendKeepServer.onBatchReceived = { batch ->
            runOnUiThread {
                Toast.makeText(
                    this@MainActivity,
                    "✓ Received folder '${batch.folderName}' (${batch.files.size} items) from ${batch.sender}",
                    Toast.LENGTH_LONG
                ).show()

                // Media scanning for any photos/videos inside the folder
                for ((file, meta) in batch.files) {
                    val isPhoto = meta.fileType.startsWith("image/") || file.name.endsWith(".jpg", true) || file.name.endsWith(".png", true) || file.name.endsWith(".webp", true)
                    val isVideo = meta.fileType.startsWith("video/") || file.name.endsWith(".mp4", true) || file.name.endsWith(".mov", true)
                    if (isPhoto || isVideo) {
                        try {
                            android.media.MediaScannerConnection.scanFile(
                                this@MainActivity,
                                arrayOf(file.absolutePath),
                                arrayOf(meta.fileType),
                                null
                            )
                        } catch (ignored: Exception) {}
                    }
                }

                val sizeStr = RecentMediaScanner.formatFileSize(batch.totalBytes)
                val bundledItems = batch.files.map { (f, meta) ->
                    BundledFileItem(
                        name = f.name,
                        relativePath = meta.fileName,
                        size = f.length(),
                        formattedSize = RecentMediaScanner.formatFileSize(f.length()),
                        path = f.absolutePath,
                        mimeType = meta.fileType
                    )
                }

                streamItemsState.add(
                    0,
                    ShelfStreamItem(
                        id = System.currentTimeMillis().toString(),
                        name = batch.folderName,
                        subtitle = "${batch.files.size} items • Received from ${batch.sender}",
                        size = sizeStr,
                        isSent = false,
                        category = "Folders",
                        iconName = "folder",
                        localFilePath = batch.folderDir?.absolutePath,
                        mimeType = "resource/folder",
                        bundledFiles = bundledItems
                    )
                )
                saveHistory(streamItemsState)
            }
        }

        // Supply active shelf stream items to incoming web browser download requests
        SendKeepServer.webShareFilesProvider = {
            streamItemsState.map { item ->
                val bytes = if (!item.localFilePath.isNullOrBlank() && File(item.localFilePath).exists()) {
                    File(item.localFilePath).length()
                } else {
                    parseSizeStringToBytes(item.size)
                }
                SendKeepServer.WebShareItem(
                    id = item.id,
                    name = item.name,
                    path = item.localFilePath,
                    uriString = item.uriString,
                    size = bytes,
                    mimeType = item.mimeType ?: "application/octet-stream"
                )
            }
        }

        // Start background UDP discovery listener
        lifecycleScope.launch {
            SendKeepDiscovery.startListening(this@MainActivity)
        }

        lifecycleScope.launch {
            SendKeepDiscovery.discoveredPeers.collect { peers ->
                val currentTrusted = SendKeepServer.getTrustedDevices(this@MainActivity)
                var updated = false
                val newTrusted = currentTrusted.map { td ->
                    val matched = peers.firstOrNull { it.fingerprint == td.fingerprint }
                    if (matched != null && (matched.ip != null && matched.ip != td.ip || matched.port != td.port)) {
                        updated = true
                        td.copy(ip = matched.ip ?: td.ip, port = matched.port)
                    } else {
                        td
                    }
                }
                if (updated) {
                    SendKeepServer.saveTrustedDevices(this@MainActivity, newTrusted)
                }

                peers.firstOrNull()?.let { peer ->
                    getSharedPreferences("sendkeep_prefs", MODE_PRIVATE).edit()
                        .putString("last_laptop_ip", peer.ip)
                        .putString("last_laptop_name", peer.alias)
                        .putInt("last_laptop_port", peer.port)
                        .apply()
                }
            }
        }

        setContent {
            val triggerPicker by triggerPickerState

            SendKeepTheme {
                SendKeepDashboard(
                    streamItems = streamItemsState,
                    triggerFilePicker = triggerPicker,
                    onPickerHandled = { triggerPickerState.value = false },
                    onClearHistory = {
                        streamItemsState.clear()
                        saveHistory(emptyList())
                    },
                    onSendFiles = { uris ->
                        val trusted = SendKeepServer.getTrustedDevices(this@MainActivity)
                        val activePeers = SendKeepDiscovery.discoveredPeers.value
                        val onlinePeer = trusted.firstNotNullOfOrNull { td ->
                            activePeers.firstOrNull { it.fingerprint == td.fingerprint || it.ip == td.ip }
                        } ?: activePeers.firstOrNull()

                        val targetIp = onlinePeer?.ip ?: trusted.firstOrNull()?.ip
                        val targetPort = onlinePeer?.port ?: trusted.firstOrNull()?.port ?: 53317
                        val targetName = onlinePeer?.alias ?: trusted.firstOrNull()?.alias ?: "PC"

                        if (targetIp != null) {
                            lifecycleScope.launch {
                                Toast.makeText(this@MainActivity, "⚡ Beaming ${uris.size} item(s)...", Toast.LENGTH_SHORT).show()
                                val success = client.sendFiles(this@MainActivity, targetIp, targetPort, uris)
                                if (success) {
                                    Toast.makeText(this@MainActivity, "✓ Beamed to $targetName successfully!", Toast.LENGTH_SHORT).show()
                                    uris.forEach { u ->
                                        val isTree = (u.scheme == "content" && (u.path?.contains("/tree/") == true || u.toString().contains("/tree/")))
                                        val treeDoc = if (isTree) androidx.documentfile.provider.DocumentFile.fromTreeUri(this@MainActivity, u) else null
                                        val isFolder = treeDoc?.isDirectory == true || (u.scheme == "file" && java.io.File(u.path ?: "").isDirectory)
                                        val name = if (isFolder) {
                                            treeDoc?.name ?: (if (u.scheme == "file") java.io.File(u.path ?: "").name else "Folder")
                                        } else {
                                            u.lastPathSegment?.substringAfterLast('/') ?: "Sent Item"
                                        }
                                        val isApk = !isFolder && name.endsWith(".apk", true)
                                        val isPhoto = !isFolder && (name.endsWith(".jpg", true) || name.endsWith(".png", true))
                                        val isZip = !isFolder && name.endsWith(".zip", true)
                                        val cat = when {
                                             isFolder -> "Folders"
                                             isApk -> "APKs"
                                             isPhoto -> "Photos"
                                             isZip -> "Files"
                                             else -> "Files"
                                        }
                                        val iconName = when {
                                             isFolder -> "folder"
                                             isApk -> "apk"
                                             isPhoto -> "photo"
                                             isZip -> "zip"
                                             else -> "file"
                                        }
                                        val filePath = if (u.scheme == "file") u.path else null
                                        streamItemsState.add(
                                            0,
                                            ShelfStreamItem(
                                                id = System.currentTimeMillis().toString(),
                                                name = name,
                                                subtitle = "Sent to $targetName",
                                                size = if (isFolder) "Folder Beam OK" else "Beam OK",
                                                isSent = true,
                                                category = cat,
                                                iconName = iconName,
                                                uriString = u.toString(),
                                                localFilePath = filePath
                                            )
                                        )
                                    }
                                    saveHistory(streamItemsState)
                                } else {
                                    Toast.makeText(this@MainActivity, "✗ Transfer failed", Toast.LENGTH_SHORT).show()
                                }
                            }
                        } else {
                            Toast.makeText(this@MainActivity, "No PC connected • Tap Devices to scan or pair", Toast.LENGTH_LONG).show()
                        }
                    },
                    onSendText = { text ->
                        val trusted = SendKeepServer.getTrustedDevices(this@MainActivity)
                        val activePeers = SendKeepDiscovery.discoveredPeers.value
                        val onlinePeer = trusted.firstNotNullOfOrNull { td ->
                            activePeers.firstOrNull { it.fingerprint == td.fingerprint || it.ip == td.ip }
                        } ?: activePeers.firstOrNull()

                        val targetIp = onlinePeer?.ip ?: trusted.firstOrNull()?.ip
                        val targetPort = onlinePeer?.port ?: trusted.firstOrNull()?.port ?: 53317
                        val targetName = onlinePeer?.alias ?: trusted.firstOrNull()?.alias ?: "PC"

                        if (targetIp != null) {
                            lifecycleScope.launch {
                                val success = client.sendText(targetIp, targetPort, text)
                                if (success) {
                                    Toast.makeText(this@MainActivity, "✓ Note beamed to $targetName!", Toast.LENGTH_SHORT).show()
                                    streamItemsState.add(
                                        0,
                                        ShelfStreamItem(
                                            id = System.currentTimeMillis().toString(),
                                            name = text.take(32) + if (text.length > 32) "..." else "",
                                            subtitle = "Sent to $targetName",
                                            size = "${text.length} chars",
                                            isSent = true,
                                            category = "Files",
                                            iconName = "file",
                                            uriString = null,
                                            localFilePath = null
                                        )
                                    )
                                    saveHistory(streamItemsState)
                                }
                            }
                        } else {
                            Toast.makeText(this@MainActivity, "No PC connected • Tap Devices to scan or pair", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (android.provider.Settings.canDrawOverlays(this)) {
            EdgeShelfService.start(this)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getStringExtra("action") == "pick_files") {
            triggerPickerState.value = true
        }
    }
}

@Composable
fun SendKeepDashboard(
    streamItems: List<ShelfStreamItem>,
    triggerFilePicker: Boolean = false,
    onPickerHandled: () -> Unit = {},
    onClearHistory: () -> Unit = {},
    onSendFiles: (List<Uri>) -> Unit,
    onSendText: (String) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val peers by SendKeepDiscovery.discoveredPeers.collectAsState()
    var trustedDevices by remember { mutableStateOf(SendKeepServer.getTrustedDevices(context)) }

    LaunchedEffect(Unit) {
        trustedDevices = SendKeepServer.getTrustedDevices(context)
    }

    var activeTab by remember { mutableStateOf(0) } // 0: Shelf, 1: Devices, 2: Settings
    var showMediaPicker by remember { mutableStateOf(false) }
    var showSettingsSheet by remember { mutableStateOf(false) }
    var showManualIpDialog by remember { mutableStateOf(false) }
    var isManualPairing by remember { mutableStateOf(false) }
    var selectedFilterIndex by remember { mutableStateOf(0) }
    val filterCategories = listOf("All", "Folders", "APKs", "Files", "Photos")

    var quickNoteText by remember { mutableStateOf("") }
    var hasOverlayPermission by remember {
        mutableStateOf(android.provider.Settings.canDrawOverlays(context))
    }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            onSendFiles(uris)
        }
    }

    val folderPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { treeUri ->
        if (treeUri != null) {
            onSendFiles(listOf(treeUri))
        }
    }

    val overlayPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) {
        hasOverlayPermission = android.provider.Settings.canDrawOverlays(context)
        if (hasOverlayPermission) {
            EdgeShelfService.start(context)
        }
    }

    LaunchedEffect(triggerFilePicker) {
        if (triggerFilePicker) {
            showMediaPicker = true
            onPickerHandled()
        }
    }

    var pendingIncomingTransfer by remember { mutableStateOf<SendKeepServer.IncomingTransferRequest?>(null) }
    var pendingPairRequest by remember { mutableStateOf<SendKeepServer.IncomingPairRequest?>(null) }
    var activeTransferProgress by remember { mutableStateOf<TransferProgressState?>(null) }
    var showWebShareDialog by remember { mutableStateOf(false) }
    var viewingFolderItem by remember { mutableStateOf<ShelfStreamItem?>(null) }

    DisposableEffect(Unit) {
        SendKeepServer.onIncomingTransferRequested = { req ->
            pendingIncomingTransfer = req
        }
        SendKeepServer.onIncomingPairRequested = { req ->
            pendingPairRequest = req
        }
        SendKeepServer.onTransferProgress = { prog ->
            activeTransferProgress = prog
        }
        SendKeepClient.onTransferProgress = { prog ->
            activeTransferProgress = prog
        }
        onDispose {
            SendKeepServer.onIncomingTransferRequested = null
            SendKeepServer.onIncomingPairRequested = null
            SendKeepServer.onTransferProgress = null
            SendKeepClient.onTransferProgress = null
        }
    }

    LaunchedEffect(activeTransferProgress?.status) {
        if (activeTransferProgress?.status == TransferStatus.COMPLETED || activeTransferProgress?.status == TransferStatus.CANCELLED) {
            delay(3500)
            if (activeTransferProgress?.status == TransferStatus.COMPLETED || activeTransferProgress?.status == TransferStatus.CANCELLED) {
                activeTransferProgress = null
            }
        }
    }

    LaunchedEffect(peers) {
        trustedDevices = SendKeepServer.getTrustedDevices(context)
    }

    val onlineTrusted = trustedDevices.firstOrNull { td ->
        peers.any { p -> p.fingerprint == td.fingerprint || p.ip == td.ip }
    }
    val isConnected = onlineTrusted != null
    val targetDeviceName = if (onlineTrusted != null) {
        onlineTrusted.alias
    } else if (trustedDevices.isNotEmpty()) {
        "${trustedDevices.first().alias} (Offline)"
    } else {
        "No PC Connected"
    }

    Scaffold(
        containerColor = CanvasBg,
        topBar = {
            // Clean App Header matching mobile-concept-4-refined.html
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 18.dp, end = 18.dp, top = 8.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "SendKeep",
                    fontSize = 21.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = (-0.6).sp,
                    color = TextMain
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Web Share Globe Button
                    Surface(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .clickable { showWebShareDialog = true },
                        shape = CircleShape,
                        color = CardBg,
                        border = BorderStroke(1.dp, CardBorder)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Outlined.Language,
                                contentDescription = "Web Share Mode",
                                tint = Color(0xFF06B6D4),
                                modifier = Modifier.size(17.dp)
                            )
                        }
                    }

                    // Target Device Pill (Accurate real-time online/offline beacon)
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .clickable { activeTab = 1 },
                        shape = RoundedCornerShape(20.dp),
                        color = CardBg,
                        border = BorderStroke(1.dp, CardBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(7.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .background(if (isConnected) ElectricLime else TextDim, CircleShape)
                            )
                            Text(
                                text = targetDeviceName,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (isConnected) TextMain else TextDim
                            )
                            Icon(
                                imageVector = Icons.Default.KeyboardArrowDown,
                                contentDescription = null,
                                tint = TextSub,
                                modifier = Modifier.size(13.dp)
                            )
                        }
                    }
                }
            }
        },
        bottomBar = {
            // Grounded Bottom Navigation Bar matching Concept 4
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
                color = SurfaceDark,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    BottomNavItem(
                        label = "Shelf",
                        icon = Icons.Outlined.GridView,
                        active = activeTab == 0,
                        onClick = { activeTab = 0 }
                    )
                    BottomNavItem(
                        label = "Devices",
                        icon = Icons.Outlined.Devices,
                        active = activeTab == 1,
                        onClick = { activeTab = 1 }
                    )
                    BottomNavItem(
                        label = "Settings",
                        icon = Icons.Outlined.Tune,
                        active = activeTab == 2,
                        onClick = { showSettingsSheet = true }
                    )
                }
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when (activeTab) {
                0 -> ShelfScreen(
                    hasOverlayPermission = hasOverlayPermission,
                    onRequestOverlay = {
                        val intent = Intent(
                            android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:${context.packageName}")
                        )
                        overlayPermissionLauncher.launch(intent)
                    },
                    onOpenPhotos = { showMediaPicker = true },
                    onOpenFiles = { filePicker.launch("*/*") },
                    onOpenFolders = { folderPicker.launch(null) },
                    onSyncClipboard = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        val item = clipboard.primaryClip?.getItemAt(0)?.text?.toString()
                        if (!item.isNullOrBlank()) {
                            onSendText(item)
                            Toast.makeText(context, "⚡ Beaming clipboard text to PC...", Toast.LENGTH_SHORT).show()
                        } else {
                            Toast.makeText(context, "Clipboard is empty", Toast.LENGTH_SHORT).show()
                        }
                    },
                    quickNoteText = quickNoteText,
                    onQuickNoteChange = { quickNoteText = it },
                    onSendNote = {
                        if (quickNoteText.isNotBlank()) {
                            onSendText(quickNoteText)
                            quickNoteText = ""
                        }
                    },
                    streamItems = streamItems,
                    selectedFilter = filterCategories[selectedFilterIndex],
                    filterCategories = filterCategories,
                    onSelectFilter = { selectedFilterIndex = it },
                    onClearHistory = onClearHistory,
                    onFolderItemTapped = { folderItem -> viewingFolderItem = folderItem }
                )

                1 -> RadarDevicesScreen(
                    peers = peers,
                    trustedDevices = trustedDevices,
                    onAddByIp = { showManualIpDialog = true },
                    onRescan = {
                        coroutineScope.launch {
                            Toast.makeText(context, "Scanning Wi-Fi subnet...", Toast.LENGTH_SHORT).show()
                            SendKeepDiscovery.rescan(context)
                        }
                    },
                    onPairWithPeer = { peer ->
                        val targetIp = peer.ip ?: return@RadarDevicesScreen
                        coroutineScope.launch {
                            Toast.makeText(context, "Sending pairing request to ${peer.alias}...", Toast.LENGTH_SHORT).show()
                            val response = SendKeepDiscovery.sendPairRequest(targetIp, peer.port)
                            if (response != null && response.status == "accepted") {
                                val entity = TrustedDeviceEntity(
                                    id = response.fingerprint,
                                    alias = response.alias,
                                    ip = targetIp,
                                    port = peer.port,
                                    deviceModel = response.deviceModel,
                                    deviceType = response.deviceType,
                                    fingerprint = response.fingerprint,
                                    addedAt = System.currentTimeMillis()
                                )
                                SendKeepServer.addTrustedDevice(context, entity)
                                trustedDevices = SendKeepServer.getTrustedDevices(context)
                                Toast.makeText(context, "✓ Paired with ${response.alias}!", Toast.LENGTH_SHORT).show()
                            } else if (response != null && response.status == "declined") {
                                Toast.makeText(context, "Pairing was declined by ${peer.alias}", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "✗ Pairing failed or timed out", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    onRemoveTrustedDevice = { device ->
                        SendKeepServer.removeTrustedDevice(context, device.id)
                        trustedDevices = SendKeepServer.getTrustedDevices(context)
                        Toast.makeText(context, "Removed ${device.alias} from trusted devices", Toast.LENGTH_SHORT).show()
                    }
                )
            }

            TransferProgressCard(
                state = activeTransferProgress,
                onDismiss = { activeTransferProgress = null },
                onCancel = {
                    activeTransferProgress?.let { prog ->
                        if (prog.direction == TransferDirection.SEND) {
                            val prefs = context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE)
                            val targetIp = prefs.getString("last_laptop_ip", null)
                            val port = prefs.getInt("last_laptop_port", 53317)
                            SendKeepClient.cancelTransfer(prog.sessionId, targetIp, port)
                        } else {
                            SendKeepServer.cancelTransfer(prog.sessionId)
                        }
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 8.dp)
            )
        }

        // Modals
        if (showMediaPicker) {
            MediaPickerDrawer(
                onDismiss = { showMediaPicker = false },
                onBeamItems = { items ->
                    showMediaPicker = false
                    val uris = items.map { it.uri }
                    onSendFiles(uris)
                },
                onOpenSystemPicker = {
                    showMediaPicker = false
                    filePicker.launch("*/*")
                },
                onOpenFolderPicker = {
                    showMediaPicker = false
                    folderPicker.launch(null)
                }
            )
        }

        if (showWebShareDialog) {
            WebShareDialog(
                stagedCount = streamItems.size,
                onDismiss = { showWebShareDialog = false }
            )
        }

        if (showSettingsSheet) {
            SettingsSheet(
                onDismiss = { showSettingsSheet = false },
                edgeShelfActive = hasOverlayPermission,
                onToggleEdgeShelf = { enable ->
                    if (enable) {
                        if (android.provider.Settings.canDrawOverlays(context)) {
                            hasOverlayPermission = true
                            EdgeShelfService.start(context)
                        } else {
                            val intent = Intent(
                                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:${context.packageName}")
                            )
                            overlayPermissionLauncher.launch(intent)
                        }
                    } else {
                        hasOverlayPermission = false
                        EdgeShelfService.stop(context)
                    }
                }
            )
        }

        IncomingTransferDialog(
            isOpen = pendingIncomingTransfer != null,
            senderName = pendingIncomingTransfer?.senderAlias ?: (onlineTrusted?.alias ?: "Nearby Device"),
            senderMeta = pendingIncomingTransfer?.senderMeta ?: "${onlineTrusted?.ip ?: "Wi-Fi"} • Port 53317",
            files = pendingIncomingTransfer?.files ?: emptyList(),
            onAccept = { alwaysTrust ->
                pendingIncomingTransfer?.onDecision?.invoke(true, alwaysTrust)
                pendingIncomingTransfer = null
                Toast.makeText(context, "✓ Transfer accepted! Receiving payload...", Toast.LENGTH_SHORT).show()
            },
            onDecline = {
                pendingIncomingTransfer?.onDecision?.invoke(false, false)
                pendingIncomingTransfer = null
                Toast.makeText(context, "Transfer declined", Toast.LENGTH_SHORT).show()
            }
        )

        IncomingPairDialog(
            isOpen = pendingPairRequest != null,
            request = pendingPairRequest?.request,
            peerIp = pendingPairRequest?.peerIp ?: "",
            onAccept = {
                val req = pendingPairRequest
                if (req != null) {
                    val entity = TrustedDeviceEntity(
                        id = req.request.fingerprint,
                        alias = req.request.alias,
                        ip = req.peerIp,
                        port = req.request.port,
                        deviceModel = req.request.deviceModel,
                        deviceType = req.request.deviceType,
                        fingerprint = req.request.fingerprint,
                        addedAt = System.currentTimeMillis()
                    )
                    SendKeepServer.addTrustedDevice(context, entity)
                    trustedDevices = SendKeepServer.getTrustedDevices(context)
                    req.onDecision(true, true)
                    pendingPairRequest = null
                    Toast.makeText(context, "✓ Trusted device added: ${req.request.alias}", Toast.LENGTH_SHORT).show()
                }
            },
            onDecline = {
                pendingPairRequest?.onDecision?.invoke(false, false)
                pendingPairRequest = null
                Toast.makeText(context, "Pairing declined", Toast.LENGTH_SHORT).show()
            }
        )

        ManualIpPairDialog(
            isOpen = showManualIpDialog,
            localIp = SendKeepDiscovery.getLocalIpAddress(),
            isConnecting = isManualPairing,
            onDismiss = { showManualIpDialog = false },
            onConnect = { ip, port, pin ->
                isManualPairing = true
                coroutineScope.launch {
                    val response = SendKeepDiscovery.sendPairRequest(ip, port, pin)
                    isManualPairing = false
                    if (response != null && response.status == "accepted") {
                        val entity = TrustedDeviceEntity(
                            id = response.fingerprint,
                            alias = response.alias,
                            ip = ip,
                            port = port,
                            deviceModel = response.deviceModel,
                            deviceType = response.deviceType,
                            fingerprint = response.fingerprint,
                            addedAt = System.currentTimeMillis()
                        )
                        SendKeepServer.addTrustedDevice(context, entity)
                        trustedDevices = SendKeepServer.getTrustedDevices(context)
                        showManualIpDialog = false
                        Toast.makeText(context, "✓ Paired with ${response.alias}!", Toast.LENGTH_LONG).show()
                    } else if (response != null && response.status == "declined") {
                        Toast.makeText(context, "Pairing was declined by the device.", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(context, "✗ Could not reach $ip:$port. Check that SendKeep Desktop is running.", Toast.LENGTH_LONG).show()
                    }
                }
            }
        )

        // Folder Stack Dialog — opens when a folder item is tapped in the shelf
        FolderStackDialog(
            isOpen = viewingFolderItem != null,
            item = viewingFolderItem,
            onDismiss = { viewingFolderItem = null },
            onOpenFile = { bundledFile ->
                val f = File(bundledFile.path)
                if (f.exists()) {
                    RecentMediaScanner.openFile(context, Uri.fromFile(f), bundledFile.mimeType, f)
                } else {
                    Toast.makeText(context, "File not found: ${bundledFile.name}", Toast.LENGTH_SHORT).show()
                }
            },
            onOpenInFileManager = { dir ->
                try {
                    val intent = Intent(Intent.ACTION_VIEW)
                    intent.setDataAndType(Uri.fromFile(dir), "resource/folder")
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                } catch (e: Exception) {
                    // Fallback: open with file manager
                    try {
                        val intent = Intent(Intent.ACTION_VIEW)
                        intent.setDataAndType(Uri.fromFile(dir), "*/*")
                        context.startActivity(intent)
                    } catch (e2: Exception) {
                        Toast.makeText(context, "No file manager found", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onShareAll = { files ->
                try {
                    val uris = files.map { f ->
                        androidx.core.content.FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            f
                        )
                    }
                    val shareIntent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                        type = "*/*"
                        putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Share ${files.size} files"))
                } catch (e: Exception) {
                    Toast.makeText(context, "Failed to share: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        )
    }
}

@Composable
fun ShelfScreen(
    hasOverlayPermission: Boolean,
    onRequestOverlay: () -> Unit,
    onOpenPhotos: () -> Unit,
    onOpenFiles: () -> Unit,
    onOpenFolders: () -> Unit,
    onSyncClipboard: () -> Unit,
    quickNoteText: String,
    onQuickNoteChange: (String) -> Unit,
    onSendNote: () -> Unit,
    streamItems: List<ShelfStreamItem>,
    selectedFilter: String,
    filterCategories: List<String>,
    onSelectFilter: (Int) -> Unit,
    onClearHistory: () -> Unit,
    onFolderItemTapped: (ShelfStreamItem) -> Unit = {}
) {
    val context = LocalContext.current

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 4.dp, bottom = 20.dp)
    ) {
        // Subtle prompt only if overlay permission is completely missing
        if (!hasOverlayPermission) {
            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .clickable { onRequestOverlay() },
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF1E170A),
                    border = BorderStroke(1.dp, Color(0xFFD97706))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .background(Color(0xFF332005), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Warning,
                                contentDescription = null,
                                tint = WarningYellow,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Enable Edge Shelf & Drag-to-Send",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.5.sp
                            )
                            Text(
                                text = "Tap here to allow overlay permission for 1-tap edge handle.",
                                color = Color(0xFFFDE68A),
                                fontSize = 10.5.sp
                            )
                        }
                    }
                }
            }
        }

        // UNIFIED ACTION HUB (4 Identical Tiles + Quick Compose Bar)
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // 4 Action Tiles
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    ActionTile(
                        title = "Photos",
                        icon = Icons.Outlined.Image,
                        modifier = Modifier.weight(1f),
                        onClick = onOpenPhotos
                    )
                    ActionTile(
                        title = "Files",
                        icon = Icons.Outlined.Description,
                        modifier = Modifier.weight(1f),
                        onClick = onOpenFiles
                    )
                    ActionTile(
                        title = "Folders",
                        icon = Icons.Outlined.Folder,
                        modifier = Modifier.weight(1f),
                        onClick = onOpenFolders
                    )
                    ActionTile(
                        title = "Clipboard",
                        icon = Icons.Outlined.Assignment,
                        modifier = Modifier.weight(1f),
                        onClick = onSyncClipboard
                    )
                }

                // Clean Note / URL Beam Composer matching Concept 4
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = CardBg,
                    border = BorderStroke(1.dp, CardBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(start = 14.dp, end = 6.dp, top = 5.dp, bottom = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        BasicTextField(
                            value = quickNoteText,
                            onValueChange = onQuickNoteChange,
                            textStyle = TextStyle(
                                color = TextMain,
                                fontSize = 12.5.sp,
                                fontFamily = FontFamily.Default
                            ),
                            cursorBrush = SolidColor(ElectricLime),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            decorationBox = { innerTextField ->
                                if (quickNoteText.isEmpty()) {
                                    Text(
                                        text = "Beam note or paste link to PC...",
                                        color = TextDim,
                                        fontSize = 12.5.sp
                                    )
                                }
                                innerTextField()
                            }
                        )

                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .background(ElectricLime, RoundedCornerShape(10.dp))
                                .clickable { onSendNote() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                contentDescription = "Send",
                                tint = LimeText,
                                modifier = Modifier.size(15.dp)
                            )
                        }
                    }
                }
            }
        }

        // RECENT SHELF SECTION
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // Section Title Row
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Recent Shelf",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextMain
                    )
                    Text(
                        text = "Clear",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextDim,
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .clickable { onClearHistory() }
                            .padding(4.dp)
                    )
                }

                // Filter Pills Row
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(filterCategories.size) { index ->
                        val catName = filterCategories[index]
                        val isSelected = catName == selectedFilter
                        val label = if (index == 0) "All (${streamItems.size})" else catName

                        Surface(
                            modifier = Modifier
                                .clip(RoundedCornerShape(16.dp))
                                .clickable { onSelectFilter(index) },
                            shape = RoundedCornerShape(16.dp),
                            color = if (isSelected) ElectricLime else CardBg,
                            border = if (isSelected) null else BorderStroke(1.dp, CardBorder)
                        ) {
                            Box(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 11.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.SemiBold,
                                    color = if (isSelected) LimeText else TextSub
                                )
                            }
                        }
                    }
                }
            }
        }

        // Stream Items: 100% UNIFIED MONOCHROME
        val filteredItems = if (selectedFilter == "All") streamItems else streamItems.filter { it.category == selectedFilter }
        if (filteredItems.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No $selectedFilter files in recent shelf",
                        fontSize = 12.sp,
                        color = TextDim
                    )
                }
            }
        } else {
            items(filteredItems, key = { it.id }) { item ->
                ShelfStreamCard(
                    item = item,
                    onClick = {
                        // Folder items open the FolderStackDialog instead of a file
                        if (item.iconName == "folder" || !item.bundledFiles.isNullOrEmpty()) {
                            onFolderItemTapped(item)
                            return@ShelfStreamCard
                        }
                        val file = item.localFilePath?.let { File(it) }
                        if (file != null && file.exists()) {
                            RecentMediaScanner.openFile(context, Uri.fromFile(file), item.mimeType, file)
                        } else if (!item.uriString.isNullOrBlank()) {
                            RecentMediaScanner.openFile(context, Uri.parse(item.uriString), item.mimeType)
                        } else if (item.name.startsWith("http://") || item.name.startsWith("https://")) {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(item.name))
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                Toast.makeText(context, "Cannot open link", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            val dlDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                            val sendKeepDir = if (dlDir != null) File(dlDir, "SendKeep") else null
                            val candidate = if (sendKeepDir != null) File(sendKeepDir, item.name) else null
                            if (candidate != null && candidate.exists()) {
                                RecentMediaScanner.openFile(context, Uri.fromFile(candidate), item.mimeType, candidate)
                            } else {
                                Toast.makeText(context, "Item: ${item.name} (${item.subtitle})", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun ActionTile(
    title: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = CardBg,
        border = BorderStroke(1.dp, CardBorder)
    ) {
        Column(
            modifier = Modifier.padding(vertical = 13.dp, horizontal = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(IconBoxBg, RoundedCornerShape(13.dp))
                    .border(BorderStroke(1.dp, IconBoxBorder), RoundedCornerShape(13.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = title,
                    tint = Color.White, // UNIFIED CRISP WHITE
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(Modifier.height(7.dp))
            Text(
                text = title,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextMain
            )
        }
    }
}

@Composable
private fun ShelfStreamCard(
    item: ShelfStreamItem,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = CardBg,
        border = BorderStroke(1.dp, CardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Unified Monochrome Icon Box — amber for folders
            val isFolder = item.iconName == "folder" || !item.bundledFiles.isNullOrEmpty()
            val iconBg = if (isFolder) Color(0x26F59E0B) else IconBoxBg
            val iconBorder = if (isFolder) Color(0x4DF59E0B) else IconBoxBorder
            val iconTint = if (isFolder) Color(0xFFFBBF24) else Color.White
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconBg, RoundedCornerShape(11.dp))
                    .border(BorderStroke(1.dp, iconBorder), RoundedCornerShape(11.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = item.icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(18.dp)
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                Text(
                    text = item.name,
                    fontSize = 13.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextMain,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Text(
                        text = if (item.isSent) "↗" else "↙",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (item.isSent) ElectricLime else TextSub
                    )
                    Text(
                        text = item.subtitle,
                        fontSize = 11.5.sp,
                        color = TextSub,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Text(
                text = item.size,
                fontSize = 11.sp,
                fontFamily = FontFamily.Monospace,
                color = TextDim
            )
        }
    }
}

@Composable
private fun BottomNavItem(
    label: String,
    icon: ImageVector,
    active: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (active) Color(0x1FB8FF24) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (active) ElectricLime else TextDim,
                modifier = Modifier.size(20.dp)
            )
            Text(
                text = label,
                fontSize = 10.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (active) ElectricLime else TextDim
            )
        }
    }
}

@Composable
fun RadarDevicesScreen(
    peers: List<PeerAnnouncementDto>,
    trustedDevices: List<TrustedDeviceEntity>,
    onAddByIp: () -> Unit,
    onRescan: () -> Unit,
    onPairWithPeer: (PeerAnnouncementDto) -> Unit,
    onRemoveTrustedDevice: (TrustedDeviceEntity) -> Unit
) {
    val untrustedPeers = remember(peers, trustedDevices) {
        peers.filter { peer ->
            !trustedDevices.any { td ->
                (peer.fingerprint.isNotBlank() && td.fingerprint == peer.fingerprint) || td.ip == peer.ip
            }
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp)
    ) {
        // Radar Sweep Scanner with "+ Add PC via IP" and "Rescan"
        item {
            RadarScanView(
                onAddByIp = onAddByIp,
                onRescan = onRescan
            )
        }

        // 1. TRUSTED COMPUTERS SECTION
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "TRUSTED COMPUTERS (${trustedDevices.size})",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = TextDim
                )
                Text(
                    text = "Zero-Click Beaming",
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = ElectricLime
                )
            }
        }

        if (trustedDevices.isEmpty()) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = CardBg,
                    border = BorderStroke(1.dp, CardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .background(IconBoxBg, RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Lock,
                                contentDescription = null,
                                tint = TextDim,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Text(
                            text = "No trusted computers yet",
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextSub
                        )
                        Text(
                            text = "Pair with your computer below or tap '+ Add PC via IP' to enable instant beaming.",
                            fontSize = 11.sp,
                            color = TextDim,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            lineHeight = 15.sp
                        )
                    }
                }
            }
        } else {
            items(trustedDevices, key = { it.id }) { device ->
                val isOnline = peers.any { it.fingerprint == device.fingerprint || it.ip == device.ip }
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = CardBg,
                    border = BorderStroke(1.dp, if (isOnline) Color(0x33B8FF24) else CardBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(
                                        if (isOnline) Color(0x1FB8FF24) else IconBoxBg,
                                        RoundedCornerShape(10.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Computer,
                                    contentDescription = null,
                                    tint = if (isOnline) ElectricLime else Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = device.alias,
                                        fontSize = 13.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextMain
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .size(7.dp)
                                            .background(if (isOnline) ElectricLime else TextDim, CircleShape)
                                    )
                                }
                                Text(
                                    text = if (isOnline) "ONLINE • ${device.ip}:${device.port}" else "OFFLINE • Last seen ${device.ip}",
                                    fontSize = 11.sp,
                                    color = if (isOnline) ElectricLime else TextDim,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        IconButton(
                            onClick = { onRemoveTrustedDevice(device) },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Delete,
                                contentDescription = "Forget device",
                                tint = TextDim,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }
        }

        // 2. NEARBY PEERS SECTION
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "NEARBY PEERS (${untrustedPeers.size})",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                    color = TextDim
                )
                Text(
                    text = "Wi-Fi Multicast • 53317",
                    fontSize = 10.sp,
                    color = TextDim,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        if (untrustedPeers.isEmpty()) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = CardBg,
                    border = BorderStroke(1.dp, CardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Devices,
                            contentDescription = null,
                            tint = TextDim,
                            modifier = Modifier.size(36.dp)
                        )
                        Text(
                            text = if (trustedDevices.isNotEmpty()) "All detected devices are paired" else "No other SendKeep devices detected yet",
                            fontSize = 12.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextSub
                        )
                        Text(
                            text = if (trustedDevices.isNotEmpty()) "Your paired computers are ready for instant beaming above." else "Ensure SendKeep is open on your Laptop or PC on the same Wi-Fi network.",
                            fontSize = 11.sp,
                            color = TextDim,
                            lineHeight = 15.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        } else {
            items(untrustedPeers, key = { it.fingerprint + (it.ip ?: "") }) { peer ->
                val isTrusted = trustedDevices.any { it.fingerprint == peer.fingerprint }
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = CardBg,
                    border = BorderStroke(1.dp, if (isTrusted) Color(0x33B8FF24) else CardBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(IconBoxBg, RoundedCornerShape(10.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Outlined.Devices,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = peer.alias,
                                        fontSize = 13.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = TextMain
                                    )
                                    Spacer(Modifier.width(6.dp))
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .background(ElectricLime, CircleShape)
                                    )
                                }
                                Text(
                                    text = "${peer.ip} • Port ${peer.port}",
                                    fontSize = 11.sp,
                                    color = TextSub,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }

                        if (isTrusted) {
                            Text(
                                text = "✓ PAIRED",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = ElectricLime,
                                modifier = Modifier
                                    .background(Color(0x1FB8FF24), RoundedCornerShape(6.dp))
                                    .border(1.dp, Color(0x33B8FF24), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        } else {
                            Button(
                                onClick = { onPairWithPeer(peer) },
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = ElectricLime,
                                    contentColor = LimeText
                                ),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                modifier = Modifier.height(32.dp)
                            ) {
                                Text(
                                    text = "+ Pair",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
