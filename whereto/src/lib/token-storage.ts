import * as SecureStore from 'expo-secure-store';

const KEY = 'where-to-auth-token';

// Stored in the iOS Keychain / Android Keystore so it's encrypted at rest.
export const getToken = () => SecureStore.getItemAsync(KEY);
export const setToken = (token: string) => SecureStore.setItemAsync(KEY, token);
export const clearToken = () => SecureStore.deleteItemAsync(KEY);
