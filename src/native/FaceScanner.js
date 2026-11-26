import { DeviceEventEmitter, NativeModules, requireNativeComponent } from 'react-native';

export const NativeFaceScannerView = requireNativeComponent('FaceScannerView');

const { FaceScannerModule, OtaUpdateModule } = NativeModules;

export const OtaUpdater = {
  getAppInfo: async () => {
    if (!OtaUpdateModule) {
      return { packageName: 'com.faceattendancern', versionCode: 1, versionName: '1.0' };
    }
    return OtaUpdateModule.getAppInfo();
  },
  canRequestPackageInstalls: async () => {
    if (!OtaUpdateModule) return true;
    return OtaUpdateModule.canRequestPackageInstalls();
  },
  openUnknownAppSourcesSettings: async () => {
    if (!OtaUpdateModule) return false;
    return OtaUpdateModule.openUnknownAppSourcesSettings();
  },
  downloadAndInstallApk: async (downloadUrl, fileName, onProgress) => {
    if (!OtaUpdateModule) throw new Error('OtaUpdateModule unavailable');
    const sub = DeviceEventEmitter.addListener('onOtaDownloadProgress', evt => {
      if (typeof evt?.percent === 'number') {
        onProgress?.(evt.percent);
      }
    });
    try {
      return await OtaUpdateModule.downloadAndInstallApk(downloadUrl, fileName || null);
    } finally {
      sub.remove();
    }
  },
};

export const FaceScannerEngine = {
  loadEmployees: async employees => {
    if (!FaceScannerModule) return 0;
    return FaceScannerModule.loadEmployees(JSON.stringify(employees || []));
  },
  ejectEmployee: async employeeId => {
    if (!FaceScannerModule) return false;
    return FaceScannerModule.ejectEmployee(employeeId);
  },
  registerUserInRam: async (id, name, employeeCode, branchId, embedding) => {
    if (!FaceScannerModule) return 0;
    return FaceScannerModule.registerUserInRam(id, name, employeeCode || '', branchId || null, embedding);
  },
  captureForRegister: async (excludeEmployeeId = null) => {
    if (!FaceScannerModule) throw new Error('FaceScannerModule unavailable');
    return FaceScannerModule.captureForRegister(excludeEmployeeId);
  },
  playAudio: soundName => {
    FaceScannerModule?.playAudio(soundName);
  },
};
