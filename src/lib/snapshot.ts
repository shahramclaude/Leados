// =============================================================================
// Part 32 — snapshot/version machinery for the Board Pack ("numbers freeze").
// =============================================================================
// Contract: once a pack is frozen, it renders forever against the ledger
// fingerprint captured at freeze time — a later change to the underlying
// OrgDataset CANNOT silently change a reviewed pack's numbers. Regenerating
// after a source change produces a NEW version with an explicit diff against
// the prior frozen version. This is the board-governance property the brief
// calls "numbers cannot silently change after review."
import type { BriefingPack } from "./briefingCompiler";
import type { Fact } from "./citations";

export interface PackVersion {
  version: number;
  frozenAt: string;
  frozenBy: string;
  fingerprint: string;
  pack: BriefingPack;
  /** Diff against the previous version, if any (version 1 has none). */
  diffFromPrevious: FactDiff[] | null;
}

export interface FactDiff {
  factId: number;
  label: string;
  before: string;
  after: string;
  changedBy: "source_data_changed";
}

export interface PackHistory {
  packKind: BriefingPack["kind"];
  orgId: string;
  versions: PackVersion[];
}

function diffFacts(prevFacts: Fact[], nextFacts: Fact[]): FactDiff[] {
  const prevById = new Map(prevFacts.map((f) => [f.id, f]));
  const diffs: FactDiff[] = [];
  for (const next of nextFacts) {
    const prev = prevById.get(next.id);
    if (prev && prev.formatted !== next.formatted) {
      diffs.push({ factId: next.id, label: next.label, before: prev.formatted, after: next.formatted, changedBy: "source_data_changed" });
    }
  }
  return diffs;
}

/** Freeze a newly-compiled pack as the next version in its history. Pure
 * function: does not mutate `history`, returns a new one. */
export function freezePack(history: PackHistory | null, pack: BriefingPack, frozenBy: string, now: string = new Date().toISOString()): PackHistory {
  const fingerprint = pack.ledger.fingerprint();
  const prevVersion = history?.versions[history.versions.length - 1] ?? null;

  if (prevVersion && prevVersion.fingerprint === fingerprint) {
    // Nothing changed — freezing again is a no-op that returns the same history
    // (this is what "numbers cannot silently change" looks like when nothing
    // actually moved: we don't manufacture a version bump for cosmetic re-runs).
    return history as PackHistory;
  }

  const diffFromPrevious = prevVersion ? diffFacts(prevVersion.pack.ledger.all(), pack.ledger.all()) : null;
  const version: PackVersion = {
    version: (prevVersion?.version ?? 0) + 1,
    frozenAt: now,
    frozenBy,
    fingerprint,
    pack,
    diffFromPrevious,
  };
  return {
    packKind: pack.kind,
    orgId: pack.orgId,
    versions: [...(history?.versions ?? []), version],
  };
}

export function latestVersion(history: PackHistory | null): PackVersion | null {
  if (!history || history.versions.length === 0) return null;
  return history.versions[history.versions.length - 1];
}
