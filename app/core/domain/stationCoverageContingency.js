/** ADR-0251 — N−1 contingency screening applied to the station matching model.
 * Test loss of one declared candidate at a time, not probability of absence
 * or individual performance. No schedule, reassignment or obligation is saved. */
import { STATION_ABSENCE_STATES } from './stationCoverageRegistry.js';
import { solveSingleAbsence } from './stationCoverageFlow.js';

// Count graph construction, the residual copies and arc inspections. Earliest
// windows go first; exhausting the workspace budget withholds any unfinished
// window rather than presenting a partial sweep as coverage.
const WORK_LIMIT = 5_000_000;
const byId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const outcome = (status, reason, evidence = null) => ({ status, reason, evidence });

export function buildStationAbsenceCheck({ windowRows, windows, tasks, acts, poolOf, availability, nowIso, clean, floorN }) {
  const liveIds = new Set(windows.filter((w) => !w.invalid && !w.retiredOn).map((w) => w.id));
  const live = windowRows.filter((w) => !w.past && liveIds.has(w.windowId))
    .sort((a, b) => byId(a.fromDay, b.fromDay) || byId(a.windowId, b.windowId));
  const taskById = new Map(tasks.filter((r) => !r.invalid).map((r) => [r.id, r]));
  const badSkill = [...tasks, ...acts].some((r) => r.invalid || (r.recordedAt || r.declaredAt) > nowIso);
  const latestByTask = new Map();
  if (!badSkill) for (const a of acts) {
    if (!latestByTask.has(a.taskId)) latestByTask.set(a.taskId, new Map());
    latestByTask.get(a.taskId).set(a.personId, a);
  }
  const availableByWindow = new Map();
  if (clean) for (const a of availability) {
    if (a.withdrawnAt) continue;
    if (!availableByWindow.has(a.windowId)) availableByWindow.set(a.windowId, new Map());
    availableByWindow.get(a.windowId).set(a.personId, a);
  }
  const budget = { remaining: WORK_LIMIT };

  function check(row) {
    if (row.concurrentN < 2) return outcome('not-tested', 'This check needs at least two simultaneous stations.');
    if (!row.detail && row.stations.some((s) => s.requirement === 'concurrent' && s.state === 'withheld')) {
      return outcome('withheld', 'The candidate pool is below this seat’s disclosure floor.');
    }
    if (!clean || row.verdict === 'unproven') return outcome('unproven', 'First resolve the unreadable or incomplete station coverage record.');
    if (row.verdict !== 'feasible') return outcome('not-tested', 'Baseline staffing or the declared running order already fails. Resolve that before testing an absence.');
    if (row.feed.liveN !== row.feed.orderN || row.precedence.danglingN) {
      return outcome('unproven', 'At least one declared prerequisite cannot be confirmed at baseline. Review the prerequisite before using this check.');
    }
    if (badSkill) return outcome('unproven', 'The skills register contains unreadable or future-dated evidence. Review it before using this check.');

    const concurrent = row.stations.filter((s) => s.requirement === 'concurrent').sort((a, b) => byId(a.stationId, b.stationId));
    const pool = poolOf(row.holderId);
    const titles = new Map(concurrent.map((s) => [s.stationId, s.title]));
    const statements = availableByWindow.get(row.windowId);
    const capacity = new Map();
    const missing = new Set();
    const stations = [];
    for (const station of concurrent) {
      const task = taskById.get(station.taskId);
      if (!task || task.holderId !== row.holderId || (task.retiredOn && task.retiredOn <= row.toDay)) {
        return outcome('unproven', 'A station’s own qualifying task is missing, belongs to another line, or is retired before this window ends.');
      }
      const eligible = new Set();
      for (const act of latestByTask.get(task.id)?.values() || []) {
        if (!pool.has(act.personId) || (act.level !== 'U' && act.level !== 'O') || act.expiresOn < row.toDay) continue;
        const statement = statements?.get(act.personId);
        if (!statement || statement.fromDay > row.fromDay || statement.toDay < row.toDay) {
          missing.add(act.personId);
          continue;
        }
        capacity.set(act.personId, statement.capacity);
        eligible.add(act.personId);
      }
      stations.push({ stationId: station.stationId, demand: station.demand, eligible });
    }
    if (!row.detail && capacity.size < floorN) return outcome('withheld', 'The declared candidate pool is below this seat’s disclosure floor.');

    const result = solveSingleAbsence(stations, capacity, budget);
    if (!result.ok) {
      if (result.reason === 'baseline') return outcome('unproven', 'The record does not fill baseline demand using qualifications valid through the window end and availability covering the whole window.');
      if (result.reason === 'limit') return outcome('unproven', 'The analysis limit was reached. This window has no complete result.');
      return outcome('unproven', 'The shortage proof did not reconcile with the matching. This window has no certified result.');
    }
    if (result.testedN !== result.fillableN + result.shortfallN) {
      return outcome('unproven', 'The scenario counts did not reconcile. This window has no certified result.');
    }
    const evidence = row.detail ? {
      testedN: result.testedN,
      fillableN: result.fillableN,
      shortfallN: result.shortfallN,
      missingN: missing.size,
      worst: result.worst ? {
        deficitN: result.worst.deficitN,
        demandN: result.worst.demandN,
        capacityN: result.worst.capacityN,
        stationTitles: result.worst.stationIds.map((id) => titles.get(id)),
      } : null,
    } : null;
    if (!result.shortfallN) return outcome('tolerant', 'Recorded cover can meet all simultaneous demand after any one candidate absence.', evidence);
    if (missing.size) return outcome('unproven', 'Recorded cover falls short in some cases, but qualified people lack full-window availability statements. Confirm their availability before calling it a shortage.', evidence);
    return outcome('exposed', 'At least one absence leaves simultaneous demand unfilled. Add qualified cover for the bottleneck stations or revise the declared demand and check again.', evidence);
  }

  const rows = live.map((row) => ({ windowId: row.windowId, label: row.label, fromDay: row.fromDay, toDay: row.toDay, ...check(row) }));
  const counts = Object.fromEntries(STATION_ABSENCE_STATES.map(({ key }) => [key, 0]));
  for (const row of rows) counts[row.status] += 1;
  return {
    rows,
    windowsN: rows.length,
    counts,
    countsReconcile: Object.values(counts).reduce((sum, count) => sum + count, 0) === new Set(rows.map((r) => r.windowId)).size
      && rows.every((r) => !r.evidence || r.evidence.testedN === r.evidence.fillableN + r.evidence.shortfallN),
    evidenceComplete: clean && rows.length > 0 && counts.tolerant + counts.exposed === rows.length,
  };
}
