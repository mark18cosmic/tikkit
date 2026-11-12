import { requireOptionalNativeModule } from 'expo';

// Straight to Instagram's Story composer, skipping the share sheet. Only in
// development and store builds: Expo Go and the web don't include this module,
// so callers fall back to the share sheet.
type InstagramStoriesNative = {
  isAvailable(): Promise<boolean>;
  shareBackgroundImage(fileUri: string, appId: string): Promise<boolean>;
};

const native = requireOptionalNativeModule<InstagramStoriesNative>('InstagramStories');

// True when this build can talk to Instagram directly and Instagram is installed.
export async function canShareToInstagramStory(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.isAvailable();
  } catch {
    return false;
  }
}

// Opens Instagram's Story composer with the image as the background.
export function shareToInstagramStory(fileUri: string, appId: string): Promise<boolean> {
  if (!native) return Promise.reject(new Error('Instagram sharing isn’t in this build.'));
  return native.shareBackgroundImage(fileUri, appId);
}
