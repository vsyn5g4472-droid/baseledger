import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';

interface AppleAuthResult {
  signInWithApple: () => Promise<void>;
  loading: boolean;
  error: string | null;
  isAvailable: boolean;
}

export function useAppleAuth(): AppleAuthResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAvailable);
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const { identityToken } = credential;
      if (!identityToken) {
        throw new Error('Apple Sign-In failed: no identity token');
      }

      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: identityToken,
        rawNonce: undefined,
      });

      await signInWithCredential(auth, firebaseCredential);
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — not an error
      } else {
        setError(e.message ?? 'Apple sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { signInWithApple, loading, error, isAvailable };
}
