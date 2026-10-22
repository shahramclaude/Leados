// OIDC-ready seam (documented, not yet wired to a real identity provider).
//
// Today only `CredentialsAuthProvider` (src/lib/authService.ts) is
// implemented: email + scrypt-hashed password, checked against the `users`
// table. The interface below is the contract any future provider (Okta,
// Azure AD, Google Workspace, generic OIDC) must satisfy so the rest of the
// app — session issuance, audit logging, CSRF, RBAC — does not change at
// all when SSO is added. An OIDC implementation would:
//   1. Redirect to the IdP's /authorize endpoint (PKCE).
//   2. On callback, exchange the code, verify the id_token (iss/aud/exp/nonce)
//      with `jose`'s `jwtVerify` against the IdP's JWKS.
//   3. Map the verified subject to a local `users` row (create on first
//      login if the org allows JIT provisioning — a policy decision, not a
//      security one, left to product).
//   4. Call `createSession()` exactly like `authenticateWithPassword` does.
// No change to `src/lib/apiUtils.ts`, `src/lib/csrf.ts`, or any route is
// required to add step 1-4; they only ever consume `SessionUser`.
export interface AuthenticatedIdentity {
  userId: string;
  orgId: string;
  email: string;
}

export interface AuthProvider {
  readonly id: string;
  /** Returns the verified identity, or null if authentication failed. Must
   * never throw on bad credentials — throwing is reserved for infrastructure
   * failures (DB down), which callers handle as 500s rather than 401s. */
  authenticate(input: Record<string, unknown>): Promise<AuthenticatedIdentity | null>;
}
