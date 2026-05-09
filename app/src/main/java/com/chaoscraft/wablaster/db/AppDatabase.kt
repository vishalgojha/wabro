package com.chaoscraft.wablaster.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
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

        val MIGRATION_1_2 = Migration(1, 2) { db ->
            db.execSQL("CREATE TABLE IF NOT EXISTS `broadcast_lists` (`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, `name` TEXT NOT NULL, `contactCount` INTEGER NOT NULL, `createdAt` INTEGER NOT NULL)")
            db.execSQL("CREATE TABLE IF NOT EXISTS `broadcast_list_contacts` (`listId` INTEGER NOT NULL, `phone` TEXT NOT NULL, `name` TEXT NOT NULL, `locality` TEXT, `budget` TEXT, `language` TEXT, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`listId`, `phone`))")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_broadcast_list_contacts_listId` ON `broadcast_list_contacts` (`listId`)")
            db.execSQL("CREATE INDEX IF NOT EXISTS `index_broadcast_list_contacts_phone` ON `broadcast_list_contacts` (`phone`)")
        }

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    DATABASE_NAME
                )
                    .addMigrations(MIGRATION_1_2)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}


