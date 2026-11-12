import { Linking, Platform } from 'react-native';

// Opens the platform's maps app with directions. No native map SDK needed.
export function openDirections(v: { name: string; address: string; lat: number; lng: number }) {
  const label = encodeURIComponent(`${v.name}, ${v.address}`);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${v.lat},${v.lng}&q=${label}`
      : `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`;
  Linking.openURL(url).catch(() => {});
}
