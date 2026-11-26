import React, { useCallback, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKiosk } from '../context/KioskContext';

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { adminPin, changeAdminPin } = useKiosk();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSavePin = useCallback(async () => {
    if (currentPin.trim() !== String(adminPin).trim()) {
      Alert.alert('Invalid PIN', 'Current admin password is incorrect.');
      return;
    }
    const cleanNew = newPin.trim();
    if (cleanNew.length < 4) {
      Alert.alert('Invalid PIN', 'New admin password must be at least 4 digits.');
      return;
    }
    if (cleanNew !== confirmPin.trim()) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      const result = await changeAdminPin(cleanNew);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      Alert.alert(
        'Updated',
        result?.cloudSynced
          ? 'Admin password updated and synced to cloud.'
          : 'Admin password updated on this device.',
      );
    } catch (e) {
      Alert.alert('Update Failed', e?.message || 'Could not update admin password.');
    } finally {
      setSaving(false);
    }
  }, [currentPin, newPin, confirmPin, adminPin, changeAdminPin]);

  return (
    <View className="flex-1 bg-[#111318] px-5" style={{ paddingTop: insets.top + 16 }}>
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          className="w-10 h-10 rounded-full bg-[#1A202C] items-center justify-center mr-3"
        >
          <Text className="text-white text-lg">☰</Text>
        </TouchableOpacity>
        <View>
          <Text className="text-white text-xl font-bold">Settings</Text>
          <Text className="text-[#94A3B8] text-xs">Manage kiosk admin security</Text>
        </View>
      </View>

      <View className="bg-[#1A202C] rounded-2xl p-5 border border-[#2D3748]">
        <Text className="text-white text-base font-bold">Change Admin Password</Text>
        <Text className="text-[#94A3B8] text-xs mt-1 mb-4">
          Required when opening the kiosk menu drawer
        </Text>

        <Text className="text-[#CBD5E1] text-xs font-semibold mb-1.5">Current Password</Text>
        <TextInput
          value={currentPin}
          onChangeText={setCurrentPin}
          placeholder="Enter current PIN"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          className="bg-[#111318] text-white rounded-xl px-4 py-3 border border-[#2D3748] text-sm mb-3"
        />

        <Text className="text-[#CBD5E1] text-xs font-semibold mb-1.5">New Password</Text>
        <TextInput
          value={newPin}
          onChangeText={setNewPin}
          placeholder="Enter new PIN (min 4 digits)"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          className="bg-[#111318] text-white rounded-xl px-4 py-3 border border-[#2D3748] text-sm mb-3"
        />

        <Text className="text-[#CBD5E1] text-xs font-semibold mb-1.5">Confirm New Password</Text>
        <TextInput
          value={confirmPin}
          onChangeText={setConfirmPin}
          placeholder="Re-enter new PIN"
          placeholderTextColor="#64748B"
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          className="bg-[#111318] text-white rounded-xl px-4 py-3 border border-[#2D3748] text-sm mb-5"
        />

        <TouchableOpacity
          disabled={saving}
          onPress={handleSavePin}
          className={`bg-[#0C83C6] rounded-xl py-3.5 items-center ${saving ? 'opacity-60' : ''}`}
        >
          <Text className="text-white font-bold">
            {saving ? 'Saving...' : 'Update Admin Password'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
