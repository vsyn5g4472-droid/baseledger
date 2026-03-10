import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';
import { useAuthGuard } from '../../../src/hooks/useAuthGuard';

const whiteHeader = {
  headerStyle: { backgroundColor: Colors.white },
  headerTintColor: Colors.primary,
  headerTitleStyle: { fontWeight: '700' as const, color: Colors.text },
  headerShadowVisible: false,
};

export default function TeamsLayout() {
  useAuthGuard();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ headerShown: true, title: 'チーム作成', ...whiteHeader }} />
      <Stack.Screen name="[teamId]/index" options={{ headerShown: true, title: 'チーム', ...whiteHeader }} />
      <Stack.Screen name="[teamId]/chat" options={{ headerShown: true, title: 'チームチャット', ...whiteHeader }} />
      <Stack.Screen name="[teamId]/scores" options={{ headerShown: true, title: 'スコア', ...whiteHeader }} />
      <Stack.Screen name="[teamId]/game" options={{ headerShown: true, title: '打席ログ', ...whiteHeader }} />
    </Stack>
  );
}
