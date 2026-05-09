package com.chaoscraft.wablaster.campaign

import android.content.Context
import android.content.SharedPreferences
import com.chaoscraft.wablaster.db.daos.CampaignDao
import com.chaoscraft.wablaster.db.daos.ContactDao
import com.chaoscraft.wablaster.db.daos.SendLogDao
import com.chaoscraft.wablaster.engine.HumanTimingEngine
import com.chaoscraft.wablaster.engine.SkillPipeline
import com.chaoscraft.wablaster.util.SenderConfig
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class CampaignManagerTest {

    private lateinit var campaignDao: CampaignDao
    private lateinit var contactDao: ContactDao
    private lateinit var sendLogDao: SendLogDao
    private lateinit var skillPipeline: SkillPipeline
    private lateinit var timingEngine: HumanTimingEngine
    private lateinit var prefs: SharedPreferences
    private lateinit var senderConfig: SenderConfig
    private lateinit var context: Context
    private lateinit var manager: CampaignManager
    private lateinit var editor: SharedPreferences.Editor

    @Before
    fun setup() {
        campaignDao = mockk()
        contactDao = mockk()
        sendLogDao = mockk()
        skillPipeline = mockk()
        timingEngine = mockk()
        prefs = mockk()
        editor = mockk()
        senderConfig = mockk()
        context = mockk()

        every { prefs.edit() } returns editor
        every { editor.putBoolean(any(), any()) } returns editor
        every { editor.apply() } just runs
        every { context.applicationContext } returns context
        every { context.startService(any()) } returns null
        every { context.startForegroundService(any()) } returns null
        every { context.stopService(any()) } returns true

        manager = CampaignManager(
            campaignDao = campaignDao,
            contactDao = contactDao,
            sendLogDao = sendLogDao,
            skillPipeline = skillPipeline,
            timingEngine = timingEngine,
            prefs = prefs,
            senderConfig = senderConfig,
            context = context
        )
    }

    @Test
    fun `initial stats are empty`() {
        val stats = manager.stats.value
        assertEquals(0, stats.total)
        assertEquals(0, stats.sent)
        assertEquals(0, stats.failed)
        assertFalse(stats.isRunning)
        assertFalse(stats.isPaused)
    }

    @Test
    fun `pause sets isPaused true`() {
        manager.pauseCampaign()
        assertTrue(manager.stats.value.isPaused)
    }

    @Test
    fun `resumeFromPause sets isPaused false`() {
        manager.pauseCampaign()
        assertTrue(manager.stats.value.isPaused)
        manager.resumeFromPause()
        assertFalse(manager.stats.value.isPaused)
    }

    @Test
    fun `stop sets isRunning and isPaused false`() {
        manager.stopCampaign()
        val stats = manager.stats.value
        assertFalse(stats.isRunning)
        assertFalse(stats.isPaused)
    }

    @Test
    fun `recentLogs starts empty`() {
        assertTrue(manager.recentLogs.value.isEmpty())
    }
}
