import type { Permission } from "@/lib/permissions";

/**
 * Route → permission registry. Both `middleware.ts` and
 * `tests/permissionRegistry.test.ts` read this single source of truth so the
 * enforced middleware behavior and the admin-facing permission matrix page
 * can never drift apart silently (acceptance gate 5).
 *
 * `match` is a simple prefix+method matcher — good enough for this route
 * tree and easy to audit by eye, which matters for a security-relevant list.
 */
export type RoutePermissionRule = {
  prefix: string;
  method: "GET" | "POST" | "PATCH" | "DELETE" | "*";
  permission: Permission | null; // null = authenticated only, no extra permission
  description: string;
};

export const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  { prefix: "/api/subjects", method: "GET", permission: "subjects.read", description: "List/read subjects" },
  { prefix: "/api/subjects", method: "POST", permission: "subjects.write", description: "Create subject" },
  { prefix: "/api/subjects", method: "PATCH", permission: "subjects.write", description: "Update subject" },
  { prefix: "/api/briefings", method: "GET", permission: "briefings.read", description: "List briefings" },
  { prefix: "/api/briefings", method: "POST", permission: "briefings.write", description: "Generate briefing" },
  { prefix: "/api/briefings", method: "PATCH", permission: "briefings.write", description: "Edit briefing" },
  { prefix: "/api/findings", method: "GET", permission: "findings.read", description: "List findings" },
  { prefix: "/api/playbooks", method: "GET", permission: "playbooks.read", description: "List playbooks" },
  { prefix: "/api/playbooks", method: "POST", permission: "playbooks.write", description: "Create playbook" },
  { prefix: "/api/teams", method: "GET", permission: "subjects.read", description: "List teams" },
  { prefix: "/api/teams", method: "POST", permission: "team.manage", description: "Create team" },
  { prefix: "/api/org/profile", method: "GET", permission: null, description: "Read org profile" },
  { prefix: "/api/org/profile", method: "PATCH", permission: "org.profile.manage", description: "Update org profile" },
  { prefix: "/api/feature-flags", method: "GET", permission: null, description: "Read feature flags" },
  { prefix: "/api/feature-flags", method: "PATCH", permission: "featureFlags.manage", description: "Toggle feature flag" },
  { prefix: "/api/permissions/matrix", method: "GET", permission: null, description: "Read permission matrix" },
  { prefix: "/api/permissions/matrix", method: "PATCH", permission: "permissions.manage", description: "Edit permission matrix" },
  { prefix: "/api/users", method: "GET", permission: "users.manage", description: "List org users" },
  { prefix: "/api/users", method: "POST", permission: "users.manage", description: "Create org user" },
  { prefix: "/api/audit", method: "GET", permission: "audit.read", description: "Read audit log" },
  { prefix: "/api/onboarding", method: "*", permission: null, description: "Onboarding state is self-service for any authenticated member" },
  { prefix: "/api/sync", method: "POST", permission: null, description: "Offline write queue flush (per-item permission checked server-side)" },
];

export function findRouteRule(pathname: string, method: string): RoutePermissionRule | undefined {
  const candidates = ROUTE_PERMISSIONS.filter((r) => pathname.startsWith(r.prefix));
  if (candidates.length === 0) return undefined;
  return (
    candidates.find((r) => r.method === method) ?? candidates.find((r) => r.method === "*")
  );
}
