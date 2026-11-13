export interface TokenClaims {
  sub: string;
  groups: string[];
}

export interface TokenVerifier {
  /** Throws UnauthorizedError when the token is missing/invalid/expired. */
  verify(token: string): Promise<TokenClaims>;
}
