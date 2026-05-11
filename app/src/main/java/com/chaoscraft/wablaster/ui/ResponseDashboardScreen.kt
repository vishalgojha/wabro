package com.chaoscraft.wablaster.ui

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.Deal
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResponseDashboardScreen(
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
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Summary Cards
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
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
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "$unfollowed lead(s) need follow-up",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }

            if (hotCount > 0 && unclosedHotLeads.isNotEmpty()) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
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

            // Tab content
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

@Composable
private fun SummaryCard(title: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, color: androidx.compose.ui.graphics.Color) {
    Card(
        modifier = Modifier.weight(1f),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.08f))
    ) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
            Text(title, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun LeadList(leads: List<CampaignResponse>, onLeadClick: (CampaignResponse) -> Unit) {
    val listState = rememberLazyListState()

    if (leads.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No leads in this category", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(leads, key = { it.id }) { lead ->
            LeadCard(lead = lead, onClick = { onLeadClick(lead) })
        }
    }
}

@Composable
private fun LeadCard(lead: CampaignResponse, onClick: () -> Unit) {
    val intentColor = when (lead.intentLevel) {
        "HOT" -> MaterialTheme.colorScheme.error
        "WARM" -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(lead.brokerName.ifEmpty { lead.brokerPhone }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(lead.responseText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                    Text("Score: %.0f · %s · %s".format(lead.hotLeadScore, lead.intentLevel, formatTimeAgo(lead.repliedAt)), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(lead.intentLevel, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = intentColor)
            }

            if (lead.dealClosed) {
                Row(modifier = Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(4.dp))
                    Text("Deal: ₹%.0f · Commission: ₹%.0f".format(lead.dealValue, lead.commissionAmount), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun DealList(deals: List<Deal>) {
    val listState = rememberLazyListState()

    if (deals.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No deals yet", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }

    LazyColumn(state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            val totalValue = deals.sumOf { it.dealValue }
            val totalCommission = deals.sumOf { it.commissionAmount }
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("₹%.2f Cr".format(totalValue / 1_00_00_000.0), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text("Total Value", style = MaterialTheme.typography.bodySmall)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("₹%.2f L".format(totalCommission / 1_00_000.0), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text("Commission", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }

        items(deals, key = { it.id }) { deal ->
            DealCard(deal = deal)
        }
    }
}

private fun formatTimeAgo(timestamp: Long): String {
    val diff = System.currentTimeMillis() - timestamp
    val minutes = diff / 60_000
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "${minutes}m ago"
        minutes < 1440 -> "${minutes / 60}h ago"
        else -> "${minutes / 1440}d ago"
    }
}