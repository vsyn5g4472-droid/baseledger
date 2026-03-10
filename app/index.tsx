import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import LoadingScreen from '../src/components/LoadingScreen';

export default function Index() {
  const { loading, isNewUser, currentUser } = useAuth();

  if (loading) {
    return <LoadingScreen message="Loading..." />;
  }

  // New users (just signed up) → onboarding to set username
  if (isNewUser) {
    return <Redirect href={'/(auth)/onboarding' as any} />;
  }

  // Not authenticated → login screen
  if (!currentUser) {
    return <Redirect href={'/(auth)/login' as any} />;
  }

  // Authenticated → main app
  return <Redirect href="/(tabs)/feed" />;
}
