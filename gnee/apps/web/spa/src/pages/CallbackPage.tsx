import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userManager } from "../auth/authConfig";

/** Target of VITE_OIDC_REDIRECT_URI — completes the Authorization Code + PKCE exchange. */
export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then((user) => navigate(user.state && typeof user.state === "string" ? user.state : "/", { replace: true }))
      .catch((err) => setError(err instanceof Error ? err.message : "Sign-in failed"));
  }, [navigate]);

  if (error) {
    return <p style={{ color: "crimson" }}>Sign-in failed: {error}</p>;
  }
  return <p>Completing sign-in…</p>;
}
