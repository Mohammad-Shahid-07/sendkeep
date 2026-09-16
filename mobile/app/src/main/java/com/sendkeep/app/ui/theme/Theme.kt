package com.sendkeep.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = ElectricViolet,
    onPrimary = AccentText,
    primaryContainer = VioletDim,
    onPrimaryContainer = ElectricViolet,
    background = CanvasBg,
    onBackground = TextMain,
    surface = SurfaceDark,
    onSurface = TextMain,
    surfaceVariant = CardBg,
    onSurfaceVariant = TextSub
)

@Composable
fun SendKeepTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
