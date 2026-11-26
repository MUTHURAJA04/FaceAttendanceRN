package com.faceattendancern.ml

import android.media.MediaPlayer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.faceattendancern.R

class FaceScannerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "FaceScannerModule"

    private val recognizer by lazy { TFLiteFaceRecognition.getInstance(reactContext) }

    @ReactMethod
    fun loadEmployees(employeesJson: String, promise: Promise) {
        try {
            val count = recognizer.loadFromJson(employeesJson)
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("LOAD_ERR", e.message, e)
        }
    }

    @ReactMethod
    fun ejectEmployee(employeeId: String, promise: Promise) {
        promise.resolve(recognizer.ejectUser(employeeId))
    }

    @ReactMethod
    fun registerUserInRam(id: String, name: String, employeeCode: String, branchId: String?, embeddingArray: ReadableArray, promise: Promise) {
        try {
            val floats = FloatArray(embeddingArray.size()) { i -> embeddingArray.getDouble(i).toFloat() }
            recognizer.register(id, name, employeeCode, branchId, floats)
            promise.resolve(recognizer.registeredUsers.size)
        } catch (e: Exception) {
            promise.reject("REG_ERR", e.message, e)
        }
    }

    @ReactMethod
    fun captureForRegister(excludeEmployeeId: String?, promise: Promise) {
        val embedding = FaceScannerView.latestValidEmbedding
        val photo = FaceScannerView.latestValidPhotoBase64
        if (!FaceScannerView.isCurrentPoseValid || embedding == null) {
            promise.reject("NO_FACE", "Please hold still and center your face in the frame")
            return
        }

        val collision = recognizer.findFaceCollision(embedding, excludeEmployeeId)
        val result = Arguments.createMap()
        if (collision != null) {
            val (user, dist) = collision
            val simPct = ((1.0f - (dist * dist) / 2.0f) * 100).toInt().coerceIn(65, 99)
            result.putBoolean("collision", true)
            result.putString("existingName", user.name)
            result.putString("existingCode", user.employeeCode)
            result.putInt("similarity", simPct)
            promise.resolve(result)
            return
        }

        val arr = Arguments.createArray()
        for (v in embedding) arr.pushDouble(v.toDouble())
        result.putBoolean("collision", false)
        result.putArray("embedding", arr)
        result.putString("photoBase64", photo ?: "")
        promise.resolve(result)
    }

    @ReactMethod
    fun playAudio(soundName: String) {
        val resId = when (soundName) {
            "punch_in", "punch_out", "success_sound" -> R.raw.success_sound
            else -> R.raw.sorrytryagain
        }
        try {
            val player = MediaPlayer.create(reactContext, resId)
            player?.setOnCompletionListener { it.release() }
            player?.start()
        } catch (_: Exception) {
        }
    }
}
