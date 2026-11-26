import React, { memo, useEffect } from 'react';
import { Image, Modal, Text, TouchableOpacity, View } from 'react-native';

function PunchSuccessModal({ visible, data, onClose }) {
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      onClose?.();
    }, 2600);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  if (!data) return null;

  const isOut = data.punchType === 'PUNCH OUT';
  const badgeBg = isOut ? 'bg-[#F59E0B]' : data.offline ? 'bg-[#0C83C6]' : 'bg-[#38A169]';
  const ringColor = isOut ? 'border-[#F59E0B]' : data.offline ? 'border-[#0C83C6]' : 'border-[#38A169]';
  const initials = (data.name || 'ST')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');

  const formattedTime = new Date(data.timestamp || Date.now()).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 bg-black/65 items-center justify-center px-8"
      >
        <View className="w-full max-w-[300px] bg-[#161B22] rounded-3xl px-6 py-7 border border-[#2D3748]/80 items-center">
          <View className={`px-3.5 py-1 rounded-full ${badgeBg} mb-5`}>
            <Text className="text-white text-[11px] font-bold tracking-widest">{data.punchType}</Text>
          </View>

          {data.photoBase64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${data.photoBase64}` }}
              className={`w-24 h-24 rounded-full border-2 ${ringColor}`}
            />
          ) : (
            <View className={`w-24 h-24 rounded-full bg-[#1E293B] border-2 ${ringColor} items-center justify-center`}>
              <Text className="text-white text-2xl font-bold">{initials}</Text>
            </View>
          )}

          <Text className="text-white text-xl font-bold mt-4 text-center" numberOfLines={1}>
            {data.name}
          </Text>

          <Text className="text-[#94A3B8] text-sm font-medium mt-1.5">
            {formattedTime}
          </Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default memo(PunchSuccessModal);
