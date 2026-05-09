package com.chaoscraft.wablaster

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.chaoscraft.wablaster.campaign.CsvImporter
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.ui.*
import com.chaoscraft.wablaster.ui.theme.WaBlasterTheme
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.AppValidator
import com.chaoscraft.wablaster.util.PaymentManager
import com.chaoscraft.wablaster.util.SenderConfig
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

sealed class Screen(val route: String, val label: String, val icon: @Composable () -> Unit) {
    data object Home : Screen("home", "Home", { Icon(Icons.Default.Home, contentDescription = "Home") })
    data object Lists : Screen("lists", "Lists", { Icon(Icons.Default.People, contentDescription = "Lists") })
    data object Settings : Screen("settings", "Settings", { Icon(Icons.Default.Settings, contentDescription = "Settings") })
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var paymentManager: PaymentManager
    @Inject lateinit var senderConfig: SenderConfig
    @Inject lateinit var aiConfig: AiConfig
    @Inject lateinit var broadcastListDao: BroadcastListDao
    @Inject lateinit var broadcastListContactDao: BroadcastListContactDao
    @Inject lateinit var csvImporter: CsvImporter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WaBlasterTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    if (!paymentManager.isUnlocked) {
                        PaywallScreen(
                            onUnlocked = { paymentManager.unlock() }
                        )
                    } else {
                        MainContent(
                            senderConfig = senderConfig,
                            aiConfig = aiConfig,
                            broadcastListDao = broadcastListDao,
                            broadcastListContactDao = broadcastListContactDao,
                            csvImporter = csvImporter,
                            paymentManager = paymentManager
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MainContent(
    senderConfig: SenderConfig,
    aiConfig: AiConfig,
    broadcastListDao: BroadcastListDao,
    broadcastListContactDao: BroadcastListContactDao,
    csvImporter: CsvImporter,
    paymentManager: com.chaoscraft.wablaster.util.PaymentManager
) {
    val navController = rememberNavController()
    val viewModel: CampaignViewModel = hiltViewModel()
    val screens = listOf(Screen.Home, Screen.Lists, Screen.Settings)

    Scaffold(
        bottomBar = {
            NavigationBar {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentDestination = navBackStackEntry?.destination
                screens.forEach { screen ->
                    NavigationBarItem(
                        icon = screen.icon,
                        label = { Text(screen.label) },
                        selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    viewModel = viewModel,
                    onNavigateToDashboard = {
                        navController.navigate("dashboard")
                    }
                )
            }
            composable(Screen.Lists.route) {
                BroadcastListsScreen(
                    broadcastListDao = broadcastListDao,
                    broadcastListContactDao = broadcastListContactDao,
                    csvImporter = csvImporter,
                    onSelectList = { contacts ->
                        contacts.forEach { viewModel.addContactsFromPhonebook(listOf(it)) }
                        navController.navigate(Screen.Home.route) {
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                        }
                    }
                )
            }
            composable(Screen.Settings.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val validator = remember { AppValidator(context) }
                SettingsScreen(
                    senderConfig = senderConfig,
                    aiConfig = aiConfig,
                    validator = validator,
                    paymentManager = paymentManager
                )
            }
            composable("dashboard") {
                CampaignDashboard(
                    viewModel = viewModel,
                    onNavigateBack = { navController.popBackStack() }
                )
            }
        }
    }
}
