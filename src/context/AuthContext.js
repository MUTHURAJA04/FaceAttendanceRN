import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  completeGoogleOAuthCallback,
  refreshClerkToken,
  restoreClerkSession,
  signOutClerk,
  startGoogleOAuth,
} from '../services/clerkAuth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    restoreClerkSession()
      .then(s => setSession(s))
      .finally(() => setIsLoaded(true));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await startGoogleOAuth();
  }, []);

  const handleOAuthCallback = useCallback(async url => {
    const s = await completeGoogleOAuthCallback(url);
    if (s) {
      setSession(s);
    }
    return s;
  }, []);

  const signOut = useCallback(async () => {
    await signOutClerk();
    setSession(null);
  }, []);

  const getToken = useCallback(async () => {
    return refreshClerkToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoaded,
        isSignedIn: Boolean(session?.user),
        user: session?.user || null,
        signInWithGoogle,
        handleOAuthCallback,
        signOut,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
