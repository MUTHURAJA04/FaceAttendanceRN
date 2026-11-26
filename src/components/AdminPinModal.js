import React, { memo, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';

function AdminPinModal({ visible, expectedPin = '1234', onSuccess, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (pin.trim() === String(expectedPin).trim()) {
      setPin('');
      setError('');
      onSuccess?.();
    } else {
      setError('Invalid Admin PIN');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 bg-black/75 items-center justify-center px-6">
        <View className="w-full max-w-sm bg-[#1A202C] rounded-2xl p-6 border border-[#2D3748]">
          <Text className="text-white text-lg font-bold">Admin Gate</Text>
          <Text className="text-[#94A3B8] text-xs mt-1">
            Enter kiosk admin PIN to manage staff enrollment
          </Text>

          <TextInput
            value={pin}
            onChangeText={t => {
              setPin(t);
              setError('');
            }}
            placeholder="Enter PIN"
            placeholderTextColor="#64748B"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            className="bg-[#111318] text-white rounded-xl px-4 py-3 mt-4 border border-[#2D3748] text-center text-lg tracking-widest"
          />

          {!!error && <Text className="text-[#EF4444] text-xs mt-2 text-center">{error}</Text>}

          <View className="flex-row gap-3 mt-5">
            <TouchableOpacity
              onPress={() => {
                setPin('');
                setError('');
                onCancel?.();
              }}
              className="flex-1 bg-[#2D3748] rounded-xl py-3 items-center"
            >
              <Text className="text-[#CBD5E1] font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              className="flex-1 bg-[#0C83C6] rounded-xl py-3 items-center"
            >
              <Text className="text-white font-semibold">Unlock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default memo(AdminPinModal);
