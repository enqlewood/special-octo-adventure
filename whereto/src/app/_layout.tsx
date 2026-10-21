import { DarkTheme, DefaultTheme, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Linking, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AccountProvider } from '@/lib/account';
import { refreshNewPlaceAlertsLocation } from '@/lib/new-place-alerts';
import { addNotificationTapListener } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  // Mealtime reminders open the Where To tab; new restaurant alerts open the
  // place in Google Maps.
  useEffect(
    () =>
      addNotificationTapListener((url) => {
        if (url.startsWith('http')) Linking.openURL(url);
        else router.push(url as never);
      }),
    [router]
  );

  // Keep the server's idea of "near you" current for new restaurant alerts.
  useEffect(() => {
    refreshNewPlaceAlertsLocation();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AccountProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </AccountProvider>
    </ThemeProvider>
  );
}
