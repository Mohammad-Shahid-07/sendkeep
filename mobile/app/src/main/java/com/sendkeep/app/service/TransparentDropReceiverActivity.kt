package com.sendkeep.app.service

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.DragEvent
import android.widget.Toast
import com.sendkeep.app.network.SendKeepClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class TransparentDropReceiverActivity : Activity() {

    private val client = SendKeepClient()
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        overridePendingTransition(0, 0)

        val uris = intent.getParcelableArrayListExtra<Uri>(EXTRA_URIS)
        val text = intent.getStringExtra(EXTRA_TEXT)

        val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
        val targetIp = prefs.getString("last_laptop_ip", null)
        val port = prefs.getInt("last_laptop_port", 53317)

        if (targetIp == null) {
            Toast.makeText(this, "No connected PC found. Open SendKeep to connect.", Toast.LENGTH_SHORT).show()
            finish()
            overridePendingTransition(0, 0)
            return
        }

        if (!uris.isNullOrEmpty()) {
            Toast.makeText(this, "⚡ Sending ${uris.size} file(s) to PC...", Toast.LENGTH_SHORT).show()
            scope.launch {
                val success = client.sendFiles(this@TransparentDropReceiverActivity, targetIp, port, uris)
                launch(Dispatchers.Main) {
                    if (success) {
                        Toast.makeText(this@TransparentDropReceiverActivity, "✅ Sent to PC", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@TransparentDropReceiverActivity, "❌ Failed to send", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } else if (!text.isNullOrBlank()) {
            Toast.makeText(this, "⚡ Sending text to PC...", Toast.LENGTH_SHORT).show()
            scope.launch {
                client.sendText(targetIp, port, text)
            }
        }

        finish()
        overridePendingTransition(0, 0)
    }

    companion object {
        const val EXTRA_URIS = "extra_uris"
        const val EXTRA_TEXT = "extra_text"
    }
}
