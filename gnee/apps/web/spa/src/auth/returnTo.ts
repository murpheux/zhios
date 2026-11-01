/** Shape of the `state` we round-trip through the IdP in signinRedirect. */
export interface SigninState {
  returnTo: string;
}

/**
 * Only same-origin, path-absolute targets are allowed back out of the OIDC
 * callback — "//evil.example", "/\\evil.example", "https://…" and anything with
 * control characters collapse to "/" so `state` can't become an open redirect.
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  if (value.startsWith("/callback")) return "/";
  return value;
}

export function returnToFromState(state: unknown): string {
  if (typeof state === "object" && state !== null && "returnTo" in state) {
    return sanitizeReturnTo((state as SigninState).returnTo);
  }
  return "/";
}

export function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
