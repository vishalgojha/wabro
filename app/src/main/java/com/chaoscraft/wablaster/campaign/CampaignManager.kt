package com.chaoscraft.wablaster.campaign

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import android.os.Build
import android.util.Log
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.SendLogDao
import com.chaoscraft.wablaster.db.entities.CampaignStatus
import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.db.entities.SendLog
import com.chaoscraft.wablaster.db.entities.SendStatus
import com.chaoscraft.wablaster.engine.HumanTimingEngine
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

data class CampaignStats(
    val campaignId: Long = 0,
    val total: Int = 0,
    val sent: Int = 0,
    val failed: Int = 0,
    val skipped: Int = 0,
    val paused: Int = 0,
    val isRunning: Boolean = false,
    val isPaused: Boolean = false
)

@Singleton
class CampaignManager @Inject constructor(
    private val campaignDao: CampaignDao,
    private val contactDao: ContactDao,
    private val sendLogDao: SendLogDao,
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

    private var campaignScope: CoroutineScope? = null
    private var currentCampaignId: Long = 0
    private val campaignRunningKey: String get() = "campaign_${currentCampaignId}_running"

    suspend fun startCampaign(
        campaignId: Long,
        contacts: List<Contact>,
        messageTemplate: String,
        mediaUri: Uri?,
        skillsConfig: SkillsConfig
    ) {
        currentCampaignId = campaignId

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
