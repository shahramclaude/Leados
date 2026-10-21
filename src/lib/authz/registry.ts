// Route -> permission registry (Part 13), CI-enforced.
//
// `scripts/check-route-registry.mjs` walks every `src/app/api/**/route.ts`
// file, extracts the HTTP methods it exports, derives the path template
// (Next.js `[param]` segments become `:param`), and fails the build if any
// (method, path) pair is missing from `ROUTE_REGISTRY` below. This is what
// makes "a new route without a registry entry fails the pipeline" true
// rather than aspirational — see `npm run check:routes`.
//
// `permission: "public"` is an explicit, auditable opt-out (health checks,
// login, csrf bootstrap) — never the default.
import type { Permission } from "@/lib/authz/permissions";

export type RouteRule = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Next.js-style path template, e.g. "/api/people/:id". */
  path: string;
  permission: Permission | "public" | "authenticated";
  /** Short note on why, for audit readability. */
  note: string;
};

export const ROUTE_REGISTRY: RouteRule[] = [
  { method: "GET", path: "/api/health", permission: "public", note: "liveness probe" },

  { method: "POST", path: "/api/auth/login", permission: "public", note: "rate-limited credential check" },
  { method: "POST", path: "/api/auth/logout", permission: "authenticated", note: "ends caller's own session" },
  { method: "GET", path: "/api/auth/session", permission: "authenticated", note: "returns caller identity only" },
  { method: "GET", path: "/api/auth/csrf", permission: "public", note: "issues double-submit token" },

  { method: "GET", path: "/api/people", permission: "people:read", note: "org-scoped list" },
  { method: "POST", path: "/api/people", permission: "people:write", note: "org-scoped create" },
  { method: "GET", path: "/api/people/:id", permission: "people:read", note: "org-scoped read" },
  { method: "PATCH", path: "/api/people/:id", permission: "people:write", note: "org-scoped update" },
  { method: "DELETE", path: "/api/people/:id", permission: "people:write", note: "org-scoped soft delete" },
  { method: "GET", path: "/api/people/export", permission: "people:export", note: "bulk export, heavily audited" },
  { method: "POST", path: "/api/people/import", permission: "people:import", note: "quarantined CSV import" },

  { method: "GET", path: "/api/users", permission: "users:read", note: "org-scoped list" },
  { method: "POST", path: "/api/users", permission: "users:manage", note: "invite user into caller's org" },
  { method: "PATCH", path: "/api/users/:id/role", permission: "roles:manage", note: "privilege change, rotates sessions" },

  { method: "GET", path: "/api/webhooks", permission: "webhooks:manage", note: "org-scoped list, secrets redacted" },
  { method: "POST", path: "/api/webhooks", permission: "webhooks:manage", note: "SSRF-checked URL" },

  { method: "POST", path: "/api/agent/run", permission: "agent:run", note: "simulated agent action, fully audited" },

  { method: "GET", path: "/api/audit", permission: "audit:read", note: "filtered, org-scoped" },
  { method: "GET", path: "/api/audit/export", permission: "audit:export", note: "bulk export, heavily audited" },
  { method: "GET", path: "/api/audit/verify", permission: "audit:read", note: "recomputes hash chain" },
];

export function findRouteRule(method: string, templatePath: string): RouteRule | undefined {
  return ROUTE_REGISTRY.find((r) => r.method === method && r.path === templatePath);
}
