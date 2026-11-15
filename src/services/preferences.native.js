import * as SecureStore from 'expo-secure-store';

// iOS/Android: device preferences are kept with expo-secure-store, the app's only on-device storage (the setting isn't
// secret). They stay on this phone across sign-outs and restarts. Same async interface as preferences.js.
const LARGER_TEXT_KEY = 'bank_larger_text';

export async function readLargerText() {
  try { return await SecureStore.getItemAsync(LARGER_TEXT_KEY) === '1'; } catch { return false; }
}

export async function writeLargerText(enabled) {
  try { enabled ? await SecureStore.setItemAsync(LARGER_TEXT_KEY, '1') : await SecureStore.deleteItemAsync(LARGER_TEXT_KEY); } catch { /* Keychain unavailable. */ }
}
