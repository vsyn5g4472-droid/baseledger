import { Redirect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from '../components/LoadingScreen';

export default function FullIndex() {
  const { loading, isNewUser, currentUser } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isNewUser) {
    return <Redirect href={'/(auth)/onboarding' as any} />;
  }

  if (!currentUser) {
    return <Redirect href={'/(auth)/login' as any} />;
  }

  return <Redirect href="/(tabs)/feed" />;
}
