import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKiosk } from '../context/KioskContext';
import { syncOfflineQueue } from '../services/kioskApi';

export default function OfflineQueueScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { enrolledCount, offlineCount, syncStatus, syncAll, refreshQueueCount } = useKiosk();
  const [busy, setBusy] = useState(false);

  const handleSyncNow = async () => {
    setBusy(true);
    await syncOfflineQueue();
    await syncAll();
    await refreshQueueCount();
    setBusy(false);
  };

  return (
    <View className="flex-1 bg-[#111318] px-5" style={{ paddingTop: insets.top + 16 }}>
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          className="w-10 h-10 rounded-full bg-[#1A202C] items-center justify-center mr-3"
        >
          <Text className="text-white text-lg">☰</Text>
        </TouchableOpacity>
        <Text className="text-white text-xl font-bold">Kiosk Sync & Status</Text>
      </View>

      <View className="bg-[#1A202C] rounded-2xl p-5 border border-[#2D3748] mb-4">
        <Text className="text-[#94A3B8] text-xs">CLOUD STATUS</Text>
        <Text className="text-white text-base font-semibold mt-1">{syncStatus}</Text>
      </View>

      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-[#1A202C] rounded-2xl p-4 border border-[#2D3748]">
          <Text className="text-[#94A3B8] text-xs">ACTIVE FACES</Text>
          <Text className="text-[#10B981] text-2xl font-bold mt-1">{enrolledCount}</Text>
        </View>
        <View className="flex-1 bg-[#1A202C] rounded-2xl p-4 border border-[#2D3748]">
          <Text className="text-[#94A3B8] text-xs">OFFLINE QUEUE</Text>
          <Text className="text-[#F59E0B] text-2xl font-bold mt-1">{offlineCount}</Text>
        </View>
      </View>

      <TouchableOpacity
        disabled={busy}
        onPress={handleSyncNow}
        className="bg-[#0C83C6] rounded-xl py-4 items-center"
      >
        <Text className="text-white font-bold">
          {busy ? 'Syncing with Supabase...' : 'Sync Directory & Offline Punches'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
