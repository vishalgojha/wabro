package com.chaoscraft.wablaster.di

import android.content.Context
import android.content.SharedPreferences
import com.chaoscraft.wablaster.db.AppDatabase
import com.chaoscraft.wablaster.db.daos.BroadcastListContactDao
import com.chaoscraft.wablaster.db.daos.BroadcastListDao
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.SendLogDao
import com.chaoscraft.wablaster.engine.HumanTimingEngine
import com.chaoscraft.wablaster.engine.Skill
import com.chaoscraft.wablaster.engine.SkillPipeline
import com.chaoscraft.wablaster.engine.skills.*
import com.chaoscraft.wablaster.service.AccessibilityBridge
import com.chaoscraft.wablaster.util.AiConfig
import com.chaoscraft.wablaster.util.GeminiClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return AppDatabase.getInstance(context)
    }

    @Provides
    @Singleton
    fun provideCampaignDao(database: AppDatabase): CampaignDao {
        return database.campaignDao()
    }

    @Provides
    @Singleton
    fun provideContactDao(database: AppDatabase): ContactDao {
        return database.contactDao()
    }

    @Provides
    @Singleton
    fun provideSendLogDao(database: AppDatabase): SendLogDao {
        return database.sendLogDao()
    }

    @Provides
    @Singleton
    fun provideBroadcastListDao(database: AppDatabase): BroadcastListDao {
        return database.broadcastListDao()
    }

    @Provides
    @Singleton
    fun provideBroadcastListContactDao(database: AppDatabase): BroadcastListContactDao {
        return database.broadcastListContactDao()
    }

    @Provides
    @Singleton
    fun provideSharedPreferences(@ApplicationContext context: Context): SharedPreferences {
        return context.getSharedPreferences("wablaster_prefs", Context.MODE_PRIVATE)
    }

    @Provides
    @Singleton
    fun provideHumanTimingEngine(): HumanTimingEngine {
        return HumanTimingEngine()
    }

    @Provides
    @Singleton
    fun provideSkills(prefs: SharedPreferences, gemini: GeminiClient): List<Skill> {
        return listOf(
            SpinSkill(),
            MergeSkill(),
            TranslateSkill(gemini),
            SmartCaptionSkill(gemini),
            AIRewriteSkill(gemini),
            ReplyGuardSkill(AccessibilityBridge.replyFlow),
            WarmupSkill(prefs)
        )
    }

    @Provides
    @Singleton
    fun provideSkillPipeline(skills: @JvmSuppressWildcards List<Skill>): SkillPipeline {
        return SkillPipeline(skills)
    }
}
