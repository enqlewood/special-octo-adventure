// Push notifications aren't supported on web.
export const newPlaceAlertsSupported = false;

export async function getNewPlaceAlertsEnabled() {
  return false;
}

export async function setNewPlaceAlerts(_enabled: boolean): Promise<string | null> {
  return null;
}

export async function sendTestNewPlaceAlert(): Promise<string | null> {
  return null;
}

export async function refreshNewPlaceAlertsLocation() {}
