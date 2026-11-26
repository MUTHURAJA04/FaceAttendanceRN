package com.faceattendancern.ml

import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class FaceScannerViewManager : SimpleViewManager<FaceScannerView>() {
    override fun getName(): String = "FaceScannerView"

    override fun createViewInstance(reactContext: ThemedReactContext): FaceScannerView {
        return FaceScannerView(reactContext)
    }

    @ReactProp(name = "mode")
    fun setMode(view: FaceScannerView, mode: String?) {
        view.scanMode = mode ?: "recognize"
    }

    @ReactProp(name = "paused")
    fun setPaused(view: FaceScannerView, paused: Boolean) {
        view.isPaused = paused
    }

    @ReactProp(name = "lowLight")
    fun setLowLight(view: FaceScannerView, lowLight: Boolean) {
        view.lowLight = lowLight
    }

    @ReactProp(name = "cameraFacing")
    fun setCameraFacing(view: FaceScannerView, facing: String?) {
        view.cameraFacing = facing ?: "front"
    }

    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
        return MapBuilder.of(
            "onFaceHint", MapBuilder.of("registrationName", "onFaceHint"),
            "onFaceRecognized", MapBuilder.of("registrationName", "onFaceRecognized"),
            "onFaceNotRecognized", MapBuilder.of("registrationName", "onFaceNotRecognized"),
            "onSpoofDetected", MapBuilder.of("registrationName", "onSpoofDetected")
        )
    }
}
