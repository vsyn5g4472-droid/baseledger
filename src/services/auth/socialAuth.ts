import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase';
import { getOrCreateFirestoreUser } from './userAuthService';
import type { User } from '../../models/types';

/**
 * Sign in with a Google id_token and/or access_token obtained via expo-auth-session.
 * At least one of idToken / accessToken must be non-null.
 */
export async function signInWithGoogleCredential(
  idToken: string | null,
  accessToken: string | null,
): Promise<{ user: User; isNew: boolean }> {
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const result = await signInWithCredential(auth, credential);
  return getOrCreateFirestoreUser(result.user);
}

/**
 * Sign in with an Apple identityToken obtained via expo-apple-authentication.
 * rawNonce is the un-hashed nonce that was SHA-256 hashed before passing to Apple.
 */
export async function signInWithAppleToken(
  identityToken: string,
  rawNonce: string,
): Promise<{ user: User; isNew: boolean }> {
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken: identityToken, rawNonce });
  const result = await signInWithCredential(auth, credential);
  return getOrCreateFirestoreUser(result.user);
}
