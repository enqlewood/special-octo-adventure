import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ACCENT } from '@/components/restaurant-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getNewPlaceAlertsEnabled,
  newPlaceAlertsSupported,
  sendTestNewPlaceAlert,
  setNewPlaceAlerts,
} from '@/lib/new-place-alerts';

export function NewPlaceAlerts() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    getNewPlaceAlertsEnabled().then(setEnabled);
  }, []);

  if (!newPlaceAlertsSupported) return null;

  async function toggle(value: boolean) {
    setBusy(true);
    setEnabled(value);
    setError(null);
    setTestSent(false);
    const result = await setNewPlaceAlerts(value);
    setBusy(false);
    if (result) {
      setEnabled(false);
      setError(result);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setTestSent(false);
    const result = await sendTestNewPlaceAlert();
    setTesting(false);
    if (result) setError(result);
    else setTestSent(true);
  }

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">New restaurants</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="small">New restaurant alerts</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Get notified when places open or are coming soon near you
            </ThemedText>
          </View>
          <Switch
            value={enabled ?? false}
            disabled={enabled === null || busy}
            onValueChange={toggle}
            trackColor={{ true: ACCENT }}
          />
        </View>
        {enabled && !busy && (
          <Pressable
            onPress={sendTest}
            disabled={testing}
            style={({ pressed }) => [
              styles.testButton,
              { backgroundColor: theme.backgroundSelected },
              (pressed || testing) && styles.dimmed,
            ]}>
            {testing ? (
              <ActivityIndicator color={theme.textSecondary} />
            ) : (
              <ThemedText type="small" style={{ color: ACCENT }}>
                Send test notification
              </ThemedText>
            )}
          </Pressable>
        )}
      </ThemedView>
      {testSent && (
        <ThemedText type="small" themeColor="textSecondary">
          Sent! It should arrive in a few seconds.
        </ThemedText>
      )}
      {error === 'denied' ? (
        <Pressable onPress={() => Linking.openSettings()}>
          <ThemedText type="small" style={{ color: ACCENT }}>
            Notifications are turned off for this app. Tap to open Settings.
          </ThemedText>
        </Pressable>
      ) : (
        error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  testButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.5,
  },
});
