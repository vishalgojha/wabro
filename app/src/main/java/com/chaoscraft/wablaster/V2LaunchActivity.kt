package com.chaoscraft.wablaster.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.chaoscraft.wablaster.ui.theme.WaBlasterTheme

/**
 * V2 Entry point — replaces MainActivity for the broker-focused rebuild.
 * Uses 5-tab navigation: Brokers | Listings | Campaigns | Dashboard | Settings
 */
class V2LaunchActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Note: MainNavigation handles V2MainActivity internally via DI composition
        // For initial launch, start with V2MainActivity via manifest intent-filter
        setContent {
            WaBlasterTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    // Launch is handled via AndroidManifest intent-filter on V2MainActivity
                }
            }
        }
        finish()
    }
}