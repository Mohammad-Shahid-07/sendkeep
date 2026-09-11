package com.sendkeep.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.sendkeep.app.network.SendKeepClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ClipboardSyncService : Service() {
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = SendKeepClient()
    private var lastCopiedText: String? = null

    private val clipListener = ClipboardManager.OnPrimaryClipChangedListener {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return@OnPrimaryClipChangedListener
        val clip = clipboard.primaryClip ?: return@OnPrimaryClipChangedListener
        if (clip.itemCount > 0) {
            val text = clip.getItemAt(0).text?.toString() ?: return@OnPrimaryClipChangedListener
            if (text != lastCopiedText && text.isNotBlank()) {
                lastCopiedText = text
                syncTextToLaptop(text)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFICATION_ID, createNotification())
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.addPrimaryClipChangedListener(clipListener)
    }

    private fun syncTextToLaptop(text: String) {
        val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
        val targetIp = prefs.getString("last_laptop_ip", null) ?: return
        val port = prefs.getInt("last_laptop_port", 53317)

        serviceScope.launch {
            client.sendText(targetIp, port, text)
        }
    }

    private fun createNotification(): Notification {
        val channelId = "sendkeep_clipboard_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "SendKeep Clipboard Sync",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Syncs copied text automatically with your laptop"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("SendKeep Active")
            .setContentText("Clipboard sync active with your Laptop")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    override fun onDestroy() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        clipboard?.removePrimaryClipChangedListener(clipListener)
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            val intent = Intent(context, ClipboardSyncService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ClipboardSyncService::class.java))
        }
    }
}
