package com.chaoscraft.wablaster.db.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "broker_group_cross_ref")
data class BrokerGroupCrossRef(
    val brokerId: Long,
    val groupId: Long,
    val addedAt: Long = System.currentTimeMillis()
)