package com.chaoscraft.wablaster.db

import android.util.Log
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.CampaignResponseDao
import com.chaoscraft.wablaster.db.daos.DealDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.entities.CampaignResponse
import com.chaoscraft.wablaster.db.entities.Deal
import com.chaoscraft.wablaster.db.entities.Listing
import com.chaoscraft.wablaster.db.entities.SendLog
import com.chaoscraft.wablaster.db.daos.SendLogDao
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ListingRepository @Inject constructor(
    private val listingDao: ListingDao,
    private val responseDao: CampaignResponseDao,
    private val dealDao: DealDao,
    private val sendLogDao: SendLogDao
) {
    val allListings = listingDao.getAllFlow()
    val activeListings = listingDao.getActiveListings()

    suspend fun getById(id: Long): Listing? = listingDao.getById(id)

    fun getByCity(city: String) = listingDao.getByCity(city)

    fun getByStatus(status: String) = listingDao.getByStatus(status)

    fun searchActive(city: String?, type: String?) =
        listingDao.searchActiveListings(city, type)

    suspend fun insertOrUpdate(listing: Listing): Long {
        val existing = listingDao.getById(listing.id)
        return if (existing != null) {
            listingDao.update(listing)
            listing.id
        } else {
            listingDao.insert(listing)
        }
    }

    suspend fun updateStatus(id: Long, status: String) =
        listingDao.updateStatus(id, status)

    // ===== Campaign Response Tracking =====

    fun getResponsesByCampaign(campaignId: Long) =
        responseDao.getByCampaign(campaignId)

    fun getHotLeads(campaignId: Long) =
        responseDao.getHotLeads(campaignId)

    fun getResponsesWithBrokerInfo(campaignId: Long) =
        responseDao.getResponsesWithBrokerInfo(campaignId)

    suspend fun recordResponse(
        campaignId: Long,
        listingId: Long,
        brokerId: Long,
        brokerName: String,
        brokerPhone: String,
        responseText: String,
        responseType: String,
        hotLeadScore: Double,
        intentLevel: String,
        responseTimeSec: Long
    ): Long {
        // Check for duplicate (same campaign + broker within 6 hours)
        val existing = responseDao.getByCampaign(campaignId)
        // Note: In production, use a proper query for dedup. Simplified here.

        val response = CampaignResponse(
            campaignId = campaignId,
            listingId = listingId,
            brokerId = brokerId,
            brokerName = brokerName,
            brokerPhone = brokerPhone,
            responseText = responseText,
            responseType = responseType,
            hotLeadScore = hotLeadScore,
            intentLevel = intentLevel,
            responseTimeSec = responseTimeSec,
            repliedAt = System.currentTimeMillis()
        )
        return responseDao.insert(response)
    }

    suspend fun markFollowUpSent(responseId: Long) {
        responseDao.markFollowUpSent(responseId, System.currentTimeMillis())
    }

    // ===== Deal Management =====

    fun getDealsByCampaign(campaignId: Long) = dealDao.getByCampaign(campaignId)

    fun getDealsByBroker(brokerId: Long) = dealDao.getByBroker(brokerId)

    fun getTotalDealValue(campaignId: Long): Flow<Double?> =
        dealDao.getTotalDealValue(campaignId)

    suspend fun recordDeal(
        campaignId: Long,
        listingId: Long,
        brokerId: Long,
        clientName: String,
        clientPhone: String,
        dealValue: Double,
        commissionRate: Double,
        commissionAmount: Double,
        attributionSource: String = "CAMPAIGN",
        stage: String = "INQUIRY"
    ): Long {
        val deal = Deal(
            campaignId = campaignId,
            listingId = listingId,
            brokerId = brokerId,
            clientName = clientName,
            clientPhone = clientPhone,
            dealValue = dealValue,
            commissionRate = commissionRate,
            commissionAmount = commissionAmount,
            attributionSource = attributionSource,
            stage = stage
        )
        return dealDao.insert(deal)
    }

    suspend fun updateDealStage(dealId: Long, stage: String) =
        dealDao.updateStage(dealId, stage)

    suspend fun markDealWon(dealId: Long) =
        dealDao.updateStage(dealId, "CLOSED_WON")

    suspend fun markDealLost(dealId: Long) =
        dealDao.updateStage(dealId, "CLOSED_LOST")

    suspend fun markCommissionPaid(dealId: Long) =
        dealDao.updateCommissionStatus(dealId, "PAID")

    fun getPendingCommission() = dealDao.getByCommissionStatus("PENDING")

    fun getPaidCommission() = dealDao.getByCommissionStatus("PAID")

    fun getTotalPaidCommission(brokerId: Long): Flow<Double> =
        dealDao.getTotalPaidCommission(brokerId)

    fun getTotalPendingCommission(brokerId: Long): Flow<Double> =
        dealDao.getTotalPendingCommission(brokerId)

    // Stats
    fun getCampaignStats(campaignId: Long): Flow<CampaignStats> {
        // This combines multiple queries — in production, use a transaction or view
        return listingDao.getById(campaignId.toLong()) // Simplified
    }
}

data class CampaignStats(
    val totalLeads: Int = 0,
    val hotLeads: Int = 0,
    val closedDeals: Int = 0,
    val totalDealValue: Double = 0.0,
    val totalCommission: Double = 0.0
)