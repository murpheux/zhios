import { UserManager, type UserManagerSettings, WebStorageStateStore } from "oidc-client-ts";

const audience = import.meta.env.VITE_OIDC_AUDIENCE;

/**
 * Generic OIDC Authorization Code + PKCE config — points at whatever
 * provider Murpheux registers this app with (Auth0, Keycloak, Cognito,
 * Azure AD, …). The provider must issue access tokens shaped like
 * `{ sub, roles? }` (or be configured to add a `roles` custom claim), since
 * that's what zuma's `requireAuth` consumes unchanged — see
 * zuma/docs/security.md's "OIDC / JWKS path".
 *
 * Tokens live in sessionStorage (per-tab, cleared when the tab closes) rather
 * than localStorage, shrinking the window in which an XSS or a shared machine
 * can lift a long-lived token. automaticSilentRenew refreshes the access token
 * shortly before expiry (refresh token if the IdP issues one, else a hidden
 * iframe to redirect_uri, which CallbackPage handles via signinCallback()).
 */
export const oidcConfig: UserManagerSettings = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI ?? `${window.location.origin}/callback`,
  post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI ?? window.location.origin,
  scope: import.meta.env.VITE_OIDC_SCOPE ?? "openid profile email",
  // zuma's requireAuth verifies the access token directly (see JWT_AUDIENCE) —
  // audience must be the API identifier registered with the OIDC provider.
  ...(audience ? { extraQueryParams: { audience } } : {}),
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true,
};

export const userManager = new UserManager(oidcConfig);
