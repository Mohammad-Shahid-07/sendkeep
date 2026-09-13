package com.sendkeep.app.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.core.app.NotificationCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.sendkeep.app.MainActivity
import com.sendkeep.app.data.RecentItem
import com.sendkeep.app.network.SendKeepClient
import com.sendkeep.app.ui.EdgeShelfOverlay
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class EdgeShelfService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val client = SendKeepClient()

    private lateinit var windowManager: WindowManager
    private lateinit var rootOverlayView: FrameLayout
    private lateinit var handleTouchTarget: FrameLayout
    private lateinit var handleStrip: View
    private var composeShelfView: ComposeView? = null

    private var isShelfExpanded = false
    private val isOverlayVisibleState = mutableStateOf(false)
    private var isLeftEdge by mutableStateOf(false)
    private var handleY by mutableStateOf(0)
    private var isTransferringState by mutableStateOf(false)
    private var transferProgressState by mutableStateOf(0f)
    private var transferStatusState by mutableStateOf("")
    private var transferSpeedState by mutableStateOf("")

    private val lifecycleOwner = OverlayLifecycleOwner()

    override fun onCreate() {
        super.onCreate()
        lifecycleOwner.onCreate()
        startForeground(NOTIFICATION_ID, createNotification())

        val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
        isLeftEdge = prefs.getBoolean("edge_handle_is_left", false)
        val defaultY = resources.displayMetrics.heightPixels / 2 - dp(32f)
        handleY = prefs.getInt("edge_handle_y", defaultY)

        com.sendkeep.app.network.SendKeepServer.start(this)

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        setupOverlayViews()
    }

    private fun dp(value: Float): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()

    @SuppressLint("ClickableViewAccessibility")
    private fun setupOverlayViews() {
        rootOverlayView = FrameLayout(this).apply {
            setViewTreeLifecycleOwner(lifecycleOwner)
            setViewTreeViewModelStoreOwner(lifecycleOwner)
            setViewTreeSavedStateRegistryOwner(lifecycleOwner)
        }

        // 1. Compose Drawer Container
        composeShelfView = ComposeView(this).apply {
            setViewTreeLifecycleOwner(lifecycleOwner)
            setViewTreeViewModelStoreOwner(lifecycleOwner)
            setViewTreeSavedStateRegistryOwner(lifecycleOwner)
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)

            setContent {
                val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
                val targetIp = prefs.getString("last_laptop_ip", null)
                val port = prefs.getInt("last_laptop_port", 53317)
                val targetName = prefs.getString("last_laptop_name", null)

                EdgeShelfOverlay(
                    isVisible = isOverlayVisibleState.value,
                    isLeftEdge = isLeftEdge,
                    targetDeviceName = targetName,
                    isConnected = targetIp != null && targetName != null,
                    isTransferring = isTransferringState,
                    transferProgress = transferProgressState,
                    transferStatus = transferStatusState,
                    transferSpeed = transferSpeedState,
                    onCancelTransfer = {
                        targetIp?.let { ip ->
                            SendKeepClient.cancelFlags.keys().toList().forEach { sid ->
                                SendKeepClient.cancelTransfer(sid, ip, port)
                            }
                        }
                        isTransferringState = false
                        transferStatusState = "Cancelled"
                        Toast.makeText(this@EdgeShelfService, "Transfer cancelled", Toast.LENGTH_SHORT).show()
                    },
                    onSendRecentItem = { item ->
                        targetIp?.let { ip -> sendSingleItem(ip, port, item) }
                    },
                    onSendRecentPhotos = { photos ->
                        targetIp?.let { ip -> sendMultipleItems(ip, port, photos.map { it.uri }) }
                    },
                    onSendClipboardText = { text ->
                        targetIp?.let { ip ->
                            serviceScope.launch { client.sendText(ip, port, text) }
                            Toast.makeText(this@EdgeShelfService, "⚡ Sent note to PC", Toast.LENGTH_SHORT).show()
                            collapseShelf()
                        }
                    },
                    onPickFiles = { openMainActivityForPicker() },
                    onPickFolder = { openMainActivityForPicker() },
                    onClose = { collapseShelf() }
                )
            }
        }

        val shelfParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        rootOverlayView.addView(composeShelfView, shelfParams)

        // 2. Sleek 4dp Bezel Tick Handle
        handleStrip = View(this)

        // Invisible touch area (18dp) around 4dp visible strip for easy touch & drag
        handleTouchTarget = FrameLayout(this).apply {
            val stripParams = FrameLayout.LayoutParams(dp(4f), dp(54f)).apply {
                gravity = Gravity.CENTER_VERTICAL or (if (isLeftEdge) Gravity.START else Gravity.END)
            }
            addView(handleStrip, stripParams)
        }

        val handleParams = FrameLayout.LayoutParams(
            dp(18f),
            dp(64f)
        ).apply {
            gravity = Gravity.CENTER_VERTICAL or (if (isLeftEdge) Gravity.START else Gravity.END)
        }
        rootOverlayView.addView(handleTouchTarget, handleParams)

        updateHandleAppearance(isLeftEdge)

        handleTouchTarget.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
            updateSystemGestureExclusion()
        }

        // Touch listener: Distinguishes inward swipe to open vs dragging to reposition
        var downRawX = 0f
        var downRawY = 0f
        var downWindowY = 0
        var isDragging = false
        var hasSwipedOpen = false

        handleTouchTarget.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    handleTouchTarget.parent?.requestDisallowInterceptTouchEvent(true)
                    rootOverlayView.parent?.requestDisallowInterceptTouchEvent(true)
                    downRawX = event.rawX
                    downRawY = event.rawY
                    downWindowY = handleY
                    isDragging = false
                    hasSwipedOpen = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    if (hasSwipedOpen) return@setOnTouchListener true

                    val dx = event.rawX - downRawX
                    val dy = event.rawY - downRawY
                    val absDx = kotlin.math.abs(dx)
                    val absDy = kotlin.math.abs(dy)

                    // 1. Check for inward swipe in opposite direction of the docked edge:
                    // If docked on Right: inward direction is left (dx < -18dp)
                    // If docked on Left: inward direction is right (dx > 18dp)
                    val isInwardSwipe = if (isLeftEdge) {
                        dx > dp(18f) && absDx > absDy * 0.9f
                    } else {
                        dx < -dp(18f) && absDx > absDy * 0.9f
                    }

                    if (isInwardSwipe && !isDragging) {
                        hasSwipedOpen = true
                        expandShelf()
                        return@setOnTouchListener true
                    }

                    // 2. Otherwise check for dragging up/down or across the screen
                    if (absDy > dp(8f) || isDragging || (if (isLeftEdge) dx < -dp(4f) else dx > dp(4f))) {
                        isDragging = true
                        val screenHeight = resources.displayMetrics.heightPixels
                        val newY = (downWindowY + dy).toInt().coerceIn(dp(40f), screenHeight - dp(120f))
                        handleY = newY

                        // Check if dragged across the screen to switch sides
                        val screenWidth = resources.displayMetrics.widthPixels
                        val prefersLeft = event.rawX < screenWidth * 0.5f
                        if (prefersLeft != isLeftEdge) {
                            isLeftEdge = prefersLeft
                            updateHandleAppearance(prefersLeft)
                        }

                        val params = rootOverlayView.layoutParams as? WindowManager.LayoutParams
                            ?: createCollapsedWindowParams()
                        params.gravity = Gravity.TOP or (if (isLeftEdge) Gravity.START else Gravity.END)
                        params.x = 0
                        params.y = handleY
                        windowManager.updateViewLayout(rootOverlayView, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isDragging) {
                        val screenWidth = resources.displayMetrics.widthPixels
                        val finalIsLeft = event.rawX < screenWidth * 0.5f
                        isLeftEdge = finalIsLeft
                        updateHandleAppearance(finalIsLeft)

                        getSharedPreferences("sendkeep_prefs", MODE_PRIVATE).edit()
                            .putBoolean("edge_handle_is_left", finalIsLeft)
                            .putInt("edge_handle_y", handleY)
                            .apply()

                        val params = rootOverlayView.layoutParams as? WindowManager.LayoutParams
                            ?: createCollapsedWindowParams()
                        params.gravity = Gravity.TOP or (if (isLeftEdge) Gravity.START else Gravity.END)
                        params.x = 0
                        params.y = handleY
                        windowManager.updateViewLayout(rootOverlayView, params)
                        vibrateTick()
                    }
                    isDragging = false
                    true
                }
                else -> false
            }
        }

        // Drag & Drop Listener for Drag-to-Bezel
        handleTouchTarget.setOnDragListener { _, dragEvent ->
            when (dragEvent.action) {
                DragEvent.ACTION_DRAG_STARTED -> {
                    expandDragCatcher()
                    true
                }
                DragEvent.ACTION_DRAG_ENTERED -> {
                    highlightDragCatcher(true)
                    vibrateTick()
                    true
                }
                DragEvent.ACTION_DRAG_EXITED -> {
                    highlightDragCatcher(false)
                    true
                }
                DragEvent.ACTION_DROP -> {
                    handleDroppedFiles(dragEvent)
                    collapseDragCatcher()
                    true
                }
                DragEvent.ACTION_DRAG_ENDED -> {
                    collapseDragCatcher()
                    true
                }
                else -> true
            }
        }

        val windowParams = createCollapsedWindowParams()
        windowManager.addView(rootOverlayView, windowParams)
    }

    private fun updateHandleAppearance(isLeft: Boolean) {
        val r = dp(3f).toFloat()
        val bg = GradientDrawable().apply {
            setColor(AndroidColor.parseColor("#B8FF24"))
            cornerRadii = if (isLeft) {
                floatArrayOf(0f, 0f, r, r, r, r, 0f, 0f)
            } else {
                floatArrayOf(r, r, 0f, 0f, 0f, 0f, r, r)
            }
        }
        handleStrip.background = bg

        val stripParams = (handleStrip.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(dp(4f), dp(54f))
        stripParams.gravity = Gravity.CENTER_VERTICAL or (if (isLeft) Gravity.START else Gravity.END)
        handleStrip.layoutParams = stripParams

        val targetParams = (handleTouchTarget.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(dp(18f), dp(64f))
        targetParams.gravity = Gravity.CENTER_VERTICAL or (if (isLeft) Gravity.START else Gravity.END)
        handleTouchTarget.layoutParams = targetParams

        updateSystemGestureExclusion()
    }

    private fun updateSystemGestureExclusion() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            handleTouchTarget.post {
                val w = handleTouchTarget.width.takeIf { it > 0 } ?: dp(18f)
                val h = handleTouchTarget.height.takeIf { it > 0 } ?: dp(64f)
                val rect = Rect(0, 0, w, h)
                handleTouchTarget.systemGestureExclusionRects = listOf(rect)
            }
            rootOverlayView.post {
                val w = rootOverlayView.width.takeIf { it > 0 } ?: dp(18f)
                val h = rootOverlayView.height.takeIf { it > 0 } ?: dp(64f)
                val rect = Rect(0, 0, w, h)
                rootOverlayView.systemGestureExclusionRects = listOf(rect)
            }
        }
    }

    private fun createCollapsedWindowParams(): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or (if (isLeftEdge) Gravity.START else Gravity.END)
            x = 0
            y = handleY
        }
    }

    private fun createExpandedWindowParams(): WindowManager.LayoutParams {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }
    }

    private fun expandDragCatcher() {
        val r = dp(4f).toFloat()
        handleStrip.background = GradientDrawable().apply {
            setColor(AndroidColor.parseColor("#B8FF24"))
            cornerRadii = if (isLeftEdge) {
                floatArrayOf(0f, 0f, r, r, r, r, 0f, 0f)
            } else {
                floatArrayOf(r, r, 0f, 0f, 0f, 0f, r, r)
            }
        }
        val p = handleStrip.layoutParams as FrameLayout.LayoutParams
        p.width = dp(8f)
        handleStrip.layoutParams = p
        vibrateTick()
    }

    private fun highlightDragCatcher(isInside: Boolean) {
        val r = dp(4f).toFloat()
        handleStrip.background = GradientDrawable().apply {
            if (isInside) {
                setColor(AndroidColor.parseColor("#E6B8FF24"))
            } else {
                setColor(AndroidColor.parseColor("#B8FF24"))
            }
            cornerRadii = if (isLeftEdge) {
                floatArrayOf(0f, 0f, r, r, r, r, 0f, 0f)
            } else {
                floatArrayOf(r, r, 0f, 0f, 0f, 0f, r, r)
            }
        }
    }

    private fun collapseDragCatcher() {
        val r = dp(3f).toFloat()
        handleStrip.background = GradientDrawable().apply {
            setColor(AndroidColor.parseColor("#B8FF24"))
            cornerRadii = if (isLeftEdge) {
                floatArrayOf(0f, 0f, r, r, r, r, 0f, 0f)
            } else {
                floatArrayOf(r, r, 0f, 0f, 0f, 0f, r, r)
            }
        }
        val p = handleStrip.layoutParams as FrameLayout.LayoutParams
        p.width = dp(4f)
        handleStrip.layoutParams = p
    }

    private fun handleDroppedFiles(dragEvent: DragEvent) {
        val clipData = dragEvent.clipData ?: return
        val uris = mutableListOf<Uri>()
        var textContent: String? = null

        for (i in 0 until clipData.itemCount) {
            val item = clipData.getItemAt(i)
            item.uri?.let { uris.add(it) }
            if (item.text != null && textContent == null) {
                textContent = item.text.toString()
            }
        }

        vibrateDoublePulse()

        val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
        val targetIp = prefs.getString("last_laptop_ip", null)
        val port = prefs.getInt("last_laptop_port", 53317)

        if (targetIp == null) {
            Toast.makeText(this, "No connected PC found. Open SendKeep to connect.", Toast.LENGTH_SHORT).show()
            return
        }

        if (uris.isNotEmpty()) {
            sendMultipleItems(targetIp, port, uris)
        } else if (!textContent.isNullOrBlank()) {
            Toast.makeText(this, "⚡ Sending note to PC...", Toast.LENGTH_SHORT).show()
            serviceScope.launch {
                client.sendText(targetIp, port, textContent)
            }
        }
    }

    // Expand Edge Shelf with smooth animation
    private fun expandShelf() {
        if (isShelfExpanded) return
        isShelfExpanded = true

        handleTouchTarget.visibility = View.GONE
        windowManager.updateViewLayout(rootOverlayView, createExpandedWindowParams())
        isOverlayVisibleState.value = true
        vibrateTick()
    }

    // Collapse Edge Shelf with smooth exit transition
    private fun collapseShelf() {
        if (!isShelfExpanded) return
        isOverlayVisibleState.value = false

        serviceScope.launch(Dispatchers.Main) {
            delay(220) // Allow smooth Compose slideOut to finish
            if (!isOverlayVisibleState.value) {
                isShelfExpanded = false
                handleTouchTarget.visibility = View.VISIBLE
                windowManager.updateViewLayout(rootOverlayView, createCollapsedWindowParams())
                updateSystemGestureExclusion()
            }
        }
    }

    private fun sendSingleItem(targetIp: String, port: Int, item: RecentItem) {
        sendMultipleItems(targetIp, port, listOf(item.uri))
    }

    private fun sendMultipleItems(targetIp: String, port: Int, uris: List<Uri>) {
        Toast.makeText(this, "⚡ Beaming ${uris.size} file(s) to PC...", Toast.LENGTH_SHORT).show()
        val startTime = System.currentTimeMillis()

        serviceScope.launch {
            isTransferringState = true
            transferProgressState = 0.05f
            transferStatusState = "Preparing ${uris.size} file(s)..."
            transferSpeedState = "Calculating..."

            val success = client.sendFiles(this@EdgeShelfService, targetIp, port, uris) { cur, tot, name ->
                transferProgressState = cur.toFloat() / tot.toFloat()
                transferStatusState = "$cur/$tot: $name"
                val elapsedSec = maxOf((System.currentTimeMillis() - startTime) / 1000.0, 0.5)
                transferSpeedState = String.format("%.1f MB/s", (cur * 4.2) / elapsedSec)
            }

            isTransferringState = false
            launch(Dispatchers.Main) {
                if (success) {
                    val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
                    val targetName = prefs.getString("last_laptop_name", "PC") ?: "PC"
                    appendOutgoingToHistory(uris, targetName)
                    Toast.makeText(this@EdgeShelfService, "✅ Beamed to PC successfully", Toast.LENGTH_SHORT).show()
                    collapseShelf()
                } else {
                    Toast.makeText(this@EdgeShelfService, "❌ Transfer failed", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun appendOutgoingToHistory(uris: List<Uri>, targetName: String) {
        try {
            val prefs = getSharedPreferences("sendkeep_prefs", MODE_PRIVATE)
            val json = prefs.getString("shelf_history_json", null)
            val gson = com.google.gson.Gson()
            val list = if (!json.isNullOrBlank()) {
                val type = object : com.google.gson.reflect.TypeToken<MutableList<com.sendkeep.app.ShelfStreamItem>>() {}.type
                gson.fromJson<MutableList<com.sendkeep.app.ShelfStreamItem>>(json, type) ?: mutableListOf()
            } else {
                mutableListOf()
            }

            uris.forEach { u ->
                val name = u.lastPathSegment?.substringAfterLast('/') ?: "Sent Item"
                val isApk = name.endsWith(".apk", true)
                val isPhoto = name.endsWith(".jpg", true) || name.endsWith(".png", true)
                val isZip = name.endsWith(".zip", true)
                val cat = when {
                    isApk -> "APKs"
                    isPhoto -> "Photos"
                    isZip -> "Files"
                    else -> "Files"
                }
                val iconName = when {
                    isApk -> "apk"
                    isPhoto -> "photo"
                    isZip -> "zip"
                    else -> "file"
                }
                val filePath = if (u.scheme == "file") u.path else null
                list.add(
                    0,
                    com.sendkeep.app.ShelfStreamItem(
                        id = System.currentTimeMillis().toString(),
                        name = name,
                        subtitle = "Sent to $targetName",
                        size = "Beam OK",
                        isSent = true,
                        category = cat,
                        iconName = iconName,
                        uriString = u.toString(),
                        localFilePath = filePath
                    )
                )
            }
            prefs.edit().putString("shelf_history_json", gson.toJson(list.take(40))).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun openMainActivityForPicker() {
        collapseShelf()
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("action", "pick_files")
        }
        startActivity(intent)
    }

    private fun vibrateTick() {
        val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(20)
        }
    }

    private fun vibrateDoublePulse() {
        val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 25, 45, 25), -1))
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(50)
        }
    }

    private fun createNotification(): Notification {
        val channelId = "sendkeep_edge_shelf_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "SendKeep Edge Shelf",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Active Edge Shelf & Drag-to-Send overlay"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("SendKeep Edge Shelf Ready")
            .setContentText("Swipe edge or drag files to send to PC")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    override fun onDestroy() {
        lifecycleOwner.onDestroy()
        com.sendkeep.app.network.SendKeepServer.stop()
        if (::rootOverlayView.isInitialized) {
            try {
                windowManager.removeView(rootOverlayView)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val NOTIFICATION_ID = 2002

        fun start(context: Context) {
            val intent = Intent(context, EdgeShelfService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, EdgeShelfService::class.java))
        }
    }
}

class OverlayLifecycleOwner : LifecycleOwner, ViewModelStoreOwner, SavedStateRegistryOwner {
    private val lifecycleRegistry = LifecycleRegistry(this)
    private val store = ViewModelStore()
    private val savedStateController = SavedStateRegistryController.create(this)

    fun onCreate() {
        savedStateController.performRestore(Bundle())
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
    }

    fun onDestroy() {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        store.clear()
    }

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val viewModelStore: ViewModelStore get() = store
    override val savedStateRegistry: SavedStateRegistry get() = savedStateController.savedStateRegistry
}
