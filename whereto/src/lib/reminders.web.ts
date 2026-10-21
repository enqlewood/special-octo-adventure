// expo-notifications doesn't support scheduling on web, so reminders are
// native-only. These stubs keep the same API so screens don't need checks.
export type Meal = 'lunch' | 'dinner';
export type Reminder = { enabled: boolean; hour: number; minute: number };

export const MEALS: Record<Meal, { label: string; hour: number; minute: number; body: string }> = {
  lunch: { label: 'Lunch', hour: 11, minute: 30, body: '' },
  dinner: { label: 'Dinner', hour: 17, minute: 30, body: '' },
};

export const remindersSupported = false;

export async function getReminders(): Promise<Record<Meal, Reminder>> {
  return {
    lunch: { enabled: false, hour: MEALS.lunch.hour, minute: MEALS.lunch.minute },
    dinner: { enabled: false, hour: MEALS.dinner.hour, minute: MEALS.dinner.minute },
  };
}

export async function saveReminder(_meal: Meal, _reminder: Reminder): Promise<boolean> {
  return false;
}
