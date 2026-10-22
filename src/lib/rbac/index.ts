import registryJson from "./registry.json";
import type { DomainScope, MembershipRole } from "@/db/schema";

export type PermissionEntry = {
  method: string;
  path: string;
  roles: (MembershipRole | "*")[];
  scope: "dynamic" | null;
  description: string;
};

export const PERMISSION_REGISTRY: PermissionEntry[] = registryJson.entries as PermissionEntry[];
export const REGISTRY_ROLES = registryJson.roles as MembershipRole[];
export const REGISTRY_SCOPES = registryJson.scopes as DomainScope[];

function pathToRegExp(path: string): RegExp {
  const escaped = path
    .split("/")
    .map((segment) => (segment.startsWith("[") && segment.endsWith("]") ? "([^/]+)" : segment))
    .join("/");
  return new RegExp(`^${escaped}$`);
}

export function findPermission(method: string, requestPath: string): PermissionEntry | undefined {
  return PERMISSION_REGISTRY.find(
    (entry) => entry.method === method && pathToRegExp(entry.path).test(requestPath),
  );
}

export type Actor = {
  role: MembershipRole;
  scopes: DomainScope[];
};

/** RBAC check: does this role satisfy the registry entry for method+path? */
export function isRoleAllowed(actor: Actor, method: string, requestPath: string): boolean {
  const entry = findPermission(method, requestPath);
  if (!entry) return false; // fail closed: unknown route is denied, not allowed
  if (entry.roles.includes("*")) return true;
  return entry.roles.includes(actor.role);
}

/**
 * Scoped ABAC check layered on top of RBAC: for routes marked
 * `scope: "dynamic"`, the actor additionally needs the specific domain scope
 * (people/finance/strategy/operations) on their membership, UNLESS their role
 * is Admin (full access) or Viewer-only reads (read access to every domain,
 * no writes).
 */
export function canAccessDomain(actor: Actor, domain: DomainScope, mode: "read" | "write"): boolean {
  if (actor.role === "Admin") return true;
  if (mode === "read" && actor.role === "Viewer") return true;
  if (mode === "write" && actor.role === "Viewer") return false;
  return actor.scopes.includes(domain);
}

export function assertPermission(actor: Actor, method: string, requestPath: string): { ok: true } | { ok: false; status: 403 | 404 } {
  const entry = findPermission(method, requestPath);
  if (!entry) return { ok: false, status: 404 };
  if (!isRoleAllowed(actor, method, requestPath)) return { ok: false, status: 403 };
  return { ok: true };
}
