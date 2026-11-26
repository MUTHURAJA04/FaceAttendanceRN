import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const CACHE_KEYS = {
  EMPLOYEES: '@kiosk_cached_employees',
  OFFLINE_PUNCHES: '@kiosk_offline_punches',
  ADMIN_PIN: '@kiosk_admin_pin',
  ADMIN_PIN_UPDATED_AT: '@kiosk_admin_pin_updated_at',
  DEFAULT_BRANCH_ID: '@kiosk_default_branch_id',
};

function getTodayStartUtcIso() {
  const now = new Date();
  const midnightLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return midnightLocal.toISOString();
}

export async function loginAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function getCachedEmployees() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.EMPLOYEES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCachedEmployees(employees) {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.EMPLOYEES, JSON.stringify(employees));
  } catch (e) {
    console.warn('[KioskAPI] Failed to cache employees:', e?.message);
  }
}

export async function fetchEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, employee_code, branch_id, status, face_embedding, face_updated_at')
    .order('full_name', { ascending: true });

  if (error) throw error;

  const list = data || [];
  const branch = list.find(e => e.branch_id)?.branch_id;
  if (branch) {
    await AsyncStorage.setItem(CACHE_KEYS.DEFAULT_BRANCH_ID, branch);
  }
  await saveCachedEmployees(list);
  return list;
}

