import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { apiFetch } from '@/lib/api';
import { getLocation } from '@/lib/location';
import { ensureNotificationPermission } from '@/lib/notifications';

// New restaurant alerts are real push notifications: the server checks for
// new places near this device's last known location (server/new-places.js)
// and sends them through Expo's push service.

export const newPlaceAlertsSupported = true;

// Must match ANDROID_CHANNEL_ID in server/new-places.js.
const CHANNEL = { id: 'new-restaurants', name: 'New restaurants nearby' };
const ENABLED_KEY = 'new-place-alerts-enabled';

export async function getNewPlaceAlertsEnabled() {
  return (await SecureStore.getItemAsync(ENABLED_KEY)) === 'true';
}

async function getPushToken() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

async function subscribe(): Promise<string | null> {
  if (!(await ensureNotificationPermission(CHANNEL))) {
    return 'denied';
  }
  let token: string;
  try {
    token = await getPushToken();
  } catch {
    if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      return 'New restaurant alerts need a development build on Android - Expo Go can’t receive push notifications.';
    }
    return 'Couldn’t set up push notifications on this device.';
  }
  const location = await getLocation();
  if (!location) {
    return 'Turn on location for this app so we know which restaurants are near you.';
  }
  try {
    const { ok } = await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: { token, latitude: location.lat, longitude: location.lng },
    });
    return ok ? null : 'The server couldn’t turn on alerts. Try again?';
  } catch {
    return 'Couldn’t reach the server. Is it running?';
  }
}

/**
 * Turns alerts on or off. Returns null on success, 'denied' if notification
 * permission was refused, or a message to show the user.
 */
export async function setNewPlaceAlerts(enabled: boolean): Promise<string | null> {
  if (enabled) {
    const error = await subscribe();
    if (!error) await SecureStore.setItemAsync(ENABLED_KEY, 'true');
    return error;
  }
  await SecureStore.deleteItemAsync(ENABLED_KEY);
  try {
    const token = await getPushToken();
    await apiFetch('/api/push/unsubscribe', { method: 'POST', body: { token } });
  } catch {
    // The server also drops tokens once pushes to them start failing.
  }
  return null;
}

/**
 * Asks the server to push this device a sample new restaurant alert.
 * Returns null on success, or a message to show the user.
 */
export async function sendTestNewPlaceAlert(): Promise<string | null> {
  try {
    const token = await getPushToken();
    const { ok, data } = await apiFetch<{ error?: string }>('/api/push/test', {
      method: 'POST',
      body: { token },
    });
    return ok ? null : data?.error || 'Couldn’t send a test notification. Try again?';
  } catch {
    return 'Couldn’t reach the server. Is it running?';
  }
}

/** Sends the server this device's current location, if alerts are on. */
export async function refreshNewPlaceAlertsLocation() {
  if (await getNewPlaceAlertsEnabled()) await subscribe();
}
