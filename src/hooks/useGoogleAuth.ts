import { useEffect, useState, useCallback } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../services/firebase';

// Required for expo-auth-session on native
WebBrowser.maybeCompleteAuthSession();

interface GoogleAuthResult {
  signInWithGoogle: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useGoogleAuth(): GoogleAuthResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      setLoading(true);
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .catch((err) => setError(err.message ?? 'Google sign-in failed'))
        .finally(() => setLoading(false));
    } else if (response?.type === 'error') {
      setError(response.error?.message ?? 'Google sign-in failed');
    }
  }, [response]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await promptAsync();
    } catch (err) {
      setError((err as Error).message ?? 'Google sign-in failed');
      setLoading(false);
    }
  }, [promptAsync]);

  return { signInWithGoogle, loading: loading || !request, error };
}
