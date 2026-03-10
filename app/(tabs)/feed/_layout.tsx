import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

export default function FeedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[postId]"
        options={{
          headerShown: true,
          title: 'Post',
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
