import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../src/contexts/AuthContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
import { AuthModalProvider } from '../src/contexts/AuthModalContext';
import AuthModal from '../src/components/AuthModal';
import { PaperTheme, Colors } from '../src/constants/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={PaperTheme as any}>
        <AuthProvider>
          <AuthModalProvider>
            <NotificationProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
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
                <Stack.Screen name="messages/index" options={{ headerShown: true, title: 'Messages' }} />
                <Stack.Screen name="messages/[conversationId]" options={{ headerShown: true, title: 'Chat' }} />
                <Stack.Screen name="ranking/details" options={{ headerShown: false }} />
              </Stack>
              <AuthModal />
            </NotificationProvider>
          </AuthModalProvider>
        </AuthProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
