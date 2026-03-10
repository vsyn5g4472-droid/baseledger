import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

/**
 * Redirects unauthenticated users to the login screen.
 * Use this at the top of any screen or layout that requires login.
 */
export function useAuthGuard() {
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.replace('/(auth)/login');
    }
  }, [currentUser, loading]);

  return { currentUser, loading, isAuthenticated: !!currentUser };
}
