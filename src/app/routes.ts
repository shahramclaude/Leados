/**
 * src/app/routes.ts
 *
 * Canonical route manifest for LEADOS. This is the single source of truth
 * that README.md and FEATURES.md are generated from by hand — if you add,
 * remove, or change the status of a route, update it here first.
 *
 * `status`:
 *  - "live": fully implemented, reads/writes real data, no placeholders.
 *  - "partial": implemented but intentionally narrow in scope (documented
 *    in FEATURES.md).
 *  - "stub": renders but does not yet do real work (none exist today —
 *    this codebase does not ship ComingSoon placeholders).
 */
export interface RouteDescriptor {
  path: string;
  kind: "page" | "api";
  label: string;
  description: string;
  status: "live" | "partial" | "stub";
}

export const ROUTES = [
  {
    path: "/",
    kind: "page",
    label: "System Status",
    description:
      "Server-rendered home page: confirms the Postgres connection via Drizzle and shows the live event log.",
    status: "live",
  },
  {
    path: "/api/health",
    kind: "api",
    label: "Health Check",
    description: "Liveness/readiness probe used by build_and_start and deployment platforms.",
    status: "live",
  },
  {
    path: "/api/events",
    kind: "api",
    label: "Event Ingestion & Log API",
    description:
      "GET returns a paginated recent event list + total count. POST validates a payload against the versioned event schema registry and appends it to the `events` table.",
    status: "live",
  },
] as const satisfies readonly RouteDescriptor[];

export type RoutePath = (typeof ROUTES)[number]["path"];
