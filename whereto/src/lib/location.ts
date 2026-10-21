import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

// Asks for foreground location permission the first time it's needed, then
// returns the user's position (or null if denied/unavailable). Works on iOS,
// Android, and web.
export async function getLocation(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    // A recent cached fix is instant; fall back to a fresh reading.
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
