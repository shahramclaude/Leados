import type { AppState } from "./types";

// Original storage key for this delivery. Deliberately NOT reusing any key
// name seen in github.com/wbweve/Leados (that repo's sessions used keys like
// "leados:data", "leados-sandbox:v1", "leados-pt-j:data" across its many
// overwritten generations — see ProvenanceView). Using a fresh key avoids
// implying continuity with a history this build does not share.
export const STORAGE_KEY = "leados-honest-build:v1";

const DAY = 86400000;

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}
function isoDaysFromNow(n: number): string {
  return new Date(Date.now() + n * DAY).toISOString();
}

export function buildSeed(): AppState {
  return {
    people: [
      {
        id: "p1",
        name: "Ana Ruiz",
        role: "Eng Lead",
        cadenceDays: 14,
        lastOneOnOne: isoDaysAgo(18),
        lastFeedback: isoDaysAgo(10),
        lastFeedbackSentiment: "negative",
      },
      {
        id: "p2",
        name: "Marcus Lee",
        role: "Design Lead",
        cadenceDays: 14,
        lastOneOnOne: isoDaysAgo(4),
        lastFeedback: isoDaysAgo(6),
        lastFeedbackSentiment: "positive",
      },
      {
        id: "p3",
        name: "Priya Nair",
        role: "PM Lead",
        cadenceDays: 10,
        lastOneOnOne: isoDaysAgo(12),
        lastFeedback: isoDaysAgo(40),
        lastFeedbackSentiment: "neutral",
      },
    ],
    decisions: [
      {
        id: "d1",
        domain: "strategy",
        title: "Sunset legacy reporting module",
        loggedAt: isoDaysAgo(40),
        reviewBy: isoDaysAgo(5),
        outcome: null,
      },
      {
        id: "d2",
        domain: "product",
        title: "Pricing tier restructure",
        loggedAt: isoDaysAgo(20),
        reviewBy: isoDaysFromNow(10),
        outcome: null,
      },
    ],
    goals: [
      { id: "g1", domain: "strategy", title: "Expand into SMB segment", ownerId: null, lastUpdate: isoDaysAgo(3) },
      { id: "g2", domain: "ops", title: "Reduce on-call load 30%", ownerId: "p2", lastUpdate: isoDaysAgo(25) },
    ],
    vendors: [
      { id: "v1", name: "DataProc GmbH (DPA)", renewalDue: isoDaysFromNow(8), counterpartRespondedAt: null },
    ],
    metrics: {
      budgetVariancePct: 18,
      deployFreqDeltaPct: -40,
      churnDeltaPct: 6,
    },
    settings: {
      oneOnOneCadenceDefault: 14,
      feedbackGapDays: 30,
    },
    meta: {
      createdAt: new Date().toISOString(),
      idSeq: 100,
    },
  };
}

export function buildAllClear(): AppState {
  return {
    people: [
      { id: "p1", name: "Ana Ruiz", role: "Eng Lead", cadenceDays: 14, lastOneOnOne: isoDaysAgo(1), lastFeedback: isoDaysAgo(2), lastFeedbackSentiment: "positive" },
      { id: "p2", name: "Marcus Lee", role: "Design Lead", cadenceDays: 14, lastOneOnOne: isoDaysAgo(2), lastFeedback: isoDaysAgo(3), lastFeedbackSentiment: "positive" },
      { id: "p3", name: "Priya Nair", role: "PM Lead", cadenceDays: 10, lastOneOnOne: isoDaysAgo(1), lastFeedback: isoDaysAgo(4), lastFeedbackSentiment: "neutral" },
    ],
    decisions: [{ id: "d1", domain: "strategy", title: "Sunset legacy reporting module", loggedAt: isoDaysAgo(40), reviewBy: isoDaysFromNow(20), outcome: "validated" }],
    goals: [{ id: "g1", domain: "strategy", title: "Expand into SMB segment", ownerId: "p3", lastUpdate: isoDaysAgo(2) }],
    vendors: [{ id: "v1", name: "DataProc GmbH (DPA)", renewalDue: isoDaysFromNow(60), counterpartRespondedAt: isoDaysAgo(1) }],
    metrics: { budgetVariancePct: 2, deployFreqDeltaPct: 4, churnDeltaPct: 1 },
    settings: { oneOnOneCadenceDefault: 14, feedbackGapDays: 30 },
    meta: { createdAt: new Date().toISOString(), idSeq: 100 },
  };
}

export function buildCrisis(): AppState {
  const seed = buildSeed();
  return {
    ...seed,
    people: seed.people.map((p) => ({ ...p, lastOneOnOne: isoDaysAgo(35), lastFeedback: isoDaysAgo(50), lastFeedbackSentiment: "negative" })),
    decisions: seed.decisions.map((d) => ({ ...d, reviewBy: isoDaysAgo(15) })),
    goals: seed.goals.map((g) => ({ ...g, ownerId: null, lastUpdate: isoDaysAgo(45) })),
    vendors: seed.vendors.map((v) => ({ ...v, renewalDue: isoDaysAgo(2), counterpartRespondedAt: null })),
    metrics: { budgetVariancePct: 45, deployFreqDeltaPct: -60, churnDeltaPct: 28 },
  };
}

export function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.people)) return null;
    return parsed as AppState;
  } catch {
    return null;
  }
}

export function save(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode / quota) — fail silently, state stays in-memory for this session
  }
}

export function seedIfEmpty(): AppState {
  const existing = load();
  if (existing) return existing;
  const fresh = buildSeed();
  save(fresh);
  return fresh;
}

export function nextId(state: AppState, prefix: string): [string, AppState] {
  const id = `${prefix}${state.meta.idSeq}`;
  return [id, { ...state, meta: { ...state.meta, idSeq: state.meta.idSeq + 1 } }];
}

export function wipe() {
  localStorage.removeItem(STORAGE_KEY);
}
