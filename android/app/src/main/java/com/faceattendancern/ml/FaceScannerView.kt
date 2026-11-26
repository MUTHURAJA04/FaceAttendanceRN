package com.faceattendancern.ml

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.Rect
import android.util.Base64
import android.util.Log
import android.util.Size
import android.widget.FrameLayout
import androidx.camera.core.CameraControl
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class FaceScannerView(private val reactContext: ReactContext) : FrameLayout(reactContext) {

    private val previewView = PreviewView(reactContext).apply {
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    }

    private val measureAndLayout = Runnable {
        if (width > 0 && height > 0) {
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
            )
            layout(left, top, right, bottom)
        }
    }

    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }

    private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val faceRecognizer = TFLiteFaceRecognition.getInstance(reactContext)
    private val antiSpoofing = AntiSpoofingClassifier(reactContext)
    private val faceDetector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
            .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
            .setMinFaceSize(0.20f)
            .build()
    )

    private var cameraControl: CameraControl? = null
    private var isProcessingFrame = false
    private var failedAttempts = 0
    private var lastRecognizedEmitTime = 0L
    private var lastNotRecognizedEmitTime = 0L
    private var lastSpoofEmitTime = 0L
    private var lastCooldownHintTime = 0L
    private val lastPunchTimeByUser = ConcurrentHashMap<String, Long>()

    var scanMode: String = "recognize"
    var isPaused: Boolean = false
        set(value) {
            val wasPaused = field
            field = value
            if (!value && wasPaused && activeInstance !== this) {
                post { startCamera() }
            }
        }
    var cameraFacing: String = "front"
        set(value) {
            if (field != value) {
                field = value
                post { startCamera() }
            }
        }
    var lowLight: Boolean = false
        set(value) {
            field = value
            try {
                cameraControl?.setExposureCompensationIndex(if (value) 2 else 0)
            } catch (_: Exception) {
            }
        }

    companion object {
        private const val TAG = "FaceScannerView"
        private const val REFERENCE_WIDTH = 1080.0f
        private const val REFERENCE_HEIGHT = 1440.0f
        private const val CENTER_BOX_X1 = 135.0f
        private const val CENTER_BOX_X2 = 945.0f
        private const val CENTER_BOX_Y1 = 180.0f
        private const val CENTER_BOX_Y2 = 1260.0f
        private const val GLOBAL_RECOGNITION_COOLDOWN_MS = 5000L
        private const val EMPLOYEE_PUNCH_COOLDOWN_MS = 60000L
        private const val REJECTION_COOLDOWN_MS = 2500L
        private const val FAILED_ATTEMPTS_THRESHOLD = 8

        @Volatile
        var latestValidEmbedding: FloatArray? = null

        @Volatile
        var latestValidPhotoBase64: String? = null

        @Volatile
        var isCurrentPoseValid: Boolean = false

        @Volatile
        private var activeInstance: FaceScannerView? = null
    }

    init {
        addView(previewView)
        post { startCamera() }
    }

    fun startCamera() {
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            return
        }
        val lifecycleOwner = reactContext.currentActivity as? LifecycleOwner ?: return
        val cameraProviderFuture = ProcessCameraProvider.getInstance(reactContext)
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val imageAnalyzer = ImageAnalysis.Builder()
                    .setTargetResolution(Size(1280, 960))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                    .build()
                    .also {
                        if (cameraExecutor.isShutdown) {
                            cameraExecutor = Executors.newSingleThreadExecutor()
                        }
                        it.setAnalyzer(cameraExecutor) { imageProxy -> processCameraFrame(imageProxy) }
                    }

                val selector = if (cameraFacing == "back") {
                    CameraSelector.DEFAULT_BACK_CAMERA
                } else {
                    CameraSelector.DEFAULT_FRONT_CAMERA
                }

                cameraProvider.unbindAll()
                val camera = cameraProvider.bindToLifecycle(lifecycleOwner, selector, preview, imageAnalyzer)
                activeInstance = this
                cameraControl = camera.cameraControl
                cameraControl?.setExposureCompensationIndex(if (lowLight) 2 else 0)
            } catch (e: Exception) {
                Log.e(TAG, "Camera bind failed: ${e.message}", e)
            }
        }, ContextCompat.getMainExecutor(reactContext))
    }

    private fun isFaceWithinCenterBox(rect: Rect, imageWidth: Int, imageHeight: Int): Boolean {
        val scaleX = imageWidth / REFERENCE_WIDTH
        val scaleY = imageHeight / REFERENCE_HEIGHT
        return rect.left >= CENTER_BOX_X1 * scaleX &&
            rect.top >= CENTER_BOX_Y1 * scaleY &&
            rect.right <= CENTER_BOX_X2 * scaleX &&
            rect.bottom <= CENTER_BOX_Y2 * scaleY
    }

    private fun processCameraFrame(imageProxy: ImageProxy) {
        if (isProcessingFrame || isPaused) {
            imageProxy.close()
            return
        }
        isProcessingFrame = true
        var bitmap: Bitmap? = null
        var rotatedBitmap: Bitmap? = null
        try {
            bitmap = imageProxy.toBitmap()
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            rotatedBitmap = if (rotationDegrees != 0) {
                val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            } else {
                bitmap
            }
            if (rotatedBitmap !== bitmap && !bitmap.isRecycled) {
                bitmap.recycle()
                bitmap = null
            }

            val frameBitmap = rotatedBitmap
            val inputImage = InputImage.fromBitmap(frameBitmap, 0)
            faceDetector.process(inputImage)
                .addOnSuccessListener { faces ->
                    var alignedBitmap: Bitmap? = null
                    var croppedFace: Bitmap? = null
                    var face160: Bitmap? = null
                    try {
                        if (faces.isEmpty()) {
                            isCurrentPoseValid = false
                            failedAttempts = 0
                            emitHint(
                                if (scanMode == "register") "Position face in center frame" else "Align face in center frame",
                                false
                            )
                            return@addOnSuccessListener
                        }

                        var largestFace = faces[0]
                        var maxArea = largestFace.boundingBox.width() * largestFace.boundingBox.height()
                        for (f in faces) {
                            val area = f.boundingBox.width() * f.boundingBox.height()
                            if (area > maxArea) {
                                maxArea = area
                                largestFace = f
                            }
                        }

                        if (abs(largestFace.headEulerAngleY) > 30) {
                            isCurrentPoseValid = false
                            emitHint("Please face forward directly", false)
                            return@addOnSuccessListener
                        }
                        if (abs(largestFace.headEulerAngleZ) > 20) {
                            isCurrentPoseValid = false
                            emitHint("Please keep your head straight", false)
                            return@addOnSuccessListener
                        }

                        val ratio = maxArea.toFloat() / (frameBitmap.width * frameBitmap.height).toFloat()
                        if (ratio < 0.05f) {
                            isCurrentPoseValid = false
                            emitHint("Move a bit closer to camera", false)
                            return@addOnSuccessListener
                        } else if (ratio > 0.55f) {
                            isCurrentPoseValid = false
                            emitHint("Move slightly further away", false)
                            return@addOnSuccessListener
                        }

                        if (!isFaceWithinCenterBox(largestFace.boundingBox, frameBitmap.width, frameBitmap.height)) {
                            isCurrentPoseValid = false
                            emitHint("Move face to the center of frame", false)
                            return@addOnSuccessListener
                        }

                        val leftEye = largestFace.getLandmark(FaceLandmark.LEFT_EYE)?.let { Pair(it.position.x, it.position.y) }
                        val rightEye = largestFace.getLandmark(FaceLandmark.RIGHT_EYE)?.let { Pair(it.position.x, it.position.y) }
                        val alignResult = ImageUtils.alignFace(frameBitmap, leftEye, rightEye)
                        alignedBitmap = alignResult.first
                        val rotationAngle = alignResult.second

                        var faceRect = Rect(largestFace.boundingBox)
                        if (rotationAngle != 0.0f) {
                            faceRect = ImageUtils.rotateFacialArea(faceRect, rotationAngle, Pair(alignedBitmap.width, alignedBitmap.height))
                        }

                        val safeLeft = max(0, faceRect.left)
                        val safeTop = max(0, faceRect.top)
                        val safeWidth = min(faceRect.width(), alignedBitmap.width - safeLeft)
                        val safeHeight = min(faceRect.height(), alignedBitmap.height - safeTop)
                        if (safeWidth < 30 || safeHeight < 30) {
                            isCurrentPoseValid = false
                            return@addOnSuccessListener
                        }

                        croppedFace = Bitmap.createBitmap(alignedBitmap, safeLeft, safeTop, safeWidth, safeHeight)
                        face160 = ImageUtils.resizeImageWithPadding(croppedFace, 160, 160)
                        val embedding = faceRecognizer.extractEmbedding(face160)

                        latestValidEmbedding = embedding
                        latestValidPhotoBase64 = bitmapToBase64(croppedFace)
                        isCurrentPoseValid = true

                        if (scanMode == "register") {
                            emitHint("Face ready! Tap blue circle to register", true)
                            return@addOnSuccessListener
                        }

                        if (!faceRecognizer.hasRegisteredFaces()) {
                            emitHint("No staff enrolled. Switch mode to enroll.", false)
                            return@addOnSuccessListener
                        }

                        val (matchedUser, dist) = faceRecognizer.recognize(embedding)
                        val now = System.currentTimeMillis()
                        Log.i(TAG, "Recognize: match=${matchedUser?.name ?: "none"} dist=${"%.4f".format(dist)} threshold=${TFLiteFaceRecognition.MATCH_THRESHOLD}")
                        if (matchedUser != null && dist < TFLiteFaceRecognition.MATCH_THRESHOLD) {
                            failedAttempts = 0
                            val lastUserPunch = lastPunchTimeByUser[matchedUser.id] ?: 0L
                            val elapsedUserMs = now - lastUserPunch
                            if (elapsedUserMs < EMPLOYEE_PUNCH_COOLDOWN_MS) {
                                if (now - lastCooldownHintTime > 1000L) {
                                    lastCooldownHintTime = now
                                    val waitSec = ((EMPLOYEE_PUNCH_COOLDOWN_MS - elapsedUserMs) / 1000L).coerceAtLeast(1L)
                                    emitHint("${matchedUser.name}: Wait ${waitSec}s before next punch", true)
                                }
                                return@addOnSuccessListener
                            }

                            val (isReal, spoofScore) = antiSpoofing.isRealFace(
                                alignedBitmap,
                                Rect(safeLeft, safeTop, safeLeft + safeWidth, safeTop + safeHeight)
                            )
                            Log.i(TAG, "AntiSpoof: user=${matchedUser.name} isReal=$isReal score=${"%.3f".format(spoofScore)}")
                            if (!isReal) {
                                if (now - lastSpoofEmitTime > REJECTION_COOLDOWN_MS) {
                                    lastSpoofEmitTime = now
                                    sendEvent("onSpoofDetected", Arguments.createMap().apply {
                                        putDouble("spoofScore", spoofScore.toDouble())
                                    })
                                }
                                return@addOnSuccessListener
                            }

                            if (now - lastRecognizedEmitTime > GLOBAL_RECOGNITION_COOLDOWN_MS) {
                                lastRecognizedEmitTime = now
                                lastPunchTimeByUser[matchedUser.id] = now
                                val simScore = (1.0f - (dist * dist) / 2.0f).coerceIn(0.65f, 0.99f)
                                sendEvent("onFaceRecognized", Arguments.createMap().apply {
                                    putString("id", matchedUser.id)
                                    putString("name", matchedUser.name)
                                    putString("employeeCode", matchedUser.employeeCode)
                                    putString("branchId", matchedUser.branchId ?: "")
                                    putDouble("distance", dist.toDouble())
                                    putDouble("similarityScore", simScore.toDouble())
                                    putDouble("spoofScore", spoofScore.toDouble())
                                    putString("photoBase64", latestValidPhotoBase64 ?: "")
                                })
                            }
                        } else {
                            failedAttempts++
                            if (failedAttempts >= FAILED_ATTEMPTS_THRESHOLD) {
                                failedAttempts = 0
                                if (now - lastNotRecognizedEmitTime > REJECTION_COOLDOWN_MS) {
                                    lastNotRecognizedEmitTime = now
                                    sendEvent("onFaceNotRecognized", Arguments.createMap().apply {
                                        putInt("attempts", FAILED_ATTEMPTS_THRESHOLD)
                                    })
                                }
                            } else {
                                emitHint("Scanning... Hold still", true)
                            }
                        }
                    } finally {
                        if (face160 != null && !face160.isRecycled) face160.recycle()
                        if (croppedFace != null && !croppedFace.isRecycled) croppedFace.recycle()
                        if (alignedBitmap != null && alignedBitmap !== frameBitmap && !alignedBitmap.isRecycled) {
                            alignedBitmap.recycle()
                        }
                    }
                }
                .addOnCompleteListener {
                    if (!frameBitmap.isRecycled) frameBitmap.recycle()
                    isProcessingFrame = false
                    imageProxy.close()
                }
        } catch (e: Throwable) {
            Log.e(TAG, "Frame processing error: ${e.message}", e)
            if (bitmap != null && !bitmap.isRecycled) bitmap.recycle()
            if (rotatedBitmap != null && !rotatedBitmap.isRecycled) rotatedBitmap.recycle()
            isProcessingFrame = false
            imageProxy.close()
        }
    }

    private fun bitmapToBase64(bmp: Bitmap): String {
        val baos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 85, baos)
        return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
    }

    private fun emitHint(hint: String, poseValid: Boolean) {
        sendEvent("onFaceHint", Arguments.createMap().apply {
            putString("hint", hint)
            putBoolean("poseValid", poseValid)
        })
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        if (id > 0) {
            reactContext.getJSModule(RCTEventEmitter::class.java).receiveEvent(id, eventName, params)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cameraExecutor.shutdown()
    }
}
