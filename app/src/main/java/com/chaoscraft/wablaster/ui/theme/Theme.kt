package com.chaoscraft.wablaster.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val WhatsAppTeal = Color(0xFF075E54)
val WhatsAppGreen = Color(0xFF25D366)
val WhatsAppGreenLight = Color(0xFFDCF8C6)
val WhatsAppDarkGreen = Color(0xFF128C7E)
val WhatsAppLightBg = Color(0xFFECE5DD)

private val LightColorScheme = lightColorScheme(
    primary = WhatsAppTeal,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE8F5E9),
    onPrimaryContainer = WhatsAppTeal,
    secondary = WhatsAppDarkGreen,
    onSecondary = Color.White,
    secondaryContainer = WhatsAppGreenLight,
    onSecondaryContainer = WhatsAppDarkGreen,
    tertiary = Color(0xFF00A884),
    onTertiary = Color.White,
    background = Color(0xFFFAFAFA),
    onBackground = Color(0xFF1C1E21),
    surface = Color.White,
    onSurface = Color(0xFF1C1E21),
    surfaceVariant = Color(0xFFF0F0F0),
    onSurfaceVariant = Color(0xFF3C4043),
    error = Color(0xFFE53935),
    onError = Color.White,
    outline = Color(0xFFDADCE0),
    outlineVariant = Color(0xFFE8EAED)
)

private val DarkColorScheme = darkColorScheme(
    primary = WhatsAppGreen,
    onPrimary = Color(0xFF000000),
    primaryContainer = Color(0xFF001F1B),
    onPrimaryContainer = WhatsAppGreen,
    secondary = WhatsAppGreen,
    onSecondary = Color(0xFF000000),
    secondaryContainer = Color(0xFF002B24),
    onSecondaryContainer = WhatsAppGreen,
    tertiary = WhatsAppGreenLight,
    onTertiary = Color(0xFF000000),
    background = Color(0xFF000000),
    onBackground = Color(0xFFE9EDEF),
    surface = Color(0xFF000000),
    onSurface = Color(0xFFE9EDEF),
    surfaceVariant = Color(0xFF1A1A1A),
    onSurfaceVariant = Color(0xFFB0B8C1),
    error = Color(0xFFEF5350),
    onError = Color(0xFF000000),
    outline = Color(0xFF3D4B55),
    outlineVariant = Color(0xFF2A2A2A)
)

val WaShapes = Shapes(
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp)
)

val WaTypography = Typography(
    displayLarge = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 40.sp),
    headlineLarge = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, lineHeight = 32.sp),
    headlineSmall = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 28.sp),
    titleLarge = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 22.sp),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Normal, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 20.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, lineHeight = 16.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, lineHeight = 16.sp, letterSpacing = 0.5.sp)
)

@Composable
fun WaBlasterTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        shapes = WaShapes,
        typography = WaTypography,
        content = content
    )
}
