import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Shared setup for every kind of notification the app shows.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Creates the Android channel (which must exist before the permission prompt
 * can appear on Android 13+), then asks for permission if needed.
 */
export async function ensureNotificationPermission(channel: { id: string; name: string }) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Calls `onUrl` with a notification's `data.url` when the user taps it,
 * including a tap that launched the app.
 */
export function addNotificationTapListener(onUrl: (url: string) => void) {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') onUrl(url);
  };
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
