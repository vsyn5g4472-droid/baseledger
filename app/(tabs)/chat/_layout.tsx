import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

export default function ChatLayout() {
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
