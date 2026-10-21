import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { ensureNotificationPermission } from '@/lib/notifications';

export type Meal = 'lunch' | 'dinner';
export type Reminder = { enabled: boolean; hour: number; minute: number };

export const MEALS: Record<Meal, { label: string; hour: number; minute: number; body: string }> = {
  lunch: { label: 'Lunch', hour: 11, minute: 30, body: 'Hungry? Ask Where To for lunch ideas nearby.' },
  dinner: { label: 'Dinner', hour: 17, minute: 30, body: "Not sure what's for dinner? Where To can help." },
};

export const remindersSupported = true;

const CHANNEL = { id: 'meal-reminders', name: 'Meal reminders' };
// The chosen times are saved separately so they're kept while a reminder is
// off. SecureStore is just the small key-value store this app already has.
const TIMES_KEY = 'meal-reminder-times';
// Each meal's reminder is scheduled under a fixed identifier, so the
// scheduled notifications themselves are the source of truth for which
// reminders are on.
const identifierFor = (meal: Meal) => `meal-reminder-${meal}`;

type SavedTimes = Partial<Record<Meal, { hour: number; minute: number }>>;

async function loadTimes(): Promise<SavedTimes> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(TIMES_KEY)) ?? '{}');
  } catch {
    return {};
  }
}

export async function getReminders(): Promise<Record<Meal, Reminder>> {
  const [scheduled, times] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    loadTimes(),
  ]);
  const ids = new Set(scheduled.map((n) => n.identifier));
  const reminderFor = (meal: Meal): Reminder => ({
    enabled: ids.has(identifierFor(meal)),
    hour: times[meal]?.hour ?? MEALS[meal].hour,
    minute: times[meal]?.minute ?? MEALS[meal].minute,
  });
  return { lunch: reminderFor('lunch'), dinner: reminderFor('dinner') };
}

/**
 * Saves a meal's reminder time and schedules or cancels its daily
 * notification. Returns false if notification permission was denied, so the
 * caller can tell the user.
 */
export async function saveReminder(meal: Meal, { enabled, hour, minute }: Reminder): Promise<boolean> {
  const times = await loadTimes();
  await SecureStore.setItemAsync(TIMES_KEY, JSON.stringify({ ...times, [meal]: { hour, minute } }));

  const identifier = identifierFor(meal);
  await Notifications.cancelScheduledNotificationAsync(identifier);
  if (!enabled) return true;
  if (!(await ensureNotificationPermission(CHANNEL))) return false;

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: 'Where To', body: MEALS[meal].body, data: { url: '/where-to' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL.id },
  });
  return true;
}
