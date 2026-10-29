import { UserManager, WebStorageStateStore } from "oidc-client-ts";

/**
 * Generic OIDC Authorization Code + PKCE config — points at whatever
 * provider Murpheux registers this app with (Auth0, Keycloak, Cognito,
 * Azure AD, …). The provider must issue access tokens shaped like
 * `{ sub, roles? }` (or be configured to add a `roles` custom claim), since
 * that's what zuma's `requireAuth` consumes unchanged — see
 * zuma/docs/security.md's "OIDC / JWKS path".
 */
export const oidcConfig = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/callback`,
  post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin,
  scope: import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email",
  // zuma's requireAuth verifies the access token directly (see JWT_AUDIENCE) —
  // audience must be the API identifier registered with the OIDC provider.
  ...(import.meta.env.VITE_OIDC_AUDIENCE ? { extraQueryParams: { audience: import.meta.env.VITE_OIDC_AUDIENCE } } : {}),
  userStore: new WebStorageStateStore({ store: window.localStorage }),
};

export const userManager = new UserManager(oidcConfig);
