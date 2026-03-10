import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as ExpoCrypto from 'expo-crypto';
import { useAuth } from '../../src/contexts/AuthContext';
import { useI18n } from '../../src/i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';

WebBrowser.maybeCompleteAuthSession();

// Redirect URI registered in Google Cloud Console → Authorized redirect URIs
// Dev (Expo Go): https://auth.expo.io/@<your-expo-username>/ballpark
// Prod (standalone): ballpark://
const REDIRECT_URI = makeRedirectUri({ scheme: 'ballpark' });

// ── Nonce helpers for Apple Sign-In ──────────────────────────────────────────

function generateNonce(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(str: string): Promise<string> {
  return ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    str,
    { encoding: ExpoCrypto.CryptoEncoding.HEX },
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { signIn, signInWithGoogle, signInWithApple, loading } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  // ── Google OAuth (expo-auth-session) ────────────────────────────────────────
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: REDIRECT_URI,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    // Code flow → idToken in authentication object; implicit flow → params.id_token
    const idToken = response.authentication?.idToken ?? response.params?.id_token ?? null;
    const accessToken = response.authentication?.accessToken ?? null;
    if (!idToken && !accessToken) return;
    signInWithGoogle(idToken, accessToken)
      .then(() => router.replace('/'))
      .catch((e: any) => setError(e.message || 'Google sign-in failed'));
  }, [response]);

  // ── Email / Password login ──────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) {
      setError(t.auth.errorFill);
      return;
    }
    try {
      setError('');
      await signIn(email, password);
      router.replace('/(tabs)/feed');
    } catch (e: any) {
      setError(e.message || 'Login failed');
    }
  };

  // ── Apple Sign-In ───────────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    try {
      setError('');
      const rawNonce = generateNonce();
      const hashedNonce = await sha256(rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (credential.identityToken) {
        await signInWithApple(credential.identityToken, rawNonce);
        router.replace('/');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError(e.message || 'Apple sign-in failed');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero section */}
        <View style={styles.logoSection}>
          <MaterialCommunityIcons name="baseball" size={72} color={Colors.white} />
          <Text style={styles.appName}>{t.app.title}</Text>
          <Text style={styles.tagline}>{t.auth.tagline}</Text>
        </View>

        {/* Form section */}
        <View style={styles.formSection}>
          <TextInput
            label={t.auth.emailLabel}
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            left={<TextInput.Icon icon="email" />}
          />

          <TextInput
            label={t.auth.passwordLabel}
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            style={styles.input}
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.loginButton}
            labelStyle={styles.loginButtonLabel}
            buttonColor={Colors.primary}
          >
            {t.auth.loginBtn}
          </Button>

          {/* ── Social sign-in ── */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>または</Text>
            <View style={styles.orLine} />
          </View>

          {/* Apple — iOS only (native HIG-compliant button) */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={BorderRadius.lg}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Google */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={() => { setError(''); promptAsync(); }}
            disabled={!request || loading}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="google" size={20} color="#4285F4" />
            <Text style={styles.googleButtonText}>{t.auth.google}</Text>
          </TouchableOpacity>

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>{t.auth.noAccount} </Text>
            <Button
              mode="text"
              onPress={() => router.push('/(auth)/register')}
              compact
              labelStyle={styles.registerLink}
            >
              {t.auth.signUpBtn}
            </Button>
          </View>

          {/* Guest access */}
          <Divider style={styles.divider} />
          <Button
            mode="text"
            onPress={() => router.replace('/(tabs)/feed')}
            textColor={Colors.textSecondary}
            icon="eye-outline"
            style={styles.guestBtn}
          >
            {t.auth.guestContinue}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  scroll: { flexGrow: 1 },
  logoSection: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: Spacing.xl,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.white,
    marginTop: Spacing.md,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: Typography.body,
    color: 'rgba(255,255,255,0.8)',
    marginTop: Spacing.xs,
  },
  formSection: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  input: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
  },
  error: {
    color: Colors.error,
    fontSize: Typography.caption,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  loginButton: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 4,
    marginBottom: Spacing.md,
  },
  loginButtonLabel: {
    fontSize: Typography.body,
    fontWeight: '600',
  },

  // OR divider
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.sm,
  },

  // Apple button (native AppleAuthenticationButton requires explicit height)
  appleButton: {
    height: 50,
    width: '100%',
    marginBottom: Spacing.sm,
  },

  // Google button
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    marginBottom: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  googleButtonText: {
    color: Colors.text,
    fontSize: Typography.body,
    fontWeight: '600',
  },

  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
  },
  registerLink: {
    color: Colors.primary,
    fontWeight: '600',
  },
  divider: {
    marginVertical: Spacing.md,
  },
  guestBtn: {
    alignSelf: 'center',
  },
});
