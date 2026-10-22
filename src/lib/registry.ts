// API registry (Part 19), covering every public route (Part 16). The public
// API handler (src/app/api/public/v1/*) MUST call `assertRouteRegistered`
// before serving a request. Anything not listed here is unreachable by
// design, not by accident — see docs/RED-TEAM-2026.md for the unreachable
// route found in Part 22 Phase 0 and removed in Phase 3.
export interface RegistryEntry {
  path: string;
  version: "v1";
  scope: "internal" | "partner" | "public";
  minTier: number;
  description: string;
  deprecated?: boolean;
}

export const API_REGISTRY: RegistryEntry[] = [
  {
    path: "/api/public/v1/leads",
    version: "v1",
    scope: "public",
    minTier: 0,
    description: "List leads for the authenticated org (API-key scoped, read-only).",
  },
  {
    path: "/api/public/v1/signals",
    version: "v1",
    scope: "public",
    minTier: 0,
    description: "Ingest a signal for a lead in the authenticated org.",
  },
];

export function findRegistryEntry(path: string, version: string = "v1"): RegistryEntry | undefined {
  return API_REGISTRY.find((e) => e.path === path && e.version === version);
}

export function assertRouteRegistered(path: string, version: string = "v1"): RegistryEntry {
  const entry = findRegistryEntry(path, version);
  if (!entry) {
    throw new RegistryError(`route "${path}" (${version}) is not in the API registry — refusing to serve`);
  }
  if (entry.deprecated) {
    throw new RegistryError(`route "${path}" (${version}) is deprecated — refusing to serve`);
  }
  return entry;
}

export class RegistryError extends Error {}
