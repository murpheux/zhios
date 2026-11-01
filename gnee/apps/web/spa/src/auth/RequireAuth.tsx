import type React from "react";
import { useEffect, useRef } from "react";
import { currentPath } from "./returnTo";
import { useAuth } from "./AuthContext";

/** Redirects to the OIDC provider's login page if there's no authenticated user yet, remembering where to come back to. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, login } = useAuth();
  const redirecting = useRef(false);

  useEffect(() => {
    if (!isLoading && !user && !redirecting.current) {
      redirecting.current = true;
      login(currentPath()).catch((err: unknown) => {
        redirecting.current = false;
        console.error("[auth] could not start sign-in", err);
      });
    }
  }, [isLoading, user, login]);

  if (isLoading || !user) {
    return <p>Signing in…</p>;
  }

  return <>{children}</>;
}
