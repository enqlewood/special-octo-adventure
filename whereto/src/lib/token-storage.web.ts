const KEY = 'where-to-auth-token';

// expo-secure-store doesn't support web, so the browser keeps the token in
// localStorage. Wrapped in try/catch because storage can be blocked.
export async function getToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {}
}

export async function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
