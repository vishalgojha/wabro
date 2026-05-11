package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Campaign
import com.chaoscraft.wablaster.db.entities.CampaignResponse

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampaignDashboardScreen(
    campaignId: Long,
    viewModel: ResponseDashboardViewModel = hiltViewModel(),
    onNavigateToLead: (CampaignResponse) -> Unit,
    onNavigateBack: () -> Unit
) {
    LaunchedEffect(campaignId) {
        viewModel.selectCampaign(campaignId)
    }

    val hotLeads by viewModel.hotLeads.collectAsState(initial = emptyList())
    val warmLeads by viewModel.warmLeads.collectAsState(initial = emptyList())
    val coldLeads by viewModel.coldLeads.collectAsState(initial = emptyList())
    val hotCount by viewModel.hotLeadCount.collectAsState(initial = 0)
    val warmCount by viewModel.warmLeadCount.collectAsState(initial = 0)
    val coldCount by viewModel.coldLeadCount.collectAsState(initial = 0)
    val totalResponses by viewModel.totalResponses.collectAsState(initial = 0)
    val unfollowed by viewModel.unfollowedCount.collectAsState(initial = 0)
    val deals by viewModel.deals.collectAsState(initial = emptyList())
    val unclosedHotLeads by viewModel.unclosedHotLeads.collectAsState(initial = emptyList())

    var selectedTab by remember { mutableIntStateOf(0) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Campaign Dashboard") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding)
        ) {
            // Summary Cards
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                SummaryCard("Total", totalResponses.toString(), Icons.Default.People, MaterialTheme.colorScheme.primary)
                SummaryCard("Hot", hotCount.toString(), Icons.Default.LocalFireDepartment, MaterialTheme.colorScheme.error)
                SummaryCard("Warm", warmCount.toString(), Icons.Default.Thermostat, MaterialTheme.colorScheme.tertiary)
                SummaryCard("Closed", deals.size.toString(), Icons.Default.CheckCircle, MaterialTheme.colorScheme.primary)
            }

            // Follow-up alert
            if (unfollowed > 0) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                ) {
                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(12.dp))
                        Text("$unfollowed lead(s) need follow-up", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
            }

            if (hotCount > 0 && unclosedHotLeads.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("🔥 Hot Leads Not Converted", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        unclosedHotLeads.take(3).forEach { lead ->
                            Text("• ${lead.brokerName} — responded ${formatTimeAgo(lead.repliedAt)}", style = MaterialTheme.typography.bodySmall)
                        }
                        if (unclosedHotLeads.size > 3) {
                            Text("+${unclosedHotLeads.size - 3} more", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }
                }
            }

            // Tabs
            TabRow(selectedTabIndex = selectedTab) {
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }, text = { Text("All ($totalResponses)") })
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }, icon = { Icon(Icons.Default.LocalFireDepartment, null) }, text = { Text("Hot ($hotCount)") })
                Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }, icon = { Icon(Icons.Default.Thermostat, null) }, text = { Text("Warm ($warmCount)") })
                Tab(selected = selectedTab == 3, onClick = { selectedTab = 3 }, text = { Text("Cold ($coldCount)") })
                Tab(selected = selectedTab == 4, onClick = { selectedTab = 4 }, icon = { Icon(Icons.Default.Business, null) }, text = { Text("Deals (${deals.size})") })
            }

            when (selectedTab) {
                0 -> LeadList(leads = hotLeads + warmLeads + coldLeads, onLeadClick = onNavigateToLead)
                1 -> LeadList(leads = hotLeads, onLeadClick = onNavigateToLead)
                2 -> LeadList(leads = warmLeads, onLeadClick = onNavigateToLead)
                3 -> LeadList(leads = coldLeads, onLeadClick = onNavigateToLead)
                4 -> DealList(deals = deals)
            }
        }
    }
}