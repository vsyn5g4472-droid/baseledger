import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

// Auth guard removed from layout — handled per-screen in score/index.tsx
export default function ScoreLayout() {
  const { t } = useI18n();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: '700', color: Colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="setup"
        options={{ title: t.nav.lineupSetup, headerShown: true }}
      />
      <Stack.Screen
        name="main"
        options={{
          title: t.nav.liveScore,
          headerShown: false,
          headerBackButtonMenuEnabled: false,
        }}
      />
      <Stack.Screen
        name="history"
        options={{ title: t.nav.scoreHistory, headerShown: true }}
      />
      <Stack.Screen
        name="start"
        options={{ title: 'クイックスタート', headerShown: true }}
      />
      <Stack.Screen
        name="mapping"
        options={{ title: '選手名簿の設定', headerShown: true }}
      />
      <Stack.Screen
        name="spot"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="normal"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
