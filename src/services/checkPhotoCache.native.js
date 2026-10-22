import * as FileSystem from 'expo-file-system/legacy';

// ImagePicker camera output is an app-cache copy. Never remove a URI outside our cache,
// because a library selection could point at a user-owned original on some devices.
export async function discardCheckPhoto(asset) {
  const cache = FileSystem.cacheDirectory;
  if (!cache || !asset?.uri?.startsWith(cache)) return;
  try { await FileSystem.deleteAsync(asset.uri, { idempotent: true }); }
  catch { /* The cache may already have been cleared by the OS. */ }
}
