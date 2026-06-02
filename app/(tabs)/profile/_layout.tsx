import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

export default function ProfileLayout() {
  const { t } = useI18n();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerBackTitle: 'プロフィール' }} />
      <Stack.Screen
        name="edit"
        options={{
          headerShown: true,
          title: t.nav.editProfile,
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          title: t.settings.title,
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="feed"
        options={{
          headerShown: true,
          title: 'マイ成績フィード',
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: true,
          title: '通知',
          headerBackTitle: '戻る',
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="plan"
        options={{
          headerShown: true,
          title: 'プランを選択',
          headerBackTitle: '戻る',
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
