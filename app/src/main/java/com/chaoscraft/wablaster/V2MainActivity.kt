package com.chaoscraft.wablaster

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.chaoscraft.wablaster.ui.AuthScreen
import com.chaoscraft.wablaster.ui.MainNavigation
import com.chaoscraft.wablaster.ui.PaywallScreen
import com.chaoscraft.wablaster.ui.theme.WaBroV2Theme
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.AppUpdateManager
import com.chaoscraft.wablaster.util.AppVersionInfo
import com.chaoscraft.wablaster.util.AuthManager
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.UpdateResult
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class V2MainActivity : ComponentActivity() {

    @Inject lateinit var paymentManager: PaymentManager
    @Inject lateinit var senderConfig: SenderConfig
    @Inject lateinit var aiConfig: AiConfig
    @Inject lateinit var authManager: AuthManager
    @Inject lateinit var appUpdateManager: AppUpdateManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.chaoscraft.wablaster.service.DashboardSyncManager.start(this)

        if (paymentManager.installedAt == 0L) {
            paymentManager.installedAt = System.currentTimeMillis()
        }

        setContent {
            var authenticated by mutableStateOf(authManager.isLoggedIn())
            var unlocked by mutableStateOf(paymentManager.isUnlocked)
            var updateInfo by mutableStateOf<AppVersionInfo?>(null)
            var updateDismissed by mutableStateOf(false)
            var downloading by mutableStateOf(false)
            var downloadError by mutableStateOf<String?>(null)
            val scope = rememberCoroutineScope()

            LaunchedEffect(authenticated) {
                if (authenticated) {
                    updateInfo = appUpdateManager.checkForUpdate()
                }
            }

            WaBroV2Theme {
                Surface(
                    modifier = androidx.compose.ui.Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    if (!authenticated) {
                        AuthScreen(
                            authManager = authManager,
                            onAuthenticated = {
                                authenticated = true
                            }
                        )
                    } else if (!unlocked) {
                        PaywallScreen(
                            onUnlocked = {
                                paymentManager.unlock()
                                unlocked = true
                            }
                        )
                    } else {
                        MainNavigation(
                            senderConfig = senderConfig,
                            aiConfig = aiConfig,
                            paymentManager = paymentManager
                        )
                    }
                }

                val version = updateInfo
                if (version != null && appUpdateManager.needsUpdate(version) && !updateDismissed) {
                    AlertDialog(
                        onDismissRequest = {
                            if (!version.forceUpdate && !downloading) updateDismissed = true
                        },
                        title = {
                            Text(
                                if (downloading) "Downloading Update..." else "Update Available",
                                fontWeight = FontWeight.Bold
                            )
                        },
                        text = {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                if (downloading) {
                                    Spacer(Modifier.height(16.dp))
                                    CircularProgressIndicator()
                                    Spacer(Modifier.height(12.dp))
                                    Text(
                                        "Downloading WaBro ${version.versionName}...",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                } else if (downloadError != null) {
                                    Text(
                                        downloadError!!,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                } else {
                                    Text("WaBro ${version.versionName} is available.")
                                    if (!version.releaseNotes.isNullOrBlank()) {
                                        Spacer(Modifier.height(8.dp))
                                        Text(
                                            version.releaseNotes,
                                            style = MaterialTheme.typography.bodySmall
                                        )
                                    }
                                }
                            }
                        },
                        confirmButton = {
                            if (!downloading) {
                                Button(onClick = {
                                    downloading = true
                                    downloadError = null
                                    scope.launch {
                                        val result = appUpdateManager.downloadAndInstall(version)
                                        when (result) {
                                            is UpdateResult.Installing -> {
                                                if (version.forceUpdate) updateDismissed = true
                                            }
                                            is UpdateResult.Failed -> {
                                                downloadError = result.message
                                                downloading = false
                                            }
                                        }
                                    }
                                }) {
                                    Text("Update")
                                }
                            }
                        },
                        dismissButton = {
                            if (!version.forceUpdate && !downloading) {
                                TextButton(onClick = { updateDismissed = true }) {
                                    Text("Later")
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}
