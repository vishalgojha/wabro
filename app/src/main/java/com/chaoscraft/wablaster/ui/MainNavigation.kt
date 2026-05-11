package com.chaoscraft.wablaster.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.ui.NavTab
import com.chaoscraft.wablaster.ui.NavTabs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainNavigation(
    senderConfig: SenderConfig,
    aiConfig: AiConfig,
    paymentManager: com.chaoscraft.wablaster.util.PaymentManager,
    brokerViewModel: BrokerViewModel = hiltViewModel(),
    listingViewModel: ListingViewModel = hiltViewModel(),
    campaignViewModel: CampaignViewModel = hiltViewModel(),
    responseViewModel: ResponseDashboardViewModel = hiltViewModel()
) {
    val navController = rememberNavController()
    var currentTab by remember { mutableIntStateOf(0) }
    val tabs = NavTabs.allTabs

    var lastBackPressTime by remember { mutableStateOf(0L) }
    val context = LocalContext.current

    BackHandler {
        val currentRoute = navController.currentBackStackEntry?.destination?.route
        if (currentRoute == tabs[currentTab].route) {
            if (System.currentTimeMillis() - lastBackPressTime < 2000) {
                (context as? android.app.Activity)?.finishAffinity()
            } else {
                lastBackPressTime = System.currentTimeMillis()
                Toast.makeText(context, "Press back again to exit", Toast.LENGTH_SHORT).show()
            }
        } else {
            navController.popBackStack()
        }
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        icon = {
                            Icon(
                                if (currentTab == index) tab.selectedIcon else tab.icon,
                                contentDescription = tab.label
                            )
                        },
                        label = { Text(tab.label) },
                        selected = currentTab == index,
                        onClick = {
                            if (currentTab != index) {
                                currentTab = index
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        }
                    )
                }
            }
        },
        modifier = Modifier.fillMaxSize()
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = NavTabs.Brokers.route,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // ===== Brokers =====
            composable(NavTabs.Brokers.route) {
                BrokerListScreen(
                    viewModel = brokerViewModel,
                    onBrokerClick = { broker ->
                        navController.navigate("broker/${broker.id}")
                    },
                    onAddBroker = {
                        navController.navigate("broker/edit")
                    }
                )
            }
            composable("broker/{brokerId}") { backStackEntry ->
                val brokerId = backStackEntry.arguments?.getString("brokerId")?.toLongOrNull() ?: 0L
                BrokerDetailScreen(
                    brokerId = brokerId,
                    viewModel = brokerViewModel,
                    listingViewModel = listingViewModel,
                    responseViewModel = responseViewModel,
                    onNavigateBack = { navController.popBackStack() },
                    onEdit = { broker ->
                        navController.navigate("broker/edit/${broker.id}")
                    }
                )
            }
            composable("broker/edit") {
                BrokerEditScreen(
                    viewModel = brokerViewModel,
                    onSave = { navController.popBackStack() },
                    onCancel = { navController.popBackStack() }
                )
            }
            composable("broker/edit/{brokerId}") { backStackEntry ->
                val brokerId = backStackEntry.arguments?.getString("brokerId")?.toLongOrNull() ?: 0L
                BrokerEditScreen(
                    viewModel = brokerViewModel,
                    brokerId = brokerId,
                    onSave = { navController.popBackStack() },
                    onCancel = { navController.popBackStack() }
                )
            }

            // ===== Listings =====
            composable(NavTabs.Listings.route) {
                ListingManagerScreen(
                    viewModel = listingViewModel,
                    onListingClick = { listing ->
                        navController.navigate("listing/${listing.id}")
                    }
                )
            }
            composable("listing/{listingId}") { backStackEntry ->
                val listingId = backStackEntry.arguments?.getString("listingId")?.toLongOrNull() ?: 0L
                Text("Listing Detail: $listingId")
            }

            // ===== Campaigns =====
            composable(NavTabs.Campaigns.route) {
                CampaignScreen(
                    viewModel = campaignViewModel,
                    senderConfig = senderConfig,
                    aiConfig = aiConfig,
                    paymentManager = paymentManager,
                    onNavigateToDashboard = { campaignId ->
                        navController.navigate("campaign_detail/$campaignId")
                    }
                )
            }

            // ===== Dashboard =====
            composable(NavTabs.Dashboard.route) {
                CampaignOverviewScreen(
                    onCampaignClick = { campaignId ->
                        navController.navigate("campaign_detail/$campaignId")
                    },
                    onNavigateBack = { /* Top level, no back */ }
                )
            }
            composable("campaign_detail/{campaignId}") { backStackEntry ->
                val campaignId = backStackEntry.arguments?.getString("campaignId")?.toLongOrNull() ?: 0L
                CampaignDashboard(
                    campaignId = campaignId,
                    viewModel = responseViewModel,
                    onNavigateToLead = { response ->
                        navController.navigate("lead/${response.id}")
                    },
                    onNavigateBack = { navController.popBackStack() }
                )
            }
            composable("lead/{leadId}") { backStackEntry ->
                val leadId = backStackEntry.arguments?.getString("leadId")?.toLongOrNull() ?: 0L
                // TODO: Wire up actual lead fetching from DB
                Text("Lead Detail: $leadId")
            }

            // ===== Settings =====
            composable(NavTabs.Settings.route) {
                val validator = remember { AppValidator(context) }
                SettingsScreen(
                    senderConfig = senderConfig,
                    aiConfig = aiConfig,
                    validator = validator,
                    paymentManager = paymentManager
                )
            }
        }
    }
}