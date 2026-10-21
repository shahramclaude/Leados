"use client";

/**
 * Progressive feature disclosure (Section E): new users see "Now" + 3 core
 * views. Secondary views (Findings, Playbooks) unlock after the user has
 * visited a signal view a few times, and we toast once when that happens.
 * Tracked client-side in localStorage — deliberately not a server
 * preference, since it's a soft UX nudge, not account state.
 */
const STORAGE_KEY = "leados.nav.usage.v1";

type UsageMap = Record<string, number>;

function readUsage(): UsageMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function recordFeatureUse(signalKey: string): void {
  if (typeof window === "undefined") return;
  const usage = readUsage();
  usage[signalKey] = (usage[signalKey] ?? 0) + 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export function getUsageCount(signalKey: string): number {
  return readUsage()[signalKey] ?? 0;
}
