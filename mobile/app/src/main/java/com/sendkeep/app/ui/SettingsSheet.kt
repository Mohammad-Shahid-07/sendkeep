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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sendkeep.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsSheet(
    onDismiss: () -> Unit,
    edgeShelfActive: Boolean,
    onToggleEdgeShelf: (Boolean) -> Unit
) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("sendkeep_prefs", Context.MODE_PRIVATE) }

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
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
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
                            text = "Local beam engine & edge overlay",
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

            // Section 3: Edge Shelf System
            SettingsGroupHeader(title = "EDGE OVERLAY SYSTEM")
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                color = CardBg,
                border = BorderStroke(1.dp, CardBorder)
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SettingsSwitchRow(
                        icon = Icons.Default.ElectricBolt,
                        title = "Right-Edge Shelf Handle",
                        subtitle = "Always-available 4dp grip tick for quick drag-and-beam and 1-tap shelf",
                        checked = edgeShelfActive,
                        onCheckedChange = {
                            onToggleEdgeShelf(it)
                        }
                    )
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(CanvasBg, RoundedCornerShape(8.dp))
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(if (edgeShelfActive) ElectricLime else TextDim, CircleShape)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = if (edgeShelfActive) "Docked at right bezel • Thumb-reach 216dp" else "Disabled • Tap toggle to activate",
                            fontSize = 10.5.sp,
                            color = if (edgeShelfActive) TextMain else TextSub
                        )
                    }
                }
            }

            // Section 4: Device Identity & Port
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

            // Footer
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "SendKeep Mobile v1.0.0 • Obsidian Zero-Cloud Engine",
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
