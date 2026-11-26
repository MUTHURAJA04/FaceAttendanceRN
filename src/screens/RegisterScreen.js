import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScannerOverlay from '../components/ScannerOverlay';
import { useKiosk } from '../context/KioskContext';
import { FaceScannerEngine, NativeFaceScannerView } from '../native/FaceScanner';
import { updateEmployeeFace } from '../services/kioskApi';

export default function RegisterScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const targetEmployee = route.params?.targetEmployee || null;
  const { updateLocalEmployee } = useKiosk();

  const [cameraFacing, setCameraFacing] = useState('front');
  const [liveHint, setLiveHint] = useState(
    targetEmployee
      ? `Align face and tap blue circle for ${targetEmployee.full_name}`
      : 'Look straight at the camera and hold still',
  );
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [captured, setCaptured] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleCapture = useCallback(async () => {
    try {
      const res = await FaceScannerEngine.captureForRegister(targetEmployee?.id || null);
      if (res.collision) {
        FaceScannerEngine.playAudio('sorrytryagain');
        Vibration.vibrate(100);
        Alert.alert(
          'Face Collision Detected',
          `This face is already enrolled for:\n\nName: ${res.existingName}\nCode: ${res.existingCode}\nSimilarity: ${res.similarity}%\n\nBiometric faces must be unique.`,
        );
        return;
      }

      Vibration.vibrate(40);
      setCaptured(res);
      setConfirmVisible(true);
    } catch (e) {
      FaceScannerEngine.playAudio('sorrytryagain');
      Alert.alert('Hold Still', e?.message || 'Please center your face in the frame');
    }
  }, [targetEmployee?.id]);

  const handleConfirmSync = useCallback(async () => {
    if (!captured?.embedding || !targetEmployee) return;

    setSaving(true);
    try {
      const savedEmp = await updateEmployeeFace(targetEmployee.id, captured.embedding);

      await FaceScannerEngine.registerUserInRam(
        savedEmp.id,
        savedEmp.full_name,
        savedEmp.employee_code || '',
        savedEmp.branch_id || null,
        captured.embedding,
      );
      updateLocalEmployee(savedEmp);
      FaceScannerEngine.playAudio('success_sound');
      setConfirmVisible(false);
      navigation.navigate('MainDrawer');
    } catch (e) {
      Alert.alert('Sync Failed', e?.message || 'Could not save face embedding');
    } finally {
      setSaving(false);
    }
  }, [captured, targetEmployee, updateLocalEmployee, navigation]);

  const hasFace =
    targetEmployee &&
    Array.isArray(targetEmployee.face_embedding) &&
    targetEmployee.face_embedding.length === 512;
  const subtitle = targetEmployee
    ? `${hasFace ? 'UPDATE FACE' : 'ENROLL FACE'}: ${targetEmployee.full_name.toUpperCase()}`
    : 'ENROLL FACE';

  return (
    <View className="flex-1 bg-[#111318]">
      <NativeFaceScannerView
        style={{ flex: 1 }}
        mode="register"
        paused={confirmVisible}
        cameraFacing={cameraFacing}
        onFaceHint={e => e.nativeEvent?.hint && setLiveHint(e.nativeEvent.hint)}
      />

      <ScannerOverlay bottomOffset={130 + insets.bottom} />

      {/* Top Controls (matches fragment_register.xml) */}
      <View
        className="absolute top-0 left-0 right-0 px-4 pb-3 flex-row items-center justify-between bg-black/45"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center mr-3"
          >
            <Text className="text-white text-lg font-bold">←</Text>
          </TouchableOpacity>
          <View>
            <Text className="text-white text-lg font-bold">Face Enrollment</Text>
            <Text className="text-[#D5E1FA] text-[11px]">{subtitle}</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setCameraFacing(f => (f === 'front' ? 'back' : 'front'))}
          className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
        >
          <Text className="text-white text-base">⟲</Text>
        </TouchableOpacity>
      </View>

      {/* Floating Live Hint Pill */}
      <View
        pointerEvents="none"
        className="absolute left-8 right-8 items-center"
        style={{ bottom: 144 + insets.bottom }}
      >
        <View className="bg-[#1A202C]/85 px-5 py-2 rounded-2xl">
          <Text className="text-white text-[13px] font-medium text-center">{liveHint}</Text>
        </View>
      </View>

      {/* Bottom 130dp Capture Bar */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-[#111318] items-center pt-4"
        style={{ height: 130 + insets.bottom, paddingBottom: insets.bottom }}
      >
        <TouchableOpacity
          onPress={handleCapture}
          className="w-[72px] h-[72px] rounded-full bg-[#0C83C6] border-4 border-white"
        />
        <Text className="text-white/60 text-xs mt-2.5 tracking-wider">TAP TO REGISTER</Text>
      </View>

      {/* Confirmation Modal */}
      <Modal visible={confirmVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/75 items-center justify-center px-6">
          <View className="w-full max-w-sm bg-[#1A202C] rounded-2xl p-6 border border-[#2D3748]">
            <Text className="text-white text-lg font-bold text-center">
              {hasFace ? 'Update Face Vector' : 'Enroll Face Vector'}
            </Text>

            {!!captured?.photoBase64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${captured.photoBase64}` }}
                className="w-28 h-28 rounded-2xl self-center my-4 border border-[#0C83C6]"
              />
            )}

            <TextInput
              value={targetEmployee?.full_name || ''}
              editable={false}
              placeholder="Employee Full Name"
              placeholderTextColor="#64748B"
              className="bg-[#111318] text-white rounded-xl px-4 py-3 border border-[#2D3748] text-sm"
            />
            <TextInput
              value={targetEmployee?.employee_code || ''}
              editable={false}
              placeholder="Employee Code"
              placeholderTextColor="#64748B"
              className="bg-[#111318] text-white rounded-xl px-4 py-3 mt-3 border border-[#2D3748] text-sm"
            />

            <View className="flex-row gap-3 mt-5">
              <TouchableOpacity
                disabled={saving}
                onPress={() => setConfirmVisible(false)}
                className="flex-1 bg-[#2D3748] rounded-xl py-3 items-center"
              >
                <Text className="text-[#CBD5E1] font-semibold">Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={saving}
                onPress={handleConfirmSync}
                className="flex-1 bg-[#0C83C6] rounded-xl py-3 items-center"
              >
                <Text className="text-white font-semibold">
                  {saving ? 'Syncing...' : 'Confirm & Sync'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
