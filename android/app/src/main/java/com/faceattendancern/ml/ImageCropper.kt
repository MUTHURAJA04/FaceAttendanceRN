package com.faceattendancern.ml

import android.graphics.Bitmap
import android.graphics.Rect
import kotlin.math.min

class ImageCropper {
    fun getNewBox(srcW: Int, srcH: Int, bbox: IntArray, scale: Double): IntArray {
        val x1 = bbox[0]
        val y1 = bbox[1]
        val boxW = (bbox[2] - x1).toDouble()
        val boxH = (bbox[3] - y1).toDouble()
        val dSrcH = srcH.toDouble()
        val dSrcW = srcW.toDouble()
        val dScale = min((dSrcH - 1.0) / boxH, min((dSrcW - 1.0) / boxW, scale))
        val newW = boxW * dScale
        val newH = boxH * dScale
        val centerX = boxW / 2.0 + x1
        val centerY = boxH / 2.0 + y1
        var left = centerX - newW / 2.0
        var top = centerY - newH / 2.0
        var right = centerX + newW / 2.0
        var bottom = centerY + newH / 2.0
        if (left < 0.0) {
            right -= left
            left = 0.0
        }
        if (top < 0.0) {
            bottom -= top
            top = 0.0
        }
        val maxX = (srcW - 1).toDouble()
        if (right > maxX) {
            left -= (right - dSrcW) + 1.0
            right = maxX
        }
        val maxY = (srcH - 1).toDouble()
        if (bottom > maxY) {
            top -= (bottom - dSrcH) + 1.0
            bottom = maxY
        }
        return intArrayOf(left.toInt().coerceAtLeast(0), top.toInt().coerceAtLeast(0), right.toInt(), bottom.toInt())
    }

    fun cropImage(orgImg: Bitmap, bbox: Rect, scale: Float, outW: Int, outH: Int): Bitmap {
        val box = getNewBox(orgImg.width, orgImg.height, intArrayOf(bbox.left, bbox.top, bbox.right, bbox.bottom), scale.toDouble())
        val left = box[0].coerceIn(0, orgImg.width - 1)
        val top = box[1].coerceIn(0, orgImg.height - 1)
        val w = (box[2] - left + 1).coerceIn(1, orgImg.width - left)
        val h = (box[3] - top + 1).coerceIn(1, orgImg.height - top)
        val cropped = Bitmap.createBitmap(orgImg, left, top, w, h)
        val resized = Bitmap.createScaledBitmap(cropped, outW, outH, true)
        if (cropped != orgImg && !cropped.isRecycled) cropped.recycle()
        return resized
    }
}
