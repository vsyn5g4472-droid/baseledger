import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/theme';
import { useI18n } from '../../src/i18n';

export default function AuthLayout() {
  const { t } = useI18n();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t.auth.createAccount }} />
      <Stack.Screen
        name="onboarding"
        options={{
          title: t.auth.onboarding.title,
          headerLeft: () => null, // No back — must complete or skip
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
