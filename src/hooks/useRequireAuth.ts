import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAuthModal } from '../contexts/AuthModalContext';

/**
 * Returns a function that wraps any action with an auth check.
 * If the user is authenticated, the action executes immediately.
 * If not, the auth modal appears and the action is deferred until sign-in.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   <Button onPress={() => requireAuth(() => doSomething())} />
 */
export function useRequireAuth() {
  const { currentUser } = useAuth();
  const { showModal } = useAuthModal();

  return useCallback(
    (action?: () => void) => {
      if (currentUser) {
        action?.();
        return true;
      }
      showModal(action);
      return false;
    },
    [currentUser, showModal],
  );
}
