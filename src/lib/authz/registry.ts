// Route -> permission registry. Every route.ts under src/app/api MUST have a
// matching entry here for every HTTP method it exports.
// `scripts/check-route-registry.mjs` fails CI if a route file exists on disk
// with no matching registry entry, or a registry entry points at a route
// that no longer exists — so "forgot to protect a new route" is a build-time
// failure, not a production incident. `secureRoute()` (src/lib/apiUtils.ts)
// additionally fails closed at runtime: an unregistered route refuses to
// serve traffic rather than defaulting to "open".
import type { Permission } from "@/lib/authz/permissions";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RouteRule {
  method: HttpMethod;
  path: string; // Next.js path template, e.g. "/api/people/:id"
  permission: Permission;
  description: string;
}

export const ROUTE_REGISTRY: RouteRule[] = [
  { method: "GET", path: "/api/health", permission: "public", description: "Liveness/readiness probe." },
  { method: "GET", path: "/api/csrf", permission: "public", description: "Issue a CSRF double-submit token." },
  { method: "POST", path: "/api/auth/register", permission: "public", description: "Create an org + first admin user." },
  { method: "POST", path: "/api/auth/login", permission: "public", description: "Authenticate with email+password." },
  { method: "POST", path: "/api/auth/logout", permission: "authenticated", description: "End the current session." },

  { method: "GET", path: "/api/people", permission: "people:read", description: "List people in the caller's org." },
  { method: "POST", path: "/api/people", permission: "people:write", description: "Create a person in the caller's org." },
  { method: "GET", path: "/api/people/:id", permission: "people:read", description: "Read one person (own org only)." },
  { method: "PATCH", path: "/api/people/:id", permission: "people:write", description: "Update one person (own org only)." },
  { method: "DELETE", path: "/api/people/:id", permission: "people:delete", description: "Soft-delete one person (own org only)." },
  { method: "GET", path: "/api/people/search", permission: "people:read", description: "Parameterized search over the caller's org." },
  { method: "GET", path: "/api/people/export", permission: "people:export", description: "CSV export, requires prior recorded consent." },
  { method: "POST", path: "/api/people/import", permission: "people:import", description: "Submit a quarantined import batch for review." },
  { method: "GET", path: "/api/people/import", permission: "people:import", description: "List import batches pending/decided for the org." },
  { method: "POST", path: "/api/people/import/:id/approve", permission: "people:import", description: "Admin approval applies a quarantined batch." },
  { method: "POST", path: "/api/people/import/:id/reject", permission: "people:import", description: "Admin rejection discards a quarantined batch." },

  { method: "PATCH", path: "/api/admin/users/:id/role", permission: "users:role_change", description: "Change another user's role; rotates their sessions." },
  { method: "GET", path: "/api/admin/incident-banner", permission: "authenticated", description: "Read the current sitewide incident banner." },
  { method: "PATCH", path: "/api/admin/incident-banner", permission: "settings:incident_banner", description: "Toggle the sitewide incident-mode banner." },

  { method: "GET", path: "/api/audit", permission: "audit:read", description: "List hash-chained audit events for the caller's org." },
  { method: "GET", path: "/api/audit/verify", permission: "audit:verify", description: "Recompute and verify the org's audit hash chain." },

  { method: "GET", path: "/api/privacy/me", permission: "authenticated", description: "What's stored about me: own profile + audit entries about me." },

  { method: "GET", path: "/api/sessions", permission: "authenticated", description: "List the caller's own active sessions (device management)." },
  { method: "DELETE", path: "/api/sessions/:id", permission: "authenticated", description: "Revoke one of the caller's own sessions." },

  { method: "POST", path: "/api/consent/export", permission: "authenticated", description: "Record explicit consent before an export proceeds." },

  { method: "POST", path: "/api/integrations/test-webhook", permission: "people:import", description: "Validate a user-supplied URL against the SSRF guard before any use." },
];

function toRegex(pathTemplate: string): RegExp {
  const escaped = pathTemplate
    .split("/")
    .map((segment) => (segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${escaped}$`);
}

export function findRouteRule(method: HttpMethod, path: string): RouteRule | undefined {
  return ROUTE_REGISTRY.find((rule) => rule.method === method && toRegex(rule.path).test(path));
}
