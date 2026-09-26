package com.sendkeep.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sendkeep.app.BuildConfig
import com.sendkeep.app.ui.theme.*
import com.sendkeep.app.util.AppUpdater
import com.sendkeep.app.util.AppUpdateInfo
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val prefs = remember { context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE) }

    var isCheckingUpdates by remember { mutableStateOf(false) }
    var updateInfo by remember { mutableStateOf<AppUpdateInfo?>(null) }
    var updateStatusMessage by remember { mutableStateOf("") }
    var isDownloadingUpdate by remember { mutableStateOf(false) }
    var downloadProgress by remember { mutableFloatStateOf(0f) }

    var storagePath by remember {
        mutableStateOf(prefs.getString("storage_path", "/Download/SendKeep") ?: "/Download/SendKeep")
    }
    var autoAccept by remember {
        mutableStateOf(prefs.getBoolean("auto_accept_trusted", true))
    }
    var requirePin by remember {
        mutableStateOf(prefs.getBoolean("require_pin", false))
    }
    var securityPin by remember {
        mutableStateOf(prefs.getString("security_pin", "1234") ?: "1234")
    }
    var deviceName by remember {
        mutableStateOf(prefs.getString("device_alias", Build.MODEL ?: "Android Device") ?: "Android Device")
    }
    var collisionStrategy by remember {
        mutableStateOf(prefs.getString("collision_strategy", "rename") ?: "rename")
    }

    val folderPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                context.contentResolver.takePersistableUriPermission(uri, flags)
                val displayPath = uri.lastPathSegment ?: uri.path ?: uri.toString()
                storagePath = displayPath
                prefs.edit()
                    .putString("storage_path", displayPath)
                    .putString("storage_tree_uri", uri.toString())
                    .apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    val powerManager = remember { context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager }
    var isIgnoringBatteryOptimizations by remember {
        mutableStateOf(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true
            } else true
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = SurfaceDark,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(vertical = 10.dp)
                    .width(36.dp)
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(TextDim)
            )
        },
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(LimeDim, RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Tune,
                            contentDescription = null,
                            tint = ElectricLime,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Settings & Preferences",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextMain
                        )
                        Text(
                            text = "Local beam engine & preferences",
                            fontSize = 11.5.sp,
                            color = TextSub
                        )
                    }
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = TextSub,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            HorizontalDivider(color = CardBorder, thickness = 1.dp)

            // Section 1: Storage Destination
            SettingsGroupHeader(title = "STORAGE DESTINATION")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Folder,
                            contentDescription = null,
                            tint = ElectricLime,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Save incoming files to",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextMain
                            )
                            Text(
                                text = storagePath,
                                fontSize = 11.sp,
                                color = TextSub
                            )
                        }
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        TextButton(
                            onClick = {
                                storagePath = "/Download/SendKeep"
                                prefs.edit().putString("storage_path", "/Download/SendKeep").remove("storage_tree_uri").apply()
                            },
                            colors = ButtonDefaults.textButtonColors(contentColor = TextSub)
                        ) {
                            Text("Default", fontSize = 11.5.sp)
                        }
                        Button(
                            onClick = { folderPickerLauncher.launch(null) },
                            colors = ButtonDefaults.buttonColors(containerColor = ElectricLime, contentColor = LimeText),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Change", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // Section 2: Duplicate File Handling
            SettingsGroupHeader(title = "DUPLICATE FILE HANDLING")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Column {
                        Text(
                            text = "Collision Strategy",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = TextMain
                        )
                        Text(
                            text = "Action when receiving a file that already exists",
                            fontSize = 11.sp,
                            color = TextSub
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            "rename" to "Auto-Rename",
                            "overwrite" to "Overwrite",
                            "skip" to "Skip"
                        ).forEach { (key, label) ->
                            val isSelected = collisionStrategy == key
                            Surface(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(10.dp))
                                    .clickable {
                                        collisionStrategy = key
                                        prefs.edit().putString("collision_strategy", key).apply()
                                    },
                                shape = RoundedCornerShape(10.dp),
                                color = if (isSelected) ElectricLime else SurfaceDark,
                                border = if (isSelected) null else BorderStroke(1.dp, CardBorder)
                            ) {
                                Box(
                                    modifier = Modifier.padding(vertical = 8.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = label,
                                        fontSize = 11.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (isSelected) LimeText else TextSub
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Section 2: Transfers & Security
            SettingsGroupHeader(title = "TRANSFERS & SECURITY")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SettingsSwitchRow(
                        icon = Icons.Default.Security,
                        title = "Auto-Accept Trusted Peers",
                        subtitle = "Instantly save incoming files from paired devices without prompting",
                        checked = autoAccept,
                        onCheckedChange = {
                            autoAccept = it
                            prefs.edit().putBoolean("auto_accept_trusted", it).apply()
                        }
                    )
                    HorizontalDivider(color = CardBorder, thickness = 0.5.dp)
                    SettingsSwitchRow(
                        icon = Icons.Default.Lock,
                        title = "Require PIN for Unknown Devices",
                        subtitle = "Require senders to enter this 4-digit PIN before accepting transfers or pairing",
                        checked = requirePin,
                        onCheckedChange = {
                            requirePin = it
                            prefs.edit().putBoolean("require_pin", it).apply()
                        }
                    )
                    if (requirePin) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(SurfaceDark, RoundedCornerShape(10.dp))
                                .border(BorderStroke(1.dp, CardBorder), RoundedCornerShape(10.dp))
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "4-Digit Security PIN",
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextMain
                                )
                                Text(
                                    text = "Peers will be prompted to enter this code",
                                    fontSize = 10.5.sp,
                                    color = TextSub
                                )
                            }
                            OutlinedTextField(
                                value = securityPin,
                                onValueChange = { input ->
                                    val filtered = input.filter { it.isDigit() }.take(4)
                                    securityPin = filtered
                                    if (filtered.length == 4) {
                                        prefs.edit().putString("security_pin", filtered).apply()
                                    }
                                },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                textStyle = androidx.compose.ui.text.TextStyle(
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ElectricLime,
                                    textAlign = TextAlign.Center
                                ),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = Color.Transparent,
                                    unfocusedContainerColor = Color.Transparent,
                                    focusedBorderColor = ElectricLime,
                                    unfocusedBorderColor = CardBorder
                                ),
                                modifier = Modifier
                                    .width(90.dp)
                                    .height(48.dp)
                            )
                        }
                    }
                }
            }

            // Section 3: Device Identity & Port
            SettingsGroupHeader(title = "LOCAL NETWORK IDENTITY")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Broadcast Device Name", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = TextMain)
                            Text("Visible to nearby laptops and phones", fontSize = 11.sp, color = TextSub)
                        }
                        Text(
                            text = deviceName,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = ElectricLime
                        )
                    }
                    HorizontalDivider(color = CardBorder, thickness = 0.5.dp)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Local Server Port", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = TextMain)
                            Text("HTTP streaming & UDP discovery port", fontSize = 11.sp, color = TextSub)
                        }
                        Text(
                            text = "53317 (Standard)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSub
                        )
                    }
                }
            }

            // Section 5: Background Persistence & Battery
            SettingsGroupHeader(title = "BACKGROUND PERSISTENCE")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isIgnoringBatteryOptimizations) Icons.Default.BatteryChargingFull else Icons.Default.BatteryAlert,
                            contentDescription = null,
                            tint = if (isIgnoringBatteryOptimizations) ElectricLime else WarningYellow,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Background Execution",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextMain
                            )
                            Text(
                                text = if (isIgnoringBatteryOptimizations) "Unrestricted (recommended)" else "Optimized (may sleep when locked)",
                                fontSize = 11.sp,
                                color = TextSub
                            )
                        }
                    }
                    if (!isIgnoringBatteryOptimizations && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        Button(
                            onClick = {
                                try {
                                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                        data = Uri.parse("package:${context.packageName}")
                                    }
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    try {
                                        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                                    } catch (ignored: Exception) {}
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = WarningYellow, contentColor = Color.Black),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Allow", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        Text(
                            text = "Active",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = ElectricLime
                        )
                    }
                }
            }

            // Section 5: App Updates (No Store Required)
            SettingsGroupHeader(title = "APP UPDATES")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Current Version", fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = TextMain)
                            Text("SendKeep v${BuildConfig.VERSION_NAME} (Storeless)", fontSize = 11.sp, color = TextSub)
                        }
                        Button(
                            onClick = {
                                isCheckingUpdates = true
                                updateStatusMessage = "Checking GitHub releases..."
                                coroutineScope.launch {
                                    val info = AppUpdater.checkForUpdates(BuildConfig.VERSION_NAME)
                                    isCheckingUpdates = false
                                    updateInfo = info
                                    updateStatusMessage = if (info.hasUpdate) {
                                        "New version v${info.latestVersion} available!"
                                    } else {
                                        "You are on the latest version."
                                    }
                                }
                            },
                            enabled = !isCheckingUpdates && !isDownloadingUpdate,
                            colors = ButtonDefaults.buttonColors(containerColor = SurfaceDark, contentColor = ElectricLime),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            modifier = Modifier.height(34.dp)
                        ) {
                            if (isCheckingUpdates) {
                                CircularProgressIndicator(modifier = Modifier.size(14.dp), color = ElectricLime, strokeWidth = 2.dp)
                            } else {
                                Text("Check for Updates", fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    if (updateStatusMessage.isNotBlank()) {
                        Text(
                            text = updateStatusMessage,
                            fontSize = 11.sp,
                            color = if (updateInfo?.hasUpdate == true) ElectricLime else TextSub
                        )
                    }

                    if (updateInfo?.hasUpdate == true && updateInfo?.apkUrl != null) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = CanvasBg,
                            border = BorderStroke(1.dp, CardBorder)
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "⚡ Update v${updateInfo!!.latestVersion}",
                                        fontSize = 12.5.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ElectricLime
                                    )
                                    if (updateInfo!!.apkSize != null && updateInfo!!.apkSize!! > 0) {
                                        Text(
                                            text = "%.1f MB".format(updateInfo!!.apkSize!! / (1024f * 1024f)),
                                            fontSize = 10.5.sp,
                                            color = TextSub
                                        )
                                    }
                                }

                                if (updateInfo!!.releaseNotes.isNotBlank()) {
                                    Text(
                                        text = updateInfo!!.releaseNotes,
                                        fontSize = 11.sp,
                                        color = TextMain,
                                        maxLines = 4,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                if (isDownloadingUpdate) {
                                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        LinearProgressIndicator(
                                            progress = { downloadProgress },
                                            modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)),
                                            color = ElectricLime,
                                            trackColor = SurfaceDark
                                        )
                                        Text(
                                            text = "Downloading APK: ${(downloadProgress * 100).toInt()}%",
                                            fontSize = 10.5.sp,
                                            color = TextSub
                                        )
                                    }
                                } else {
                                    Button(
                                        onClick = {
                                            isDownloadingUpdate = true
                                            coroutineScope.launch {
                                                AppUpdater.downloadAndInstallApk(
                                                    context = context,
                                                    apkUrl = updateInfo!!.apkUrl!!,
                                                    onProgress = { prog, _, _ ->
                                                        downloadProgress = prog
                                                    },
                                                    onError = { err ->
                                                        isDownloadingUpdate = false
                                                        updateStatusMessage = "Download failed: $err"
                                                    }
                                                )
                                                isDownloadingUpdate = false
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = ElectricLime, contentColor = LimeText),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.fillMaxWidth().height(36.dp)
                                    ) {
                                        Text("Install Update", fontSize = 12.5.sp, fontWeight = FontWeight.ExtraBold)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Footer
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "SendKeep Mobile v0.0.1 • Obsidian Zero-Cloud Engine",
                    fontSize = 10.5.sp,
                    color = TextDim
                )
            }
        }
    }
}

@Composable
private fun SettingsGroupHeader(title: String) {
    Text(
        text = title,
        fontSize = 10.5.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp,
        color = TextDim
    )
}

@Composable
private fun SettingsSwitchRow(
    icon: ImageVector,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (checked) ElectricLime else TextSub,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    text = title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = TextMain
                )
                Text(
                    text = subtitle,
                    fontSize = 11.sp,
                    color = TextSub,
                    lineHeight = 15.sp
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = LimeText,
                checkedTrackColor = ElectricLime,
                uncheckedThumbColor = TextSub,
                uncheckedTrackColor = SurfaceDark
            )
        )
    }
}
