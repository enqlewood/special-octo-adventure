import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { apiFetch, type Restaurant, type User } from '@/lib/api';
import { clearToken, getToken, setToken } from '@/lib/token-storage';

type AccountContextValue = {
  /** False until the saved login (if any) has been checked on launch. */
  ready: boolean;
  user: User | null;
  token: string | null;
  /** Each returns an error message to show, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  favorites: Restaurant[];
  isFavorite: (restaurant: Restaurant) => boolean;
  toggleFavorite: (restaurant: Restaurant) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const value = use(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Restaurant[]>([]);

  // Restore the saved login on launch.
  useEffect(() => {
    (async () => {
      try {
        const saved = await getToken();
        if (!saved) return;
        const res = await apiFetch<{ user: User }>('/api/auth/me', { token: saved });
        if (res.ok) {
          setTokenState(saved);
          setUser(res.data.user);
        } else if (res.status === 401) {
          await clearToken(); // expired or signed out elsewhere
        }
      } catch {
        // Server unreachable: stay signed out for now, keep the token for next launch.
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) {
      setFavorites([]);
      return;
    }
    apiFetch<{ favorites: Restaurant[] }>('/api/favorites', { token })
      .then((res) => res.ok && setFavorites(res.data.favorites))
      .catch(() => {});
  }, [token]);

  async function authenticate(path: string, email: string, password: string) {
    try {
      const res = await apiFetch<{ token: string; user: User; error?: string }>(path, {
        method: 'POST',
        body: { email, password },
      });
      if (!res.ok) return res.data?.error ?? 'Something went wrong. Try again?';
      await setToken(res.data.token);
      setTokenState(res.data.token);
      setUser(res.data.user);
      return null;
    } catch {
      return "Couldn't reach the server. Is it running?";
    }
  }

  async function signOut() {
    const current = token;
    setTokenState(null);
    setUser(null);
    await clearToken();
    if (current) {
      apiFetch('/api/auth/logout', { token: current, method: 'POST' }).catch(() => {});
    }
  }

  const isFavorite = (r: Restaurant) => !!r.id && favorites.some((f) => f.id === r.id);

  async function toggleFavorite(r: Restaurant) {
    if (!token || !r.id) return;
    const wasFavorite = isFavorite(r);
    const previous = favorites;
    // Update the UI right away, then roll back if the server says no.
    setFavorites(wasFavorite ? favorites.filter((f) => f.id !== r.id) : [r, ...favorites]);
    try {
      const res = wasFavorite
        ? await apiFetch(`/api/favorites/${encodeURIComponent(r.id)}`, { token, method: 'DELETE' })
        : await apiFetch('/api/favorites', { token, method: 'POST', body: { restaurant: r } });
      if (!res.ok) setFavorites(previous);
    } catch {
      setFavorites(previous);
    }
  }

  return (
    <AccountContext
      value={{
        ready,
        user,
        token,
        signIn: (email, password) => authenticate('/api/auth/login', email, password),
        signUp: (email, password) => authenticate('/api/auth/signup', email, password),
        signOut,
        favorites,
        isFavorite,
        toggleFavorite,
      }}>
      {children}
    </AccountContext>
  );
}
