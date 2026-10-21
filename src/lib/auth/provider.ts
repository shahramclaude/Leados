// OIDC-ready authentication seam (Part 17-A).
//
// This is a documented interface, not a faked integration: there is no
// working OIDC client wired up today. The goal is that adding enterprise
// SSO later (Okta/Azure AD/Google Workspace via OIDC, or SAML through an
// OIDC-bridge like Auth0) is a matter of implementing `AuthProvider` and
// registering it below — every call site already goes through
// `resolveIdentity()` rather than talking to the local password table
// directly, and `createSession()` in src/lib/session.ts does not care which
// provider produced the verified identity.
//
// To wire real OIDC when needed:
//   1. `npm install openid-client`.
//   2. Implement `OidcProvider implements AuthProvider` using the
//      Authorization Code + PKCE flow, validating `iss`/`aud`/`exp` and
//      mapping the verified `sub`/`email`/claims to an org + role via your
//      SSO-to-role mapping table.
//   3. Add `/api/auth/oidc/start` and `/api/auth/oidc/callback` routes that
//      call `providers.oidc.handleCallback(...)` then `createSession(...)`
//      exactly like `/api/auth/login` does for the local provider.
//   4. Register the provider in `providers` below; no other call site needs
//      to change.

export type VerifiedIdentity = {
  userId: string;
  orgId: string;
  role: string;
  email: string;
  securityStamp: string;
};

export interface AuthProvider {
  readonly id: "local" | "oidc";
  /** True once the provider is actually configured (env vars present etc). */
  isEnabled(): boolean;
}

export interface LocalCredentialProvider extends AuthProvider {
  readonly id: "local";
  verifyCredentials(email: string, password: string): Promise<VerifiedIdentity | null>;
}

export interface OidcProvider extends AuthProvider {
  readonly id: "oidc";
  /** Not implemented yet — placeholder seam, see module docblock. */
  handleCallback(params: { code: string; state: string }): Promise<VerifiedIdentity | null>;
}

const unconfiguredOidc: OidcProvider = {
  id: "oidc",
  isEnabled: () => false,
  async handleCallback() {
    throw new Error(
      "OIDC provider is not configured. This is an intentional seam (see src/lib/auth/provider.ts) " +
        "for future enterprise SSO, not a bug.",
    );
  },
};

export const providers = {
  oidc: unconfiguredOidc,
};
