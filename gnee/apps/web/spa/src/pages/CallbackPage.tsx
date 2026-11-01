import type { User } from "oidc-client-ts";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth/authConfig";
import { returnToFromState } from "../auth/returnTo";

/**
 * Target of VITE_OIDC_REDIRECT_URI. signinCallback() completes either the
 * top-level Authorization Code + PKCE redirect (then we navigate to the
 * sanitized `state.returnTo`) or a silent-renew iframe (returns undefined;
 * oidc-client-ts notifies the parent window and nothing renders here).
 */
export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // The authorization code is single-use; StrictMode's double effect must not redeem it twice.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    userManager
      .signinCallback()
      .then((user: User | undefined) => {
        if (user) navigate(returnToFromState(user.state), { replace: true });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Sign-in failed"));
  }, [navigate]);

  if (error) {
    return (
      <main>
        <p role="alert" style={{ color: "crimson" }}>
          Sign-in failed: {error}
        </p>
        <a href="/">Try again</a>
      </main>
    );
  }
  return <p>Completing sign-in…</p>;
}