export async function updateEmployeeFace(employeeId, embedding) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('employees')
    .update({
      face_embedding: embedding,
      face_updated_at: nowIso,
    })
    .eq('id', employeeId)
    .select('id, full_name, employee_code, branch_id, status, face_embedding, face_updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function createNewEmployee(fullName, employeeCode, embedding) {
  const defaultBranchId = await AsyncStorage.getItem(CACHE_KEYS.DEFAULT_BRANCH_ID);
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.slice(0, 10);

  const payload = {
    full_name: fullName,
    employee_code: employeeCode,
    role: 'STAFF',
    phone: '0000000000',
    branch_id: defaultBranchId,
    date_of_joining: todayDate,
    status: 'ACTIVE',
    face_embedding: embedding,
    face_updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select('id, full_name, employee_code, branch_id, status, face_embedding, face_updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function getTodayOpenPunch(employeeId) {
  const todayStart = getTodayStartUtcIso();
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id, employee_id, branch_id, check_in, check_out, status')
    .eq('employee_id', employeeId)
    .is('check_out', null)
    .gte('check_in', todayStart)
    .order('check_in', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function recordAttendancePunch({ employeeId, branchId, employeeName, similarityScore }) {
  const nowIso = new Date().toISOString();
  const resolvedBranch = branchId || (await AsyncStorage.getItem(CACHE_KEYS.DEFAULT_BRANCH_ID));

  try {
    const openPunch = await getTodayOpenPunch(employeeId);
    if (openPunch?.id) {
      const { data, error } = await supabase
        .from('attendance_logs')
        .update({
          check_out: nowIso,
          metadata: {
            similarity_score: similarityScore,
            punch_type: 'OUT',
            employee_name: employeeName,
            client: 'KIOSK_FACE_VERIFIED',
          },
        })
        .eq('id', openPunch.id)
        .select('id, check_in, check_out')
        .single();

      if (error) throw error;
      return { punchType: 'PUNCH OUT', logId: data.id, timestamp: nowIso, offline: false };
    }

    const { data, error } = await supabase
      .from('attendance_logs')
      .insert({
        employee_id: employeeId,
        branch_id: resolvedBranch,
        check_in: nowIso,
        check_out: null,
        status: 'PRESENT',
        source: 'BIOMETRIC',
        metadata: {
          similarity_score: similarityScore,
          punch_type: 'IN',
          employee_name: employeeName,
          client: 'KIOSK_FACE_VERIFIED',
        },
      })
      .select('id, check_in')
      .single();

    if (error) throw error;
    return { punchType: 'PUNCH IN', logId: data.id, timestamp: nowIso, offline: false };
  } catch (err) {
    // Queue punch offline in AsyncStorage when network is unavailable
    await queueOfflinePunch({
      employeeId,
      branchId: resolvedBranch,
      employeeName,
      similarityScore,
      timestamp: nowIso,
    });
    return { punchType: 'QUEUED OFFLINE', logId: null, timestamp: nowIso, offline: true };
  }
}

export async function getOfflineQueue() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.OFFLINE_PUNCHES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function queueOfflinePunch(entry) {
  const queue = await getOfflineQueue();
  queue.push({ ...entry, queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(CACHE_KEYS.OFFLINE_PUNCHES, JSON.stringify(queue));
}

export async function syncOfflineQueue() {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await recordAttendancePunch(item);
      synced++;
    } catch {
      remaining.push(item);
    }
  }

  await AsyncStorage.setItem(CACHE_KEYS.OFFLINE_PUNCHES, JSON.stringify(remaining));
  return { synced, remaining: remaining.length };
}

export async function fetchAdminPin() {
  const localPin = await AsyncStorage.getItem(CACHE_KEYS.ADMIN_PIN);
  const localUpdatedAt = await AsyncStorage.getItem(CACHE_KEYS.ADMIN_PIN_UPDATED_AT);

  try {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('key, value, updated_at')
      .in('key', ['admin_pin', 'kiosk_admin_pin'])
      .limit(1);

    if (!error && data && data.length > 0 && data[0].value) {
      const remotePin = String(data[0].value).trim();
      const remoteTs = data[0].updated_at ? Date.parse(data[0].updated_at) : 0;
      const localTs = localUpdatedAt ? Date.parse(localUpdatedAt) : 0;

      // Keep local PIN if it was updated more recently than the remote row (e.g., when RLS blocks anon PATCH)
      if (localPin && localTs > remoteTs) {
        return localPin;
      }

      await AsyncStorage.setItem(CACHE_KEYS.ADMIN_PIN, remotePin);
      if (data[0].updated_at) {
        await AsyncStorage.setItem(CACHE_KEYS.ADMIN_PIN_UPDATED_AT, data[0].updated_at);
      }
      return remotePin;
    }
  } catch {
    // Fallback to cached PIN
  }
  return localPin || '1234';
}

export async function updateAdminPin(newPin) {
  const cleanPin = String(newPin || '').trim();
  if (!cleanPin) throw new Error('Admin PIN cannot be empty');

  const nowIso = new Date().toISOString();
  await AsyncStorage.setItem(CACHE_KEYS.ADMIN_PIN, cleanPin);
  await AsyncStorage.setItem(CACHE_KEYS.ADMIN_PIN_UPDATED_AT, nowIso);

  let cloudSynced = false;
  try {
    const { data: existingRows } = await supabase
      .from('organization_settings')
      .select('id, key')
      .in('key', ['admin_pin', 'kiosk_admin_pin'])
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      const targetKey = existingRows[0].key;
      const { data: updatedRows, error: updateErr } = await supabase
        .from('organization_settings')
        .update({ value: cleanPin, updated_at: nowIso })
        .eq('key', targetKey)
        .select('key, value');

      if (!updateErr && updatedRows && updatedRows.length > 0) {
        cloudSynced = true;
      }
    }
  } catch {
    // Local cache already saved above
  }

  return { pin: cleanPin, cloudSynced };
}

export async function checkOtaRelease(packageName, versionCode) {
  try {
    const { data, error } = await supabase
      .from('app_releases')
      .select('*')
      .eq('package_name', packageName)
      .order('version_code', { ascending: false })
      .limit(1);

    if (error) return { updateAvailable: false, error: error.message };
    const latest = data && data[0];
    if (!latest) return { updateAvailable: false };

    const remoteCode = latest.latest_version_code ?? latest.version_code ?? 0;
    const normalizedRelease = {
      ...latest,
      download_url: latest.download_url || latest.downloadUrl || latest.file_url || latest.url || null,
      file_size: latest.file_size || latest.file_size_formatted || 'APK',
      latest_version_name: latest.latest_version_name || latest.version_name || null,
      latest_version_code: remoteCode,
    };

    return {
      updateAvailable: Boolean(latest.update_available) || remoteCode > versionCode,
      forceUpdate: Boolean(latest.force_update),
      release: normalizedRelease,
    };
  } catch (e) {
    return { updateAvailable: false, error: e?.message };
  }
}

export function subscribeEmployeeDeletions(onDeleteEmployee) {
  const channel = supabase
    .channel('kiosk-employees-changes')
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'employees' },
      payload => {
        if (payload?.old?.id) {
          onDeleteEmployee(payload.old.id);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
