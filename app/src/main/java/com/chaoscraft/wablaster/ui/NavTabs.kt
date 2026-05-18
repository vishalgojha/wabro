package com.chaoscraft.wablaster.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.vector.ImageVector

sealed class NavTab(
    val route: String,
    val label: String,
    val icon: ImageVector,
    val selectedIcon: ImageVector = icon
) {
    data object Home : NavTab("home", "Home", Icons.Default.Home, Icons.Default.Home)
    data object Brokers : NavTab("brokers", "Brokers", Icons.Default.People, Icons.Default.PeopleAlt)
    data object Listings : NavTab("listings", "Listings", Icons.Default.HomeWork, Icons.Default.HomeWork)
    data object Campaigns : NavTab("campaigns", "Campaigns", Icons.Default.Campaign, Icons.Default.Campaign)
    data object Dashboard : NavTab("dashboard", "Dashboard", Icons.Default.Dashboard, Icons.Default.Dashboard)
    data object Settings : NavTab("settings", "Settings", Icons.Default.Settings, Icons.Default.Settings)

    companion object {
        val allTabs = listOf(Home, Brokers, Listings, Campaigns, Dashboard, Settings)
    }
}
