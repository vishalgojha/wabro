package com.chaoscraft.wablaster.ui

import android.util.Log
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
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.db.entities.Listing as ListingEntity
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingManagerScreen(
    viewModel: ListingViewModel = hiltViewModel(),
    onListingClick: (ListingEntity) -> Unit
) {
    val listings by viewModel.activeListings.collectAsState(initial = emptyList())
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedCity by viewModel.selectedCity.collectAsState()
    val selectedType by viewModel.selectedType.collectAsState()

    var showAddDialog by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        // Toolbar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Property Listings",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            FilledTonalButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(4.dp))
                Text("Add Listing")
            }
        }

        // Search
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { viewModel.setSearchQuery(it) },
            label = { Text("Search listings...") },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            singleLine = true
        )

        // Filter chips for cities
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val cities = listOf("Bangalore", "Mumbai", "Delhi", "Pune", "Chennai", "Hyderabad", "Kolkata", "Ahmedabad", "Jaipur", "Lucknow")
            cities.forEach { city ->
                FilterChip(
                    selected = selectedCity == city,
                    onClick = {
                        viewModel.setCityFilter(if (selectedCity == city) null else city)
                    },
                    label = { Text(city) }
                )
            }
        }

        // Filter chips for property types
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val types = listOf("FLAT", "HOUSE", "SHOP", "OFFICE", "PLOT", "VILLA")
            types.forEach { type ->
                FilterChip(
                    selected = selectedType == type,
                    onClick = {
                        viewModel.setSpecialtyFilter(if (selectedType == type) null else type)
                    },
                    label = { Text(type) }
                )
            }
        }

        // Listing cards
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            items(listings, key = { it.id }) { listing ->
                ListingCard(
                    listing = listing,
                    onClick = { onListingClick(listing) }
                )
            }

            if (listings.isEmpty()) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.HomeWork,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.height(12.dp))
                            Text("No listings yet", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Add your first property listing to start broadcasting",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddListingDialog(
            onDismiss = { showAddDialog = false },
            onSave = { listing ->
                viewModel.addOrUpdateListing(listing)
                showAddDialog = false
            }
        )
    }
}

@Composable
private fun ListingCard(listing: Listing, onClick: () -> Unit) {
    val priceText = when {
        listing.price >= 1_00_00_000 -> "₹%.1f Cr".format(listing.price / 1_00_00_000.0)
        listing.price >= 1_00_000 -> "₹%.0f L".format(listing.price / 1_00_000.0)
        else -> "₹%.0f".format(listing.price)
    }

    val bhkText = when (listing.bhk) {
        0 -> "Studio"
        1 -> "1 BHK"
        2 -> "2 BHK"
        3 -> "3 BHK"
        4 -> "4 BHK"
        else -> "${listing.bhk} BHK"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        listing.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                    if (listing.projectName.isNotBlank()) {
                        Text(
                            listing.projectName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "$bhkText · ${listing.areaSqft} sqft",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    if (listing.locality.isNotBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.LocationOn,
                                null,
                                modifier = Modifier.size(14.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                "${listing.locality}, ${listing.city}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                Text(
                    priceText,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            // Tags row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (listing.status == "LAUNCHED") {
                    AssistChip(
                        onClick = {},
                        label = { Text("Launched") },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer
                        )
                    )
                }
                AssistChip(
                    onClick = {},
                    label = { Text(listing.propertyType) },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    )
                )
                if (listing.reraNumber.isNotBlank()) {
                    AssistChip(
                        onClick = {},
                        label = { Text("RERA") },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = MaterialTheme.colorScheme.tertiaryContainer
                        )
                    )
                }
                if (listing.commissionRate > 0) {
                    Text(
                        "Brokerage: ${listing.commissionRate}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddListingDialog(
    onDismiss: () -> Unit,
    onSave: (ListingEntity) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var projectName by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var locality by remember { mutableStateOf("") }
    var pincode by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var bhk by remember { mutableStateOf("2") }
    var area by remember { mutableStateOf("") }
    var possessionDate by remember { mutableStateOf("") }
    var reraNumber by remember { mutableStateOf("") }
    var commissionRate by remember { mutableStateOf("") }
    var propertyType by remember { mutableStateOf("FLAT") }
    var description by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }
    var expandedType by remember { mutableStateOf(false) }

    val propertyTypes = listOf("FLAT", "HOUSE", "SHOP", "OFFICE", "PLOT", "VILLA")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add New Listing") },
        text = {
            Column(
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Listing Name *") },
                    modifier = Modifier.fillMaxWidth(),
                    isError = name.isBlank()
                )
                OutlinedTextField(
                    value = projectName,
                    onValueChange = { projectName = it },
                    label = { Text("Project Name") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("Full Address") },
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = city,
                        onValueChange = { city = it },
                        label = { Text("City") },
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
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = price,
                        onValueChange = { price = it.filter { c -> c.isDigit() } },
                        label = { Text("Price (₹) *") },
                        modifier = Modifier.weight(1f),
                        isError = price.isNotBlank() && price.toLongOrNull() == null
                    )
                    OutlinedTextField(
                        value = bhk,
                        onValueChange = { if (it.toIntOrNull() != null || it.isEmpty()) bhk = it },
                        label = { Text("BHK") },
                        modifier = Modifier.weight(0.5f)
                    )
                    OutlinedTextField(
                        value = area,
                        onValueChange = { area = it.filter { c -> c.isDigit() } },
                        label = { Text("Area (sqft)") },
                        modifier = Modifier.weight(1f)
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = pincode,
                        onValueChange = { if (it.length <= 6) pincode = it },
                        label = { Text("Pincode") },
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = possessionDate,
                        onValueChange = { possessionDate = it },
                        label = { Text("Possession Date") },
                        modifier = Modifier.weight(1f)
                    )
                }

                OutlinedTextField(
                    value = reraNumber,
                    onValueChange = { reraNumber = it },
                    label = { Text("RERA Number") },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = commissionRate,
                        onValueChange = { commissionRate = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("Commission %") },
                        modifier = Modifier.width(120.dp)
                    )
                    Text("%", style = MaterialTheme.typography.bodyMedium)

                    // Property type dropdown
                    ExposedDropdownMenuBox(
                        expanded = expandedType,
                        onExpandedChange = { expandedType = !expandedType }
                    ) {
                        OutlinedTextField(
                            value = propertyType,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Type") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedType) },
                            modifier = Modifier.menuAnchor().weight(1f)
                        )
                        ExposedDropdownMenu(
                            expanded = expandedType,
                            onDismissRequest = { expandedType = false }
                        ) {
                            propertyTypes.forEach { type ->
                                DropdownMenuItem(
                                    text = { Text(type) },
                                    onClick = {
                                        propertyType = type
                                        expandedType = false
                                    }
                                )
                            }
                        }
                    }
                }

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                    maxLines = 4
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val priceLong = price.toLongOrNull() ?: 0
                    if (name.isNotBlank() && priceLong > 0) {
                        onSave(
                            ListingEntity(
                                name = name,
                                projectName = projectName,
                                address = address,
                                city = city,
                                locality = locality,
                                pincode = pincode,
                                price = priceLong.toDouble(),
                                bhk = bhk.toIntOrNull() ?: 0,
                                areaSqft = area.toIntOrNull() ?: 0,
                                possessionDate = possessionDate,
                                reraNumber = reraNumber,
                                propertyType = propertyType,
                                commissionRate = commissionRate.toDoubleOrNull() ?: 0.0
                            )
                        )
                    }
                },
                enabled = name.isNotBlank()
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}