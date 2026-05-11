package com.chaoscraft.wablaster.util

import android.content.Context
import android.util.Log
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WaBroApiClient @Inject constructor(
    private val context: Context
) {
    companion object {
        private const val TAG = "WaBroApiClient"
        private const val BASE_URL = "https://wabro.propai.live/api/wabro"
        
        // For debugging/testing - can be overridden in dev builds
        private const val DEV_BASE_URL = "https://api.propai.live/api/wabro"
    }

    private val gson = Gson()
    
    // Register device
    suspend fun registerDevice(deviceId: String, model: String, androidVersion: String, appVersion: String): Result<Unit> {
        return callApi(
            endpoint = "/devices/register",
            method = "POST",
            body = mapOf(
                "device_id" to deviceId,
                "device_model" to model,
                "android_version" to androidVersion,
                "app_version" to appVersion
            )
        )
    }
    
    // Get pending campaigns
    suspend fun getPendingCampaigns(deviceId: String): Result<List<PendingCampaign>> {
        return callApi<List<PendingCampaign>>(
            endpoint = "/pending/$deviceId",
            method = "GET"
        )
    }
    
    // Sync send logs
    suspend fun syncSendLogs(campaignId: String, logs: List<SendLog>): Result<Unit> {
        return callApi(
            endpoint = "/sync/logs",
            method = "POST",
            body = mapOf(
                "campaign_id" to campaignId,
                "logs" to logs
            )
        )
    }
    
    // Sync campaign progress
    suspend fun syncCampaignProgress(campaignId: String, updates: Map<String, Any>): Result<Unit> {
        return callApi(
            endpoint = "/sync/campaign/$campaignId",
            method = "POST",
            body = updates
        )
    }
    
    // Report crash
    suspend fun reportCrash(deviceId: String, model: String, androidVersion: String, appVersion: String, stackTrace: String): Result<Unit> {
        return callApi(
            endpoint = "/crash",
            method = "POST",
            body = mapOf(
                "device_id" to deviceId,
                "device_model" to model,
                "android_version" to androidVersion,
                "app_version" to appVersion,
                "stack_trace" to stackTrace
            )
        )
    }
    
    private suspend fun <T> callApi(
        endpoint: String,
        method: String,
        body: Any? = null
    ): Result<T> {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$BASE_URL$endpoint")
                val conn = url.openConnection() as HttpURLConnection
                
                conn.apply {
                    requestMethod = method
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                    doOutput = body != null
                    connectTimeout = 15_000
                    readTimeout = 30_000
                }
                
                body?.let {
                    val jsonBody = gson.toJson(it)
                    OutputStreamWriter(conn.outputStream).use { writer ->
                        writer.write(jsonBody)
                    }
                }
                
                val responseCode = conn.responseCode
                if (responseCode < 200 || responseCode >= 300) {
                    val error = BufferedReader(InputStreamReader(conn.errorStream)).readText()
                    Log.e(TAG, "API Error ($responseCode): $error")
                    return@withContext Result.failure(Exception("API Error $responseCode: $error"))
                }
                
                val response = BufferedReader(InputStreamReader(conn.inputStream)).readText()
                if (responseCode == 204) {
                    // No content
                    return@withContext Result.success(null as T)
                }
                
                // Parse response for GET requests
                val result = try {
                    if (T::class.java == List::class.java) {
                        // For List responses, we need special handling
                        gson.fromJson(response, T::class.java) as T
                    } else {
                        gson.fromJson(response, T::class.java) as T
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Parse error: $e")
                    return@withContext Result.failure(e)
                }
                
                Result.success(result)
            } catch (e: Exception) {
                Log.e(TAG, "Network error", e)
                Result.failure(e)
            }
        }
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