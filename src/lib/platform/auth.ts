import { getApiToken } from "./env";

export interface AuthResult {
  ok: boolean;
  status: number;
  message?: string;
}

/**
 * Bearer-token auth for the public `/api/*` surface. UI pages call the app
 * layer directly (server components/actions) and never go through this
 * check; this exists for external API consumers and is what the
 * integration test suite's "auth failure" cases exercise.
 */
export function checkAuth(request: Request): AuthResult {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return { ok: false, status: 401, message: "Missing or malformed Authorization header" };
  }
  if (token !== getApiToken()) {
    return { ok: false, status: 403, message: "Invalid API token" };
  }
  return { ok: true, status: 200 };
}
