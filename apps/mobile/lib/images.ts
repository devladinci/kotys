// Image attachment pipeline for the mobile composer — mirrors the web
// Composer's prepareImage: everything becomes a JPEG data URI, downscaled so
// the longest edge is ≤ 1536px (same as the web IMAGE_MAX_DIM), and the
// daemon's stripDataUrl later strips the prefix before the model sees it.
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export const MAX_IMAGES = 4;
const IMAGE_MAX_DIM = 1536;

async function toDataUrl(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const width = asset.width ?? 0;
  const height = asset.height ?? 0;
  const scale = Math.min(1, IMAGE_MAX_DIM / Math.max(width, height, 1));
  // Small enough already and the picker gave us base64? Skip the round-trip.
  if (scale >= 1 && asset.base64) {
    return `data:image/jpeg;base64,${asset.base64}`;
  }
  const actions =
    scale < 1 && width > 0 && height > 0
      ? [
          {
            resize: {
              width: Math.max(1, Math.round(width * scale)),
              height: Math.max(1, Math.round(height * scale)),
            },
          },
        ]
      : [];
  const out = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return `data:image/jpeg;base64,${out.base64 ?? ""}`;
}

async function prepareAssets(assets: ImagePicker.ImagePickerAsset[]) {
  const urls: string[] = [];
  for (const asset of assets) {
    if (asset.type && asset.type !== "image") continue;
    try {
      const url = await toDataUrl(asset);
      if (url.length > "data:image/jpeg;base64,".length) urls.push(url);
    } catch {
      // Unreadable asset: skip it rather than failing the whole batch.
    }
  }
  return urls;
}

/** Photo library picker; returns [] on permission denial or cancel. */
export async function pickImages(remaining: number): Promise<string[]> {
  if (remaining <= 0) return [];
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 1,
    exif: false,
  });
  if (res.canceled) return [];
  return prepareAssets(res.assets);
}

/** Camera capture; returns [] on permission denial or cancel. */
export async function takePhoto(): Promise<string[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: false,
  });
  if (res.canceled) return [];
  return prepareAssets(res.assets);
}
