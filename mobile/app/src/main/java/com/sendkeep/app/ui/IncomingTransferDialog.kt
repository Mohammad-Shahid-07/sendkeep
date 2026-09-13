package com.sendkeep.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sendkeep.app.ui.theme.*

import com.sendkeep.app.network.FileMetadataDto
import java.util.Locale

@Composable
fun IncomingTransferDialog(
    isOpen: Boolean,
    senderName: String = "Nearby Device",
    senderMeta: String = "Wi-Fi • Port 53317",
    files: List<FileMetadataDto> = emptyList(),
    onAccept: (Boolean) -> Unit,
    onDecline: () -> Unit
) {
    if (!isOpen) return

    var alwaysTrust by remember { mutableStateOf(true) }

    val totalBytes = files.sumOf { it.size }
    val totalSizeStr = if (totalBytes > 0) {
        String.format(Locale.US, "%.1f MB Total", totalBytes / (1024.0 * 1024.0))
    } else {
        "Incoming Payload"
    }
    val countText = if (files.isNotEmpty()) {
        "${files.size} File${if (files.size > 1) "s" else ""} to Download"
    } else {
        "Incoming Beam"
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.75f))
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() }
            ) { onDecline() },
        contentAlignment = Alignment.BottomCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color(0xFF111611))
                .border(BorderStroke(1.dp, Color(0x59B8FF24)), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) { }
                .padding(horizontal = 18.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Top Badge
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier
                    .background(LimeDim, RoundedCornerShape(20.dp))
                    .border(BorderStroke(1.dp, Color(0x4DB8FF24)), RoundedCornerShape(20.dp))
                    .padding(horizontal = 9.dp, vertical = 3.dp)
            ) {
                Box(modifier = Modifier.size(6.dp).background(ElectricLime, CircleShape))
                Text(
                    text = "INCOMING BEAM REQUEST",
                    color = ElectricLime,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.5.sp
                )
            }

            // Sender Box
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x0DFFFFFF), RoundedCornerShape(12.dp))
                    .border(BorderStroke(1.dp, Color(0x12FFFFFF)), RoundedCornerShape(12.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(Color(0xFF182218), RoundedCornerShape(9.dp))
                        .border(BorderStroke(1.dp, Color(0x40B8FF24)), RoundedCornerShape(9.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Laptop, contentDescription = null, tint = ElectricLime, modifier = Modifier.size(20.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(senderName, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text(senderMeta, color = TextSub, fontSize = 10.5.sp)
                }
            }

            // Payload items summary
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0x59000000), RoundedCornerShape(12.dp))
                    .border(BorderStroke(1.dp, Color(0x10FFFFFF)), RoundedCornerShape(12.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(countText, color = TextSub, fontSize = 11.sp)
                    Text(totalSizeStr, color = ElectricLime, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }

                HorizontalDivider(color = Color(0x1AFFFFFF), thickness = 0.8.dp)

                if (files.isNotEmpty()) {
                    files.take(4).forEach { meta ->
                        val ext = meta.fileName.substringAfterLast('.', "FILE").uppercase(Locale.ROOT)
                        val sizeStr = String.format(Locale.US, "%.1f MB", meta.size / (1024.0 * 1024.0))
                        PayloadRow(ext.take(4), meta.fileName, sizeStr)
                    }
                    if (files.size > 4) {
                        Text(
                            text = "+ ${files.size - 4} more files",
                            color = TextDim,
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                } else {
                    PayloadRow("FILE", "Incoming payload", "Pending")
                }
            }

            // Always trust device checkbox
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { alwaysTrust = !alwaysTrust }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Checkbox(
                    checked = alwaysTrust,
                    onCheckedChange = { alwaysTrust = it },
                    colors = CheckboxDefaults.colors(
                        checkedColor = ElectricLime,
                        checkmarkColor = LimeText,
                        uncheckedColor = Color(0x4DFFFFFF)
                    ),
                    modifier = Modifier.size(20.dp)
                )
                Column {
                    Text("Always trust $senderName", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    Text("Auto-accept future beams into /Downloads/SendKeep/", color = TextSub, fontSize = 9.5.sp)
                }
            }

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedButton(
                    onClick = onDecline,
                    modifier = Modifier.weight(1f).height(44.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = DangerRed),
                    border = BorderStroke(1.dp, DangerRed.copy(alpha = 0.35f)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Decline", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }

                Button(
                    onClick = { onAccept(alwaysTrust) },
                    modifier = Modifier.weight(2f).height(44.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = ElectricLime, contentColor = LimeText),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Accept & Receive", fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun PayloadRow(type: String, name: String, size: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier
                .background(Color(0x1AFFFFFF), RoundedCornerShape(4.dp))
                .padding(horizontal = 5.dp, vertical = 1.dp)
        ) {
            Text(type, color = TextSub, fontSize = 8.sp, fontWeight = FontWeight.ExtraBold, fontFamily = FontFamily.Monospace)
        }
        Text(name, color = Color.White, fontSize = 10.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Text(size, color = TextSub, fontSize = 9.5.sp, fontFamily = FontFamily.Monospace)
    }
}
