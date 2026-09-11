package com.sendkeep.app.service

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class SendKeepTileService : TileService() {
    private var isSyncActive = false

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        isSyncActive = !isSyncActive
        if (isSyncActive) {
            ClipboardSyncService.start(this)
        } else {
            ClipboardSyncService.stop(this)
        }
        updateTileState()
    }

    private fun updateTileState() {
        val tile = qsTile ?: return
        tile.state = if (isSyncActive) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = if (isSyncActive) "SendKeep: On" else "SendKeep: Off"
        tile.updateTile()
    }
}
