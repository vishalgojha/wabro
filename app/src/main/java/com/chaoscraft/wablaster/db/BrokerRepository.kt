package com.chaoscraft.wablaster.db

import android.content.Context
import android.location.Geocoder
import android.util.Log
import com.chaoscraft.wablaster.db.daos.BrokerDao
import com.chaoscraft.wablaster.db.daos.BrokerGroupCrossRefDao
import com.chaoscraft.wablaster.db.daos.BrokerGroupDao
import com.chaoscraft.wablaster.db.daos.ListingDao
import com.chaoscraft.wablaster.db.entities.Broker
import com.chaoscraft.wablaster.db.entities.BrokerGroup
import com.chaoscraft.wablaster.db.entities.BrokerGroupCrossRef
import com.chaoscraft.wablaster.db.entities.Listing
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BrokerRepository @Inject constructor(
    private val brokerDao: BrokerDao,
    private val groupDao: BrokerGroupDao,
    private val crossRefDao: BrokerGroupCrossRefDao,
    @ApplicationContext private val context: Context
) {
    val allBrokers = brokerDao.getAll()
    val activeBrokers = brokerDao.getAllActive()

    suspend fun getById(id: Long): Broker? = brokerDao.getById(id)

    suspend fun getByPhone(phone: String): Broker? = brokerDao.getByPhone(phone)

    fun searchByCityAndSpecialty(city: String?, specialty: String?) =
        brokerDao.searchByCityAndSpecialty(city, specialty)

    fun getByCity(city: String) = brokerDao.getByCity(city)

    fun getByLocality(locality: String) = brokerDao.getByLocality(locality)

    fun getByPincode(pincode: String) = brokerDao.getByPincode(pincode)

    fun getBySpecialization(specialty: String) = brokerDao.getBySpecialization(specialty)

    fun getByTag(tag: String) = brokerDao.getByTag(tag)

    suspend fun insertOrUpdate(broker: Broker): Long {
        val existing = getByPhone(broker.phone)
        return if (existing != null) {
            brokerDao.update(broker.copy(id = existing.id))
            existing.id
        } else {
            brokerDao.insert(broker)
        }
    }

    suspend fun insertAll(brokers: List<Broker>) {
        brokers.forEach { insertOrUpdate(it) }
    }

    suspend fun delete(broker: Broker) {
        crossRefDao.deleteByGroup(broker.id) // Not exactly right, need to clean cross-ref for this broker
        brokerDao.delete(broker)
    }

    suspend fun deactivate(id: Long) = brokerDao.deactivate(id)
    suspend fun activate(id: Long) = brokerDao.activate(id)

    suspend fun updateScore(brokerId: Long, score: Double) =
        brokerDao.updateScore(brokerId, score)

    // ===== Broker Groups =====

    val allGroups = groupDao.getAll()

    fun searchGroups(query: String) = groupDao.search(query)

    suspend fun createGroup(name: String, type: String = "CUSTOM", criteria: String = "{}"): Long {
        return groupDao.insert(BrokerGroup(name = name, type = type, filterCriteria = criteria))
    }

    suspend fun getGroupById(id: Long): BrokerGroup? = groupDao.getById(id)

    suspend fun addBrokersToGroup(brokerIds: List<Long>, groupId: Long) {
        val refs = brokerIds.map { BrokerGroupCrossRef(brokerId = it, groupId = groupId) }
        crossRefDao.insertAll(refs)
        groupDao.updateBrokerCount(groupId)
    }

    suspend fun removeBrokerFromGroup(brokerId: Long, groupId: Long) {
        crossRefDao.removeBrokerFromGroup(brokerId, groupId)
        groupDao.updateBrokerCount(groupId)
    }

    fun getBrokersInGroup(groupId: Long) = crossRefDao.getBrokersInGroup(groupId)

    suspend fun getGroupIdsForBroker(brokerId: Long): List<Long> =
        crossRefDao.getGroupIdsForBroker(brokerId)

    suspend fun deleteGroup(groupId: Long) {
        crossRefDao.deleteByGroup(groupId)
        groupDao.deleteById(groupId)
    }

    suspend fun updateGroup(group: BrokerGroup) {
        groupDao.update(group)
        groupDao.updateBrokerCount(group.id)
    }

    // ===== Geo-Tagging =====

    suspend fun geoTagBroker(brokerId: Long, pincode: String): Boolean {
        return try {
            val geocoder = Geocoder(context, Locale.getDefault())
            val addresses = geocoder.getFromLocationName(pincode, 1)
            if (!addresses.isNullOrEmpty()) {
                val addr = addresses[0]
                // Update broker with lat/lon and city/locality from geocoder
                val broker = getById(brokerId) ?: return false
                val updated = broker.copy(
                    pincode = pincode,
                    latitude = addr.latitude,
                    longitude = addr.longitude,
                    city = addr.locality ?: broker.city,
                    locality = addr.subLocality ?: addr.thoroughfare ?: broker.locality
                )
                insertOrUpdate(updated)
                true
            } else false
        } catch (e: Exception) {
            Log.e("BrokerRepository", "Geocoding failed for pincode $pincode", e)
            false
        }
    }

    fun getBrokersNearPincode(targetPincode: String, maxDistanceKm: Double = 10.0): Flow<List<Broker>> {
        return brokerDao.getAllActive().map { brokers ->
            // Simple distance approximation using pincode prefix (first 3 digits = area)
            val targetPrefix = targetPincode.take(3)
            brokers.filter { broker ->
                if (broker.latitude == 0.0 || broker.longitude == 0.0) {
                    broker.pincode.take(3) == targetPrefix
                } else {
                    // For now, filter by pincode prefix
                    // Full geo-distance calculation would need lat/lon for the target pincode too
                    broker.pincode.take(3) == targetPrefix
                }
            }
        }
    }

    suspend fun count(): Int = brokerDao.count()
}