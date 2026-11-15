// Web: device preferences live in localStorage. Same async interface as preferences.native.js.
const LARGER_TEXT_KEY = 'bank_larger_text';
const storage = typeof localStorage !== 'undefined' ? localStorage : null;

export async function readLargerText() {
  try { return storage?.getItem(LARGER_TEXT_KEY) === '1'; } catch { return false; }
}

export async function writeLargerText(enabled) {
  try { enabled ? storage?.setItem(LARGER_TEXT_KEY, '1') : storage?.removeItem(LARGER_TEXT_KEY); } catch { /* Storage unavailable. */ }
}
