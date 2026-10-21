// expo-notifications doesn't support web, so these are no-ops there.
export async function ensureNotificationPermission(_channel: { id: string; name: string }) {
  return false;
}

export function addNotificationTapListener(_onUrl: (url: string) => void) {
  return () => {};
}
