import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAccount } from '@/lib/account';
import { getApiUrl, type Restaurant } from '@/lib/api';

export const ACCENT = '#b5541f';

export function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  const router = useRouter();
  const { user, isFavorite, toggleFavorite } = useAccount();
  const favorite = isFavorite(r);
  const isOpen = r.open_now !== false;
  const meta = [
    r.rating
      ? `${r.rating} ★${r.review_count ? ` (${formatCount(r.review_count)})` : ''}`
      : null,
    r.price_level,
    r.cuisine || null,
    r.distance_miles != null ? `${r.distance_miles} mi` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{r.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {meta}
          </ThemedText>
        </View>
        <View style={[styles.pill, isOpen ? styles.pillOpen : styles.pillClosed]}>
          <ThemedText style={[styles.pillText, { color: isOpen ? '#2d6a2d' : '#a83c30' }]}>
            {r.hours_note || (isOpen ? 'Open' : 'Closed')}
          </ThemedText>
        </View>
        {r.id && (
          <Pressable
            onPress={() => (user ? toggleFavorite(r) : router.navigate('/account'))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={favorite ? 'Remove from favorites' : 'Add to favorites'}
            style={({ pressed }) => pressed && styles.dimmed}>
            <ThemedText style={[styles.heart, favorite && { color: ACCENT }]}>
              {favorite ? '♥' : '♡'}
            </ThemedText>
          </Pressable>
        )}
      </View>
      <View style={styles.cardActions}>
        <CardLink label="Menu" url={r.menu_url} />
        <CardLink
          label="Website"
          url={`https://www.google.com/search?q=${encodeURIComponent(r.name)}`}
        />
        <CardLink label="Photos" url={r.photo_url && `${getApiUrl()}${r.photo_url}`} />
        <CardLink label="Directions" url={r.maps_url} />
      </View>
    </ThemedView>
  );
}

// 1234 -> "1,234". Done by hand because number locale formatting isn't
// reliable on every JS engine React Native runs on.
function formatCount(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function CardLink({ label, url }: { label: string; url: string | null }) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={!url}
      onPress={() => url && Linking.openURL(url)}
      style={({ pressed }) => [
        styles.cardLink,
        { borderColor: theme.backgroundSelected, backgroundColor: theme.background },
        (!url || pressed) && styles.dimmed,
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: Spacing.two,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillOpen: {
    backgroundColor: '#e4f2e2',
  },
  pillClosed: {
    backgroundColor: '#fbe4e1',
  },
  pillText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: 600,
  },
  heart: {
    fontSize: 20,
    lineHeight: 22,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  cardLink: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dimmed: {
    opacity: 0.5,
  },
});
