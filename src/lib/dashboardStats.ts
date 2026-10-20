// src/lib/dashboardStats.ts
//
// Everything the cockpit dashboard needs, fetched with one Promise.all
// instead of a request waterfall, and cached for STATS_TTL_MS so repeated
// dashboard loads don't re-run five aggregate queries every time. This is
// the "standardize the orchestrator's Promise.all pattern" ask from Part
// 12's brief — every multi-query server read in this app follows this
// shape now (see src/app/page.tsx, src/app/metrics/page.tsx).
import { countEvents, eventTypeBreakdown } from "./events";
import { countOpenFindings } from "./findings";
import { countOpenDecisions } from "./decisions";
import { countUnread } from "./notifications";
import { cached } from "./queryCache";

export interface DashboardStats {
  totalEvents: number;
  openFindings: number;
  openDecisions: number;
  unreadNotifications: number;
  eventTypeBreakdown: { type: string; count: number }[];
  computedAt: string;
}

const STATS_TTL_MS = 15_000;

async function computeDashboardStats(): Promise<DashboardStats> {
  const start = performance.now();
  const [totalEvents, openFindings, openDecisions, unreadNotifications, breakdown] = await Promise.all([
    countEvents(),
    countOpenFindings(),
    countOpenDecisions(),
    countUnread(),
    eventTypeBreakdown(),
  ]);
  const elapsed = +(performance.now() - start).toFixed(2);
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[dashboardStats] computed in ${elapsed}ms (parallel)`);
  }
  return {
    totalEvents,
    openFindings,
    openDecisions,
    unreadNotifications,
    eventTypeBreakdown: breakdown,
    computedAt: new Date().toISOString(),
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return cached("stats:dashboard", STATS_TTL_MS, computeDashboardStats);
}
