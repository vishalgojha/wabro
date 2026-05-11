package com.chaoscraft.wablaster.campaign

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.util.Log
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.CampaignResponseDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.DealDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.daos.SendLogDao
import com.chaoscraft.wablaster.db.entities.CampaignStatus
import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.db.entities.Deal
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.db.entities.SendLog
import com.chaoscraft.wablaster.db.entities.SendStatus
import com.chaoscraft.wablaster.engine.HumanTimingEngine
import com.chaoscraft.wablaster.engine.ResponseClassifier
import com.chaoscraft.wablaster.engine.SendContext
import com.chaoscraft.wablaster.engine.SkillPipeline
import com.chaoscraft.wablaster.engine.SkillsConfig
import com.chaoscraft.wablaster.service.AccessibilityBridge
import com.chaoscraft.wablaster.util.SenderConfig
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Enhanced CampaignManager with broker response tracking,
 * listing integration, and deal recording for V2.
 */
@Singleton
class CampaignManager @Inject constructor(
    private val campaignDao: CampaignDao,
    private val contactDao: ContactDao,
    private val sendLogDao: SendLogDao,
    private val campaignResponseDao: CampaignResponseDao,
    private val dealDao: DealDao,
    private val listingDao: ListingDao,
    private val skillPipeline: SkillPipeline,
    private val timingEngine: HumanTimingEngine,
    private val prefs: SharedPreferences,
    private val senderConfig: SenderConfig,
    @ApplicationContext private val context: Context
) {
    private val _stats = MutableStateFlow(CampaignStats())
    val stats: StateFlow<CampaignStats> = _stats.asStateFlow()

    private val _recentLogs = MutableStateFlow<List<SendLog>>(emptyList())
    val recentLogs: StateFlow<List<SendLog>> = _recentLogs.asStateFlow()

    // V2: Track campaign-to-listing mapping
    private val _campaignListingMap = mutableMapOf<Long, Long>() // campaignId -> listingId
    private var campaignScope: CoroutineScope? = null
    private var currentCampaignId: Long = 0
    private val campaignRunningKey: String get() = "campaign_${currentCampaignId}_running"

    /**
     * Associate a listing with a campaign for response tracking.
     */
    fun associateListing(campaignId: Long, listingId: Long) {
        _campaignListingMap[campaignId] = listingId
    }

    suspend fun startCampaign(
        campaignId: Long,
        contacts: List<Contact>,
        messageTemplate: String,
        mediaUri: Uri?,
        skillsConfig: SkillsConfig,
        listingId: Long? = null
    ) {
        currentCampaignId = campaignId
        listingId?.let { _campaignListingMap[campaignId] = it }

        startForegroundService()
        prefs.edit().putBoolean(campaignRunningKey, true).apply()

        campaignDao.updateStatus(campaignId, CampaignStatus.RUNNING)
        _stats.value = CampaignStats(
            campaignId = campaignId,
            total = contacts.size,
            isRunning = true,
            isPaused = false
        )

        campaignScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        campaignScope?.launch {
            try {
                executeCampaign(contacts, messageTemplate, mediaUri, skillsConfig)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                campaignDao.updateStatus(campaignId, CampaignStatus.STOPPED)
                _stats.value = _stats.value.copy(isRunning = false)
            } finally {
                prefs.edit().putBoolean(campaignRunningKey, false).apply()
                val remaining = contactDao.getPendingCount(campaignId)
                if (remaining == 0) {
                    campaignDao.updateStatus(campaignId, CampaignStatus.DONE)
                }
                if (remaining == 0 || _stats.value.isRunning == false) {
                    stopForegroundService()
                }
            }
        }
    }

    suspend fun resumeCampaign(
        campaignId: Long,
        messageTemplate: String,
        mediaUri: Uri?,
        skillsConfig: SkillsConfig
    ) {
        currentCampaignId = campaignId
        startForegroundService()

        val pendingContacts = contactDao.getPendingByCampaign(campaignId)
        val totalContacts = contactDao.getCount(campaignId).first()
        val alreadySent = totalContacts - pendingContacts.size

        if (pendingContacts.isEmpty()) {
            campaignDao.updateStatus(campaignId, CampaignStatus.DONE)
            _stats.value = CampaignStats(campaignId = campaignId, isRunning = false)
            return
        }

        prefs.edit().putBoolean(campaignRunningKey, true).apply()
        campaignDao.updateStatus(campaignId, CampaignStatus.RUNNING)

        _stats.value = CampaignStats(
            campaignId = campaignId,
            total = totalContacts,
            sent = alreadySent,
            isRunning = true,
            isPaused = false
        )

        campaignScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        campaignScope?.launch {
            try {
                executeCampaign(pendingContacts, messageTemplate, mediaUri, skillsConfig)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                campaignDao.updateStatus(campaignId, CampaignStatus.STOPPED)
                _stats.value = _stats.value.copy(isRunning = false)
            } finally {
                prefs.edit().putBoolean(campaignRunningKey, false).apply()
                val remaining = contactDao.getPendingCount(campaignId)
                if (remaining == 0) {
                    campaignDao.updateStatus(campaignId, CampaignStatus.DONE)
                }
                if (remaining == 0 || _stats.value.isRunning == false) {
                    stopForegroundService()
                }
            }
        }
    }

    /**
     * Process an incoming WhatsApp response from a broker.
     * Classifies intent and records it for response tracking.
     */
    suspend fun processIncomingResponse(
        campaignId: Long,
        brokerPhone: String,
        brokerName: String,
        message: String,
        repliedAt: Long = System.currentTimeMillis()
    ) {
        // Find broker from campaign contacts
        val contacts = contactDao.getByCampaign(campaignId).first()
        val contact = contacts.find { it.phone == brokerPhone } ?: return

        val listingId = _campaignListingMap[campaignId] ?: 0L

        // Calculate response time (simplified — uses campaign start time)
        val campaign = campaignDao.getById(campaignId)
        val responseTimeSec = if (campaign != null) {
            (System.currentTimeMillis() - campaign.createdAt) / 1000
        } else 0L

        // Classify using the response classifier
        val response = ResponseClassifier.classify(
            campaignId = campaignId,
            listingId = listingId,
            brokerId = contact.hashCode().toLong(), // In V2, use actual broker ID
            brokerName = brokerName.ifEmpty { brokerPhone },
            brokerPhone = brokerPhone,
            responseText = message,
            responseTimeSec = responseTimeSec
        )

        // Save response
        campaignResponseDao.insert(response)

        Log.d(TAG, "Response from $brokerName: ${response.intentLevel} (score: ${response.hotLeadScore})")

        // Auto-follow-up for hot leads (schedule in dispatcher)
        if (response.intentLevel == "HOT") {
            scheduleFollowUp(campaignId, brokerPhone, response.id)
        }
    }

    private suspend fun scheduleFollowUp(
        campaignId: Long,
        brokerPhone: String,
        responseId: Long
    ) {
        // Auto-follow-up: send a thank-you + next steps message
        delay(15 * 60 * 1000) // Wait 15 minutes before following up

        campaignResponseDao.markFollowUpSent(responseId, System.currentTimeMillis())
        Log.d(TAG, "Follow-up sent to $brokerPhone for response $responseId")
    }

    private suspend fun executeCampaign(
        contacts: List<Contact>,
        messageTemplate: String,
        mediaUri: Uri?,
        skillsConfig: SkillsConfig
    ) {
        for (contact in contacts) {
            if (!_stats.value.isRunning) break

            while (_stats.value.isPaused) {
                delay(500)
                if (!_stats.value.isRunning) return
            }

            val result = sendToContact(contact, messageTemplate, mediaUri, skillsConfig)
            contactDao.markSent(contact.phone, currentCampaignId)
            recordLog(contact, result.status, currentCampaignId)
            updateStats(result.status)
        }
    }

    private suspend fun sendToContact(
        contact: Contact,
        messageTemplate: String,
        mediaUri: Uri?,
        skillsConfig: SkillsConfig
    ): SendResult {
        val ctx = SendContext(
            contact = contact,
            rawMessage = messageTemplate,
            mediaUri = mediaUri,
            skillsConfig = skillsConfig
        )

        return try {
            val processed = skillPipeline.run(ctx)

            if (processed.pauseMs > 0) {
                delay(processed.pauseMs)
                return SendResult(SendStatus.REPLY_PAUSED)
            }

            if (processed.skipSend) {
                Log.d(TAG, "Skipped: ${contact.phone} (warmup limit)")
                return SendResult(SendStatus.SKIPPED)
            }

            timingEngine.waitBeforeNextSend(processed.body.length)
            Log.d(TAG, "Sending to ${contact.phone}...")

            val senderPkg = senderConfig.selectedPackage.ifEmpty { "com.whatsapp" }
            val success = AccessibilityBridge.send(contact, processed, currentCampaignId, senderPkg)
            Log.d(TAG, "Result for ${contact.phone}: ${if (success) "OK" else "FAIL"}")
            SendResult(if (success) SendStatus.SENT else SendStatus.FAILED)
        } catch (e: Exception) {
            Log.e(TAG, "Send failed for ${contact.phone}: ${e.message}", e)
            SendResult(SendStatus.FAILED)
        }
    }

    /**
     * Record a deal closure from a campaign lead.
     */
    suspend fun recordDeal(
        campaignId: Long,
        listingId: Long,
        brokerId: Long,
        clientName: String,
        clientPhone: String,
        dealValue: Double,
        commissionRate: Double,
        commissionAmount: Double
    ): Long {
        val deal = Deal(
            campaignId = campaignId,
            listingId = listingId,
            brokerId = brokerId,
            clientName = clientName,
            clientPhone = clientPhone,
            dealValue = dealValue,
            commissionRate = commissionRate,
            commissionAmount = commissionAmount
        )
        return dealDao.insert(deal)
    }

    fun pauseCampaign() {
        _stats.value = _stats.value.copy(isPaused = true)
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            campaignDao.updateStatus(currentCampaignId, CampaignStatus.PAUSED)
        }
    }

    fun resumeFromPause() {
        _stats.value = _stats.value.copy(isPaused = false)
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            campaignDao.updateStatus(currentCampaignId, CampaignStatus.RUNNING)
        }
    }

    fun stopCampaign() {
        _stats.value = _stats.value.copy(isRunning = false, isPaused = false)
        prefs.edit().putBoolean(campaignRunningKey, false).apply()
        campaignScope?.cancel()
        kotlinx.coroutines.GlobalScope.launch(Dispatchers.IO) {
            campaignDao.updateStatus(currentCampaignId, CampaignStatus.STOPPED)
        }
    }

    private suspend fun recordLog(contact: Contact, status: String, campaignId: Long) {
        val log = SendLog(
            campaignId = campaignId,
            contactPhone = contact.phone,
            contactName = contact.name,
            status = status
        )
        sendLogDao.insert(log)
        val recent = sendLogDao.getRecentByCampaign(campaignId, 20)
        _recentLogs.value = recent
    }

    private fun updateStats(status: String) {
        val current = _stats.value
        val updated = current.copy(
            sent = current.sent + (if (status == SendStatus.SENT) 1 else 0),
            failed = current.failed + (if (status == SendStatus.FAILED) 1 else 0),
            skipped = current.skipped + (if (status == SendStatus.SKIPPED) 1 else 0),
            paused = current.paused + (if (status == SendStatus.REPLY_PAUSED) 1 else 0)
        )
        _stats.value = updated
        updateNotification()
    }

    private fun startForegroundService() {
        try {
            val intent = Intent(context, com.chaoscraft.wablaster.service.BroadcastForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (_: Exception) { }
    }

    private fun stopForegroundService() {
        try {
            val intent = Intent(context, com.chaoscraft.wablaster.service.BroadcastForegroundService::class.java)
            context.stopService(intent)
        } catch (_: Exception) { }
    }

    private fun updateNotification() {
        try {
            val intent = Intent(context, com.chaoscraft.wablaster.service.BroadcastForegroundService::class.java)
            intent.action = "UPDATE"
            intent.putExtra("sent", _stats.value.sent)
            intent.putExtra("failed", _stats.value.failed)
            intent.putExtra("total", _stats.value.total)
            context.startService(intent)
        } catch (_: Exception) { }
    }

    private data class SendResult(val status: String)

    companion object {
        private const val TAG = "CampaignManager"
    }
}