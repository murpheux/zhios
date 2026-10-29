import React, { useEffect } from "react";
import { useAuth } from "./AuthContext";

/** Redirects to the OIDC provider's login page if there's no authenticated user yet. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading, login } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      login();
    }
  }, [isLoading, user, login]);

  if (isLoading || !user) {
    return <p>Signing in…</p>;
  }

  return <>{children}</>;
}
