// Web: the refresh token lives in localStorage so a page reload restores the session.
// Same async interface as tokenStorage.native.js.
const REFRESH_KEY = 'bank_refresh_token';
const storage = typeof localStorage !== 'undefined' ? localStorage : null;

export async function readRefreshToken() {
  try { return storage?.getItem(REFRESH_KEY) || null; } catch { return null; }
}

export async function writeRefreshToken(token) {
  try { token ? storage?.setItem(REFRESH_KEY, token) : storage?.removeItem(REFRESH_KEY); } catch { /* Storage unavailable. */ }
}
