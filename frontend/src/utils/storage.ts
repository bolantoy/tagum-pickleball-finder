// ─── AsyncStorage Utilities ────────────────────────────────────────────────────
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Safely get and parse a JSON value from AsyncStorage.
 * Returns null if key doesn't exist or parsing fails.
 */
export async function getStoredJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Safely serialize and store a value in AsyncStorage.
 */
export async function setStoredJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently fail — storage is non-critical
  }
}

/**
 * Removes a key from AsyncStorage.
 */
export async function removeStored(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Silently fail
  }
}
