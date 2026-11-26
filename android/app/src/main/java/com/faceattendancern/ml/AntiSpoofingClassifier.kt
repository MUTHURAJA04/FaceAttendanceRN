package com.faceattendancern.ml

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.exp

class AntiSpoofingClassifier(context: Context) {
    private val interpreterV2: Interpreter = loadModel(context, "2.7_80x80_MiniFASNetV2.tflite")
    private val interpreterV1SE: Interpreter = loadModel(context, "4_0_0_80x80_MiniFASNetV1SE.tflite")
    private val cropper = ImageCropper()

    private fun loadModel(context: Context, filename: String): Interpreter {
        val assetFd = context.assets.openFd(filename)
        val channel = FileInputStream(assetFd.fileDescriptor).channel
        val buffer = channel.map(FileChannel.MapMode.READ_ONLY, assetFd.startOffset, assetFd.declaredLength)
        return Interpreter(buffer, Interpreter.Options().apply { setNumThreads(4) })
    }

    private fun preprocessBGR(image: Bitmap): ByteBuffer {
        val buffer = ByteBuffer.allocateDirect(1 * 80 * 80 * 3 * 4)
        buffer.order(ByteOrder.nativeOrder())
        val pixels = IntArray(80 * 80)
        image.getPixels(pixels, 0, 80, 0, 0, 80, 80)
        for (pixel in pixels) {
            buffer.putFloat((pixel and 0xFF).toFloat())
            buffer.putFloat(((pixel shr 8) and 0xFF).toFloat())
            buffer.putFloat(((pixel shr 16) and 0xFF).toFloat())
        }
        return buffer
    }

    private fun softmax(logits: FloatArray): FloatArray {
        var max = Float.NEGATIVE_INFINITY
        for (v in logits) if (v > max) max = v
        val exps = FloatArray(logits.size)
        var sum = 0.0f
        for (i in logits.indices) {
            exps[i] = exp((logits[i] - max).toDouble()).toFloat()
            sum += exps[i]
        }
        for (i in exps.indices) exps[i] /= sum
        return exps
    }

    fun isRealFace(frame: Bitmap, faceBox: Rect): Pair<Boolean, Float> {
        val cropV2 = cropper.cropImage(frame, faceBox, 2.7f, 80, 80)
        val outV2 = Array(1) { FloatArray(3) }
        interpreterV2.run(preprocessBGR(cropV2), outV2)
        if (cropV2 != frame && !cropV2.isRecycled) cropV2.recycle()

        val cropV1SE = cropper.cropImage(frame, faceBox, 4.0f, 80, 80)
        val outV1SE = Array(1) { FloatArray(3) }
        interpreterV1SE.run(preprocessBGR(cropV1SE), outV1SE)
        if (cropV1SE != frame && !cropV1SE.isRecycled) cropV1SE.recycle()

        val probV2 = softmax(outV2[0])
        val probV1SE = softmax(outV1SE[0])
        val avgProbs = FloatArray(3) { i -> (probV2[i] + probV1SE[i]) / 2.0f }

        var winningClass = 0
        var maxProb = avgProbs[0]
        for (i in 1..2) {
            if (avgProbs[i] > maxProb) {
                maxProb = avgProbs[i]
                winningClass = i
            }
        }
        return Pair(winningClass == 1, avgProbs[1])
    }
}
