import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import { userManager } from "./authConfig";

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Wraps the OIDC Authorization Code + PKCE flow (oidc-client-ts) for the whole
 * app. Does not redirect on its own — <RequireAuth> (in routes.tsx) decides
 * when a login is required, so public routes can render without one.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    userManager.getUser().then((storedUser) => {
      setUser(storedUser);
      setIsLoading(false);
    });

    const onUserLoaded = (loadedUser: User) => setUser(loadedUser);
    const onUserUnloaded = () => setUser(null);
    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    return () => {
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
    };
  }, []);

  const value: AuthState = {
    user,
    isLoading,
    login: () => userManager.signinRedirect(),
    logout: () => userManager.signoutRedirect(),
    getAccessToken: () => user?.access_token ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() called outside <AuthProvider>");
  }
  return ctx;
}
