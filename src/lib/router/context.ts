/**
 * STAND-IN for Part 33's router. Not present in this repository snapshot
 * (confirmed via grep before writing). Part 51 needs two things from the
 * router: (1) resolving an org's canonical Context tags, and (2) a stable
 * canonicalization of a Context into a string key used as the marketplace's
 * context signature. Replace with the real Part 33 router when it lands.
 */

import type { Context } from "@/lib/recommender/types";

/**
 * Canonicalizes a Context into a deterministic, sorted string key, e.g.
 * "industry=saas|stage=growth|teamSize=small". Used as the primary key into
 * the context->effect marketplace table.
 */
export function canonicalizeContext(context: Context): string {
  return Object.keys(context)
    .sort()
    .map((k) => `${k}=${context[k]}`)
    .join("|");
}

/**
 * In the real system this would look up the org's live profile (team size,
 * stage, industry, management style, incident rate, etc.) via Part 33's
 * router. Here we accept an explicit context from the caller (API payload)
 * and fall back to a small set of defaults so demo/eval orgs still resolve
 * to something sane.
 */
export function resolveOrgContext(explicit?: Partial<Context>): Context {
  const defaults: Context = {
    teamSize: "small",
    stage: "growth",
    workMode: "hybrid",
    managementStyleCurrent: "directive",
    incidentRateRecent: "normal",
    orgLayers: "2",
    managerCount: "multiple",
    managerTenure: "experienced",
  };
  const merged: Context = { ...defaults };
  if (explicit) {
    for (const [key, value] of Object.entries(explicit)) {
      if (typeof value === "string" && value.length > 0) {
        merged[key] = value;
      }
    }
  }
  return merged;
}
