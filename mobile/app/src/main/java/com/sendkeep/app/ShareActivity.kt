package com.sendkeep.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.sendkeep.app.network.SendKeepClient
import com.sendkeep.app.network.SendKeepDiscovery
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

class ShareActivity : ComponentActivity() {
    private val client = SendKeepClient()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val intent = intent ?: run {
            finish()
            return
        }

        lifecycleScope.launch {
            handleShareIntent(intent)
        }
    }

    private suspend fun handleShareIntent(intent: Intent) {
        val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
        var targetIp = prefs.getString("last_laptop_ip", null)
        val port = prefs.getInt("last_laptop_port", 53317)

        // If no cached IP, try fast 1.5-second discovery
        if (targetIp == null) {
            withContext(Dispatchers.Main) {
                Toast.makeText(this@ShareActivity, "Discovering Laptop...", Toast.LENGTH_SHORT).show()
            }
            targetIp = withTimeoutOrNull(2000) {
                while (SendKeepDiscovery.discoveredPeers.value.isEmpty()) {
                    SendKeepDiscovery.broadcastAnnouncement(android.os.Build.MODEL)
                    kotlinx.coroutines.delay(200)
                }
                SendKeepDiscovery.discoveredPeers.value.firstOrNull()?.ip
            }
        }

        if (targetIp == null) {
            withContext(Dispatchers.Main) {
                Toast.makeText(this@ShareActivity, "Laptop not found on Wi-Fi", Toast.LENGTH_LONG).show()
                finish()
            }
            return
        }

        // Cache the IP for instant future transfers
        prefs.edit().putString("last_laptop_ip", targetIp).apply()

        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action) {
            if ("text/plain" == type) {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                if (!text.isNullOrBlank()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@ShareActivity, "Beaming note to Laptop...", Toast.LENGTH_SHORT).show()
                    }
                    val success = client.sendText(targetIp, port, text)
                    showResultAndFinish(success)
                    return
                }
            }

            val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
            if (uri != null) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@ShareActivity, "Beaming file to Laptop...", Toast.LENGTH_SHORT).show()
                }
                val success = client.sendFiles(this@ShareActivity, targetIp, port, listOf(uri))
                showResultAndFinish(success)
                return
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action) {
            val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            if (!uris.isNullOrEmpty()) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@ShareActivity, "Beaming ${uris.size} files to Laptop...", Toast.LENGTH_SHORT).show()
                }
                val success = client.sendFiles(this@ShareActivity, targetIp, port, uris)
                showResultAndFinish(success)
                return
            }
        }

        finish()
    }

    private suspend fun showResultAndFinish(success: Boolean) = withContext(Dispatchers.Main) {
        if (success) {
            Toast.makeText(this@ShareActivity, "✓ Sent to SendKeep Shelf!", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this@ShareActivity, "✗ Transfer failed", Toast.LENGTH_SHORT).show()
        }
        finish()
    }
}
