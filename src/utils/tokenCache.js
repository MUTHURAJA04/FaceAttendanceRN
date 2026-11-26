import * as Keychain from 'react-native-keychain';

export const tokenCache = {
  async getToken(key) {
    try {
      const creds = await Keychain.getGenericPassword({ service: key });
      return creds ? creds.password : null;
    } catch (e) {
      return null;
    }
  },
  async saveToken(key, value) {
    try {
      await Keychain.setGenericPassword(key, value, { service: key });
    } catch (e) {
      console.warn('Error saving token to Keychain:', e);
    }
  },
  async clearToken(key) {
    try {
      await Keychain.resetGenericPassword({ service: key });
    } catch (e) {
      console.warn('Error clearing token from Keychain:', e);
    }
  },
};
