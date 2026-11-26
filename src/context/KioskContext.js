import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { FaceScannerEngine } from '../native/FaceScanner';
import {
  fetchAdminPin,
  fetchEmployees,
  getCachedEmployees,
  getOfflineQueue,
  saveCachedEmployees,
  subscribeEmployeeDeletions,
  syncOfflineQueue,
  updateAdminPin,
} from '../services/kioskApi';

const KioskContext = createContext(null);

export function KioskProvider({ children }) {
  const [employees, setEmployees] = useState([]);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [adminPin, setAdminPin] = useState('1234');
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState('Connecting to Supabase cloud...');

  const refreshQueueCount = useCallback(async () => {
    const q = await getOfflineQueue();
    setOfflineCount(q.length);
  }, []);

  const syncAll = useCallback(async () => {
    // 1. Load local cache immediately
    const cached = await getCachedEmployees();
    if (cached.length > 0) {
      setEmployees(cached);
      const cachedActive = await FaceScannerEngine.loadEmployees(cached);
      setEnrolledCount(cachedActive);
    }

    // 2. Fetch fresh staff from Supabase
    try {
      setSyncStatus('Connecting to Supabase cloud...');
      const remote = await fetchEmployees();
      setEmployees(remote);
      const count = await FaceScannerEngine.loadEmployees(remote);
      setEnrolledCount(count);
      setSyncStatus(`Cloud Synced: ${count} staff vectors active`);
    } catch (e) {
      setSyncStatus(`Offline Gallery Active (${cached.length} cached)`);
    }

    // 3. Sync PIN & offline queue
    const pin = await fetchAdminPin();
    setAdminPin(pin);
    await syncOfflineQueue();
    await refreshQueueCount();
  }, [refreshQueueCount]);

  useEffect(() => {
    syncAll();
    const unsubscribe = subscribeEmployeeDeletions(async deletedId => {
      await FaceScannerEngine.ejectEmployee(deletedId);
      setEmployees(prev => {
        const next = prev.filter(e => e.id !== deletedId);
        saveCachedEmployees(next);
        setEnrolledCount(next.filter(e => Array.isArray(e.face_embedding) && e.face_embedding.length === 512).length);
        return next;
      });
    });
    return () => unsubscribe();
  }, [syncAll]);

  const updateLocalEmployee = useCallback(updatedEmp => {
    setEmployees(prev => {
      const exists = prev.some(e => e.id === updatedEmp.id);
      const next = exists
        ? prev.map(e => (e.id === updatedEmp.id ? updatedEmp : e))
        : [...prev, updatedEmp];
      saveCachedEmployees(next);
      setEnrolledCount(next.filter(e => Array.isArray(e.face_embedding) && e.face_embedding.length === 512).length);
      return next;
    });
  }, []);

  const changeAdminPin = useCallback(async newPin => {
    const result = await updateAdminPin(newPin);
    setAdminPin(result.pin);
    return result;
  }, []);

  return (
    <KioskContext.Provider
      value={{
        employees,
        enrolledCount,
        adminPin,
        offlineCount,
        syncStatus,
        syncAll,
        refreshQueueCount,
        updateLocalEmployee,
        changeAdminPin,
      }}
    >
      {children}
    </KioskContext.Provider>
  );
}

export function useKiosk() {
  return useContext(KioskContext);
}
