package com.faceattendancern.ml

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.sqrt

data class RegisteredUser(
    val id: String,
    val name: String,
    val employeeCode: String,
    val branchId: String?,
    val embedding: FloatArray
)

class TFLiteFaceRecognition private constructor(context: Context) {
    private val interpreter: Interpreter
    val registeredUsers = ConcurrentHashMap<String, RegisteredUser>()
    private val gson = Gson()

    companion object {
        private const val TAG = "TFLiteFaceRecognition"
        const val INPUT_SIZE = 160
        const val EMBEDDING_SIZE = 512
        const val MATCH_THRESHOLD = 0.80f

        @Volatile
        private var INSTANCE: TFLiteFaceRecognition? = null

        fun getInstance(context: Context): TFLiteFaceRecognition {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: TFLiteFaceRecognition(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    init {
        val assetFd = context.assets.openFd("facenet_512.tflite")
        val channel = FileInputStream(assetFd.fileDescriptor).channel
        val buffer = channel.map(FileChannel.MapMode.READ_ONLY, assetFd.startOffset, assetFd.declaredLength)
        interpreter = Interpreter(buffer, Interpreter.Options().apply { setNumThreads(4) })
    }

    fun hasRegisteredFaces(): Boolean = registeredUsers.isNotEmpty()

    fun loadFromJson(employeesJson: String): Int {
        val listType = object : TypeToken<List<Map<String, Any?>>>() {}.type
        val list: List<Map<String, Any?>> = gson.fromJson(employeesJson, listType) ?: return 0
        if (list.isNotEmpty()) {
            registeredUsers.clear()
        }
        var count = 0
        for (emp in list) {
            val id = emp["id"] as? String ?: continue
            val name = emp["full_name"] as? String ?: continue
            val code = emp["employee_code"] as? String ?: ""
            val branchId = emp["branch_id"] as? String
            val status = emp["status"] as? String
            val isActive = status.isNullOrBlank() || status.equals("ACTIVE", ignoreCase = true)
            if (!isActive) continue

            val rawEmb = emp["face_embedding"]
            val emb = parseEmbedding(rawEmb) ?: continue
            if (emb.size == EMBEDDING_SIZE) {
                registeredUsers[id] = RegisteredUser(id, name, code, branchId, l2Normalize(emb))
                count++
            }
        }
        Log.i(TAG, "Loaded $count valid face embeddings into native gallery")
        return count
    }

    private fun parseEmbedding(raw: Any?): FloatArray? {
        return when (raw) {
            is List<*> -> {
                val arr = FloatArray(raw.size)
                for (i in raw.indices) {
                    val v = (raw[i] as? Number)?.toFloat() ?: return null
                    arr[i] = v
                }
                arr
            }
            is String -> {
                val parts = raw.trim().removePrefix("[").removeSuffix("]").split(",")
                if (parts.isEmpty()) return null
                val arr = FloatArray(parts.size)
                for (i in parts.indices) {
                    arr[i] = parts[i].trim().toFloatOrNull() ?: return null
                }
                arr
            }
            else -> null
        }
    }

    fun ejectUser(id: String): Boolean = registeredUsers.remove(id) != null

    fun register(id: String, name: String, employeeCode: String, branchId: String?, embedding: FloatArray) {
        registeredUsers[id] = RegisteredUser(id, name, employeeCode, branchId, l2Normalize(embedding))
    }

    fun extractEmbedding(bitmap: Bitmap): FloatArray {
        val scaledBitmap = if (bitmap.width != INPUT_SIZE || bitmap.height != INPUT_SIZE) {
            Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, true)
        } else {
            bitmap
        }
        val inputBuffer = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * 4)
        inputBuffer.order(ByteOrder.nativeOrder())
        val intValues = IntArray(INPUT_SIZE * INPUT_SIZE)
        scaledBitmap.getPixels(intValues, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        for (pixel in intValues) {
            inputBuffer.putFloat(((pixel shr 16) and 0xFF) / 255.0f)
            inputBuffer.putFloat(((pixel shr 8) and 0xFF) / 255.0f)
            inputBuffer.putFloat((pixel and 0xFF) / 255.0f)
        }
        if (scaledBitmap != bitmap && !scaledBitmap.isRecycled) {
            scaledBitmap.recycle()
        }
        val output = Array(1) { FloatArray(EMBEDDING_SIZE) }
        interpreter.run(inputBuffer, output)
        return l2Normalize(output[0])
    }

    private fun l2Normalize(vec: FloatArray): FloatArray {
        var sum = 0.0f
        for (v in vec) sum += v * v
        val norm = sqrt(sum.toDouble()).toFloat()
        if (norm == 0.0f) return vec
        return FloatArray(vec.size) { i -> vec[i] / norm }
    }

    fun calculateDistance(emb1: FloatArray, emb2: FloatArray): Float {
        var sum = 0.0f
        for (i in emb1.indices) {
            val diff = emb1[i] - emb2[i]
            sum += diff * diff
        }
        return sqrt(sum.toDouble()).toFloat()
    }

    fun recognize(embedding: FloatArray): Pair<RegisteredUser?, Float> {
        var bestUser: RegisteredUser? = null
        var minDistance = Float.MAX_VALUE
        for ((_, user) in registeredUsers) {
            val dist = calculateDistance(embedding, user.embedding)
            if (dist < minDistance) {
                minDistance = dist
                bestUser = user
            }
        }
        return if (minDistance < MATCH_THRESHOLD) Pair(bestUser, minDistance) else Pair(null, minDistance)
    }

    fun findFaceCollision(embedding: FloatArray, excludeEmployeeId: String? = null): Pair<RegisteredUser, Float>? {
        var minDistance = Float.MAX_VALUE
        var collidingUser: RegisteredUser? = null
        for ((id, user) in registeredUsers) {
            if (excludeEmployeeId != null && id == excludeEmployeeId) continue
            val dist = calculateDistance(embedding, user.embedding)
            if (dist < minDistance) {
                minDistance = dist
                collidingUser = user
            }
        }
        return if (minDistance < MATCH_THRESHOLD && collidingUser != null) Pair(collidingUser, minDistance) else null
    }
}
