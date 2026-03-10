import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useDeferredActionStore } from '../stores/deferredActionStore';

interface AuthModalContextType {
  visible: boolean;
  showModal: (pendingAction?: () => void) => void;
  hideModal: () => void;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const setPendingAction = useDeferredActionStore((s) => s.setPendingAction);

  const showModal = useCallback(
    (pendingAction?: () => void) => {
      setPendingAction(pendingAction ?? null);
      setVisible(true);
    },
    [setPendingAction],
  );

  const hideModal = useCallback(() => {
    setVisible(false);
  }, []);

  const value = useMemo(() => ({ visible, showModal, hideModal }), [visible, showModal, hideModal]);

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal(): AuthModalContextType {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}
