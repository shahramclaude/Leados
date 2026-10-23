// Seeded fixtures used by (a) the dev `/api/seed` route to populate the UI
// with demo data, and (b) `scripts/verify-proactive-cycle.ts` for the
// Phase-4 measurement gates (extraction precision/recall, delegation
// violation blocking, nag-guard, renegotiation history).

import type { RawActionItem } from "./commitmentExtraction";

export const FIXTURE_PEOPLE = [
  { key: "amara", name: "Amara Chen", role: "manager", team: "Platform", powerLevel: 3, email: "amara@leados.dev" },
  { key: "ben", name: "Ben Osei", role: "ic", team: "Platform", powerLevel: 5, email: "ben@leados.dev" },
  { key: "cara", name: "Cara Lindqvist", role: "ic", team: "Platform", powerLevel: 5, email: "cara@leados.dev" },
  { key: "dev", name: "Dev Patel", role: "director", team: "Platform", powerLevel: 1, email: "dev@leados.dev" },
  { key: "elin", name: "Elin Haas", role: "ic", team: "Growth", powerLevel: 5, email: "elin@leados.dev" },
] as const;

// --- Commitment extraction labelled fixture set (ground truth included) ----
// `isActualCommitment` is the human-verified ground truth label used only
// for scoring; the extractor never sees it.
export const LABELLED_ACTION_ITEMS: Array<RawActionItem & { isActualCommitment: boolean }> = [
  { text: "Ben will send the vendor contract by 2026-03-02", promisorName: "ben", promiseeName: "amara", dueAtIso: "2026-03-02", isActualCommitment: true },
  { text: "Cara commits to finishing the migration script by 2026-03-05", promisorName: "cara", promiseeName: "amara", dueAtIso: "2026-03-05", isActualCommitment: true },
  { text: "Amara shall review the design doc by 2026-03-01", promisorName: "amara", promiseeName: "dev", dueAtIso: "2026-03-01", isActualCommitment: true },
  { text: "Dev promises to unblock the budget approval by 2026-03-04", promisorName: "dev", promiseeName: "amara", dueAtIso: "2026-03-04", isActualCommitment: true },
  { text: "Elin will present the growth metrics by 2026-03-06", promisorName: "elin", promiseeName: "amara", dueAtIso: "2026-03-06", isActualCommitment: true },
  { text: "Ben shall follow up with legal by 2026-03-03", promisorName: "ben", promiseeName: "cara", dueAtIso: "2026-03-03", isActualCommitment: true },
  { text: "Cara will share the retro notes", promisorName: "cara", promiseeName: "amara", dueAtIso: null, isActualCommitment: true },
  { text: "FYI the office will be closed on Friday", promisorName: "", promiseeName: "", dueAtIso: null, isActualCommitment: false },
  { text: "Great meeting everyone, thanks for joining", promisorName: "", promiseeName: "", dueAtIso: null, isActualCommitment: false },
  { text: "The quarterly numbers look strong so far", promisorName: "", promiseeName: "", dueAtIso: null, isActualCommitment: false },
];

// --- Delegation violation fixtures ------------------------------------------
// One clean delegation (should pass both checks) and two that must be
// blocked: wrong authority, and over-capacity.
export const DELEGATION_FIXTURES = {
  clean: {
    delegateRole: "manager",
    actionClassKey: "approve.budget_request",
    estimatedHours: 2,
    capacity: { personId: "amara", weekOf: "2026-03-02", allocatedHours: 20, capacityHours: 40 },
  },
  wrongAuthority: {
    delegateRole: "ic",
    actionClassKey: "approve.budget_request", // ICs are not allowed per authorityRights fixture
    estimatedHours: 2,
    capacity: { personId: "ben", weekOf: "2026-03-02", allocatedHours: 10, capacityHours: 40 },
  },
  overCapacity: {
    delegateRole: "ic",
    actionClassKey: "draft.internal_task",
    estimatedHours: 10,
    capacity: { personId: "cara", weekOf: "2026-03-02", allocatedHours: 38, capacityHours: 40 }, // only 2h left, task needs 10h
  },
};

// --- Nag-guard worst-case backlog ------------------------------------------
// 40 overdue commitments all owed by the same person, all non-critical-ish
// except a few, to prove the digest collapses the bulk instead of issuing 40
// individual nudges.
export function buildWorstCaseBacklog(personId: string, otherPersonId: string, now: Date) {
  const commitments = [];
  for (let i = 0; i < 40; i++) {
    const dueAt = new Date(now.getTime() - (i % 5) * 60 * 60 * 1000 - 60 * 60 * 1000); // all slightly overdue -> critical in our model (overdue=critical)
    commitments.push({
      id: `backlog-${i}`,
      promisorId: personId,
      promiseeId: otherPersonId,
      content: `Backlog item #${i}`,
      dueAt,
      status: "open" as const,
    });
  }
  return commitments;
}

// Softer backlog: due in the next 24-48h (stakes "normal"/"elevated", not
// critical) so the nag-guard digest path actually gets exercised (critical
// items intentionally bypass budget by design).
export function buildSoftBacklog(personId: string, otherPersonId: string, now: Date) {
  const commitments = [];
  for (let i = 0; i < 20; i++) {
    const dueAt = new Date(now.getTime() + 30 * 60 * 60 * 1000 + i * 10 * 60 * 1000); // ~30h out, within the 48h detection window but not overdue/elevated
    commitments.push({
      id: `soft-${i}`,
      promisorId: personId,
      promiseeId: otherPersonId,
      content: `Soft backlog item #${i}`,
      dueAt,
      status: "open" as const,
    });
  }
  return commitments;
}
