// src/lib/rulesApiClient.ts
//
// Thin client-side fetch wrapper around the rules + rule-health API routes.
// Intentionally has zero @/db imports so it is safe to use from client
// components.

import type { RuleAccuracyReport } from "./types";

export interface RuleSummaryDto {
  key: string;
  name: string;
  domain: string;
  baseSeverity: number;
  weight: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`rulesApiClient: ${url} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchRules(): Promise<RuleSummaryDto[]> {
  return fetchJson<RuleSummaryDto[]>("/api/rules");
}

export async function fetchRuleHealth(): Promise<RuleAccuracyReport[]> {
  return fetchJson<RuleAccuracyReport[]>("/api/rule-health");
}

export async function fetchAutonomousStatus<T>(): Promise<T> {
  return fetchJson<T>("/api/autonomous/status");
}
