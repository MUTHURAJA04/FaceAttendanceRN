import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useDrawerStatus } from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AdminPinModal from '../components/AdminPinModal';
import PunchSuccessModal from '../components/PunchSuccessModal';
import ScannerOverlay from '../components/ScannerOverlay';
import { useKiosk } from '../context/KioskContext';
import { FaceScannerEngine, NativeFaceScannerView } from '../native/FaceScanner';
import { recordAttendancePunch } from '../services/kioskApi';

export default function RecognizeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const drawerStatus = useDrawerStatus();
  const { enrolledCount, adminPin, refreshQueueCount } = useKiosk();

  const [hasPermission, setHasPermission] = useState(false);
  const [lowLight, setLowLight] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Look at camera to mark attendance');
  const [statusTone, setStatusTone] = useState('default'); // default | success | error
  const [modalVisible, setModalVisible] = useState(false);
  const [punchData, setPunchData] = useState(null);
  const [pinVisible, setPinVisible] = useState(false);

  const resetTimerRef = useRef(null);
  const isPunchingRef = useRef(false);
  const lastPunchByEmployeeRef = useRef({});

  useEffect(() => {
    const requestCam = async () => {
      if (Platform.OS === 'android') {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        setHasPermission(res === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasPermission(true);
      }
    };
    requestCam();

    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const resetPanel = useCallback(() => {
    setStatusTone('default');
    setStatusMessage('Look at camera to mark attendance');
  }, []);

  const scheduleReset = useCallback(
    delayMs => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(resetPanel, delayMs);
    },
    [resetPanel],
  );

  const handleFaceHint = useCallback(
    e => {
      if (modalVisible) return;
      const hint = e.nativeEvent?.hint;
      if (hint) {
        setStatusTone('default');
        setStatusMessage(hint);
      }
    },
    [modalVisible],
  );

  const handleSpoofDetected = useCallback(() => {
    setStatusTone('error');
    setStatusMessage('Spoof Detected! Real human required.');
    FaceScannerEngine.playAudio('sorrytryagain');
    Vibration.vibrate(100);
    scheduleReset(2200);
  }, [scheduleReset]);

  const handleFaceNotRecognized = useCallback(() => {
    setStatusTone('error');
    setStatusMessage('Face not recognized. Please try again.');
    FaceScannerEngine.playAudio('sorrytryagain');
    scheduleReset(2000);
  }, [scheduleReset]);

  const handleFaceRecognized = useCallback(
    async e => {
      if (modalVisible || isPunchingRef.current) return;
      const { id, name, employeeCode, branchId, similarityScore, photoBase64 } = e.nativeEvent || {};
      if (!id) return;

      const now = Date.now();
      const lastTs = lastPunchByEmployeeRef.current[id] || 0;
      const elapsedMs = now - lastTs;
      if (elapsedMs < 60000) {
        const waitSec = Math.max(1, Math.ceil((60000 - elapsedMs) / 1000));
        setStatusTone('default');
        setStatusMessage(`${name}: Wait ${waitSec}s before next punch`);
        return;
      }

      isPunchingRef.current = true;
      lastPunchByEmployeeRef.current[id] = now;
      setModalVisible(true);

      try {
        const punch = await recordAttendancePunch({
          employeeId: id,
          branchId,
          employeeName: name,
          similarityScore,
        });

        await refreshQueueCount();
        FaceScannerEngine.playAudio(punch.punchType === 'PUNCH OUT' ? 'punch_out' : 'punch_in');
        Vibration.vibrate(40);

        setStatusTone('success');
        setStatusMessage(`${punch.punchType}: ${name}`);
        setPunchData({
          id,
          name,
          employeeCode,
          similarityScore,
          photoBase64,
          ...punch,
        });
      } finally {
        isPunchingRef.current = false;
      }
    },
    [modalVisible, refreshQueueCount],
  );

  const handleOpenDrawer = useCallback(() => {
    setPinVisible(true);
  }, []);

  const handleToggleLowLight = useCallback(() => {
    setLowLight(v => !v);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setPunchData(null);
    resetPanel();
  }, [resetPanel]);

  const handlePinCancel = useCallback(() => {
    setPinVisible(false);
  }, []);

  const handlePinSuccess = useCallback(() => {
    setPinVisible(false);
    navigation.openDrawer();
  }, [navigation]);

  const isScannerPaused = !isFocused || drawerStatus === 'open' || modalVisible || pinVisible;
  const overlayBottomOffset = useMemo(() => 72 + insets.bottom, [insets.bottom]);

  const panelBg =
    statusTone === 'success'
      ? 'bg-[#38A169]'
      : statusTone === 'error'
      ? 'bg-[#E53E3E]'
      : 'bg-[#1A202C]';

  return (
    <View className="flex-1 bg-[#111318]">
      {hasPermission ? (
        <NativeFaceScannerView
          style={{ flex: 1 }}
          mode="recognize"
          paused={isScannerPaused}
          lowLight={lowLight}
          cameraFacing="front"
          onFaceHint={handleFaceHint}
          onFaceRecognized={handleFaceRecognized}
          onFaceNotRecognized={handleFaceNotRecognized}
          onSpoofDetected={handleSpoofDetected}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-white text-center">Camera permission is required for attendance scanning.</Text>
        </View>
      )}

      {lowLight && (
        <View pointerEvents="none" className="absolute inset-0 bg-white/40" />
      )}

      <ScannerOverlay bottomOffset={overlayBottomOffset} />

      {/* Floating Top Controls */}
      <View
        pointerEvents="box-none"
        className="absolute top-0 left-0 right-0 px-4 flex-row items-center justify-between"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity
          onPress={handleOpenDrawer}
          className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
        >
          <Text className="text-white text-lg font-bold">☰</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleToggleLowLight}
          className={`w-10 h-10 rounded-full items-center justify-center ${
            lowLight ? 'bg-[#0C83C6]' : 'bg-black/40'
          }`}
        >
          <Text className="text-white text-base">☀</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Status Panel (72dp + nav bar inset, matches fragment_recognize.xml) */}
      <View
        className={`absolute bottom-0 left-0 right-0 rounded-t-[20px] px-6 pt-3 items-center justify-center ${panelBg}`}
        style={{ minHeight: 72 + insets.bottom, paddingBottom: 12 + insets.bottom }}
      >
        <Text className="text-white text-[15px] font-semibold text-center">{statusMessage}</Text>
        <Text className="text-[#CBD5E1] text-[11px] mt-0.5">Enrolled Staff: {enrolledCount}</Text>
      </View>

      <PunchSuccessModal
        visible={modalVisible}
        data={punchData}
        onClose={handleModalClose}
      />

      <AdminPinModal
        visible={pinVisible}
        expectedPin={adminPin}
        onCancel={handlePinCancel}
        onSuccess={handlePinSuccess}
      />
    </View>
  );
}
