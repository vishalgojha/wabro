package com.chaoscraft.wablaster.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import com.chaoscraft.wablaster.R
import com.chaoscraft.wablaster.campaign.CsvImporter
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.engine.SkillsConfig
import com.chaoscraft.wablaster.util.AppValidator

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampaignScreen(
    viewModel: CampaignViewModel = hiltViewModel(),
    senderConfig: SenderConfig,
    aiConfig: AiConfig,
    broadcastListDao: BroadcastListDao,
    broadcastListContactDao: BroadcastListContactDao,
    csvImporter: CsvImporter,
    paymentManager: com.chaoscraft.wablaster.util.PaymentManager,
    onNavigateToDashboard: (Long) -> Unit
) {
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    var showAccessibilityDialog by remember { mutableStateOf(false) }

    val csvPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri -> uri?.let { viewModel.importCsv(it) } }

    val mediaPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri -> uri?.let { viewModel.mediaUri.value = it } }

    val campaignName by viewModel.campaignName.collectAsState()
    val messageTemplate by viewModel.messageTemplate.collectAsState()
    val importedContacts by viewModel.importedContacts.collectAsState()
    val importErrors by viewModel.importErrors.collectAsState()
    val importTotalRows by viewModel.importTotalRows.collectAsState()
    val skillsConfig by viewModel.skillsConfig.collectAsState()
    val savedCampaigns by viewModel.savedCampaigns.collectAsState()
    val runningCampaign by viewModel.runningCampaign.collectAsState()
    val validator = remember { AppValidator(context) }
    var validationErrors by remember { mutableStateOf<List<String>>(emptyList()) }
    var showValidationDialog by remember { mutableStateOf(false) }
    var showSenderPicker by remember { mutableStateOf(false) }

    // V2: Listing selector
    val allListings by viewModel.listings.collectAsState(initial = emptyList())
    var showListingPicker by remember { mutableStateOf(false) }

    // V2: Broker group selector
    val groups by viewModel.brokerGroups.collectAsState(initial = emptyList())
    var showGroupPicker by remember { mutableStateOf(false) }
    var selectedGroupIds by remember { mutableStateOf(emptySet<Long>()) }

    if (showValidationDialog) {
        AlertDialog(
            onDismissRequest = { showValidationDialog = false },
            icon = { Icon(Icons.Default.Warning, contentDescription = null) },
            title = { Text("Pre-flight Check Failed") },
            text = {
                Column {
                    validationErrors.forEach { error ->
                        Text(error, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showValidationDialog = false }) { Text("OK") }
            }
        )
    }

    if (showAccessibilityDialog) {
        AlertDialog(
            onDismissRequest = { showAccessibilityDialog = false },
            title = { Text(context.getString(R.string.permission_accessibility_title)) },
            text = { Text(context.getString(R.string.permission_accessibility_message)) },
            confirmButton = {
                TextButton(onClick = {
                    showAccessibilityDialog = false
                    context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                }) { Text("Open Settings") }
            },
            dismissButton = {
                TextButton(onClick = { showAccessibilityDialog = false }) { Text("Later") }
            }
        )
    }

    if (showSenderPicker) {
        SenderPickerDialog(
            currentPackage = viewModel.senderConfig.selectedPackage,
            currentNumber = viewModel.senderConfig.senderNumber,
            currentMultiAccount = viewModel.senderConfig.multiAccount,
            onSave = { pkg, number, multiAccount ->
                viewModel.senderConfig.selectedPackage = pkg
                viewModel.senderConfig.senderNumber = number
                viewModel.senderConfig.multiAccount = multiAccount
            },
            onDismiss = { showSenderPicker = false }
        )
    }

    if (showListingPicker) {
        AlertDialog(
            onDismissRequest = { showListingPicker = false },
            title = { Text("Select Listing") },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    allListings.forEach { listing ->
                        val priceText = if (listing.price >= 1_00_00_000)
                            "Rs%.1f Cr".format(listing.price / 1_00_00_000.0)
                        else
                            "Rs%.0f L".format(listing.price / 1_00_000.0)

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .combinedClickable {
                                    val autoMessage = buildString {
                                        appendLine("🏠 ${listing.name}")
                                        if (listing.projectName.isNotBlank()) appendLine("📍 ${listing.projectName}")
                                        if (listing.locality.isNotBlank()) appendLine("📌 ${listing.locality}, ${listing.city}")
                                        appendLine("💰 $priceText")
                                        if (listing.bhk > 0) appendLine("🛏️ ${listing.bhk} BHK · ${listing.areaSqft} sqft")
                                        if (listing.possessionDate.isNotBlank()) appendLine("📅 Possession: ${listing.possessionDate}")
                                        if (listing.reraNumber.isNotBlank()) appendLine("🏷️ RERA: ${listing.reraNumber}")
                                        if (listing.commissionRate > 0) appendLine("💼 Brokerage: ${listing.commissionRate}%")
                                        if (listing.reraNumber.isNotBlank()) appendLine("*RERA Registration No.: ${listing.reraNumber}*")
                                    }
                                    viewModel.messageTemplate.value = autoMessage
                                    viewModel.associateListing(listing.id)
                                    showListingPicker = false
                                }
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(listing.name, fontWeight = FontWeight.SemiBold)
                                    Text("$priceText · ${listing.bhk}BHK", style = MaterialTheme.typography.bodySmall)
                                }
                                Text(listing.city, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showListingPicker = false }) { Text("Done") } }
        )
    }

    if (showGroupPicker) {
        AlertDialog(
            onDismissRequest = { showGroupPicker = false },
            title = { Text("Select Broker Groups") },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    groups.forEach { group ->
                        val count = group.brokerCount
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .combinedClickable {
                                    selectedGroupIds = if (group.id in selectedGroupIds)
                                        selectedGroupIds - group.id
                                    else
                                        selectedGroupIds + group.id
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = group.id in selectedGroupIds,
                                onCheckedChange = null
                            )
                            Spacer(Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(group.name, fontWeight = FontWeight.Medium)
                                Text("$count brokers", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showGroupPicker = false }) { Text("Done") } }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("New Campaign", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

        // Active campaign banner
        runningCampaign?.let { campaign ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Row(modifier = Modifier.padding(16.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.PlayCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Campaign Running", fontWeight = FontWeight.Bold)
                        Text(campaign.name, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(onClick = {
                        viewModel.resumeExistingCampaign(campaign)
                        onNavigateToDashboard(campaign.id)
                    }) { Text("Resume") }
                }
            }
        }

        // V2: Listing Picker
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.HomeWork, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Property Listing", style = MaterialTheme.typography.titleMedium)
                }
                OutlinedButton(
                    onClick = { showListingPicker = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Select Listing →")
                }
            }
        }

        // Campaign Details
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.EditNote, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Campaign Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                OutlinedTextField(
                    value = campaignName,
                    onValueChange = { viewModel.campaignName.value = it },
                    label = { Text("Campaign Name") },
                    leadingIcon = { Icon(Icons.Default.Label, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = messageTemplate,
                    onValueChange = { viewModel.messageTemplate.value = it },
                    label = { Text("Message") },
                    placeholder = { Text("Type your message... use {{name}} for personalization") },
                    leadingIcon = { Icon(Icons.Default.Message, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 140.dp),
                    maxLines = 8
                )
            }
        }

        // V2: Broker Group Targeting
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.People, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Target Brokers", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                OutlinedButton(
                    onClick = { showGroupPicker = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Select Broker Groups (${selectedGroupIds.size} selected)")
                }
                if (selectedGroupIds.isNotEmpty()) {
                    FlowRow(
                        modifier = Modifier.padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        selectedGroupIds.forEach { groupId ->
                            val group = groups.find { it.id == groupId }
                            group?.let {
                                AssistChip(
                                    onClick = { selectedGroupIds = selectedGroupIds - groupId },
                                    label = { Text("${it.name} (${it.brokerCount})") },
                                    leadingIcon = {
                                        Icon(Icons.Default.Close, null, modifier = Modifier.size(14.dp))
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }

        // Media
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AttachFile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Media (Optional)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                OutlinedButton(
                    onClick = { mediaPicker.launch(arrayOf("image/*", "application/pdf")) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(if (viewModel.mediaUri.value != null) Icons.Default.CheckCircle else Icons.Default.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (viewModel.mediaUri.value != null) "Change Media" else "Attach Media")
                }
            }
        }

        // Skills
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Tune, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Skills", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Divider()
                SkillsGrid(skillsConfig) { viewModel.skillsConfig.value = it }
            }
        }

        // Sender
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.PhoneForwarded, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Text("Sender", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                    FilledTonalButton(onClick = { showSenderPicker = true }) { Text("Change") }
                }
                Divider()
                val pkg = viewModel.senderConfig.selectedPackage
                val number = viewModel.senderConfig.senderNumber
                if (pkg.isNotEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (pkg.contains("w4b")) Icons.Default.Business else Icons.Default.Chat, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(8.dp))
                        Column {
                            Text(if (pkg.contains("w4b")) "WhatsApp Business" else "WhatsApp")
                            if (number.isNotEmpty()) Text(number, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(8.dp))
                        Text("Not configured — tap Change", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        // Contacts
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Contacts, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    Text("Contacts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { csvPicker.launch(arrayOf("text/*", "*/*")) }, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.UploadFile, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("CSV Import")
                    }
                }
                if (importedContacts.isNotEmpty()) {
                    Text("${importedContacts.size} contacts ready", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                if (importErrors.isNotEmpty()) {
                    importErrors.take(3).forEach { error ->
                        Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }

        // Start Button
        Button(
            onClick = {
                if (!viewModel.senderConfig.isConfigured) {
                    showSenderPicker = true
                    return@Button
                }
                val result = validator.validateAll()
                if (!result.isValid) {
                    validationErrors = result.errors + result.warnings
                    showValidationDialog = true
                } else if (importedContacts.isNotEmpty() && campaignName.isNotBlank()) {
                    viewModel.createAndStartCampaign()
                    val id = viewModel.savedCampaigns.value.lastOrNull()?.id
                    if (id != null) onNavigateToDashboard(id)
                }
            },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            enabled = importedContacts.isNotEmpty() && campaignName.isNotBlank()
        ) {
            Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(8.dp))
            Text("Start Broadcast", style = MaterialTheme.typography.titleMedium)
        }

        Spacer(Modifier.height(16.dp))
    }
}