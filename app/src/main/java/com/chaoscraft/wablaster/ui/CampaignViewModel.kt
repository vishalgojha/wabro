package com.chaoscraft.wablaster.ui

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.chaoscraft.wablaster.campaign.CampaignManager
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.CampaignResponseDao
import com.chaoscraft.wablaster.db.daos.BrokerDao
import com.chaoscraft.wablaster.db.daos.BrokerGroupDao
import com.chaoscraft.wablaster.db.daos.DealDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import com.chaoscraft.wablaster.db.entities.Campaign
import com.chaoscraft.wablaster.db.entities.CampaignStatus
import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.engine.SkillsConfig
import com.chaoscraft.wablaster.service.BroadcastForegroundService
import com.chaoscraft.wablaster.util.SenderConfig
import com.google.gson.Gson
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CampaignViewModel @Inject constructor(
    application: Application,
    private val campaignManager: CampaignManager,
    private val csvImporter: com.chaoscraft.wablaster.campaign.CsvImporter,
    private val campaignDao: CampaignDao,
    private val contactDao: ContactDao,
    private val brokerDao: BrokerDao,
    private val brokerGroupDao: BrokerGroupDao,
    private val listingDao: ListingDao,
    private val dealDao: DealDao,
    private val responseDao: CampaignResponseDao,
    val senderConfig: SenderConfig,
    private val broadcastListDao: BroadcastListDao,
    private val broadcastListContactDao: BroadcastListContactDao
) : AndroidViewModel(application) {

    val stats = campaignManager.stats
    val recentLogs = campaignManager.recentLogs

    val campaignName = MutableStateFlow("")
    val messageTemplate = MutableStateFlow("")
    val mediaUri = MutableStateFlow<Uri?>(null)
    val skillsConfig = MutableStateFlow(SkillsConfig())
    val csvUri = MutableStateFlow<Uri?>(null)
    val importedContacts = MutableStateFlow<List<Contact>>(emptyList())
    val importErrors = MutableStateFlow<List<String>>(emptyList())
    val importTotalRows = MutableStateFlow(0)
    val activeCampaign = MutableStateFlow<Campaign?>(null)
    val savedCampaigns = MutableStateFlow<List<Campaign>>(emptyList())
    val runningCampaign = MutableStateFlow<Campaign?>(null)

    // V2: Expose lists from DAOs
    val allGroups: Flow<List<BrokerGroup>> = brokerGroupDao.getAll()
    val listings: Flow<List<Listing>> = listingDao.getAllFlow()

    private val gson = Gson()

    init {
        loadSavedCampaigns()
    }

    private fun loadSavedCampaigns() {
        viewModelScope.launch {
            campaignDao.getAllFlow().collect { campaigns ->
                savedCampaigns.value = campaigns
                val running = campaigns.find { it.status == CampaignStatus.RUNNING || it.status == CampaignStatus.PAUSED }
                runningCampaign.value = running
            }
        }
    }

    fun addContactsFromPhonebook(contacts: List<Contact>) {
        val existing = importedContacts.value.toMutableList()
        val existingPhones = existing.map { it.phone }.toSet()
        val newOnes = contacts.filter { it.phone !in existingPhones }
        importedContacts.value = existing + newOnes
        importTotalRows.value = importedContacts.value.size
    }

    fun importCsv(uri: Uri) {
        csvUri.value = uri
        viewModelScope.launch {
            try {
                val result = csvImporter.import(uri, 0)
                importedContacts.value = result.contacts
                importErrors.value = result.errors
                importTotalRows.value = result.totalRows
            } catch (e: Exception) {
                importErrors.value = listOf("CSV import failed: ${e.message}")
            }
        }
    }

    fun createAndStartCampaign() {
        viewModelScope.launch {
            try {
                val campaign = Campaign(
                    name = campaignName.value,
                    messageTemplate = messageTemplate.value,
                    mediaUri = mediaUri.value?.toString(),
                    skillsConfigJson = gson.toJson(skillsConfig.value)
                )
                val id = campaignDao.insert(campaign)
                val saved = campaign.copy(id = id)
                activeCampaign.value = saved

                val persistedContacts = importedContacts.value.map { it.copy(campaignId = id) }
                contactDao.insertAll(persistedContacts)

                startForegroundService()
                campaignManager.startCampaign(
                    campaignId = id,
                    contacts = persistedContacts,
                    messageTemplate = messageTemplate.value,
                    mediaUri = mediaUri.value,
                    skillsConfig = skillsConfig.value
                )
            } catch (e: Exception) {
                importErrors.value = listOf("Failed to start campaign: ${e.message}")
            }
        }
    }

    fun associateListing(listingId: Long) {
        activeCampaign.value?.let { campaign ->
            campaignManager.associateListing(campaign.id, listingId)
        }
    }

    private fun startForegroundService() {
        val context = getApplication<Application>()
        try {
            val intent = Intent(context, BroadcastForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            // Service start failed - log but don't crash
        }
    }

    fun resumeExistingCampaign(campaign: Campaign) {
        viewModelScope.launch {
            activeCampaign.value = campaign
            val config = try {
                gson.fromJson(campaign.skillsConfigJson, SkillsConfig::class.java)
            } catch (_: Exception) {
                SkillsConfig()
            }
            campaignManager.resumeCampaign(
                campaignId = campaign.id,
                messageTemplate = campaign.messageTemplate,
                mediaUri = campaign.mediaUri?.let { Uri.parse(it) },
                skillsConfig = config
            )
        }
    }

    fun pauseCampaign() = campaignManager.pauseCampaign()
    fun resumeCampaign() = campaignManager.resumeFromPause()
    fun stopCampaign() {
        campaignManager.stopCampaign()
        val context = getApplication<Application>()
        try {
            context.stopService(Intent(context, BroadcastForegroundService::class.java))
        } catch (_: Exception) { }
    }
}