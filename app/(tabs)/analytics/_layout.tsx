import { Stack } from 'expo-router';
import { Colors } from '../../../src/constants/theme';

export default function AnalyticsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.white },
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: '700', color: Colors.text },
        headerShadowVisible: false,
      }}
    />
  );
}
