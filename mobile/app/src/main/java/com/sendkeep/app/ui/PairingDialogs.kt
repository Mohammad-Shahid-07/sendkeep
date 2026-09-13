package com.sendkeep.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.sendkeep.app.network.PairRequestDto
import com.sendkeep.app.ui.theme.*

@Composable
fun IncomingPairDialog(
    isOpen: Boolean,
    request: PairRequestDto?,
    peerIp: String,
    onAccept: () -> Unit,
    onDecline: () -> Unit
) {
    if (!isOpen || request == null) return

    Dialog(onDismissRequest = onDecline) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp)),
            color = CardBg,
            border = BorderStroke(1.dp, CardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .background(Color(0x1FB8FF24), RoundedCornerShape(12.dp))
                            .border(BorderStroke(1.dp, Color(0x33B8FF24)), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Computer,
                            contentDescription = null,
                            tint = ElectricLime,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    Column {
                        Text(
                            text = "Pairing Request",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextMain
                        )
                        Text(
                            text = "${request.alias} (${request.deviceModel ?: "PC"})",
                            fontSize = 12.sp,
                            color = ElectricLime
                        )
                        Text(
                            text = "$peerIp • Port ${request.port}",
                            fontSize = 10.sp,
                            color = TextDim,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                }

                Text(
                    text = "Do you want to trust this computer? Once paired, you can beam files directly between your phone and PC with zero clicks.",
                    fontSize = 12.sp,
                    color = TextSub,
                    lineHeight = 16.sp
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = onDecline,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, CardBorder)
                    ) {
                        Text("Decline", color = TextSub, fontSize = 12.sp)
                    }

                    Button(
                        onClick = onAccept,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ElectricLime, contentColor = LimeText)
                    ) {
                        Text("Accept & Trust", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun ManualIpPairDialog(
    isOpen: Boolean,
    localIp: String?,
    isConnecting: Boolean,
    onDismiss: () -> Unit,
    onConnect: (ip: String, port: Int, pin: String?) -> Unit
) {
    if (!isOpen) return

    var targetIp by remember { mutableStateOf("") }
    var targetPort by remember { mutableStateOf("53317") }
    var targetPin by remember { mutableStateOf("") }

    Dialog(onDismissRequest = { if (!isConnecting) onDismiss() }) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp)),
            color = CardBg,
            border = BorderStroke(1.dp, CardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .background(IconBoxBg, RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Wifi,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Column {
                        Text(
                            text = "Add PC via IP Address",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextMain
                        )
                        Text(
                            text = "Connect across complex Wi-Fi or AP isolation",
                            fontSize = 11.sp,
                            color = TextDim
                        )
                    }
                }

                if (!localIp.isNullOrBlank()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0x22FFFFFF), RoundedCornerShape(10.dp))
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("This Phone's IP:", fontSize = 11.sp, color = TextSub)
                        Text(localIp, fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = ElectricLime)
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("PC IP Address", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TextSub)

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BasicTextField(
                            value = targetIp,
                            onValueChange = { targetIp = it },
                            textStyle = TextStyle(
                                color = TextMain,
                                fontSize = 13.sp,
                                fontFamily = FontFamily.Monospace
                            ),
                            cursorBrush = SolidColor(ElectricLime),
                            singleLine = true,
                            modifier = Modifier
                                .weight(1f)
                                .height(42.dp)
                                .background(CanvasBg, RoundedCornerShape(10.dp))
                                .border(1.dp, CardBorder, RoundedCornerShape(10.dp))
                                .padding(horizontal = 10.dp, vertical = 11.dp),
                            decorationBox = { innerTextField ->
                                if (targetIp.isEmpty()) {
                                    Text(
                                        text = localIp?.let { "${it.substringBeforeLast(".")}.x" } ?: "192.168.1.5",
                                        color = TextDim,
                                        fontSize = 13.sp,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }
                                innerTextField()
                            }
                        )

                        BasicTextField(
                            value = targetPort,
                            onValueChange = { targetPort = it },
                            textStyle = TextStyle(
                                color = TextMain,
                                fontSize = 13.sp,
                                fontFamily = FontFamily.Monospace
                            ),
                            cursorBrush = SolidColor(ElectricLime),
                            singleLine = true,
                            modifier = Modifier
                                .width(70.dp)
                                .height(42.dp)
                                .background(CanvasBg, RoundedCornerShape(10.dp))
                                .border(1.dp, CardBorder, RoundedCornerShape(10.dp))
                                .padding(horizontal = 10.dp, vertical = 11.dp)
                        )
                    }

                    Text(
                        text = "Open SendKeep on your PC to see its IP in the top left pill.",
                        fontSize = 10.5.sp,
                        color = TextDim
                    )
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Security PIN (Optional)", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TextSub)
                    BasicTextField(
                        value = targetPin,
                        onValueChange = { targetPin = it.filter { c -> c.isDigit() }.take(4) },
                        textStyle = TextStyle(
                            color = ElectricLime,
                            fontSize = 13.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        ),
                        cursorBrush = SolidColor(ElectricLime),
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(42.dp)
                            .background(CanvasBg, RoundedCornerShape(10.dp))
                            .border(1.dp, CardBorder, RoundedCornerShape(10.dp))
                            .padding(horizontal = 10.dp, vertical = 11.dp),
                        decorationBox = { innerTextField ->
                            if (targetPin.isEmpty()) {
                                Text(
                                    text = "4-digit code if required by PC",
                                    color = TextDim,
                                    fontSize = 12.sp
                                )
                            }
                            innerTextField()
                        }
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        enabled = !isConnecting,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, CardBorder)
                    ) {
                        Text("Cancel", color = TextSub, fontSize = 12.sp)
                    }

                    Button(
                        onClick = {
                            val clean = targetIp.trim().replace("http://", "").replace("https://", "").substringBefore("/")
                            val portNum = targetPort.toIntOrNull() ?: 53317
                            if (clean.isNotBlank()) {
                                onConnect(clean, portNum, targetPin.trim().takeIf { it.isNotEmpty() })
                            }
                        },
                        enabled = targetIp.isNotBlank() && !isConnecting,
                        modifier = Modifier
                            .weight(1.3f)
                            .height(40.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ElectricLime, contentColor = LimeText)
                    ) {
                        if (isConnecting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = LimeText
                            )
                            Spacer(Modifier.width(6.dp))
                            Text("Pairing...", fontSize = 11.sp)
                        } else {
                            Text("Connect & Pair", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}
