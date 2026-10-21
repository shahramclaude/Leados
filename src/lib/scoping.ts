// Part 09 seam, reused: server-side per-connection subscription scoping.
//
// A user only receives events/notifications for domains their role may see.
// The canonical mapping lives in `role_domain_visibility`; this module is the
// single place that answers "can this role see this domain" so the stream
// route, the notifications routes, and the Now surface all agree.

import { db } from "@/db";
import { roleDomainVisibility } from "@/db/schema";

export type Role = "admin" | "exec" | "finance" | "ops" | "viewer";

// Fallback default policy used to seed the table and as an in-memory guard
// if the table is briefly unavailable (fail CLOSED, never open).
const DEFAULT_POLICY: Record<Role, string[]> = {
  admin: ["finance", "ops", "security", "hr", "general"],
  exec: ["finance", "ops", "security", "general"],
  finance: ["finance", "general"],
  ops: ["ops", "general"],
  viewer: ["general"],
};

let cache: Record<string, Set<string>> | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 10_000;

async function loadPolicy(): Promise<Record<string, Set<string>>> {
  const now = Date.now();
  if (cache && now < cacheExpiresAt) return cache;

  const rows = await db.select().from(roleDomainVisibility);
  const map: Record<string, Set<string>> = {};
  for (const role of Object.keys(DEFAULT_POLICY)) map[role] = new Set();

  if (rows.length === 0) {
    // Not seeded yet: fail safe to the default policy rather than fail open.
    for (const [role, domains] of Object.entries(DEFAULT_POLICY)) {
      map[role] = new Set(domains);
    }
  } else {
    for (const row of rows) {
      if (!map[row.role]) map[row.role] = new Set();
      map[row.role].add(row.domain);
    }
  }

  cache = map;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return map;
}

export async function visibleDomainsForRole(role: string): Promise<Set<string>> {
  const policy = await loadPolicy();
  return policy[role] ?? new Set();
}

export async function roleCanSeeDomain(role: string, domain: string): Promise<boolean> {
  const domains = await visibleDomainsForRole(role);
  return domains.has(domain) || domains.has("*");
}

export async function seedDefaultPolicyIfEmpty(): Promise<void> {
  const rows = await db.select().from(roleDomainVisibility).limit(1);
  if (rows.length > 0) return;
  const values: { role: Role; domain: string }[] = [];
  for (const [role, domains] of Object.entries(DEFAULT_POLICY)) {
    for (const domain of domains) values.push({ role: role as Role, domain });
  }
  await db.insert(roleDomainVisibility).values(values).onConflictDoNothing();
  cache = null;
}

export function roleCanSeeDomainSync(role: string, domains: string[] | undefined, domain: string): boolean {
  if (!domains) return false;
  return domains.includes(domain) || domains.includes("*");
}
