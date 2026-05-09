package com.chaoscraft.wablaster.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.SendLogDao
import com.chaoscraft.wablaster.db.entities.BroadcastList
import com.chaoscraft.wablaster.db.entities.BroadcastListContact
import com.chaoscraft.wablaster.db.entities.Campaign
import com.chaoscraft.wablaster.db.entities.Contact
import com.chaoscraft.wablaster.db.entities.SendLog

@Database(
    entities = [Campaign::class, Contact::class, SendLog::class, BroadcastList::class, BroadcastListContact::class],
    version = 2,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun campaignDao(): CampaignDao
    abstract fun contactDao(): ContactDao
    abstract fun sendLogDao(): SendLogDao
    abstract fun broadcastListDao(): BroadcastListDao
    abstract fun broadcastListContactDao(): BroadcastListContactDao

    companion object {
        const val DATABASE_NAME = "wablaster.db"

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    DATABASE_NAME
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}


