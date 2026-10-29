import { File } from 'expo-file-system';

// On iOS/Android the global fetch is expo/fetch, which cannot send React Native's { uri, name, type } form parts
// ("Unsupported FormDataPart implementation"). It reads file parts through Blob-style bytes(), which
// expo-file-system's File provides; the part's filename and Content-Type come from the file (".jpg" -> image/jpeg).
export function checkPhotoPart(asset, side) {
  const file = new File(asset.uri);
  if (!file.exists) throw new Error(`The ${side} photo is no longer available. Retake it.`);
  return file;
}
