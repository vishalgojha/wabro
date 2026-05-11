package com.chaoscraft.wablaster.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.Deal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LeadDetailScreen(
    lead: CampaignResponse,
    viewModel: ResponseDashboardViewModel = hiltViewModel(),
    onClose: () -> Unit
) {
    var dealValue by remember { mutableStateOf(lead.dealValue.takeIf { it > 0 }?.toString() ?: "") }
    var clientName by remember { mutableStateOf("") }
    var clientPhone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var showDealForm by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Lead Detail") },
                navigationIcon = {
                    IconButton(onClick = onClose) {
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
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Lead Info Card
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val color = when (lead.intentLevel) {
                            "HOT" -> MaterialTheme.colorScheme.error
                            "WARM" -> MaterialTheme.colorScheme.tertiary
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .background(color, MaterialTheme.shapes.small)
                        )
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text(
                                lead.brokerName.ifEmpty { lead.brokerPhone },
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                "${lead.intentLevel} Lead · Score: %.0f".format(lead.hotLeadScore),
                                style = MaterialTheme.typography.bodyMedium,
                                color = color
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    DetailRow("Phone", lead.brokerPhone)
                    DetailRow("Response Type", lead.responseType.replace("_", " "))
                    DetailRow("Response Time", "${lead.responseTimeSec}s")
                    DetailRow("Responded", formatTimeAgo(lead.repliedAt))
                    if (lead.followUpSent) {
                        DetailRow("Follow-up", "Sent ${formatTimeAgo(lead.followUpAt)}")
                    }
                }
            }

            // Response Message
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("Broker's Response", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        lead.responseText,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }

            // Deal Section (if closed)
            if (lead.dealClosed) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("✅ Deal Closed", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(8.dp))
                        DetailRow("Deal Value", "₹%.2f Cr".format(lead.dealValue / 1_00_00_000))
                        DetailRow("Commission", "₹%.0f".format(lead.commissionAmount))
                        DetailRow("Commission Status", lead.commissionStatus)
                        DetailRow("Attribution", "Campaign ${lead.campaignId}")
                    }
                }
            }

            // Log New Deal
            if (!lead.dealClosed) {
                Button(
                    onClick = { showDealForm = true },
                    modifier = Modifier.fillMaxWidth().height(56.dp)
                ) {
                    Icon(Icons.Default.AddBusiness, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Log Deal from This Lead")
                }
            }

            // Follow-up Action
            if (!lead.followUpSent && (lead.intentLevel == "HOT" || lead.intentLevel == "WARM")) {
                OutlinedButton(
                    onClick = {
                        viewModel.markFollowUpSent(lead.id)
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Notifications, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Mark Follow-up Sent")
                }
            }
        }
    }

    // Deal form dialog
    if (showDealForm) {
        AlertDialog(
            onDismissRequest = { showDealForm = false },
            title = { Text("Log Deal") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = dealValue,
                        onValueChange = { dealValue = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Deal Value (₹)") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = androidx.compose.ui.text.input.KeyboardOptions.Default.copy(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal
                        )
                    )
                    OutlinedTextField(
                        value = clientName,
                        onValueChange = { clientName = it },
                        label = { Text("Client Name *") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = clientPhone,
                        onValueChange = { clientPhone = it },
                        label = { Text("Client Phone *") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Notes") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                        maxLines = 4
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val value = dealValue.toDoubleOrNull() ?: 0.0
                        if (value > 0 && clientName.isNotBlank()) {
                            viewModel.recordDeal(
                                campaignId = lead.campaignId,
                                listingId = lead.listingId,
                                brokerId = lead.brokerId,
                                clientName = clientName,
                                clientPhone = clientPhone,
                                dealValue = value,
                                commissionRate = 0.0, // Should come from broker listing config
                                commissionAmount = value * (lead.brokerId.toDouble() / 100) // Placeholder
                            )
                            viewModel.markDealClosed(lead.id, value)
                            showDealForm = false
                        }
                    },
                    enabled = dealValue.toDoubleOrNull() != null && clientName.isNotBlank()
                ) { Text("Save Deal") }
            },
            dismissButton = {
                TextButton(onClick = { showDealForm = false }) { Text("Cancel") }
            }
        )
    }
}