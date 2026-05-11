package com.chaoscraft.wablaster.ui

import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.hilt.navigation.compose.hiltViewModel
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun BrokerListScreen(
    viewModel: BrokerViewModel = hiltViewModel(),
    onBrokerClick: (Broker) -> Unit,
    onAddBroker: () -> Unit
) {
    val context = LocalContext.current
    val brokers by viewModel.filteredBrokers.collectAsState()
    val groups by viewModel.allGroups.collectAsState(initial = emptyList())
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedCity by viewModel.selectedCity.collectAsState()
    val selectedSpecialty by viewModel.selectedSpecialty.collectAsState()

    var showDeleteConfirm by remember { mutableStateOf<Broker?>(null) }
    var showAddGroupDialog by remember { mutableStateOf(false) }
    var groupName by remember { mutableStateOf("") }
    var groupType by remember { mutableStateOf("CUSTOM") }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = onAddBroker) {
                Icon(Icons.Default.PersonAdd, contentDescription = "Add Broker")
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(paddingValues)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Search bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { viewModel.setSearchQuery(it) },
                label = { Text("Search brokers...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            // Filter chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = selectedCity != null,
                    onClick = {
                        viewModel.setCityFilter(if (selectedCity != null) null else "Bangalore")
                    },
                    label = { Text("City") },
                    leadingIcon = { Icon(Icons.Default.LocationOn, null) }
                )
                FilterChip(
                    selected = selectedSpecialty != null,
                    onClick = {
                        viewModel.setSpecialtyFilter(
                            if (selectedSpecialty != null) null else "RESALE"
                        )
                    },
                    label = { Text("Specialty") },
                    leadingIcon = { Icon(Icons.Default.Domain, null) }
                )
            }

            // Groups section
            if (groups.isNotEmpty()) {
                Text(
                    "Broker Groups",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = 8.dp)
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    groups.forEach { group ->
                        AssistChip(
                            onClick = {
                                showAddGroupDialog = true
                                viewModel._activeGroupId.value = group.id
                            },
                            label = { Text("${group.name} (${group.brokerCount})") }
                        )
                    }
                    FilledTonalButton(onClick = { showAddGroupDialog = true }) {
                        Icon(Icons.Default.Add, null)
                        Spacer(Modifier.width(4.dp))
                        Text("New Group")
                    }
                }
            }

            // Broker list
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentPadding = PaddingValues(vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(brokers, key = { it.id }) { broker ->
                    BrokerCard(
                        broker = broker,
                        onClick = { onBrokerClick(broker) },
                        onLongClick = { showDeleteConfirm = broker }
                    )
                }

                if (brokers.isEmpty()) {
                    item {
                        EmptyState(
                            icon = Icons.Default.PeopleOff,
                            title = "No brokers yet",
                            subtitle = "Tap + to add your first broker contact"
                        )
                    }
                }
            }
        }
    }

    // Delete confirmation dialog
    showDeleteConfirm?.let { broker ->
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = null },
            title = { Text("Delete Broker") },
            text = { Text("Remove ${broker.name} from your broker network?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.deleteBroker(broker)
                        showDeleteConfirm = null
                        Toast.makeText(context, "Deleted", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = null }) { Text("Cancel") }
            }
        )
    }

    // Add group dialog
    if (showAddGroupDialog) {
        AlertDialog(
            onDismissRequest = { showAddGroupDialog = false },
            title = { Text("New Broker Group") },
            text = {
                Column {
                    OutlinedTextField(
                        value = groupName,
                        onValueChange = { groupName = it },
                        label = { Text("Group Name") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("Group Type", style = MaterialTheme.typography.labelMedium)
                    Row {
                        listOf("CUSTOM", "CITY", "SPECIALIZATION").forEach { type ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(end = 16.dp)
                            ) {
                                RadioButton(
                                    selected = groupType == type,
                                    onClick = { groupType = type }
                                )
                                Text(type, fontSize = MaterialTheme.typography.bodySmall.fontSize)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (groupName.isNotBlank()) {
                            viewModel.createGroup(groupName, groupType)
                            showAddGroupDialog = false
                            groupName = ""
                        }
                    },
                    enabled = groupName.isNotBlank()
                ) { Text("Create") }
            },
            dismissButton = {
                TextButton(onClick = { showAddGroupDialog = false }) { Text("Cancel") }
            }
        )
    }
}