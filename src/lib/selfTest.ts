// src/lib/selfTest.ts
// Original runtime self-tests for this delivery's own inference math.
// Not a reproduction of any other session's named test suite (e.g. the
// unverified "T_L_*/G_L_*" IDs referenced in the pasted brief) — see
// AI-SESSION-LOG.md. IDs here are new: ST-xxx.
import type { AppState } from "./types";
import { computeFindings } from "./engine";
import { forwardChain, backwardChain, computeDepartureCascade } from "./inference";
import { RULES } from "./rules";

export interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

function blankState(): AppState {
  const signals: AppState["signals"] = {};
  for (const r of RULES) signals[r.id] = { active: false, occurrences: r.counter ? 1 : undefined };
  return { signals, crisisCount: 0, attritionLog: [] };
}

export function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];

  // ST-001: forward chain INF-001 must NOT fire on an empty board.
  {
    const s = blankState();
    const f = computeFindings(s);
    const fc = forwardChain(f, s);
    const inf001 = fc.find((r) => r.pattern.id === "INF-001")!;
    results.push({
      id: "ST-001",
      name: "INF-001 does not fire with no signals active",
      pass: inf001.met === false,
      detail: `met=${inf001.met}`,
    });
  }

  // ST-002: forward chain INF-001 fires only once R1>=2, R3, R10 all set.
  {
    const s = blankState();
    s.signals.R1 = { active: true, occurrences: 2 };
    s.signals.R3 = { active: true };
    s.signals.R10 = { active: true };
    const f = computeFindings(s);
    const fc = forwardChain(f, s);
    const inf001 = fc.find((r) => r.pattern.id === "INF-001")!;
    results.push({
      id: "ST-002",
      name: "INF-001 fires once R1\u22652, R3, R10 are all active",
      pass: inf001.met === true,
      detail: `met=${inf001.met}`,
    });
  }

  // ST-003: R1 threshold respected — 1 occurrence is not enough.
  {
    const s = blankState();
    s.signals.R1 = { active: true, occurrences: 1 };
    s.signals.R3 = { active: true };
    s.signals.R10 = { active: true };
    const f = computeFindings(s);
    const fc = forwardChain(f, s);
    const inf001 = fc.find((r) => r.pattern.id === "INF-001")!;
    results.push({
      id: "ST-003",
      name: "INF-001 requires R1 occurrences \u2265 2, not just \u2265 1",
      pass: inf001.met === false,
      detail: `met=${inf001.met}`,
    });
  }

  // ST-004: INF-003 requires the crisisCount metric, not just the two findings.
  {
    const s = blankState();
    s.signals.R133 = { active: true };
    s.signals.R128 = { active: true };
    s.crisisCount = 1; // below gte 2
    const f = computeFindings(s);
    const fc = forwardChain(f, s);
    const inf003 = fc.find((r) => r.pattern.id === "INF-003")!;
    results.push({
      id: "ST-004",
      name: "INF-003 does not fire when crisisCount < 2, even with both findings active",
      pass: inf003.met === false,
      detail: `met=${inf003.met}, crisisCount=${s.crisisCount}`,
    });
  }

  // ST-005: backward chain returns no result when R73 is inactive.
  {
    const s = blankState();
    const f = computeFindings(s);
    const bc = backwardChain(f);
    results.push({
      id: "ST-005",
      name: "Backward chain reports no observation when R73 is inactive",
      pass: bc.observationMet === false && bc.best === null,
      detail: `observationMet=${bc.observationMet}`,
    });
  }

  // ST-006: backward chain selects Capacity reduction when R81+R19 active, others off.
  {
    const s = blankState();
    s.signals.R73 = { active: true };
    s.signals.R81 = { active: true };
    s.signals.R19 = { active: true };
    const f = computeFindings(s);
    const bc = backwardChain(f);
    results.push({
      id: "ST-006",
      name: "Backward chain selects 'Capacity reduction' as best explanation for R73 + R81 + R19",
      pass: bc.best?.name === "Capacity reduction",
      detail: `best=${bc.best?.name}`,
    });
  }

  // ST-007: departure cascade returns null below 3 historical events.
  {
    const r = computeDepartureCascade(["2024-01-01", "2024-02-01"]);
    results.push({
      id: "ST-007",
      name: "Departure cascade requires \u2265 3 historical events",
      pass: r === null,
      detail: `result=${r}`,
    });
  }

  // ST-008: departure cascade correctly counts a 60-day-window hit.
  {
    const r = computeDepartureCascade(["2024-01-01", "2024-02-20", "2024-06-01"]); // gap1=50d (<=60), gap2=102d
    results.push({
      id: "ST-008",
      name: "Departure cascade counts one cascade out of two gaps (rate = 0.5)",
      pass: r !== null && Math.abs(r.cascadeRate - 0.5) < 1e-9,
      detail: `cascadeRate=${r?.cascadeRate}`,
    });
  }

  return results;
}
