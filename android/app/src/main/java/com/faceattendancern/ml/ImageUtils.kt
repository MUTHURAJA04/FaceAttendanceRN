package com.faceattendancern.ml

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

object ImageUtils {

    fun alignFace(img: Bitmap, leftEye: Pair<Float, Float>?, rightEye: Pair<Float, Float>?): Pair<Bitmap, Float> {
        if (leftEye == null || rightEye == null || img.width == 0 || img.height == 0) {
            return Pair(img, 0.0f)
        }
        val dy = rightEye.second - leftEye.second
        val dx = rightEye.first - leftEye.first
        val degrees = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()

        val matrix = Matrix().apply {
            postRotate(-degrees, img.width / 2.0f, img.height / 2.0f)
        }
        val rotated = Bitmap.createBitmap(img, 0, 0, img.width, img.height, matrix, true)
        val cropped = Bitmap.createBitmap(
            rotated,
            (rotated.width - img.width) / 2,
            (rotated.height - img.height) / 2,
            img.width,
            img.height
        )
        if (rotated != img && !rotated.isRecycled) {
            rotated.recycle()
        }
        return Pair(cropped, degrees)
    }

    fun rotateFacialArea(facialArea: Rect, angle: Float, size: Pair<Int, Int>): Rect {
        val direction = if (angle >= 0.0f) 1 else -1
        val fAbs = abs(angle) % 360f
        if (fAbs == 0.0f) return facialArea
        val radians = (fAbs * Math.PI) / 180.0
        val imgH = size.second
        val imgW = size.first
        val centerX = imgW / 2.0
        val centerY = imgH / 2.0
        val dx = ((facialArea.left + facialArea.right) / 2.0) - centerX
        val dy = ((facialArea.top + facialArea.bottom) / 2.0) - centerY
        val rotatedX = (cos(radians) * dx) + (dy * direction * sin(radians)) + centerX
        val rotatedY = ((-dx) * direction * sin(radians)) + (dy * cos(radians)) + centerY
        val halfW = (facialArea.right - facialArea.left) / 2.0
        val halfH = (facialArea.bottom - facialArea.top) / 2.0
        return Rect(
            max((rotatedX - halfW).toInt(), 0),
            max((rotatedY - halfH).toInt(), 0),
            min((rotatedX + halfW).toInt(), imgW),
            min((rotatedY + halfH).toInt(), imgH)
        )
    }

    fun resizeImageWithPadding(sourceBitmap: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
        val width = sourceBitmap.width.toFloat()
        val height = sourceBitmap.height.toFloat()
        val scale = min(targetWidth / width, targetHeight / height)
        val scaledW = max(1, (width * scale).toInt())
        val scaledH = max(1, (height * scale).toInt())
        val scaled = Bitmap.createScaledBitmap(sourceBitmap, scaledW, scaledH, true)
        val output = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
        Canvas(output).drawBitmap(scaled, (targetWidth - scaledW) / 2f, (targetHeight - scaledH) / 2f, null as Paint?)
        if (scaled != sourceBitmap && !scaled.isRecycled) {
            scaled.recycle()
        }
        return output
    }
}
