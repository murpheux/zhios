import type { User } from "oidc-client-ts";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { userManager } from "./authConfig";
import { currentPath, type SigninState, sanitizeReturnTo } from "./returnTo";

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  /** Redirects to the IdP; `returnTo` (same-origin path) is restored after the callback. Defaults to the current URL. */
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Current access token, renewing silently if it has expired. Resolves to
   * undefined when there's no session or renewal failed — never an expired token.
   * Referentially stable for the provider's lifetime.
   */
  getAccessToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthState | null>(null);

let pendingRenewal: Promise<User | null> | null = null;

/** De-duplicates concurrent renewals (several requests can discover expiry at once). */
function renewSession(): Promise<User | null> {
  pendingRenewal ??= userManager
    .signinSilent()
    .catch((err: unknown) => {
      console.warn("[auth] silent renew failed", err);
      return null;
    })
    .finally(() => {
      pendingRenewal = null;
    });
  return pendingRenewal;
}

/**
 * Wraps the OIDC Authorization Code + PKCE flow (oidc-client-ts) for the whole
 * app. Does not redirect on its own — <RequireAuth> decides when a login is
 * required, so public routes can render without one.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Mirrors `user` so getAccessToken can stay stable (no dependency on render state).
  const userRef = useRef<User | null>(null);

  const applyUser = useCallback((next: User | null) => {
    userRef.current = next;
    setUser(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    userManager
      .getUser()
      .then(async (stored: User | null) => {
        const usable = stored?.expired ? await renewSession() : stored;
        if (!cancelled) applyUser(usable);
      })
      .catch((err: unknown) => {
        console.warn("[auth] failed to restore session", err);
        if (!cancelled) applyUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const onUserLoaded = (loadedUser: User) => applyUser(loadedUser);
    const onUserUnloaded = () => applyUser(null);
    const onAccessTokenExpired = () => {
      void renewSession().then((renewed: User | null) => {
        // Renewal failed: drop the dead session so <RequireAuth> starts a fresh login.
        if (!renewed) void userManager.removeUser();
      });
    };
    const onSilentRenewError = (err: Error) => console.warn("[auth] automatic silent renew failed", err);

    userManager.events.addUserLoaded(onUserLoaded);
    userManager.events.addUserUnloaded(onUserUnloaded);
    userManager.events.addAccessTokenExpired(onAccessTokenExpired);
    userManager.events.addSilentRenewError(onSilentRenewError);
    return () => {
      cancelled = true;
      userManager.events.removeUserLoaded(onUserLoaded);
      userManager.events.removeUserUnloaded(onUserUnloaded);
      userManager.events.removeAccessTokenExpired(onAccessTokenExpired);
      userManager.events.removeSilentRenewError(onSilentRenewError);
    };
  }, [applyUser]);

  const getAccessToken = useCallback(async (): Promise<string | undefined> => {
    const current = userRef.current;
    if (!current) return undefined;
    if (!current.expired) return current.access_token;
    const renewed = await renewSession();
    return renewed && !renewed.expired ? renewed.access_token : undefined;
  }, []);

  const login = useCallback((returnTo?: string) => {
    const state: SigninState = { returnTo: sanitizeReturnTo(returnTo ?? currentPath()) };
    return userManager.signinRedirect({ state });
  }, []);

  const logout = useCallback(() => userManager.signoutRedirect(), []);

  const value = useMemo<AuthState>(
    () => ({ user, isLoading, login, logout, getAccessToken }),
    [user, isLoading, login, logout, getAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() called outside <AuthProvider>");
  }
  return ctx;
}
