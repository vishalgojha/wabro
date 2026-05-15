package com.chaoscraft.wablaster.util

import android.content.Context
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WaBroApiClient @Inject constructor(
    private val context: Context
) {
    // Remote orchestration is intentionally disabled until the backend contract is finalized.
    suspend fun registerDevice(deviceId: String, model: String, androidVersion: String, appVersion: String): Result<Unit> {
        return Result.success(Unit)
    }

    suspend fun getPendingCampaigns(deviceId: String): Result<List<PendingCampaign>> {
        return Result.success(emptyList())
    }

    suspend fun syncSendLogs(campaignId: String, logs: List<SendLog>): Result<Unit> {
        return Result.success(Unit)
    }

    suspend fun syncCampaignProgress(campaignId: String, updates: Map<String, Any>): Result<Unit> {
        return Result.success(Unit)
    }

    suspend fun reportCrash(deviceId: String, model: String, androidVersion: String, appVersion: String, stackTrace: String): Result<Unit> {
        return Result.success(Unit)
    }
}

// Data classes for API responses
data class PendingCampaign(
    val id: String,
    val name: String,
    val message_template: String,
    val media_url: String?,
    val skills_config: Map<String, Any>?,
    val contacts: List<CampaignContact>,
    val status: String,
    val total_contacts: Int,
    val sent_count: Int,
    val failed_count: Int,
    val skipped_count: Int,
    val schedule_at: String?,
    val started_at: String?,
    val completed_at: String?,
    val created_at: String,
    val updated_at: String
)

data class CampaignContact(
    val phone: String,
    val name: String,
    val status: String
)

data class SendLog(
    val phone: String,
    val name: String,
    val status: String,
    val error: String?
)
