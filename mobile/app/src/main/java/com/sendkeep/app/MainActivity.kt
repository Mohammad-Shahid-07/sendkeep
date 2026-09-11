package com.sendkeep.app

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.sendkeep.app.network.SendKeepClient
import com.sendkeep.app.network.SendKeepDiscovery
import com.sendkeep.app.service.ClipboardSyncService
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val client = SendKeepClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Start background UDP discovery listener
        lifecycleScope.launch {
            SendKeepDiscovery.startListening(this@MainActivity)
        }

        setContent {
            SendKeepDashboard(
                onSendFiles = { uris ->
                    val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
                    val targetIp = prefs.getString("last_laptop_ip", null)
                        ?: SendKeepDiscovery.discoveredPeers.value.firstOrNull()?.ip

                    if (targetIp != null) {
                        prefs.edit().putString("last_laptop_ip", targetIp).apply()
                        lifecycleScope.launch {
                            Toast.makeText(this@MainActivity, "Beaming ${uris.size} items...", Toast.LENGTH_SHORT).show()
                            val success = client.sendFiles(this@MainActivity, targetIp, 53317, uris)
                            if (success) {
                                Toast.makeText(this@MainActivity, "✓ Beamed to Laptop!", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(this@MainActivity, "✗ Transfer failed", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        Toast.makeText(this@MainActivity, "No laptop found on Wi-Fi", Toast.LENGTH_SHORT).show()
                    }
                },
                onSendText = { text ->
                    val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
                    val targetIp = prefs.getString("last_laptop_ip", null)
                        ?: SendKeepDiscovery.discoveredPeers.value.firstOrNull()?.ip

                    if (targetIp != null) {
                        lifecycleScope.launch {
                            val success = client.sendText(targetIp, 53317, text)
                            if (success) {
                                Toast.makeText(this@MainActivity, "✓ Note beamed to Laptop!", Toast.LENGTH_SHORT).show()
                            }
                        }
                    } else {
                        Toast.makeText(this@MainActivity, "No laptop found on Wi-Fi", Toast.LENGTH_SHORT).show()
                    }
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SendKeepDashboard(
    onSendFiles: (List<android.net.Uri>) -> Unit,
    onSendText: (String) -> Unit
) {
    val context = LocalContext.current
    val peers by SendKeepDiscovery.discoveredPeers.collectAsState()
    var clipboardSyncEnabled by remember { mutableStateOf(false) }
    var quickNoteText by remember { mutableStateOf("") }

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        if (uris.isNotEmpty()) {
            onSendFiles(uris)
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(
            background = Color(0xFF0F0F13),
            surface = Color(0xFF18181F),
            primary = Color(0xFF6366F1)
        )
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.Send,
                                contentDescription = null,
                                tint = Color(0xFF6366F1),
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(Modifier.width(10.dp))
                            Text("SendKeep", fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF0F0F13))
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Connection Status Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF18181F))
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .background(
                                    if (peers.isNotEmpty()) Color(0xFF10B981) else Color(0xFFF59E0B),
                                    shape = RoundedCornerShape(6.dp)
                                )
                        )
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                text = if (peers.isNotEmpty()) peers.first().alias else "Scanning local Wi-Fi...",
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 15.sp,
                                color = Color.White
                            )
                            Text(
                                text = if (peers.isNotEmpty()) "P2P Ready • ${peers.first().ip}" else "Make sure SendKeep is running on Laptop",
                                fontSize = 12.sp,
                                color = Color.Gray
                            )
                        }
                    }
                }

                // File Picker Action Button
                Button(
                    onClick = { filePicker.launch("*/*") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                ) {
                    Icon(Icons.Default.UploadFile, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Select Files or Photos to Beam", fontWeight = FontWeight.Medium)
                }

                // Quick Note Input
                OutlinedTextField(
                    value = quickNoteText,
                    onValueChange = { quickNoteText = it },
                    placeholder = { Text("Type quick note or paste link to beam...") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    trailingIcon = {
                        if (quickNoteText.isNotBlank()) {
                            IconButton(onClick = {
                                onSendText(quickNoteText)
                                quickNoteText = ""
                            }) {
                                Icon(Icons.Default.Send, contentDescription = "Send", tint = Color(0xFF6366F1))
                            }
                        }
                    }
                )

                // Background Clipboard Sync Toggle
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF18181F))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Background Clipboard Sync", fontWeight = FontWeight.Medium, color = Color.White)
                            Text(
                                "Automatically beam copied text to laptop shelf",
                                fontSize = 11.sp,
                                color = Color.Gray
                            )
                        }
                        Switch(
                            checked = clipboardSyncEnabled,
                            onCheckedChange = {
                                clipboardSyncEnabled = it
                                if (it) {
                                    ClipboardSyncService.start(context)
                                } else {
                                    ClipboardSyncService.stop(context)
                                }
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.weight(1f))

                // Tip card
                Text(
                    text = "Tip: You can share directly from any app (Gallery, Chrome, Twitter) via the Android Share sheet by tapping 'SendKeep Laptop'.",
                    fontSize = 11.sp,
                    color = Color.DarkGray,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
            }
        }
    }
}
