import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { OtaUpdater } from '../native/FaceScanner';
import { checkOtaRelease } from '../services/kioskApi';

export default function SplashScreen({ navigation }) {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const [otaPassed, setOtaPassed] = useState(false);
  const [status, setStatus] = useState('checking'); // checking | force_update | error
  const [release, setRelease] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadError, setDownloadError] = useState('');
  const waitingForPermissionRef = useRef(false);

  const runCheck = useCallback(async () => {
    setStatus('checking');
    const appInfo = await OtaUpdater.getAppInfo();
    console.log(
      `[OTA] Local App: package=${appInfo.packageName}, versionName=${appInfo.versionName}, versionCode=${appInfo.versionCode}`,
    );

    const res = await checkOtaRelease(appInfo.packageName, appInfo.versionCode);
    console.log(
      `[OTA] Supabase Check: updateAvailable=${res.updateAvailable}, forceUpdate=${res.forceUpdate}, error=${res.error || 'none'}`,
    );

    if (res.error) {
      setErrorMsg(res.error);
      setStatus('error');
      return;
    }
    if (res.updateAvailable && res.forceUpdate) {
      setRelease(res.release);
      setStatus('force_update');
      return;
    }
    setOtaPassed(true);
  }, []);

  useEffect(() => {
    if (otaPassed && isAuthLoaded) {
      navigation.replace(isSignedIn ? 'MainDrawer' : 'Login');
    }
  }, [otaPassed, isAuthLoaded, isSignedIn, navigation]);

  const startDownload = useCallback(async rel => {
    const rawUrl = rel?.download_url || rel?.downloadUrl || rel?.file_url || rel?.url;
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.startsWith('http')) {
      setDownloadError('Invalid download URL');
      return;
    }
    const safeUrl = encodeURI(rawUrl);
    setDownloading(true);
    setDownloadError('');
    setProgress(0);
    try {
      await OtaUpdater.downloadAndInstallApk(safeUrl, rel.file_name, pct => {
        setProgress(pct);
      });
    } catch (e) {
      setDownloadError(e?.message || 'Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, []);

  const handleUpdateNow = useCallback(async () => {
    if (!release || downloading) return;
    const allowed = await OtaUpdater.canRequestPackageInstalls();
    if (!allowed) {
      Alert.alert(
        'Install Permission Required',
        'Please allow this app to install updates from this source, then return to continue.',
        [
          {
            text: 'Open Settings',
            onPress: () => {
              waitingForPermissionRef.current = true;
              OtaUpdater.openUnknownAppSourcesSettings();
            },
          },
        ],
        { cancelable: false },
      );
      return;
    }
    startDownload(release);
  }, [release, downloading, startDownload]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'active' && waitingForPermissionRef.current) {
        waitingForPermissionRef.current = false;
        const allowed = await OtaUpdater.canRequestPackageInstalls();
        if (allowed && release) {
          startDownload(release);
        }
      }
    });
    return () => sub.remove();
  }, [release, startDownload]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return (
    <View className="flex-1 bg-[#111318] items-center justify-center px-6">
      {status === 'checking' && (
        <View className="items-center">
          <View className="w-24 h-24 rounded-full bg-white/10 items-center justify-center mb-5">
            <View className="w-12 h-12 rounded-xl border-2 border-[#0C83C6]" />
          </View>
          <Text className="text-white text-2xl font-bold">Attendo: Face</Text>
          <ActivityIndicator size="large" color="#0C83C6" className="mt-7" />
          <Text className="text-[#94A3B8] text-sm mt-3">Checking for updates...</Text>
        </View>
      )}

      {status === 'force_update' && release && (
        <View className="w-full bg-[#1A202C] rounded-2xl p-6 border border-[#2D3748]">
          <View className="self-start bg-[#0C83C6] px-3 py-1 rounded-full">
            <Text className="text-white text-[11px] font-bold">REQUIRED UPDATE</Text>
          </View>
          <Text className="text-white text-xl font-bold mt-3">
            {release.release_title || 'Update Available'}
          </Text>
          <Text className="text-[#D5E1FA] text-xs mt-1">
            Version {release.latest_version_name || release.version_name || 'Latest'} •{' '}
            {release.file_size || release.file_size_formatted || 'APK'}
          </Text>
          <Text className="text-[#CBD5E1] text-sm mt-4 leading-5">
            {release.release_notes || 'A mandatory update is required to continue.'}
          </Text>

          {downloading && (
            <View className="mt-5">
              <View className="w-full h-2 bg-[#111318] rounded-full overflow-hidden">
                <View className="h-2 bg-[#0C83C6]" style={{ width: `${progress}%` }} />
              </View>
            </View>
          )}

          {!!downloadError && (
            <Text className="text-[#EF4444] text-xs mt-3">{downloadError}</Text>
          )}

          <TouchableOpacity
            disabled={downloading}
            onPress={handleUpdateNow}
            className={`rounded-xl py-3.5 mt-5 items-center ${
              downloading ? 'bg-[#0C83C6]/50' : 'bg-[#0C83C6]'
            }`}
          >
            <Text className="text-white font-semibold">
              {downloading
                ? `Downloading... ${progress}%`
                : downloadError
                ? 'Retry Download'
                : 'Update Now'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'error' && (
        <View className="w-full bg-[#1A202C] rounded-2xl p-6 border border-[#2D3748] items-center">
          <Text className="text-white text-lg font-bold">Update Check Failed</Text>
          <Text className="text-[#CBD5E1] text-sm text-center mt-2">{errorMsg}</Text>
          <TouchableOpacity
            onPress={runCheck}
            className="w-full bg-[#0C83C6] rounded-xl py-3 mt-5 items-center"
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setOtaPassed(true)}
            className="w-full border border-[#334155] rounded-xl py-3 mt-3 items-center"
          >
            <Text className="text-[#CBD5E1] font-semibold">Continue Offline</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
