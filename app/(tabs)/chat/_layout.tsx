import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';
import { useAuthGuard } from '../../../src/hooks/useAuthGuard';

export default function ChatLayout() {
  useAuthGuard();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: '700', color: Colors.text },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'チャット' }} />
      <Stack.Screen name="[chatId]" options={{ title: '' }} />
    </Stack>
  );
}
