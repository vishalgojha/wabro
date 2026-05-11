package com.chaoscraft.wablaster.ui

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.Deal
import com.chaoscraft.wablaster.ui.theme.Typography
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrokerDetailScreen(
    brokerId: Long,
    viewModel: BrokerViewModel = hiltViewModel(),
    listingViewModel: ListingViewModel = hiltViewModel(),
    responseViewModel: ResponseDashboardViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onEdit: (Broker) -> Unit
) {
    val context = LocalContext.current
    var broker: Broker? by remember { mutableStateOf(null) }

    LaunchedEffect(brokerId) {
        broker = viewModel.getBrokerById(brokerId)
    }

    val deals by listingViewModel.getDealsByBroker(brokerId).collectAsState(initial = emptyList())
    val paidCommission by listingViewModel.getTotalPaidCommission(brokerId).collectAsState(initial = 0.0)
    val pendingCommission by listingViewModel.getTotalPendingCommission(brokerId).collectAsState(initial = 0.0)

    if (broker == null) {
        Scaffold(
            topBar = { TopAppBar(title = { Text("Broker Details") }) },
            content = { Text("Broker not found", modifier = Modifier.padding(16.dp)) }
        )
        return
    }

    val b = broker!!

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(b.name) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    IconButton(onClick = { onEdit(b) }) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Profile Header
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (b.isActive)
                            MaterialTheme.colorScheme.primaryContainer
                        else
                            MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            b.name,
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            b.phone,
                            style = MaterialTheme.typography.titleLarge
                        )
                        if (b.whatsappNumber.isNotBlank() && b.whatsappNumber != b.phone) {
                            Text("WhatsApp: ${b.whatsappNumber}")
                        }
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .background(
                                        if (b.isActive) MaterialTheme.colorScheme.primary
                                        else MaterialTheme.colorScheme.error,
                                        MaterialTheme.shapes.small
                                    )
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                if (b.isActive) "Active Broker" else "Inactive",
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }

            // Details
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("Contact Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(12.dp))
                        DetailRow("City", b.city)
                        DetailRow("Locality", b.locality)
                        DetailRow("Pincode", b.pincode)
                        DetailRow("Specialization", b.specialization)
                        DetailRow("Languages", b.languages)
                        DetailRow("Commission Rate", if (b.commissionRate > 0) "%.1f%%".format(b.commissionRate) else "Not set")
                        if (b.tags.isNotBlank()) DetailRow("Tags", b.tags)
                        if (b.notes.isNotBlank()) DetailRow("Notes", b.notes)
                    }
                }
            }

            // Performance Score
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("Performance Score", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(12.dp))
                        val score = b.performanceScore.toFloat() / 100f
                        LinearProgressIndicator(
                            progress = score.coerceIn(0f, 1f),
                            modifier = Modifier.fillMaxWidth().height(12.dp),
                            color = when {
                                b.performanceScore >= 70 -> MaterialTheme.colorScheme.primary
                                b.performanceScore >= 40 -> MaterialTheme.colorScheme.tertiary
                                else -> MaterialTheme.colorScheme.error
                            },
                            trackColor = MaterialTheme.colorScheme.surfaceVariant
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "%.1f / 100".format(b.performanceScore),
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }

            // Financial Summary
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("Commission Summary", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(12.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("₹%.0f".format(paidCommission), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                                Text("Paid", style = MaterialTheme.typography.bodySmall)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("₹%.0f".format(pendingCommission), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.tertiary)
                                Text("Pending", style = MaterialTheme.typography.bodySmall)
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("${deals.size}", style = MaterialTheme.typography.headlineMedium)
                                Text("Deals", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }

            // Deals Section
            item {
                Text(
                    "Deals (${deals.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            items(deals, key = { it.id }) { deal ->
                DealCard(deal = deal)
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    if (value.isNotBlank()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
        ) {
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.widthIn(min = 120.dp)
            )
            Text(value, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun DealCard(deal: Deal) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = {}),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "₹%.0f".format(deal.dealValue),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Surface(
                    color = when (deal.stage) {
                        "CLOSED_WON" -> MaterialTheme.colorScheme.primary
                        "CLOSED_LOST" -> MaterialTheme.colorScheme.error
                        "INQUIRY" -> MaterialTheme.colorScheme.tertiary
                        "NEGOTIATION" -> MaterialTheme.colorScheme.secondary
                        "DOCUMENT" -> MaterialTheme.colorScheme.inversePrimary
                        else -> MaterialTheme.colorScheme.surfaceVariant
                    }.copy(alpha = 0.15f),
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        deal.stage.replace("_", " "),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = when (deal.stage) {
                            "CLOSED_WON" -> MaterialTheme.colorScheme.primary
                            "CLOSED_LOST" -> MaterialTheme.colorScheme.error
                            "INQUIRY" -> MaterialTheme.colorScheme.tertiary
                            "NEGOTIATION" -> MaterialTheme.colorScheme.secondary
                            "DOCUMENT" -> MaterialTheme.colorScheme.inversePrimary
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("Commission: ₹%.0f (%.1f%%)".format(deal.commissionAmount, deal.commissionRate))
            Text("Client: ${deal.clientName}", style = MaterialTheme.typography.bodySmall)
            Text(
                deal.commissionStatus,
                style = MaterialTheme.typography.bodySmall,
                color = when (deal.commissionStatus) {
                    "PAID" -> MaterialTheme.colorScheme.primary
                    "PENDING" -> MaterialTheme.colorScheme.tertiary
                    "DISPUTED" -> MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }
            )
        }
    }
}