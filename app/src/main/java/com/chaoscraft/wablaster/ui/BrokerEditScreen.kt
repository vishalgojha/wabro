package com.chaoscraft.wablaster.ui

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrokerEditScreen(
    viewModel: BrokerViewModel = hiltViewModel(),
    brokerId: Long? = null,
    onSave: () -> Unit,
    onCancel: () -> Unit
) {
    val existingBroker = if (brokerId != null && brokerId != 0L) {
        remember { mutableStateOf<Broker?>(null) }
    } else null

    LaunchedEffect(brokerId) {
        if (brokerId != null && brokerId != 0L) {
            existingBroker?.value = viewModel.getBrokerById(brokerId)
        }
    }

    val eb = existingBroker?.value

    var name by remember { mutableStateOf(eb?.name ?: "") }
    var phone by remember { mutableStateOf(eb?.phone ?: "") }
    var whatsappNumber by remember { mutableStateOf(eb?.whatsappNumber ?: "") }
    var city by remember { mutableStateOf(eb?.city ?: "") }
    var locality by remember { mutableStateOf(eb?.locality ?: "") }
    var pincode by remember { mutableStateOf(eb?.pincode ?: "") }
    var specialization by remember { mutableStateOf(eb?.specialization ?: "") }
    var languages by remember { mutableStateOf(eb?.languages ?: "") }
    var commissionRate by remember { mutableStateOf(if (eb?.commissionRate ?: 0.0 > 0) "%.1f".format(eb?.commissionRate) else "") }
    var tags by remember { mutableStateOf(eb?.tags ?: "") }
    var notes by remember { mutableStateOf(eb?.notes ?: "") }
    var isActive by remember { mutableStateOf(eb?.isActive ?: true) }

    val isEdit = brokerId != null && brokerId != 0L && eb != null

    val specializations = listOf("RESALE", "NEW_LAUNCH", "COMMERCIAL", "PLOT", "ALL")
    var showSpecialtyMenu by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            if (isEdit) "Edit Broker" else "Add New Broker",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Full Name *") },
            leadingIcon = { Icon(Icons.Default.Person, null) },
            modifier = Modifier.fillMaxWidth(),
            isError = name.isBlank()
        )

        OutlinedTextField(
            value = phone,
            onValueChange = { if (it.filter { c -> c.isDigit() }.length <= 12) phone = it },
            label = { Text("Phone Number *") },
            leadingIcon = { Icon(Icons.Default.Phone, null) },
            modifier = Modifier.fillMaxWidth(),
            isError = phone.isBlank()
        )

        OutlinedTextField(
            value = whatsappNumber,
            onValueChange = { whatsappNumber = it },
            label = { Text("WhatsApp Number (if different)") },
            leadingIcon = { Icon(Icons.Default.Chat, null) },
            modifier = Modifier.fillMaxWidth()
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = city,
                onValueChange = { city = it },
                label = { Text("City") },
                leadingIcon = { Icon(Icons.Default.LocationOn, null) },
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = locality,
                onValueChange = { locality = it },
                label = { Text("Locality") },
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = pincode,
                onValueChange = { if (it.length <= 6 && it.all { c -> c.isDigit() }) pincode = it },
                label = { Text("Pincode") },
                modifier = Modifier.weight(1f),
                keyboardOptions = androidx.compose.ui.text.input.KeyboardOptions.Default.copy(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                )
            )
            if (pincode.length == 6) {
                Button(
                    onClick = {
                        if (brokerId != null) {
                            viewModel.geoTagBroker(brokerId, pincode)
                            Toast.makeText(
                                androidx.compose.ui.platform.LocalContext.current,
                                "Geo-tagged! Update city/locality fields.",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    },
                    enabled = brokerId != null
                ) {
                    Icon(Icons.Default.MyLocation, null)
                    Spacer(Modifier.width(4.dp))
                    Text("Geo-Tag")
                }
            }
        }

        OutlinedTextField(
            value = specialization,
            onValueChange = { specialization = it },
            label = { Text("Specialization") },
            readOnly = true,
            trailingIcon = {
                ExposedDropdownMenuBox(
                    expanded = showSpecialtyMenu,
                    onExpandedChange = { showSpecialtyMenu = !showSpecialtyMenu }
                ) {
                    ExposedDropdownMenu(
                        expanded = showSpecialtyMenu,
                        onDismissRequest = { showSpecialtyMenu = false }
                    ) {
                        specializations.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    specialization = option
                                    showSpecialtyMenu = false
                                }
                            )
                        }
                    }
                }
            },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = languages,
            onValueChange = { languages = it },
            label = { Text("Languages (comma-separated)") },
            helperText = { Text("e.g., HINDI, ENGLISH, MARATHI") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = commissionRate,
            onValueChange = { commissionRate = it.filter { c -> c.isDigit() || c == '.' || c == '0' } },
            label = { Text("Commission Rate (%)") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = androidx.compose.ui.text.input.KeyboardOptions.Default.copy(
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal
            )
        )

        OutlinedTextField(
            value = tags,
            onValueChange = { tags = it },
            label = { Text("Tags (comma-separated)") },
            helperText = { Text("e.g., top_performer, delhi, builder_network") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = notes,
            onValueChange = { notes = it },
            label = { Text("Notes") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            maxLines = 5
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = isActive, onCheckedChange = { isActive = it })
            Text("Active Broker")
        }

        Spacer(Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = {
                    if (name.isNotBlank() && phone.isNotBlank()) {
                        val broker = Broker(
                            id = brokerId ?: 0L,
                            name = name,
                            phone = phone,
                            whatsappNumber = whatsappNumber,
                            city = city,
                            locality = locality,
                            pincode = pincode,
                            specialization = specialization,
                            languages = languages,
                            commissionRate = commissionRate.toDoubleOrNull() ?: 0.0,
                            tags = tags,
                            notes = notes,
                            isActive = isActive
                        )
                        viewModel.addOrUpdateBroker(broker)
                        onSave()
                    }
                },
                modifier = Modifier.weight(1f)
            ) {
                Text(if (isEdit) "Update Broker" else "Add Broker")
            }

            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) {
                Text("Cancel")
            }
        }
    }
}