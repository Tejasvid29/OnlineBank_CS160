import * as SecureStore from 'expo-secure-store';

// iOS/Android: the refresh token lives in the Keychain / Keystore so the session survives an app restart.
// Same async interface as tokenStorage.js.
const REFRESH_KEY = 'bank_refresh_token';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function readRefreshToken() {
  try { return await SecureStore.getItemAsync(REFRESH_KEY, options); } catch { return null; }
}

export async function writeRefreshToken(token) {
  try { token ? await SecureStore.setItemAsync(REFRESH_KEY, token, options) : await SecureStore.deleteItemAsync(REFRESH_KEY, options); } catch { /* Keychain unavailable. */ }
}
