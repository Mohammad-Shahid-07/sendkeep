package com.sendkeep.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sendkeep.app.ui.theme.*

@Composable
fun RadarScanView(
    onAddByIp: () -> Unit,
    onRescan: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "radar")
    val sweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "sweep"
    )
    val ringPulse by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "pulse"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0x59000000), RoundedCornerShape(18.dp))
            .border(1.dp, Color(0x4DB8FF24), RoundedCornerShape(18.dp))
            .padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier.size(90.dp),
            contentAlignment = Alignment.Center
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                // Concentric static circles
                drawCircle(color = ElectricLime.copy(alpha = 0.15f), style = Stroke(1.dp.toPx()))
                drawCircle(color = ElectricLime.copy(alpha = 0.25f), radius = size.minDimension / 3, style = Stroke(1.dp.toPx()))
                // Dynamic pulsing wave
                drawCircle(
                    color = ElectricLime.copy(alpha = (1f - (ringPulse - 0.4f) / 0.75f).coerceIn(0f, 0.6f)),
                    radius = (size.minDimension / 2) * (ringPulse / 1.15f),
                    style = Stroke(1.5.dp.toPx())
                )
            }

            // Rotating sweep beam
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .rotate(sweepAngle)
                    .background(
                        brush = Brush.sweepGradient(
                            listOf(Color.Transparent, Color.Transparent, ElectricLime.copy(alpha = 0.35f))
                        ),
                        shape = CircleShape
                    )
            )

            // Center device node
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(Color(0xFF192219), CircleShape)
                    .border(1.5.dp, ElectricLime, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Wifi, contentDescription = null, tint = ElectricLime, modifier = Modifier.size(14.dp))
            }
        }

        Text(
            text = "Scanning for Nearby SendKeep Devices...",
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = "Local Wi-Fi Multicast • Port 53317",
            color = TextSub,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            Button(
                onClick = onAddByIp,
                colors = ButtonDefaults.buttonColors(containerColor = ElectricLime, contentColor = LimeText),
                shape = RoundedCornerShape(20.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                modifier = Modifier.height(30.dp)
            ) {
                Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(4.dp))
                Text("Add PC via IP", fontSize = 10.5.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onRescan,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                border = BorderStroke(1.dp, Color(0x33FFFFFF)),
                shape = RoundedCornerShape(20.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                modifier = Modifier.height(30.dp)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(13.dp), tint = TextSub)
                Spacer(Modifier.width(4.dp))
                Text("Rescan", fontSize = 10.5.sp, color = TextSub)
            }
        }
    }
}
