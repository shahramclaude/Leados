// LEADOS route registry — the single source of truth for every page route
// and API route in the application.
//
// RULE (enforced by process, checked by docs/AUDIT-2026.md and by eye on
// every PR until a lint rule can walk the `app/` directory tree): every
// entry in `src/app/**/page.tsx` and `src/app/**/route.ts` MUST have a
// matching row here, and every row here MUST have a matching file on disk.
// README.md's route tables are generated from this file's data, not typed
// by hand, so they cannot drift from it.
//
// status:
//   "live"    — renders/returns real data backed by a repository + use case
//   "partial" — renders real data for some but not all of its surface
//   "stub"    — placeholder only, no backing engine
export type RouteStatus = "live" | "partial" | "stub";

export interface PageRouteEntry {
  kind: "page";
  path: string;
  file: string;
  domain: string;
  status: RouteStatus;
  description: string;
}

export interface ApiRouteEntry {
  kind: "api";
  path: string;
  file: string;
  methods: Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
  domain: string;
  status: RouteStatus;
  description: string;
}

export type RouteEntry = PageRouteEntry | ApiRouteEntry;

export const routes: RouteEntry[] = [
  {
    kind: "page",
    path: "/",
    file: "src/app/page.tsx",
    domain: "dashboard",
    status: "live",
    description:
      "Operating-system home: organization/leader counts and recent event log, read from Postgres via getDashboardSummary().",
  },
  {
    kind: "page",
    path: "/organizations",
    file: "src/app/organizations/page.tsx",
    domain: "organizations",
    status: "live",
    description: "List existing organizations and create a new one (server action).",
  },
  {
    kind: "page",
    path: "/leaders",
    file: "src/app/leaders/page.tsx",
    domain: "leaders",
    status: "live",
    description: "List registered leaders with their computed readiness score and band.",
  },
  {
    kind: "page",
    path: "/leaders/new",
    file: "src/app/leaders/new/page.tsx",
    domain: "leaders",
    status: "live",
    description:
      "Register a leader: form inputs feed the pure readinessEngine via the registerLeader use case.",
  },
  {
    kind: "api",
    path: "/api/health",
    file: "src/app/api/health/route.ts",
    methods: ["GET"],
    domain: "platform",
    status: "live",
    description: "Liveness probe: validates config and runs `select 1` against Postgres.",
  },
  {
    kind: "api",
    path: "/api/organizations",
    file: "src/app/api/organizations/route.ts",
    methods: ["GET", "POST"],
    domain: "organizations",
    status: "live",
    description: "List/create organizations. Thin wrapper over the organizations use cases.",
  },
  {
    kind: "api",
    path: "/api/leaders",
    file: "src/app/api/leaders/route.ts",
    methods: ["GET", "POST"],
    domain: "leaders",
    status: "live",
    description: "List/register leaders. Thin wrapper over the leaders use cases.",
  },
];

export function findMismatches(onDiskPaths: string[]): {
  missingOnDisk: RouteEntry[];
  undocumented: string[];
} {
  const registered = new Set(routes.map((r) => r.file));
  const onDisk = new Set(onDiskPaths);

  return {
    missingOnDisk: routes.filter((r) => !onDisk.has(r.file)),
    undocumented: onDiskPaths.filter((p) => !registered.has(p)),
  };
}
