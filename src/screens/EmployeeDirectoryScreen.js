import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKiosk } from '../context/KioskContext';

const FILTER_TABS = [
  { key: 'ALL', labelKey: 'all', prefix: 'ALL' },
  { key: 'NEEDS_ENROLL', labelKey: 'needs', prefix: 'NEEDS ENROLL' },
  { key: 'ENROLLED', labelKey: 'enrolled', prefix: 'ENROLLED' },
];

const EmployeeRow = memo(function EmployeeRow({ item, onSelect }) {
  const hasFace = Array.isArray(item.face_embedding) && item.face_embedding.length === 512;
  const initials = (item.full_name || 'ST')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');

  return (
    <TouchableOpacity
      onPress={() => onSelect(item)}
      className="bg-[#1A202C] rounded-2xl p-4 mb-3 border border-[#2D3748] flex-row items-center"
    >
      <View className="w-12 h-12 rounded-full bg-[#111318] items-center justify-center mr-3.5 relative">
        <Text className="text-white font-bold text-sm">{initials}</Text>
        {hasFace && (
          <View className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#10B981] items-center justify-center border border-[#1A202C]">
            <Text className="text-white text-[9px] font-bold">✓</Text>
          </View>
        )}
      </View>

      <View className="flex-1 pr-2">
        <Text className="text-white text-base font-bold" numberOfLines={1}>
          {item.full_name}
        </Text>
        <Text className="text-[#94A3B8] text-xs mt-0.5" numberOfLines={1}>
          {item.employee_code || 'NO CODE'} • {item.status || 'ACTIVE'}
        </Text>
        <Text className={`text-[11px] font-semibold mt-1 ${hasFace ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
          {hasFace ? '● ENROLLED' : '○ NOT ENROLLED'}
        </Text>
      </View>

      <View className={`px-4 py-2 rounded-xl ${hasFace ? 'bg-[#2D3748]' : 'bg-[#0C83C6]'}`}>
        <Text className="text-white text-xs font-bold">{hasFace ? 'UPDATE' : 'ENROLL'}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default function EmployeeDirectoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { employees, syncAll } = useKiosk();

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('ALL');

  const counts = useMemo(() => {
    const enrolled = employees.filter(e => Array.isArray(e.face_embedding) && e.face_embedding.length === 512).length;
    return {
      all: employees.length,
      enrolled,
      needs: employees.length - enrolled,
    };
  }, [employees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(emp => {
      const hasFace = Array.isArray(emp.face_embedding) && emp.face_embedding.length === 512;
      if (tab === 'ENROLLED' && !hasFace) return false;
      if (tab === 'NEEDS_ENROLL' && hasFace) return false;
      if (!q) return true;
      return (
        (emp.full_name || '').toLowerCase().includes(q) ||
        (emp.employee_code || '').toLowerCase().includes(q)
      );
    });
  }, [employees, query, tab]);

  const handleSelectEmployee = useCallback(
    item => {
      navigation.navigate('Register', { targetEmployee: item });
    },
    [navigation],
  );

  const keyExtractor = useCallback(item => item.id, []);

  const renderItem = useCallback(
    ({ item }) => <EmployeeRow item={item} onSelect={handleSelectEmployee} />,
    [handleSelectEmployee],
  );

  return (
    <View className="flex-1 bg-[#111318]" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 flex-row items-center border-b border-[#1E293B]">
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          className="w-10 h-10 rounded-full bg-[#1A202C] items-center justify-center mr-3"
        >
          <Text className="text-white text-lg">☰</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white text-lg font-bold">Employee Directory</Text>
          <Text className="text-[#94A3B8] text-xs">Select staff to enroll or update face</Text>
        </View>
      </View>

      {/* Search */}
      <View className="px-4 pt-3">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or employee code..."
          placeholderTextColor="#64748B"
          className="bg-[#1A202C] text-white rounded-xl px-4 py-3 border border-[#2D3748] text-sm"
        />
      </View>

      {/* Filter Tabs */}
      <View className="flex-row px-4 py-3 gap-2">
        {FILTER_TABS.map(item => {
          const active = tab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setTab(item.key)}
              className={`px-3 py-1.5 rounded-full border ${
                active ? 'bg-[#0C83C6] border-[#0C83C6]' : 'bg-transparent border-[#2D3748]'
              }`}
            >
              <Text className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-[#94A3B8]'}`}>
                {`${item.prefix} (${counts[item.labelKey]})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        onRefresh={syncAll}
        refreshing={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 + insets.bottom }}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text className="text-[#64748B] text-center mt-10 text-sm">No matching employees</Text>
        }
      />
    </View>
  );
}
