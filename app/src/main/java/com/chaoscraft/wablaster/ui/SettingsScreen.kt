package com.chaoscraft.wablaster.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.AppValidator
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(
    senderConfig: SenderConfig,
    aiConfig: AiConfig,
    validator: AppValidator,
    paymentManager: com.chaoscraft.wablaster.util.PaymentManager? = null
) {
    val context = LocalContext.current
    var showSenderPicker by remember { mutableStateOf(false) }
    var showLandingPage by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Profile / License card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = MaterialTheme.shapes.extraLarge,
                    color = if (paymentManager?.isUnlocked == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (paymentManager?.isUnlocked == true) Icons.Default.CheckCircle else Icons.Default.Lock,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("WaBro", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        if (paymentManager?.isUnlocked == true) "Licensed ✅" else "Free - License Required",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (paymentManager?.isUnlocked == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                    if (paymentManager != null) {
                        val dateFormat = remember { SimpleDateFormat("dd MMM yyyy", Locale.getDefault()) }
                        Text(
                            "Installed: ${dateFormat.format(Date(paymentManager.installedAt))}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // Sender Account
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val pkg = senderConfig.selectedPackage
                val number = senderConfig.senderNumber
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        val label = when {
                            pkg.contains("w4b") -> "WhatsApp Business"
                            pkg.isNotEmpty() -> "WhatsApp"
                            else -> "Not set"
                        }
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                        if (number.isNotEmpty()) Text(number, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    FilledTonalButton(onClick = { showSenderPicker = true }) {
                        Icon(Icons.Default.SwapHoriz, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Change")
                    }
                }
            }
        }

        if (showSenderPicker) {
            SenderPickerDialog(
                currentPackage = senderConfig.selectedPackage,
                currentNumber = senderConfig.senderNumber,
                currentMultiAccount = senderConfig.multiAccount,
                onSave = { pkg, number, multiAccount ->
                    senderConfig.selectedPackage = pkg
                    senderConfig.senderNumber = number
                    senderConfig.multiAccount = multiAccount
                },
                onDismiss = { showSenderPicker = false }
            )
        }

        // Permissions
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Permissions", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

                val checks = listOf(
                    Triple("Accessibility Service", validator.isAccessibilityServiceEnabled()) {
                        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    },
                    Triple("Battery Optimization", validator.isBatteryOptimizationIgnored()) {
                        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                            data = Uri.parse("package:${context.packageName}")
                        }
                        context.startActivity(intent)
                    },
                    Triple("Draw Over Other Apps", validator.canDrawOverlays()) {
                        context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                            data = Uri.parse("package:${context.packageName}")
                        })
                    }
                )

                checks.forEachIndexed { index, (label, enabled, action) ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                if (enabled) Icons.Default.CheckCircle else Icons.Default.Cancel,
                                contentDescription = null,
                                tint = if (enabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(label, style = MaterialTheme.typography.bodyLarge)
                        }
                        if (!enabled) {
                            TextButton(onClick = action) { Text("Fix") }
                        }
                    }
                    if (index < checks.lastIndex) {
                        androidx.compose.material3.Divider(modifier = Modifier.padding(vertical = 4.dp))
                    }
                }
            }
        }

        // AI Settings
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("AI Features", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                OutlinedTextField(
                    value = aiConfig.geminiApiKey,
                    onValueChange = { aiConfig.geminiApiKey = it },
                    label = { Text("Gemini API Key") },
                    placeholder = { Text("AIza...") },
                    leadingIcon = { Icon(Icons.Default.Key, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                if (aiConfig.hasValidKey) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(4.dp))
                        Text("Key looks valid", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
                Text(
                    "Get a free API key at aistudio.google.com. AI skills auto-enable when a key is set.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // About
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("About", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                Text("WaBro v1.0.0", style = MaterialTheme.typography.bodyMedium)
                Text(
                    "Broadcast WhatsApp messages with human-like timing",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { showLandingPage = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Language, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Landing Page")
                }
            }
        }
    }

    if (showLandingPage) {
        LandingPageDialog(onDismiss = { showLandingPage = false })
    }
}

@Composable
private fun LandingPageDialog(onDismiss: () -> Unit) {
    var loaded by remember { mutableStateOf(false) }
    Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("WaBro Landing Page", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp))
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }
                AndroidView(
                    factory = { ctx ->
                        WebView(ctx).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            webViewClient = object : WebViewClient() {
                                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                    loaded = true
                                }
                            }
                            loadUrl("file:///android_asset/landing.html")
                        }
                    },
                    modifier = Modifier.fillMaxWidth().weight(1f)
                )
                if (!loaded) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}
