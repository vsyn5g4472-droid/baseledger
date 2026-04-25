import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as ExpoCrypto from 'expo-crypto';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import {
  isBiometricAvailable,
  hasBiometricCredentials,
} from '../../src/services/auth/passkeyAuth';

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URI = makeRedirectUri({ scheme: 'ballpark' });

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

// ── ログイン方式タブ ──────────────────────────────────────────────────────────
type LoginMode = 'email' | 'username';

interface ModeTabProps {
  mode: LoginMode;
  onChange: (m: LoginMode) => void;
}

function ModeTab({ mode, onChange }: ModeTabProps) {
  return (
    <View style={tabStyles.container}>
      {(['email', 'username'] as LoginMode[]).map((m) => {
        const active = mode === m;
        return (
          <TouchableOpacity
            key={m}
            style={[tabStyles.tab, active && tabStyles.tabActive]}
            onPress={() => onChange(m)}
            activeOpacity={0.8}
          >
            <Text style={[tabStyles.label, active && tabStyles.labelActive]}>
              {m === 'email' ? 'メールアドレス' : 'ユーザーID'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  label: {
    fontSize: Typography.caption,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  labelActive: {
    fontWeight: '700',
    color: Colors.text,
  },
});

// ─────────────────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { signIn, signInWithUsername, signInWithGoogle, signInWithApple, signInWithPasskey, loading } = useAuth();

  const [loginMode, setLoginMode] = useState<LoginMode>('email');
  const [identifier, setIdentifier] = useState(''); // メールまたはユーザーID
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: REDIRECT_URI,
  });

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.authentication?.idToken ?? response.params?.id_token ?? null;
    const accessToken = response.authentication?.accessToken ?? null;
    if (!idToken && !accessToken) return;
    signInWithGoogle(idToken, accessToken)
      .then(() => router.replace('/'))
      .catch((e: any) => setError(e.message || 'Google ログインに失敗しました'));
  }, [response]);

  // パスキーが使えるか確認
  useEffect(() => {
    Promise.all([isBiometricAvailable(), hasBiometricCredentials()]).then(
      ([available, hasCreds]) => setPasskeyAvailable(available && hasCreds),
    );
  }, []);

  // ── メール/ユーザーIDログイン ─────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError('入力欄を埋めてください');
      return;
    }
    try {
      setError('');
      if (loginMode === 'email') {
        await signIn(identifier.trim(), password);
      } else {
        await signInWithUsername(identifier.trim(), password);
      }
      router.replace('/(tabs)/feed');
    } catch (e: any) {
      setError(e.message || 'ログインに失敗しました');
    }
  };

  // ── Apple ───────────────────────────────────────────────────────────────────
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
        setError(e.message || 'Apple ログインに失敗しました');
      }
    }
  };

  // ── パスキー ─────────────────────────────────────────────────────────────────
  const handlePasskey = async () => {
    try {
      setError('');
      await signInWithPasskey();
      router.replace('/(tabs)/feed');
    } catch (e: any) {
      setError(e.message || 'パスキー認証に失敗しました');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ヒーローセクション */}
        <View style={styles.hero}>
          <MaterialCommunityIcons name="baseball" size={56} color={Colors.white} />
          <Text style={styles.appName}>BallPark</Text>
          <Text style={styles.tagline}>野球をもっと、深く楽しむ</Text>
        </View>

        {/* フォームセクション */}
        <View style={styles.form}>

          {/* ソーシャルログイン — 最も手軽な方法を最初に提示 */}
          <Text style={styles.sectionLabel}>かんたんログイン</Text>

          {/* パスキー — 保存済みの場合のみ表示 */}
          {passkeyAvailable && (
            <TouchableOpacity style={styles.passkeyBtn} onPress={handlePasskey} activeOpacity={0.85}>
              <MaterialCommunityIcons name="face-recognition" size={20} color={Colors.white} />
              <Text style={styles.passkeyBtnText}>Face ID / Touch ID でログイン</Text>
            </TouchableOpacity>
          )}

          {/* Apple — iOS のみ */}
          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={BorderRadius.lg}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Google */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={() => { setError(''); promptAsync(); }}
            disabled={!request || loading}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="google" size={18} color="#4285F4" />
            <Text style={styles.googleBtnText}>Google でログイン</Text>
          </TouchableOpacity>

          {/* 区切り */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>またはIDで</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* メール / ユーザーID 切り替えタブ */}
          <ModeTab mode={loginMode} onChange={(m) => { setLoginMode(m); setIdentifier(''); setError(''); }} />

          <TextInput
            label={loginMode === 'email' ? 'メールアドレス' : 'ユーザーID（@なし）'}
            value={identifier}
            onChangeText={setIdentifier}
            mode="outlined"
            keyboardType={loginMode === 'email' ? 'email-address' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            left={<TextInput.Icon icon={loginMode === 'email' ? 'email-outline' : 'account-outline'} />}
          />

          <TextInput
            label="パスワード"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry={!showPassword}
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
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
            style={styles.loginBtn}
            labelStyle={styles.loginBtnLabel}
            buttonColor={Colors.action}
          >
            ログイン
          </Button>

          {/* アカウント作成へ */}
          <TouchableOpacity
            style={styles.registerRow}
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.7}
          >
            <Text style={styles.registerText}>アカウントをお持ちでない方</Text>
            <Text style={styles.registerLink}>新規登録 →</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  scroll: {
    flexGrow: 1,
  },

  // ── ヒーロー ────────────────────────────────────────────────────────────────
  hero: {
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  tagline: {
    fontSize: Typography.bodySmall,
    color: 'rgba(255,255,255,0.75)',
  },

  // ── フォームシート ──────────────────────────────────────────────────────────
  form: {
    flex: 1,
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
  },

  sectionLabel: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  // パスキー
  passkeyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    marginBottom: Spacing.sm,
  },
  passkeyBtnText: {
    color: Colors.white,
    fontSize: Typography.bodySmall,
    fontWeight: '700',
  },

  // Apple
  appleBtn: {
    height: 50,
    width: '100%',
    marginBottom: Spacing.sm,
  },

  // Google
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  googleBtnText: {
    color: Colors.text,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },

  // 区切り
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },

  // フォーム入力
  input: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
  },
  error: {
    color: Colors.error,
    fontSize: Typography.caption,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  loginBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 4,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  loginBtnLabel: {
    fontSize: Typography.body,
    fontWeight: '700',
  },

  // 新規登録
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  registerText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },
  registerLink: {
    fontSize: Typography.caption,
    color: Colors.action,
    fontWeight: '700',
  },

});
