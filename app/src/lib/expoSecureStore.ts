import * as SecureStore from 'expo-secure-store';
import type { SecureKeyValueStore } from './chunkedSecureStorage';

/** Binding to expo-secure-store (Android Keystore-backed encryption). */
export const expoSecureStore: SecureKeyValueStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};
