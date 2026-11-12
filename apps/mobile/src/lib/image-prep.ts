import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Choosing and shrinking photos before upload. Phone photos are 3–5 MB;
 * shrunk to these sizes they're about 100–250 KB, which keeps storage and
 * bandwidth (what we pay for) small and lists fast on slow connections.
 */
export const IMAGE_SIZES = {
  flyer: 1200,
  thumb: 400,
  profile: 400,
} as const;

/** Opens the photo library. Returns the chosen photo's local URI, or null if cancelled. */
export async function pickPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0]!.uri;
}

export interface PreparedImage {
  /** Local URI of the shrunk copy, for showing a preview. */
  uri: string;
  /** JPEG bytes to upload. */
  bytes: ArrayBuffer;
}

/** A JPEG no wider than `maxWidth` (smaller photos aren't enlarged). */
export async function prepareImage(uri: string, maxWidth: number): Promise<PreparedImage> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const rendered =
    original.width > maxWidth
      ? await ImageManipulator.manipulate(uri).resize({ width: maxWidth }).renderAsync()
      : original;
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return { uri: saved.uri, bytes: base64ToBytes(saved.base64 ?? '') };
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
