import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, Platform, Linking } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, router } from 'expo-router';
import { PaperProvider, Text } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
import { AuthModalProvider } from '../src/contexts/AuthModalContext';
import AuthModal from '../src/components/AuthModal';
import LoadingScreen from '../src/components/LoadingScreen';
import { PaperTheme, Colors, Spacing, Typography, BorderRadius } from '../src/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={errorStyles.container}>
      <MaterialCommunityIcons name="alert-circle-outline" size={56} color={Colors.error} />
      <Text style={errorStyles.title}>エラーが発生しました</Text>
      <Text style={errorStyles.message}>{error.message}</Text>
      <TouchableOpacity style={errorStyles.button} onPress={retry} activeOpacity={0.8}>
        <MaterialCommunityIcons name="reload" size={18} color={Colors.white} />
        <Text style={errorStyles.buttonText}>再読み込み</Text>
      </TouchableOpacity>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontSize: Typography.h2,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  message: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  buttonText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '700',
  },
});

// AuthProvider の内側で useAuth() を呼ぶための内部コンポーネント
// 認証完了 + 最低1.5秒経過後にメイン画面を表示する
function AppShell() {
  const { loading } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // ネイティブスプラッシュをカスタムローディング画面に切り替える
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // AdMob 初期化（モジュール未対応環境はtry-catchでスキップ）
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const { MobileAds } = require('react-native-google-mobile-ads');
      MobileAds().initialize();
    } catch (e) {
      console.warn('AdMob init skipped:', e);
    }
  }, []);
  const [showLoading, setShowLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && minTimeElapsed && showLoading) {
      // 元のシンプルなフェードアウトのみ
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start(() => setShowLoading(false));
    }
  }, [loading, minTimeElapsed]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ animation: 'none' }} />
        <Stack.Screen
          name="(tabs)"
          options={{
            animation: 'slide_from_right',
            animationTypeForReplace: 'push',
          }}
        />
        <Stack.Screen
          name="user/[userId]"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="user/[userId]/followers"
          options={{
            headerShown: true,
            title: 'フォロワー',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="user/[userId]/following"
          options={{
            headerShown: true,
            title: 'フォロー中',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="messages/index" options={{ headerShown: true, title: 'メッセージ', headerBackTitle: '戻る' }} />
        <Stack.Screen name="messages/[conversationId]" options={{ headerShown: true, title: 'チャット' }} />
        <Stack.Screen
          name="ranking/details"
          options={{
            headerShown: true,
            title: '注目選手ランキング',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="analysis/index"
          options={{
            headerShown: true,
            title: '選手分析',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="analysis/batter-report"
          options={{
            headerShown: true,
            title: '打者分析',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="analysis/battery-report"
          options={{
            headerShown: true,
            title: '捕手分析',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="analysis/pitcher-report"
          options={{
            headerShown: true,
            title: '投手分析',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="analysis/spot-report"
          options={{
            headerShown: true,
            title: 'スポット打席分析',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="(tabs)/score/spot-history"
          options={{
            headerShown: true,
            title: 'スポット打席履歴',
            headerBackTitle: '戻る',
            headerStyle: { backgroundColor: Colors.white },
            headerTintColor: Colors.primary,
            headerTitleStyle: { fontWeight: '700', color: Colors.text },
            headerShadowVisible: false,
          }}
        />
      </Stack>
      <AuthModal />

      {showLoading && (
        <Animated.View style={{
          ...StyleSheet.absoluteFillObject,
          opacity: fadeAnim,
          zIndex: 999,
        }}>
          <LoadingScreen />
        </Animated.View>
      )}
    </View>
  );
}

const handleDeepLink = (url: string) => {
  // ballpark://join?code=XXXXXX の形式を処理
  if (url.startsWith('ballpark://join')) {
    const code = url.split('code=')[1];
    if (code) {
      router.push({
        pathname: '/(tabs)/teams',
        params: { inviteCode: code },
      });
    }
  }
};

export default function RootLayout() {
  useEffect(() => {
    // アプリ起動時のディープリンク処理
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // アプリ起動中のディープリンク処理
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={PaperTheme as any}>
        <AuthProvider>
          <AuthModalProvider>
            <NotificationProvider>
              <AppShell />
            </NotificationProvider>
          </AuthModalProvider>
        </AuthProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
