import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealReminders } from '@/components/meal-reminders';
import { NewPlaceAlerts } from '@/components/new-place-alerts';
import { ACCENT, RestaurantCard } from '@/components/restaurant-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount } from '@/lib/account';

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { ready, user } = useAccount();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: Platform.OS === 'web' ? Spacing.six + Spacing.four : insets.top + Spacing.four,
            paddingBottom: Platform.OS === 'web' ? Spacing.four : insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        {!ready ? (
          <ActivityIndicator color={theme.textSecondary} />
        ) : user ? (
          <Profile />
        ) : (
          <AuthForm />
        )}
        {ready && <MealReminders />}
        {ready && <NewPlaceAlerts />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthForm() {
  const theme = useTheme();
  const { signIn, signUp } = useAccount();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    const message = await (mode === 'signIn' ? signIn : signUp)(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{mode === 'signIn' ? 'Sign in' : 'Create account'}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Save your chats and favorite restaurants.
      </ThemedText>

      <TextInput
        style={inputStyle}
        placeholder="Email"
        placeholderTextColor={theme.textSecondary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
      />
      <TextInput
        style={inputStyle}
        placeholder={mode === 'signUp' ? 'Password (8+ characters)' : 'Password'}
        placeholderTextColor={theme.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
        onSubmitEditing={submit}
        returnKeyType="go"
        editable={!busy}
      />

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <Pressable
        onPress={submit}
        disabled={busy || !email.trim() || !password}
        style={({ pressed }) => [
          styles.primaryButton,
          (pressed || busy || !email.trim() || !password) && styles.dimmed,
        ]}>
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <ThemedText style={styles.primaryButtonText}>
            {mode === 'signIn' ? 'Sign in' : 'Create account'}
          </ThemedText>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setError(null);
        }}
        style={styles.switchMode}>
        <ThemedText type="small" style={{ color: ACCENT }}>
          {mode === 'signIn' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function Profile() {
  const theme = useTheme();
  const { user, signOut, favorites } = useAccount();

  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">Account</ThemedText>
      <ThemedView type="backgroundElement" style={styles.profileRow}>
        <ThemedText type="small" style={styles.flex} numberOfLines={1}>
          {user?.email}
        </ThemedText>
        <Pressable onPress={signOut} hitSlop={8} style={({ pressed }) => pressed && styles.dimmed}>
          <ThemedText type="small" style={{ color: ACCENT }}>
            Sign out
          </ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedText type="smallBold" style={styles.heading}>
        Favorites
      </ThemedText>
      {favorites.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Tap the ♡ on a restaurant in Where To to save it here.
        </ThemedText>
      ) : (
        favorites.map((r) => <RestaurantCard key={r.id} restaurant={r} />)
      )}
      <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />
      <ThemedText type="small" themeColor="textSecondary">
        Your past chats are under Chats in the Where To tab.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  section: {
    gap: Spacing.three,
  },
  heading: {
    marginTop: Spacing.three,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 15,
  },
  error: {
    color: '#a83c30',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: 600,
  },
  switchMode: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    padding: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
  },
  dimmed: {
    opacity: 0.5,
  },
});
