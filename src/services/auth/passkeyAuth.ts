import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const SECURE_STORE_KEY = 'ballpark_biometric_creds';

interface StoredCredentials {
  email: string;
  password: string;
}

/**
 * Check if biometric authentication is available on this device.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

/**
 * Check if stored biometric credentials exist.
 */
export async function hasBiometricCredentials(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  return stored !== null;
}

/**
 * Save email/password credentials to SecureStore (for biometric unlock).
 */
export async function saveBiometricCredentials(email: string, password: string): Promise<void> {
  const creds: StoredCredentials = { email, password };
  await SecureStore.setItemAsync(SECURE_STORE_KEY, JSON.stringify(creds));
}

/**
 * Prompt biometric authentication and return stored credentials if successful.
 * Returns null if authentication fails or no credentials are stored.
 */
export async function authenticateWithBiometrics(): Promise<StoredCredentials | null> {
  const available = await isBiometricAvailable();
  if (!available) return null;

  const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!stored) return null;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'BallParkにサインイン',
    fallbackLabel: 'パスワードを使用',
    cancelLabel: 'キャンセル',
    disableDeviceFallback: false,
  });

  if (!result.success) return null;
  return JSON.parse(stored) as StoredCredentials;
}

/**
 * Clear stored biometric credentials (call on sign out).
 */
export async function clearBiometricCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
}
