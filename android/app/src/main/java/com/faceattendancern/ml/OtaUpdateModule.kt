package com.faceattendancern.ml

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.faceattendancern.BuildConfig
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class OtaUpdateModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String = "OtaUpdateModule"

    @ReactMethod
    fun getAppInfo(promise: Promise) {
        val map = Arguments.createMap().apply {
            putString("packageName", BuildConfig.APPLICATION_ID)
            putInt("versionCode", BuildConfig.VERSION_CODE)
            putString("versionName", BuildConfig.VERSION_NAME)
        }
        promise.resolve(map)
    }

    @ReactMethod
    fun canRequestPackageInstalls(promise: Promise) {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            reactContext.packageManager.canRequestPackageInstalls()
        promise.resolve(allowed)
    }

    @ReactMethod
    fun openUnknownAppSourcesSettings(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${reactContext.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_ERR", e.message, e)
        }
    }

    @ReactMethod
    fun downloadAndInstallApk(downloadUrl: String, fileName: String?, promise: Promise) {
        executor.execute {
            val safeName = fileName?.takeIf { it.isNotBlank() }?.substringAfterLast('/')
                ?: "kiosk-update.apk"
            val apkFile = File(reactContext.cacheDir, safeName)
            var conn: HttpURLConnection? = null
            try {
                if (apkFile.exists()) apkFile.delete()

                conn = (URL(downloadUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000
                    readTimeout = 60000
                    setRequestProperty("Cache-Control", "no-cache")
                    instanceFollowRedirects = true
                }
                conn.connect()

                val code = conn.responseCode
                if (code !in 200..299) {
                    throw Exception("Download failed (HTTP $code)")
                }

                val totalBytes = conn.contentLengthLong
                conn.inputStream.use { input ->
                    FileOutputStream(apkFile).use { output ->
                        val buffer = ByteArray(8 * 1024)
                        var copied = 0L
                        var lastPercent = -1
                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            output.write(buffer, 0, read)
                            copied += read
                            if (totalBytes > 0) {
                                val pct = ((copied * 100L) / totalBytes).toInt().coerceIn(0, 100)
                                if (pct != lastPercent) {
                                    lastPercent = pct
                                    emitProgress(pct)
                                }
                            }
                        }
                        output.flush()
                    }
                }
                emitProgress(100)

                val apkUri = FileProvider.getUriForFile(
                    reactContext,
                    "${BuildConfig.APPLICATION_ID}.fileprovider",
                    apkFile
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(apkUri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(installIntent)
                promise.resolve(apkFile.absolutePath)
            } catch (e: Exception) {
                if (apkFile.exists()) apkFile.delete()
                promise.reject("DOWNLOAD_ERR", e.message ?: "Download failed", e)
            } finally {
                conn?.disconnect()
            }
        }
    }

    private fun emitProgress(percent: Int) {
        val params = Arguments.createMap().apply { putInt("percent", percent) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onOtaDownloadProgress", params)
    }
}
