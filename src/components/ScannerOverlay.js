import React, { memo } from 'react';
import { View } from 'react-native';

/**
 * Replicates ic_scan_frame_modern (280x350) from com.petpooja.facerecognition:
 * 4 rounded white corner brackets + subtle center oval guide + horizontal scan line.
 */
function ScannerOverlay({ bottomOffset = 72 }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: bottomOffset,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 280, height: 350, alignItems: 'center', justifyContent: 'center' }}>
        {/* Top-Left Corner */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 40,
            height: 40,
            borderTopWidth: 4,
            borderLeftWidth: 4,
            borderColor: '#FFFFFF',
            borderTopLeftRadius: 16,
          }}
        />
        {/* Top-Right Corner */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 40,
            height: 40,
            borderTopWidth: 4,
            borderRightWidth: 4,
            borderColor: '#FFFFFF',
            borderTopRightRadius: 16,
          }}
        />
        {/* Bottom-Left Corner */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: 40,
            height: 40,
            borderBottomWidth: 4,
            borderLeftWidth: 4,
            borderColor: '#FFFFFF',
            borderBottomLeftRadius: 16,
          }}
        />
        {/* Bottom-Right Corner */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 40,
            height: 40,
            borderBottomWidth: 4,
            borderRightWidth: 4,
            borderColor: '#FFFFFF',
            borderBottomRightRadius: 16,
          }}
        />

        {/* Center Oval Guide */}
        <View
          style={{
            width: 200,
            height: 250,
            borderRadius: 125,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Horizontal Scan Line */}
          <View
            style={{
              width: 220,
              height: 2,
              backgroundColor: 'rgba(12,131,198,0.85)',
            }}
          />
        </View>
      </View>
    </View>
  );
}

export default memo(ScannerOverlay);
