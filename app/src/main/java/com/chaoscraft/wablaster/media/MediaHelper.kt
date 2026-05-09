package com.chaoscraft.wablaster.media

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MediaHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {

    fun copyToCache(uri: Uri, mimeType: String): Uri {
        val extension = when {
            mimeType.startsWith("image/") -> ".jpg"
            mimeType == "application/pdf" -> ".pdf"
            else -> ".bin"
        }

        val subDir = when {
            mimeType.startsWith("image/") -> "images"
            else -> "documents"
        }

        val cacheDir = File(context.cacheDir, subDir)
        if (!cacheDir.exists()) cacheDir.mkdirs()

        val file = File.createTempFile("media_", extension, cacheDir)
        context.contentResolver.openInputStream(uri)?.use { input ->
            file.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        return FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
    }

    fun getMimeType(uri: Uri): String {
        return context.contentResolver.getType(uri) ?: "image/*"
    }
}
