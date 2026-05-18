package com.chaoscraft.wablaster

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.chaoscraft.wablaster.ui.AuthScreen
import com.chaoscraft.wablaster.ui.MainNavigation
import com.chaoscraft.wablaster.ui.PaywallScreen
import com.chaoscraft.wablaster.ui.theme.WaBroV2Theme
import com.chaoscraft.wablaster.util.AuthManager
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import com.chaoscraft.wablaster.util.AiConfig
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class V2MainActivity : ComponentActivity() {

    @Inject lateinit var paymentManager: PaymentManager
    @Inject lateinit var senderConfig: SenderConfig
    @Inject lateinit var aiConfig: AiConfig
    @Inject lateinit var authManager: AuthManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        com.chaoscraft.wablaster.service.DashboardSyncManager.start(this)

        if (paymentManager.installedAt == 0L) {
            paymentManager.installedAt = System.currentTimeMillis()
        }

        setContent {
            var authenticated by mutableStateOf(authManager.isLoggedIn())
            var unlocked by mutableStateOf(paymentManager.isUnlocked)

            WaBroV2Theme {
                Surface(
                    modifier = androidx.compose.ui.Modifier.fillMaxSize(),
                    color = androidx.compose.material3.MaterialTheme.colorScheme.background
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
            }
        }
    }
}
