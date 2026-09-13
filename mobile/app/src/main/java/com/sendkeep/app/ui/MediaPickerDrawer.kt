package com.sendkeep.app.ui

import android.net.Uri
import android.os.Environment
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sendkeep.app.data.ItemType
import com.sendkeep.app.data.RecentMediaScanner
import com.sendkeep.app.ui.theme.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class PickerItem(
    val id: String,
    val name: String,
    val sizeText: String,
    val sizeBytes: Long,
    val category: String,
    val badge: String,
    val icon: ImageVector,
    val uri: Uri
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaPickerDrawer(
    onDismiss: () -> Unit,
    onBeamItems: (List<PickerItem>) -> Unit,
    onOpenSystemPicker: () -> Unit,
    onOpenFolderPicker: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var selectedCategory by remember { mutableStateOf(0) }
    val categories = listOf("Photos", "Folders", "APKs & ZIPs", "Documents")

    var photosList by remember { mutableStateOf<List<PickerItem>>(emptyList()) }
    var foldersList by remember { mutableStateOf<List<PickerItem>>(emptyList()) }
    var apksList by remember { mutableStateOf<List<PickerItem>>(emptyList()) }
    var docsList by remember { mutableStateOf<List<PickerItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    val selectedItems = remember { mutableStateListOf<PickerItem>() }

    // Load real storage items asynchronously
    LaunchedEffect(Unit) {
        scope.launch {
            isLoading = true

            // 1. Photos
            val rawPhotos = RecentMediaScanner.getDevicePhotos(context, limit = 50)
            photosList = rawPhotos.map {
                PickerItem(
                    id = it.uri.toString(),
                    name = it.name,
                    sizeText = it.formattedSize,
                    sizeBytes = it.sizeBytes,
                    category = "Photos",
                    badge = if (it.name.endsWith(".png", true)) "PNG" else "JPG",
                    icon = Icons.Outlined.Image,
                    uri = it.uri
                )
            }

            // 2. Folders
            val commonFolders = mutableListOf<PickerItem>()
            val dcim = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM)
            if (dcim.exists()) {
                val count = dcim.listFiles()?.size ?: 0
                commonFolders.add(
                    PickerItem("dcim", "DCIM/Camera ($count items)", "Folder", 0L, "Folders", "DIR", Icons.Outlined.Folder, Uri.fromFile(dcim))
                )
            }
            val dl = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (dl.exists()) {
                val count = dl.listFiles()?.size ?: 0
                commonFolders.add(
                    PickerItem("dl", "Download ($count items)", "Folder", 0L, "Folders", "DIR", Icons.Outlined.Folder, Uri.fromFile(dl))
                )
            }
            val docsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
            if (docsDir.exists()) {
                val count = docsDir.listFiles()?.size ?: 0
                commonFolders.add(
                    PickerItem("docs", "Documents ($count items)", "Folder", 0L, "Folders", "DIR", Icons.Outlined.Folder, Uri.fromFile(docsDir))
                )
            }
            foldersList = commonFolders

            // 3. APKs & ZIPs
            val rawApks = RecentMediaScanner.getInstalledApks(context)
            val rawDownloads = RecentMediaScanner.getDeviceDownloads(context, limit = 20)
            val zipList = rawDownloads.filter { it.itemType == ItemType.ARCHIVE || it.name.endsWith(".apk", true) }

            val combinedApks = mutableListOf<PickerItem>()
            rawApks.take(25).forEach {
                combinedApks.add(
                    PickerItem(
                        id = it.uri.toString(),
                        name = it.name,
                        sizeText = it.formattedSize,
                        sizeBytes = it.sizeBytes,
                        category = "APKs & ZIPs",
                        badge = "APK",
                        icon = Icons.Outlined.Inventory2,
                        uri = it.uri
                    )
                )
            }
            zipList.forEach {
                if (combinedApks.none { ex -> ex.name == it.name }) {
                    combinedApks.add(
                        PickerItem(
                            id = it.uri.toString(),
                            name = it.name,
                            sizeText = it.formattedSize,
                            sizeBytes = it.sizeBytes,
                            category = "APKs & ZIPs",
                            badge = if (it.name.endsWith(".zip", true)) "ZIP" else "PKG",
                            icon = Icons.Outlined.FolderZip,
                            uri = it.uri
                        )
                    )
                }
            }
            apksList = combinedApks

            // 4. Documents
            val rawDocs = RecentMediaScanner.getDeviceDocuments(context, limit = 30)
            docsList = rawDocs.map {
                PickerItem(
                    id = it.uri.toString(),
                    name = it.name,
                    sizeText = it.formattedSize,
                    sizeBytes = it.sizeBytes,
                    category = "Documents",
                    badge = if (it.name.endsWith(".pdf", true)) "PDF" else "DOC",
                    icon = Icons.Outlined.Description,
                    uri = it.uri
                )
            }

            isLoading = false
        }
    }

    val currentCategoryItems = when (selectedCategory) {
        0 -> photosList
        1 -> foldersList
        2 -> apksList
        else -> docsList
    }

    val totalSelectedSize = selectedItems.sumOf { it.sizeBytes }
    val totalSizeMB = String.format("%.1f", totalSelectedSize / (1024.0 * 1024.0))

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
                .fillMaxHeight(0.85f)
                .padding(horizontal = 16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "Device Media & Payloads",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextMain
                    )
                    Text(
                        text = "Real device photos, documents, and installed apps",
                        fontSize = 11.sp,
                        color = TextSub
                    )
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(30.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close",
                        tint = TextSub,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Tabs
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CanvasBg, RoundedCornerShape(12.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                categories.forEachIndexed { index, title ->
                    val isSelected = selectedCategory == index
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) CardBg else Color.Transparent)
                            .clickable { selectedCategory = index }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = title,
                            fontSize = 11.5.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isSelected) ElectricLime else TextSub
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            // System SAF fallback row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(CardBg)
                    .clickable {
                        if (categories[selectedCategory] == "Folders") {
                            onOpenFolderPicker()
                        } else {
                            onOpenSystemPicker()
                        }
                    }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (categories[selectedCategory] == "Folders") Icons.Outlined.CreateNewFolder else Icons.Outlined.FolderOpen,
                        contentDescription = null,
                        tint = ElectricLime,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        text = if (categories[selectedCategory] == "Folders") "Browse folder tree via Android SAF..." else "Browse all system storage files...",
                        fontSize = 11.5.sp,
                        color = TextMain
                    )
                }
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = TextSub,
                    modifier = Modifier.size(16.dp)
                )
            }

            Spacer(Modifier.height(10.dp))

            // Content List / Grid
            Box(modifier = Modifier.weight(1f)) {
                if (isLoading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = ElectricLime, strokeWidth = 2.5.dp, modifier = Modifier.size(28.dp))
                    }
                } else if (currentCategoryItems.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No items found in this category", color = TextDim, fontSize = 12.sp)
                    }
                } else if (categories[selectedCategory] == "Photos") {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(currentCategoryItems, key = { it.id }) { item ->
                            val isChosen = selectedItems.any { it.id == item.id }
                            PhotoPickerCard(
                                item = item,
                                selected = isChosen,
                                onToggle = {
                                    if (isChosen) selectedItems.removeAll { it.id == item.id }
                                    else selectedItems.add(item)
                                }
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(currentCategoryItems, key = { it.id }) { item ->
                            val isChosen = selectedItems.any { it.id == item.id }
                            ItemPickerRow(
                                item = item,
                                selected = isChosen,
                                onToggle = {
                                    if (isChosen) selectedItems.removeAll { it.id == item.id }
                                    else selectedItems.add(item)
                                }
                            )
                        }
                    }
                }
            }

            // Bottom Sticky Beam Bar
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                color = SurfaceDark
            ) {
                Button(
                    onClick = {
                        if (selectedItems.isNotEmpty()) {
                            onBeamItems(selectedItems.toList())
                        } else {
                            onOpenSystemPicker()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (selectedItems.isNotEmpty()) ElectricLime else CardBgHover,
                        contentColor = if (selectedItems.isNotEmpty()) LimeText else TextMain
                    )
                ) {
                    if (selectedItems.isNotEmpty()) {
                        Icon(
                            imageVector = Icons.Default.ElectricBolt,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Beam ${selectedItems.size} Selected (${totalSizeMB} MB) → PC",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.FileOpen,
                            contentDescription = null,
                            tint = ElectricLime,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Select Items or Open System Storage",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PhotoPickerCard(
    item: PickerItem,
    selected: Boolean,
    onToggle: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) CardBgHover else CardBg,
        border = BorderStroke(1.dp, if (selected) ElectricLime else CardBorder)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(84.dp)
                    .background(IconBoxBg, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = item.icon,
                    contentDescription = null,
                    tint = if (selected) ElectricLime else Color.White,
                    modifier = Modifier.size(36.dp)
                )
                // Checkmark bubble in top right
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(20.dp)
                        .background(if (selected) ElectricLime else CanvasBg, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    if (selected) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            tint = LimeText,
                            modifier = Modifier.size(13.dp)
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = item.name,
                fontSize = 11.5.sp,
                fontWeight = FontWeight.SemiBold,
                color = TextMain,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = item.sizeText, fontSize = 10.sp, color = TextSub)
                Text(
                    text = item.badge,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = ElectricLime,
                    modifier = Modifier
                        .background(LimeDim, RoundedCornerShape(4.dp))
                        .padding(horizontal = 4.dp, vertical = 1.dp)
                )
            }
        }
    }
}

@Composable
private fun ItemPickerRow(
    item: PickerItem,
    selected: Boolean,
    onToggle: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) CardBgHover else CardBg,
        border = BorderStroke(1.dp, if (selected) ElectricLime else CardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(IconBoxBg, RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = null,
                        tint = if (selected) ElectricLime else Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(
                        text = item.name,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextMain,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(text = item.sizeText, fontSize = 10.5.sp, color = TextSub)
                        Text(
                            text = item.badge,
                            fontSize = 8.5.sp,
                            fontWeight = FontWeight.Bold,
                            color = ElectricLime,
                            modifier = Modifier
                                .background(LimeDim, RoundedCornerShape(3.dp))
                                .padding(horizontal = 4.dp, vertical = 0.5.dp)
                        )
                    }
                }
            }
            Checkbox(
                checked = selected,
                onCheckedChange = { onToggle() },
                colors = CheckboxDefaults.colors(
                    checkedColor = ElectricLime,
                    checkmarkColor = LimeText,
                    uncheckedColor = TextDim
                )
            )
        }
    }
}
