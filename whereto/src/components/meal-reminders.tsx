import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ACCENT } from '@/components/restaurant-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getReminders,
  MEALS,
  remindersSupported,
  saveReminder,
  type Meal,
  type Reminder,
} from '@/lib/reminders';

function formatTime(hour: number, minute: number) {
  const h = hour % 12 || 12;
  return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

function toDate({ hour, minute }: { hour: number; minute: number }) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function MealReminders() {
  const theme = useTheme();
  const [reminders, setReminders] = useState<Record<Meal, Reminder> | null>(null);
  const [denied, setDenied] = useState(false);
  // The meal whose time picker is open, and the time scrolled to so far.
  // The new time is saved when the picker closes, not on every wheel tick.
  const [editing, setEditing] = useState<{ meal: Meal; date: Date } | null>(null);

  useEffect(() => {
    getReminders().then(setReminders);
  }, []);

  if (!remindersSupported) return null;

  async function update(meal: Meal, changes: Partial<Reminder>) {
    if (!reminders) return;
    const next = { ...reminders[meal], ...changes };
    setReminders((r) => r && { ...r, [meal]: next });
    const ok = await saveReminder(meal, next);
    setDenied(!ok);
    if (!ok) setReminders((r) => r && { ...r, [meal]: { ...next, enabled: false } });
  }

  function closePicker(date = editing?.date) {
    if (editing && date) update(editing.meal, { hour: date.getHours(), minute: date.getMinutes() });
    setEditing(null);
  }

  function toggleTime(meal: Meal) {
    if (!reminders) return;
    if (editing?.meal === meal) return closePicker();
    if (editing) closePicker();
    setEditing({ meal, date: toDate(reminders[meal]) });
  }

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Mealtime reminders</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {(Object.keys(MEALS) as Meal[]).map((meal) => {
          const reminder = reminders?.[meal];
          const isEditing = editing?.meal === meal;
          return (
            <View key={meal}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <ThemedText type="small">{MEALS[meal].label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Daily
                  </ThemedText>
                </View>
                {reminder && (
                  <Pressable
                    onPress={() => toggleTime(meal)}
                    style={({ pressed }) => [
                      styles.timeButton,
                      { backgroundColor: theme.backgroundSelected },
                      pressed && styles.dimmed,
                    ]}>
                    <ThemedText type="small" style={isEditing && { color: ACCENT }}>
                      {formatTime(reminder.hour, reminder.minute)}
                    </ThemedText>
                  </Pressable>
                )}
                <Switch
                  value={reminder?.enabled ?? false}
                  disabled={!reminder}
                  onValueChange={(enabled) => update(meal, { enabled })}
                  trackColor={{ true: ACCENT }}
                />
              </View>

              {isEditing &&
                (Platform.OS === 'ios' ? (
                  <View>
                    <DateTimePicker
                      mode="time"
                      display="spinner"
                      value={editing.date}
                      onValueChange={(_, date) => setEditing({ meal, date })}
                      accentColor={ACCENT}
                    />
                    <Pressable onPress={() => closePicker()} style={styles.doneButton} hitSlop={8}>
                      <ThemedText type="smallBold" style={{ color: ACCENT }}>
                        Done
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  // On Android this opens a clock-dial dialog: Material 3 has
                  // no scroll-wheel picker.
                  <DateTimePicker
                    mode="time"
                    value={editing.date}
                    onValueChange={(_, date) => closePicker(date)}
                    onDismiss={() => setEditing(null)}
                    accentColor={ACCENT}
                  />
                ))}
            </View>
          );
        })}
      </ThemedView>
      {denied && (
        <Pressable onPress={() => Linking.openSettings()}>
          <ThemedText type="small" style={{ color: ACCENT }}>
            Notifications are turned off for this app. Tap to open Settings.
          </ThemedText>
        </Pressable>
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  timeButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  doneButton: {
    alignSelf: 'flex-end',
    paddingBottom: Spacing.two,
  },
  dimmed: {
    opacity: 0.5,
  },
});
