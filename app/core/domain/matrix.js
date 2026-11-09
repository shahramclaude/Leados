/**
 * app/core/domain/matrix.js — the Matrix Accountability Ledger (ADR-0140,
 * Schema v119, `#/matrix`).
 *
 * THE DUTY. A frontline lead in a matrix has a functional manager, a project
 * manager and a product lead, and each of those three believes — correctly, from
 * where they sit — that they are that person's manager. The duty the workspace
 * has never served is the one that only exists when there is more than one line:
 *
 *   - For the PERSON: "I am accountable to three people. What am I actually on
 *     the hook for, and does it add up to more than me?"
 *   - For each MANAGER: "This person is mine — but so is she three other
 *     people's. What share of her do I actually hold, and who else is pulling?"
 *   - For the ENTERPRISE: "Add up every manager's span. Does it equal the
 *     headcount, or did the matrix count the same person twice?"
 *
 * The third question is the one no single-chain tool can answer, because a tree
 * cannot ask it. It is also the one that decides whether the first two numbers
 * can be trusted.
 *
 * WHY THIS IS THE RIGHT MODEL
 * ---------------------------
 * The home line is `person.managerId` — the tree the whole workspace already
 * rolls up through, and this module does not replace or fork it. `buildMatrix`
 * wraps `buildChain` and ADDS the declared additional lines on top, so every
 * existing roll-up keeps working unchanged on a workspace that declares no
 * matrix lines at all. Additional lines are dated, kind-typed and carry an
 * allocation in whole hundredths of a person.
 *
 * HONESTY BOUNDARIES ENFORCED IN CODE, NOT PROSE
 * ----------------------------------------------
 *  - A line with no declared allocation is UNDECLARED, never zero. A zero would
 *    let the total close on a guess.
 *  - A person on exactly ONE line is not a split: the whole person belongs to
 *    that one manager, derived by arithmetic and labelled `sole-line`. A person
 *    on two lines with one allocation missing owns NOTHING to anyone until the
 *    hole is filled — that is a guess, and this module does not make it.
 *  - Allocations are integers. Every total printed here is an integer sum that
 *    reconciles EXACTLY, so "the roll-up adds up" is a fact, not a rounding.
 *  - Netting is refused: over-allocation on one line is not offset by
 *    under-allocation on another.
 *  - A line that would close a loop is REFUSED and reported, never repaired.
 *    Inventing a reporting line is inventing an accountability.
 *  - Above the declared detail ceiling a manager row is disclosed as a count
 *    and a band, never as a named person with a named allocation.
 *
 * Pure module: no DOM, no storage, no clock beyond the injected `now`.
 */

import { buildChain, harvestWork, LEADER_ID } from './chain.js';
import { altitudeByKey, altitudeRank } from './chainRegistry.js';
import { buildSeats, activeSeat } from './seat.js';
import { dayKey, daysBetween } from '../time.js';
import {
  MATRIX_CSV_COLUMNS,
  MATRIX_ENGINE_VERSION,
  MATRIX_FINDINGS,
  MATRIX_FLOORS,
  MATRIX_HOME_RIGHTS_DEFAULT,
  MATRIX_LIMITS,
  MATRIX_METHOD,
  MATRIX_OPERATIONAL_RIGHTS,
  MATRIX_PANELS,
  MATRIX_PRIMARY_KIND,
  MATRIX_RIGHTS,
  MATRIX_RIGHT_STATE_LABELS,
  MATRIX_RIGHT_STATES,
  MATRIX_SHARE_STATE_LABELS,
  MATRIX_SHARE_STATES,
  MATRIX_STEWARDSHIP_RIGHTS,
  matrixFindingRank,
  matrixLineKind,
} from './matrixRegistry.js';
import { normalizeMatrixSettings, shareHToDisplay } from './matrixSchema.js';
import { buildRightsConcordance, rightsConcordanceBriefText } from './rightsConcordance.js';

const FULL_H = 100;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pad2(n) {
  return String(Math.abs(n) % 100).padStart(2, '0');
}

export function formatShareH(hundredths) {
  if (!Number.isInteger(hundredths)) return null;
  const sign = hundredths < 0 ? '-' : '';
  return `${sign}${Math.trunc(Math.abs(hundredths) / 100)}.${pad2(hundredths)}`;
}

/** Signed hundredths as a signed display string, e.g. +0.40 / -0.15. */
export function formatDeltaH(hundredths) {
  if (!Number.isInteger(hundredths)) return null;
  if (hundredths === 0) return '0.00';
  const sign = hundredths > 0 ? '+' : '-';
  return `${sign}${Math.trunc(Math.abs(hundredths) / 100)}.${pad2(hundredths)}`;
}

/* --------------------------------------------------------------- the graph */

/**
 * Build the matrix graph over the existing tree.
 *
 * Returns, for every person, the ordered set of lines they are actively
 * accountable through, plus the ancestor/descendant closure across ALL lines —
 * the two structures every matrix roll-up needs and a tree cannot give.
 */
export function buildMatrix(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || null;
  const conv = normalizeMatrixSettings(effective || {});
  const chain = buildChain(state, { now, settings: effective });
  const today = dayKey(now);

  const people = Array.from(chain.byId.values());
  const roster = new Map(people.map((p) => [p.id, p]));
  const nodes = new Map();
  for (const person of people) {
    nodes.set(person.id, {
      id: person.id,
      name: person.name,
      role: person.role,
      team: person.team,
      altitude: person.altitude,
      depth: person.depth,
      managerIds: [],
      lines: [],
      ancestors: new Set(),
      descendants: new Set(),
    });
  }
  // The workspace leader is a manager who holds no roster record.
  if (!nodes.has(LEADER_ID)) {
    nodes.set(LEADER_ID, {
      id: LEADER_ID, name: chain.nodes.get(LEADER_ID)?.name || 'You', role: 'Workspace leader',
      team: '', altitude: chain.nodes.get(LEADER_ID)?.altitude || null, depth: 0,
      managerIds: [], lines: [], ancestors: new Set(), descendants: new Set(),
    });
  }

  const defects = [];
  const lines = [];
  const rawLines = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  const ordered = [...rawLines].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const isActiveWindow = (line) => Boolean(line.fromISO && line.fromISO <= today
    && (!line.toISO || line.toISO >= today));

  /* 1. Sort the declared rows: a row naming the SAME manager as
        `person.managerId` is the home line's ALLOCATION, not a second line. It
        records what share of the person the home line owns and which rights it
        holds; it never creates an edge, because the roster already records that
        edge and storing it twice is how two copies drift apart. */
  const homeAllocation = new Map();
  const additional = [];
  for (const raw of ordered) {
    const person = roster.get(raw.personId);
    const manager = raw.managerId === LEADER_ID ? nodes.get(LEADER_ID) : roster.get(raw.managerId);
    if (!person) { defects.push({ defect: 'missing-person', lineId: raw.id, personId: raw.personId, managerId: raw.managerId, kind: raw.kind, detail: 'The line names a person who is not on the active roster.' }); continue; }
    if (!manager) { defects.push({ defect: 'missing-manager', lineId: raw.id, personId: raw.personId, managerId: raw.managerId, kind: raw.kind, detail: 'The line names a manager who is not on the active roster.' }); continue; }
    if (raw.personId === raw.managerId) { defects.push({ defect: 'self-line', lineId: raw.id, personId: raw.personId, managerId: raw.managerId, kind: raw.kind, detail: 'A person cannot report to themselves.' }); continue; }
    if (raw.shareInvalid) { defects.push({ defect: 'bad-share', lineId: raw.id, personId: raw.personId, managerId: raw.managerId, kind: raw.kind, detail: 'The declared allocation could not be read as a whole number of hundredths between 0 and 100.' }); continue; }
    if (raw.toISO && raw.fromISO && raw.toISO < raw.fromISO) { defects.push({ defect: 'bad-window', lineId: raw.id, personId: raw.personId, managerId: raw.managerId, kind: raw.kind, detail: 'The line ends before it starts.' }); continue; }

    const homeManagerId = person.rawManagerId || LEADER_ID;
    if (raw.managerId === homeManagerId) {
      if (homeAllocation.has(raw.personId)) {
        defects.push({ defect: 'duplicate', lineId: raw.id, personId: raw.personId, managerId: raw.managerId, kind: raw.kind, detail: 'This person already has a declared allocation for their home line.' });
        continue;
      }
      if (!isActiveWindow(raw)) continue;
      homeAllocation.set(raw.personId, raw);
      continue;
    }
    additional.push(raw);
  }

  /* 2. The home line: `person.managerId` exactly as the rest of the workspace
        reads it, carrying the declared allocation when there is one. */
  const homeEdges = [];
  for (const person of people) {
    const managerId = person.rawManagerId || LEADER_ID;
    if (managerId === person.id) {
      defects.push({ defect: 'self-line', lineId: null, personId: person.id, managerId, kind: MATRIX_PRIMARY_KIND, detail: 'The roster records this person as their own manager.' });
      continue;
    }
    if (managerId !== LEADER_ID && !roster.has(managerId)) {
      defects.push({ defect: 'missing-manager', lineId: null, personId: person.id, managerId, kind: MATRIX_PRIMARY_KIND, detail: 'The home line names a manager who is not on the active roster.' });
      continue;
    }
    const alloc = homeAllocation.get(person.id) || null;
    const declaredRights = Array.isArray(alloc?.rights) ? alloc.rights : [];
    homeEdges.push({
      id: `home:${person.id}`,
      personId: person.id,
      managerId,
      kind: MATRIX_PRIMARY_KIND,
      role: 'primary',
      shareH: alloc ? alloc.shareH : null,
      shareInvalid: false,
      // The home line is PRESUMED to hold the three rights that in every real
      // matrix belong to the functional manager until someone says otherwise.
      // A presumption is printed as a presumption, and the moment any line
      // declares one of them the presumption is outvoted into a contest — which
      // is the truth about that decision, not a bug.
      rights: [...new Set([...MATRIX_HOME_RIGHTS_DEFAULT, ...declaredRights])],
      presumedRights: MATRIX_HOME_RIGHTS_DEFAULT.filter((r) => !declaredRights.includes(r)),
      declarationId: alloc ? alloc.id : null,
      note: alloc?.note || '',
      fromISO: alloc?.fromISO || null,
      toISO: alloc?.toISO || null,
      source: 'roster',
      active: true,
    });
  }

  /* 3. Declared additional lines, rejected one at a time for a stated reason. */
  const declared = [];
  for (const raw of additional) {
    declared.push({
      id: raw.id,
      personId: raw.personId,
      managerId: raw.managerId,
      kind: raw.kind,
      role: 'secondary',
      shareH: raw.shareH,
      shareInvalid: false,
      rights: Array.isArray(raw.rights) ? raw.rights : [],
      presumedRights: [],
      declarationId: raw.id,
      fromISO: raw.fromISO,
      toISO: raw.toISO,
      note: raw.note || '',
      source: 'declared',
      active: isActiveWindow(raw),
      endedAt: raw.endedAt || null,
      endReason: raw.endReason || '',
    });
  }

  /* 3. Wire the DAG, refusing any edge that would close a loop. A cycle is not
       repaired by dropping a person: the offending LINE is refused and named. */
  const addEdge = (line) => {
    const person = nodes.get(line.personId);
    const manager = nodes.get(line.managerId);
    if (!person || !manager) return false;
    if (line.managerId === line.personId) return false;
    if (line.managerId === line.personId || person.managerIds.includes(line.managerId)) return false;
    // A loop closes exactly when the manager is already below the person.
    if (line.managerId !== LEADER_ID && person.descendants.has(line.managerId)) {
      defects.push({ defect: 'cycle', lineId: line.id, personId: line.personId, managerId: line.managerId, kind: line.kind, detail: 'This line would make each of the two people accountable to the other.' });
      return false;
    }
    person.managerIds.push(line.managerId);
    person.lines.push(line);
    lines.push(line);
    const gained = new Set([line.managerId, ...(manager.ancestors || new Set())]);
    const touch = [line.personId, ...person.descendants];
    for (const nodeId of touch) {
      const node = nodes.get(nodeId);
      if (!node) continue;
      for (const ancestorId of gained) node.ancestors.add(ancestorId);
    }
    const below = new Set([line.personId, ...person.descendants]);
    for (const ancestorId of [line.managerId, ...manager.ancestors]) {
      const node = nodes.get(ancestorId);
      if (!node) continue;
      for (const descendantId of below) node.descendants.add(descendantId);
    }
    return true;
  };

  for (const line of homeEdges) addEdge(line);
  for (const line of declared) if (line.active) addEdge(line);

  const activeLines = new Map();
  for (const line of lines) {
    if (!activeLines.has(line.personId)) activeLines.set(line.personId, []);
    activeLines.get(line.personId).push(line);
  }

  return {
    engineVersion: MATRIX_ENGINE_VERSION,
    chain,
    nodes,
    roster,
    lines,
    linesByPerson: activeLines,
    inactiveLines: declared.filter((l) => !l.active),
    defects,
    conventions: conv,
    today,
    now,
  };
}

/* ------------------------------------------------------------- allocations */

/**
 * Resolve one person's allocation.
 *
 * `shareState` is undeclared when the person has more than one active line and
 * at least one of them carries no allocation: the split is then genuinely
 * unknown and the person is attributed to NOBODY rather than split evenly.
 */
export function personAllocation(matrix, personId) {
  const lines = matrix.linesByPerson.get(personId) || [];
  const active = lines.filter((l) => l.active !== false);
  const node = matrix.nodes.get(personId);
  if (!node || !active.length) {
    return {
      personId,
      name: node?.name || personId,
      lines: [],
      lineN: 0,
      declaredN: 0,
      totalH: null,
      shareState: MATRIX_SHARE_STATES.undeclared,
      shareSource: 'no-line',
      deviationH: null,
      managerIds: [],
      multiLine: false,
    };
  }
  const declaredN = active.filter((l) => Number.isInteger(l.shareH)).length;
  const soleLine = active.length === 1;
  const allDeclared = soleLine || declaredN === active.length;

  /* A person on exactly ONE line is not a split: the whole person belongs to
     that one manager, and 100 is derived by arithmetic, not invented. A person
     on two or more lines with a hole in them belongs to NOBODY — filling the
     hole evenly would be an agreement nobody made. */
  // The attribution is ALL OR NOTHING. When the split is incomplete, not one
  // line of it is attributed — attributing the lines that DO carry a number
  // while refusing the person's total would give a manager a figure the ledger
  // has already said it cannot support, and the fan-out would no longer equal
  // the person table. The declared values stay on the row and stay visible.
  const resolved = active.map((line) => {
    if (!allDeclared) return { ...line, effectiveShareH: null, shareSource: 'refused' };
    if (Number.isInteger(line.shareH)) {
      return { ...line, effectiveShareH: line.shareH, shareSource: 'declared' };
    }
    return { ...line, effectiveShareH: FULL_H, shareSource: 'sole-line' };
  });

  let totalH = null;
  let shareSource = 'declared';
  if (!allDeclared) {
    totalH = null;
    shareSource = 'refused';
  } else {
    totalH = resolved.reduce((acc, l) => acc + (Number.isInteger(l.effectiveShareH) ? l.effectiveShareH : 0), 0);
    if (resolved.some((l) => l.shareSource === 'sole-line')) shareSource = 'sole-line';
  }

  let shareState = MATRIX_SHARE_STATES.undeclared;
  let deviationH = null;
  if (totalH !== null) {
    deviationH = totalH - FULL_H;
    const tol = matrix.conventions.matrixBalanceHundredths;
    if (deviationH > tol) shareState = MATRIX_SHARE_STATES.over;
    else if (deviationH < -tol) shareState = MATRIX_SHARE_STATES.under;
    else shareState = MATRIX_SHARE_STATES.balanced;
  }

  return {
    personId,
    name: node.name,
    role: node.role,
    altitude: node.altitude,
    lines: resolved.map((l) => ({
      lineId: l.id,
      declarationId: l.declarationId || (l.role === 'primary' ? null : l.id),
      managerId: l.managerId,
      managerName: matrix.nodes.get(l.managerId)?.name || l.managerId,
      kind: l.kind,
      kindLabel: matrixLineKind(l.kind)?.label || l.kind,
      role: l.role,
      shareH: l.effectiveShareH,
      shareDisplay: shareHToDisplay(l.effectiveShareH),
      declaredShareH: Number.isInteger(l.shareH) ? l.shareH : null,
      shareSource: l.shareSource,
      rights: l.rights || [],
      presumedRights: l.presumedRights || [],
      fromISO: l.fromISO,
      toISO: l.toISO,
      note: l.note,
    })),
    lineN: active.length,
    declaredN,
    totalH,
    totalDisplay: formatShareH(totalH),
    shareState,
    shareStateLabel: MATRIX_SHARE_STATE_LABELS[shareState],
    shareSource,
    deviationH,
    deviationDisplay: formatDeltaH(deviationH),
    managerIds: active.map((l) => l.managerId),
    multiLine: active.length > 1,
  };
}

export function matrixAllocations(matrix) {
  const out = [];
  for (const personId of matrix.roster.keys()) out.push(personAllocation(matrix, personId));
  out.sort((a, b) => a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId));
  return out;
}

/**
 * THE RECONCILIATION.
 *
 * Two identities, both exact integer equalities, both printed and both asserted
 * in the suite:
 *
 *   (1) netErrorH === Σ over resolved people of (totalH − 100)
 *   (2) Σ over managers of attributedH === Σ over resolved people of totalH
 *
 * (1) says the headline deviation is the sum of the per-person deviations — no
 * number appears in the total that is not in the table. (2) says the fan-out
 * across every manager neither double-counts a person nor loses one.
 */
export function matrixReconciliation(matrix, allocations) {
  const people = allocations || matrixAllocations(matrix);
  const resolved = people.filter((p) => p.totalH !== null);
  const undeclared = people.filter((p) => p.totalH === null);

  const assertedH = resolved.reduce((acc, p) => acc + p.totalH, 0);
  const expectedH = FULL_H * resolved.length;
  const netErrorH = assertedH - expectedH;
  const sumOfDeviationsH = resolved.reduce((acc, p) => acc + (p.totalH - FULL_H), 0);

  const managerH = new Map();
  for (const person of resolved) {
    for (const line of person.lines) {
      // `personAllocation` resolves every line to its EFFECTIVE share (a sole
      // line owns the whole person); this reads that resolved value and never
      // the raw declaration, so the fan-out and the person table cannot differ.
      if (!Number.isInteger(line.shareH)) continue;
      managerH.set(line.managerId, (managerH.get(line.managerId) || 0) + line.shareH);
    }
  }
  const fanOutH = [...managerH.values()].reduce((acc, h) => acc + h, 0);

  const overN = resolved.filter((p) => p.shareState === MATRIX_SHARE_STATES.over).length;
  const underN = resolved.filter((p) => p.shareState === MATRIX_SHARE_STATES.under).length;
  const balancedN = resolved.filter((p) => p.shareState === MATRIX_SHARE_STATES.balanced).length;
  const soleLineN = resolved.filter((p) => p.shareSource === 'sole-line').length;

  return {
    peopleN: people.length,
    lineN: matrix.lines.length,
    secondaryLineN: matrix.lines.filter((l) => l.role === 'secondary').length,
    multiLineN: people.filter((p) => p.multiLine).length,
    resolvedN: resolved.length,
    undeclaredN: undeclared.length,
    soleLineN,
    assertedH,
    assertedDisplay: formatShareH(assertedH),
    expectedH,
    expectedDisplay: formatShareH(expectedH),
    netErrorH,
    netErrorDisplay: formatDeltaH(netErrorH),
    sumOfDeviationsH,
    // TWO SEPARATE CLAIMS, deliberately never collapsed into one word.
    //  `balances`   the allocations ADD UP: every attributable person's shares
    //               total exactly 100, so the organisation's declared
    //               accountability equals its headcount. A ledger can be
    //               perfectly audited and still not balance — Otto at 130% is
    //               reported truthfully and still leaves the roll-up +0.30 out.
    //  `auditClean` what is PRINTED is what is COMPUTED: the headline error is
    //               the sum of the printed per-person deviations, and the
    //               manager fan-out equals the person total exactly.
    // Calling the first "reconciles" would let a reader hear "it adds up" from
    // a number that does not.
    identityHolds: netErrorH === sumOfDeviationsH,
    fanOutH,
    fanOutIdentical: fanOutH === assertedH,
    balances: netErrorH === 0,
    auditClean: netErrorH === sumOfDeviationsH && fanOutH === assertedH,
    overN,
    underN,
    balancedN,
    managerN: managerH.size,
  };
}

/* ----------------------------------------------------------- manager spans */

/**
 * Every manager's attributed span across ALL their lines. `directN` counts the
 * people who report to this manager on any line; `attributedH` is the share of
 * those people they actually hold; `sharedN` is how many of those people are
 * ALSO on somebody else's line — the number a tree cannot produce.
 */
export function matrixManagerSpans(matrix, allocations) {
  const people = allocations || matrixAllocations(matrix);
  const rows = [];
  const ids = new Set();
  for (const person of people) for (const line of person.lines) ids.add(line.managerId);

  for (const managerId of ids) {
    const node = matrix.nodes.get(managerId);
    const direct = people.filter((p) => p.managerIds.includes(managerId));
    const attributedH = direct.reduce((acc, p) => {
      const line = p.lines.find((l) => l.managerId === managerId);
      return acc + (Number.isInteger(line?.shareH) ? line.shareH : 0);
    }, 0);
    const shareOfDirect = direct.filter((p) => p.multiLine).length;
    const undeclaredN = direct.filter((p) => p.totalH === null).length;
    const overN = direct.filter((p) => p.shareState === MATRIX_SHARE_STATES.over).length;
    rows.push({
      managerId,
      name: node?.name || managerId,
      role: node?.role || '',
      isLeader: managerId === LEADER_ID,
      directN: direct.length,
      attributedH,
      attributedDisplay: formatShareH(attributedH),
      sharedN: shareOfDirect,
      undeclaredN,
      overN,
      descendantN: node?.descendants?.size || 0,
      // Withholding is a property of the ROW, decided at disclosure time.
      withheld: false,
      withheldReason: '',
    });
  }
  rows.sort((a, b) => b.attributedH - a.attributedH || b.directN - a.directN || a.name.localeCompare(b.name));
  return rows;
}

/* ----------------------------------------------------------- decision rights */

/**
 * RAPID/RACI decision rights, attributed per line. A right held by two managers
 * is a conflict the STRUCTURE created; a right held by nobody is a gap the
 * structure created. The module records both and adjudicates neither.
 */
export function matrixRightsRows(matrix, allocations) {
  const people = allocations || matrixAllocations(matrix);
  const rows = [];
  for (const person of people) {
    if (!person.multiLine) continue;
    for (const right of MATRIX_RIGHTS) {
      const holders = person.lines.filter((l) => (l.rights || []).includes(right.key));
      let state = MATRIX_RIGHT_STATES.unowned;
      if (holders.length > 1) state = MATRIX_RIGHT_STATES.contested;
      else if (holders.length === 1) state = MATRIX_RIGHT_STATES.held;
      rows.push({
        personId: person.personId,
        personName: person.name,
        rightKey: right.key,
        rightLabel: right.label,
        question: right.question,
        state,
        stateLabel: MATRIX_RIGHT_STATE_LABELS[state],
        holderIds: holders.map((l) => l.managerId),
        holderNames: holders.map((l) => l.managerName),
        holdersN: holders.length,
      });
    }
  }
  rows.sort((a, b) => {
    const order = { contested: 0, unowned: 1, held: 2 };
    return order[a.state] - order[b.state]
      || a.personName.localeCompare(b.personName)
      || a.rightKey.localeCompare(b.rightKey);
  });
  return rows;
}

export function matrixRightsSummary(rows) {
  const contested = rows.filter((r) => r.state === MATRIX_RIGHT_STATES.contested);
  const unowned = rows.filter((r) => r.state === MATRIX_RIGHT_STATES.unowned);
  const held = rows.filter((r) => r.state === MATRIX_RIGHT_STATES.held);
  const byRight = new Map(MATRIX_RIGHTS.map((r) => [r.key, { key: r.key, label: r.label, contested: 0, unowned: 0, held: 0 }]));
  for (const row of rows) {
    const bucket = byRight.get(row.rightKey);
    if (!bucket) continue;
    bucket[row.state] += 1;
  }
  return {
    rowN: rows.length,
    contestedN: contested.length,
    unownedN: unowned.length,
    heldN: held.length,
    contestedPeopleN: new Set(contested.map((r) => r.personId)).size,
    unownedPeopleN: new Set(unowned.map((r) => r.personId)).size,
    byRight: [...byRight.values()],
  };
}

/* ------------------------------------------------- ADR-0141: line reach */

/**
 * Who a manager holds on a DECLARED ADDITIONAL line.
 *
 * This is the read-side half of the matrix. `person.managerId` gives every
 * other roll-up in the workspace a single path to the root, so a manager with
 * no home-line reports has `span = 0`: the Operating Seat refuses them a seat,
 * and `canSee` denies them a record naming their own people. RULE-MTX-01 already
 * fans the work to them; until this existed the seat then refused to let them
 * read what had been fanned. The sets here are the exact input the seat engine
 * ingests (`buildSeats({ lineScope })`) and the exact predicate the panel
 * counts with — one source, so what is displayed is what is enforced.
 *
 * `lineOnlyIds` is the subset the tree does NOT already put in this manager's
 * subtree: the people a home-line-only product silently hides from them.
 */
export function matrixLineScope(matrix) {
  const byManager = new Map();
  for (const line of matrix.lines) {
    if (line.role === 'primary') continue;
    if (line.active === false) continue;
    if (!matrix.chain.byId.has(line.personId)) continue;
    if (!matrix.chain.nodes.has(line.managerId)) continue;
    let entry = byManager.get(line.managerId);
    if (!entry) {
      entry = { managerId: line.managerId, personIds: new Set(), lineIds: [], kinds: new Set() };
      byManager.set(line.managerId, entry);
    }
    entry.personIds.add(line.personId);
    entry.lineIds.push(line.id);
    entry.kinds.add(line.kind);
  }
  const scope = new Map();
  const rows = [];
  for (const managerId of [...byManager.keys()].sort()) {
    const entry = byManager.get(managerId);
    const node = matrix.chain.nodes.get(managerId);
    const subtree = new Set(node?.subtreeIds || []);
    const personIds = [...entry.personIds].sort();
    const lineOnlyIds = personIds.filter((pid) => !subtree.has(pid));
    const treeSpanN = Math.max(0, (node?.span || 0));
    scope.set(managerId, {
      personIds,
      lineN: entry.lineIds.length,
      kinds: [...entry.kinds].sort(),
      lineOnlyIds,
    });
    rows.push({
      managerId,
      name: node?.name || managerId,
      isLeader: managerId === LEADER_ID,
      altitude: node?.altitude || null,
      rank: altitudeRank(node?.altitude),
      treeSpanN,
      lineN: entry.lineIds.length,
      linePersonN: personIds.length,
      lineOnlyN: lineOnlyIds.length,
      matrixSpanN: treeSpanN + lineOnlyIds.length,
      kinds: [...entry.kinds].sort(),
      // A line holder with no leadership altitude cannot be given a seat, and
      // the tree gave them no span. The refusal is a fact about the roster.
      seatEligible: treeSpanN > 0 || Boolean(node?.altitude),
      seatReason: null,
    });
  }
  for (const row of rows) {
    if (!row.seatEligible) {
      row.seatReason = `${row.name} holds ${row.linePersonN} person(s) on ${row.lineN} declared line(s) but carries no leadership altitude on the roster. The seat is refused rather than invented; correct the roster level to give them one.`;
    }
  }
  return { byManager: scope, rows };
}

/**
 * The injection helper every seat-reading surface uses.
 *
 * Returns `null` when the workspace declares NO additional line, so a
 * single-chain workspace keeps the pre-ADR-0141 code path exactly — the option
 * is absent rather than empty, and `buildSeats` produces byte-identical seats.
 */
export function matrixLineScopeFor(state, { now = new Date(), settings = null } = {}) {
  const lines = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  if (!lines.length) return null;
  const matrix = buildMatrix(state, { now, settings: settings || state?.settings || null });
  const scope = matrixLineScope(matrix);
  return scope.byManager.size ? scope.byManager : null;
}

/**
 * The reach of every open work item across the matrix.
 *
 * Two separate claims, printed separately (Bulletproof Reliability Mandate):
 *   treeSees(m)  the reporting tree already rolls the item up to m;
 *   lineSees(m)  every person the item names is someone m manages on a line.
 * An item reachable only through a line is the exact work a home-line-only
 * product hides from its owner. `sites` is the set of managers the item is
 * accountable to — never collapsed to one: when it has more than one, the
 * ledger says so instead of picking.
 */
export function matrixWorkReach(matrix, lineScope, items) {
  const rows = [];
  for (const item of items || []) {
    const people = Array.isArray(item.people) ? item.people : [];
    const ownerNodeId = item.ownerNodeId || LEADER_ID;
    const treeSees = (managerId) => {
      if (managerId === ownerNodeId) return true;
      const node = matrix.chain.nodes.get(managerId);
      if (!node) return false;
      const subtree = node.subtreeIds || [];
      if (subtree.includes(ownerNodeId)) return true;
      return people.some((pid) => pid === managerId || subtree.includes(pid));
    };
    const sites = [ownerNodeId];
    const lineManagers = [];
    if (people.length) {
      for (const [managerId, entry] of lineScope.byManager) {
        if (managerId === ownerNodeId) continue;
        const held = new Set(entry.personIds);
        if (!people.some((pid) => held.has(pid))) continue;
        const node = matrix.chain.nodes.get(managerId);
        const subtree = new Set(node?.subtreeIds || []);
        const covers = people.every((pid) => subtree.has(pid) || held.has(pid));
        if (!covers) continue;
        if (sites.includes(managerId)) continue;
        sites.push(managerId);
        lineManagers.push({ managerId, lineOnly: !treeSees(managerId) });
      }
    }
    rows.push({
      type: item.type,
      entityId: item.entityId,
      ownerNodeId,
      treeOwnerNodeId: ownerNodeId,
      sites,
      siteN: sites.length,
      shared: sites.length > 1,
      lineManagers,
      lineOnlyN: lineManagers.filter((m) => m.lineOnly).length,
      sensitive: item.sensitive === true,
    });
  }
  rows.sort((a, b) => b.siteN - a.siteN || String(a.type).localeCompare(String(b.type)) || String(a.entityId).localeCompare(String(b.entityId)));
  return rows;
}

/* ---------------------------------------------------------------- findings */

export function matrixFindings(matrix, { allocations, rightsRows, spans } = {}) {
  const people = allocations || matrixAllocations(matrix);
  const rights = rightsRows || matrixRightsRows(matrix, people);
  const expiringDays = matrix.conventions.matrixExpiringDays;
  const out = [];

  for (const person of people) {
    if (person.shareState === MATRIX_SHARE_STATES.over) {
      out.push({
        finding: 'over-committed',
        personId: person.personId,
        personName: person.name,
        severity: person.deviationH,
        detail: `Declared allocations total ${person.totalDisplay} — ${formatDeltaH(person.deviationH)} beyond the one person who has to carry them.`,
        managers: person.managerIds.length,
      });
    } else if (person.shareState === MATRIX_SHARE_STATES.under) {
      out.push({
        finding: 'under-allocated',
        personId: person.personId,
        personName: person.name,
        severity: -person.deviationH,
        detail: `Declared allocations total ${person.totalDisplay} — ${formatDeltaH(person.deviationH)} of this person is accountable to nobody.`,
        managers: person.managerIds.length,
      });
    } else if (person.shareState === MATRIX_SHARE_STATES.undeclared) {
      out.push({
        finding: 'undeclared-share',
        personId: person.personId,
        personName: person.name,
        severity: person.lineN,
        detail: `${person.lineN} active lines, ${person.lineN - person.declaredN} with no declared allocation. Nothing is attributed rather than split by guesswork.`,
        managers: person.managerIds.length,
      });
    }
  }

  const contested = rights.filter((r) => r.state === MATRIX_RIGHT_STATES.contested);
  const byPersonContested = new Map();
  for (const row of contested) {
    if (!byPersonContested.has(row.personId)) byPersonContested.set(row.personId, []);
    byPersonContested.get(row.personId).push(row);
  }
  for (const [personId, rows] of byPersonContested) {
    out.push({
      finding: 'contested-right',
      personId,
      personName: rows[0].personName,
      severity: rows.length,
      detail: `${rows.length} decision right(s) held by more than one manager: ${rows.map((r) => r.rightLabel).join(', ')}.`,
      managers: new Set(rows.flatMap((r) => r.holderIds)).size,
    });
  }

  const unowned = rights.filter((r) => r.state === MATRIX_RIGHT_STATES.unowned);
  const byPersonUnowned = new Map();
  for (const row of unowned) {
    if (!byPersonUnowned.has(row.personId)) byPersonUnowned.set(row.personId, []);
    byPersonUnowned.get(row.personId).push(row);
  }
  for (const [personId, rows] of byPersonUnowned) {
    out.push({
      finding: 'unowned-right',
      personId,
      personName: rows[0].personName,
      severity: rows.length,
      detail: `${rows.length} decision right(s) nobody holds: ${rows.map((r) => r.rightLabel).join(', ')}.`,
      managers: people.find((p) => p.personId === personId)?.managerIds.length || 0,
    });
  }

  for (const line of matrix.lines) {
    if (!line.toISO) continue;
    const remaining = daysBetween(matrix.today, line.toISO);
    if (remaining < 0 || remaining > expiringDays) continue;
    out.push({
      finding: 'expiring',
      personId: line.personId,
      personName: matrix.nodes.get(line.personId)?.name || line.personId,
      severity: expiringDays - remaining,
      detail: `The ${matrixLineKind(line.kind)?.label || line.kind} line to ${matrix.nodes.get(line.managerId)?.name || line.managerId} ends on ${line.toISO} (${remaining} day(s)).`,
      managers: 1,
    });
  }

  for (const person of people) {
    if (!person.multiLine) continue;
    out.push({
      finding: 'multi-line',
      personId: person.personId,
      personName: person.name,
      severity: 0,
      detail: `Accountable to ${person.lineN} managers at once — every roll-up that touches this person fans to all of them.`,
      managers: person.lineN,
    });
  }

  out.sort((a, b) => matrixFindingRank(a.finding) - matrixFindingRank(b.finding)
    || b.severity - a.severity
    || a.personName.localeCompare(b.personName)
    || a.personId.localeCompare(b.personId));

  const total = out.length;
  const carried = out.slice(0, MATRIX_LIMITS.queue);
  return { rows: carried, total, carriedN: carried.length, remainderN: Math.max(0, total - carried.length) };
}

/* ------------------------------------------------ CEO / C-suite governance */

const Z95 = 1.959963984540054;

/** Wilson 95% score interval in percent, matching boardWilson. */
export function matrixWilson(successes, n, z = Z95) {
  if (!Number.isFinite(n) || n <= 0) return { lower: null, upper: null };
  const p = Math.min(1, Math.max(0, successes / n));
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, Math.round((centre - half) * 1000) / 10),
    upper: Math.min(100, Math.round((centre + half) * 1000) / 10),
  };
}

/**
 * Resolve the lowest common ancestor(s) in the matrix DAG for a set of
 * accountable manager node IDs.
 *
 * A reporting tree always has ONE unique lowest common ancestor. A matrix DAG
 * can have TWO incomparable minimal common ancestors (a diamond tie) or zero
 * common ancestors if the roster has a disconnected defect. This function
 * returns EVERY minimal common ancestor and NEVER silently collapses a tie.
 */
export function matrixJointApex(matrix, nodeIds = []) {
  const valid = [...new Set((Array.isArray(nodeIds) ? nodeIds : [])
    .filter((id) => typeof id === 'string' && matrix?.nodes?.has(id)))].sort();
  if (!valid.length) {
    return {
      apexIds: [],
      apexId: null,
      unique: false,
      ambiguous: false,
      disconnected: false,
      isLeaderOnly: false,
    };
  }
  if (valid.length === 1) {
    return {
      apexIds: valid,
      apexId: valid[0],
      unique: true,
      ambiguous: false,
      disconnected: false,
      isLeaderOnly: valid[0] === LEADER_ID,
    };
  }

  let common = null;
  for (const id of valid) {
    const node = matrix.nodes.get(id);
    const reachUp = new Set([id, ...(node?.ancestors || [])]);
    if (common === null) {
      common = reachUp;
    } else {
      for (const candidate of [...common]) {
        if (!reachUp.has(candidate)) common.delete(candidate);
      }
    }
  }
  if (!common || !common.size) {
    return {
      apexIds: [],
      apexId: null,
      unique: false,
      ambiguous: true,
      disconnected: true,
      isLeaderOnly: false,
    };
  }

  // A node `c` in `common` is minimal (lowest in the DAG — closest to the work)
  // iff no other `d` in `common` has `c` as an ancestor.
  const minimal = [];
  for (const candidate of common) {
    let dominated = false;
    for (const other of common) {
      if (other === candidate) continue;
      if (matrix.nodes.get(other)?.ancestors?.has(candidate)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) minimal.push(candidate);
  }
  minimal.sort((a, b) => {
    if (a === LEADER_ID && b !== LEADER_ID) return 1;
    if (b === LEADER_ID && a !== LEADER_ID) return -1;
    const da = matrix.nodes.get(a)?.depth ?? 0;
    const db = matrix.nodes.get(b)?.depth ?? 0;
    return (db - da) || String(a).localeCompare(String(b));
  });

  if (minimal.length === 1) {
    return {
      apexIds: minimal,
      apexId: minimal[0],
      unique: true,
      ambiguous: false,
      disconnected: false,
      isLeaderOnly: minimal[0] === LEADER_ID,
    };
  }
  return {
    apexIds: minimal,
    apexId: null,
    unique: false,
    ambiguous: true,
    disconnected: false,
    isLeaderOnly: false,
  };
}

/**
 * Pure CEO / C-suite Matrix Governance read model.
 *
 * Surfaces:
 *   1. Common-agency escalation tax: contested operational rights (priority,
 *      assignment, technical) and multi-manager shared work aggregated to each
 *      joint apex in the reporting DAG (preserving ties as ambiguous, never
 *      inventing a single owner).
 *   2. Cross-axis structural coupling: distinct managerial span-pairs linked by
 *      shared people, tree-hidden open work, and Wilson-bounded multi-line /
 *      shared-work shares refused below `MATRIX_FLOORS.cellN`.
 *   3. Structural checks (five explicit binary assertions — NO composite score).
 */
export function matrixGovernance(matrix, {
  allocations = [],
  rightsRows = [],
  reach = [],
  seatRows = [],
  reconciliation = null,
  seat = null,
} = {}) {
  const rec = reconciliation || matrixReconciliation(matrix, allocations);
  const hasMatrix = rec.secondaryLineN > 0 || allocations.some((p) => p.multiLine);

  const opSet = new Set(MATRIX_OPERATIONAL_RIGHTS);
  const stewSet = new Set(MATRIX_STEWARDSHIP_RIGHTS);

  const contested = rightsRows.filter((r) => r.state === MATRIX_RIGHT_STATES.contested);
  const unowned = rightsRows.filter((r) => r.state === MATRIX_RIGHT_STATES.unowned);

  const contestedOperationalN = contested.filter((r) => opSet.has(r.rightKey)).length;
  const contestedStewardshipN = contested.filter((r) => stewSet.has(r.rightKey)).length;
  const contestedPriorityN = contested.filter((r) => r.rightKey === 'priority').length;
  const contestedAssignmentN = contested.filter((r) => r.rightKey === 'assignment').length;
  const contestedTechnicalN = contested.filter((r) => r.rightKey === 'technical').length;
  const unownedOperationalN = unowned.filter((r) => opSet.has(r.rightKey)).length;
  const unownedStewardshipN = unowned.filter((r) => stewSet.has(r.rightKey)).length;

  // Bucket contested rights and shared work items by their joint DAG apex.
  const buckets = new Map();
  const ensureBucket = (apex) => {
    const key = apex.disconnected
      ? '__disconnected__'
      : apex.unique
        ? apex.apexId
        : `ambiguous:${apex.apexIds.join('+')}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        key,
        apexIds: apex.apexIds,
        apexId: apex.apexId,
        unique: apex.unique,
        ambiguous: apex.ambiguous,
        disconnected: apex.disconnected,
        isLeader: apex.apexId === LEADER_ID,
        contestedRightsN: 0,
        operationalContestedN: 0,
        stewardshipContestedN: 0,
        sharedWorkN: 0,
        lineOnlyWorkN: 0,
        sensitiveCountedN: 0,
        peopleIds: new Set(),
      };
      buckets.set(key, entry);
    }
    return entry;
  };

  for (const row of contested) {
    const apex = matrixJointApex(matrix, row.holderIds);
    const entry = ensureBucket(apex);
    entry.contestedRightsN += 1;
    if (opSet.has(row.rightKey)) entry.operationalContestedN += 1;
    if (stewSet.has(row.rightKey)) entry.stewardshipContestedN += 1;
    entry.peopleIds.add(row.personId);
  }

  const sharedItems = reach.filter((item) => item.shared);
  for (const item of sharedItems) {
    const apex = matrixJointApex(matrix, item.sites);
    const entry = ensureBucket(apex);
    entry.sharedWorkN += 1;
    if (item.lineOnlyN > 0) entry.lineOnlyWorkN += 1;
    if (item.sensitive) entry.sensitiveCountedN += 1;
  }

  // Executive detail ceiling: a rank-4 restricted seat may not inspect peer/other
  // individual manager names below/beside them; chief (rank 5) and fullAccess
  // see leadership apex seats (never IC names). CSV applies small-cell floor
  // separately so no sub-floor row is ever named in exports.
  const restrictNonSelfNames = Boolean(seat)
    && !seat.fullAccess
    && Number(seat.rank) >= MATRIX_FLOORS.detailRank
    && Number(seat.rank) < 5;

  const apexRows = [...buckets.values()].map((entry) => {
    const firstNode = entry.apexIds.length ? matrix.chain.nodes.get(entry.apexIds[0]) : null;
    const altitude = entry.disconnected ? null : (firstNode?.altitude || null);
    const altitudeLabel = entry.disconnected
      ? 'Disconnected graph defect'
      : entry.ambiguous
        ? `Tie across ${entry.apexIds.length} minimal ancestors`
        : (altitudeByKey(altitude)?.label || 'Unassigned');
    const rank = entry.disconnected ? null : altitudeRank(altitude);
    const withheld = restrictNonSelfNames && !entry.isLeader && entry.apexId !== seat?.id;

    let displayName = null;
    if (!withheld) {
      if (entry.disconnected) {
        displayName = 'No common ancestor (roster defect)';
      } else if (entry.ambiguous) {
        const names = entry.apexIds.map((id) => (id === LEADER_ID ? 'Workspace leader' : (matrix.nodes.get(id)?.name || id)));
        displayName = `${names.join(' / ')} (tie — neither chosen)`;
      } else {
        displayName = entry.isLeader ? 'Workspace leader' : (matrix.nodes.get(entry.apexId)?.name || entry.apexId);
      }
    } else {
      displayName = `${altitudeLabel} (name withheld at executive ceiling)`;
    }

    const totalEscalationsN = entry.contestedRightsN + entry.sharedWorkN;
    return {
      key: entry.key,
      apexId: entry.apexId,
      apexIds: entry.apexIds,
      name: withheld ? null : displayName,
      displayLabel: displayName,
      isLeader: entry.isLeader,
      unique: entry.unique,
      ambiguous: entry.ambiguous,
      disconnected: entry.disconnected,
      altitude,
      altitudeLabel,
      rank,
      withheld,
      withheldReason: withheld ? `Non-self leadership names are withheld at rank ${seat.rank} unless full access holds; structural counts survive.` : null,
      contestedRightsN: entry.contestedRightsN,
      operationalContestedN: entry.operationalContestedN,
      stewardshipContestedN: entry.stewardshipContestedN,
      sharedWorkN: entry.sharedWorkN,
      lineOnlyWorkN: entry.lineOnlyWorkN,
      sensitiveCountedN: entry.sensitiveCountedN,
      affectedPeopleN: entry.peopleIds.size,
      totalEscalationsN,
    };
  }).sort((a, b) => (b.totalEscalationsN - a.totalEscalationsN)
    || (b.operationalContestedN - a.operationalContestedN)
    || String(a.key).localeCompare(String(b.key)));

  // Cross-axis structural coupling: unique unordered manager pairs linked by
  // at least one person on more than one active line.
  const spanPairKeys = new Set();
  for (const person of allocations) {
    if (!person.multiLine) continue;
    const managers = [...new Set(person.managerIds)].sort();
    for (let i = 0; i < managers.length; i += 1) {
      for (let j = i + 1; j < managers.length; j += 1) {
        spanPairKeys.add(`${managers[i]}|${managers[j]}`);
      }
    }
  }

  const workTotalN = reach.length;
  const workLineOnlyN = reach.filter((r) => r.lineManagers.some((m) => m.lineOnly)).length;
  const workSharedN = sharedItems.length;
  const multiLinePeopleN = rec.multiLineN;
  const peopleN = rec.peopleN;
  const maxLinesOnPerson = allocations.reduce((mx, p) => Math.max(mx, p.lineN || 0), 0);
  const maxManagersOnPerson = allocations.reduce((mx, p) => Math.max(mx, new Set(p.managerIds).size), 0);

  const peopleRateRefused = peopleN < MATRIX_FLOORS.cellN;
  const multiLineSharePct = peopleRateRefused ? null : Math.round((multiLinePeopleN / peopleN) * 1000) / 10;
  const multiLineInterval = peopleRateRefused ? { lower: null, upper: null } : matrixWilson(multiLinePeopleN, peopleN);

  const workRateRefused = workTotalN < MATRIX_FLOORS.cellN;
  const sharedWorkPct = workRateRefused ? null : Math.round((workSharedN / workTotalN) * 1000) / 10;
  const sharedWorkInterval = workRateRefused ? { lower: null, upper: null } : matrixWilson(workSharedN, workTotalN);

  const seatRefusedN = seatRows.filter((r) => !r.seatEligible).length;
  const apexAmbiguousN = apexRows.filter((r) => r.ambiguous).length;
  const leaderApexEscalationsN = apexRows.filter((r) => r.isLeader).reduce((sum, r) => sum + r.totalEscalationsN, 0);

  const checks = [
    {
      key: 'capacity-reconciles',
      label: 'Headcount capacity reconciles without undeclared splits',
      holds: !hasMatrix || (rec.balances && rec.undeclaredN === 0),
      detail: !hasMatrix
        ? 'Single-chain workspace: every person maps to one home line.'
        : (rec.balances && rec.undeclaredN === 0
          ? `${rec.assertedDisplay} attributed across ${rec.resolvedN} people with zero undeclared splits.`
          : `Net error ${rec.netErrorDisplay}, ${rec.overN} over-committed, ${rec.underN} under-allocated, ${rec.undeclaredN} undeclared.`),
    },
    {
      key: 'operational-rights-clear',
      label: 'Day-to-day operational rights have one owner (priority, assignment, technical)',
      holds: contestedOperationalN === 0 && unownedOperationalN === 0,
      detail: contestedOperationalN === 0 && unownedOperationalN === 0
        ? 'Every multi-line person has a single declared holder on priority, assignment and technical direction.'
        : `${contestedOperationalN} contested and ${unownedOperationalN} unowned operational right(s) climb upward to joint apex seats.`,
    },
    {
      key: 'stewardship-rights-clear',
      label: 'Employment stewardship rights have one owner (pay, performance, absence)',
      holds: contestedStewardshipN === 0 && unownedStewardshipN === 0,
      detail: contestedStewardshipN === 0 && unownedStewardshipN === 0
        ? 'Pay, performance and absence each sit with one line.'
        : `${contestedStewardshipN} contested and ${unownedStewardshipN} unowned stewardship right(s) create dual-appraisal conflict.`,
    },
    {
      key: 'seats-resolved',
      label: 'Every declared line holder carries a valid leadership seat',
      holds: seatRefusedN === 0,
      detail: seatRefusedN === 0
        ? 'Every declared secondary-line manager resolves an operating seat.'
        : `${seatRefusedN} line holder(s) carry no leadership altitude on the roster and were refused a seat.`,
    },
    {
      key: 'dag-apex-unique',
      label: 'Cross-line escalations converge to a unique joint apex in the DAG',
      holds: apexAmbiguousN === 0,
      detail: apexAmbiguousN === 0
        ? (apexRows.length ? `All ${apexRows.length} escalation cluster(s) resolve to a unique minimal common ancestor.` : 'No cross-line escalations in scope.')
        : `${apexAmbiguousN} escalation cluster(s) hit incomparable minimal ancestors in a matrix diamond and have no single owner.`,
    },
  ];

  const alertN = hasMatrix
    ? ((rec.balances ? 0 : 1)
      + (rec.undeclaredN > 0 ? 1 : 0)
      + (contestedOperationalN > 0 ? 1 : 0)
      + (unownedOperationalN > 0 ? 1 : 0)
      + (seatRefusedN > 0 ? 1 : 0)
      + (apexAmbiguousN > 0 ? 1 : 0))
    : 0;

  return {
    hasMatrix,
    headlineVerdict: !hasMatrix ? 'single-chain' : (alertN === 0 ? 'governed' : 'attention'),
    alertN,
    contestedOperationalN,
    contestedStewardshipN,
    contestedPriorityN,
    contestedAssignmentN,
    contestedTechnicalN,
    unownedOperationalN,
    unownedStewardshipN,
    apexRows,
    apexAmbiguousN,
    leaderApexEscalationsN,
    coupling: {
      coupledSpanPairsN: spanPairKeys.size,
      multiLinePeopleN,
      peopleN,
      maxLinesOnPerson,
      maxManagersOnPerson,
      workTotalN,
      workLineOnlyN,
      workSharedN,
      peopleRateRefused,
      peopleRateReason: peopleRateRefused ? `Below ${MATRIX_FLOORS.cellN}-person cell floor (${peopleN} in scope); counts print, rate is withheld.` : null,
      multiLineSharePct,
      multiLineInterval,
      workRateRefused,
      workRateReason: workRateRefused ? `Below ${MATRIX_FLOORS.cellN}-item cell floor (${workTotalN} open item(s)); counts print, rate is withheld.` : null,
      sharedWorkPct,
      sharedWorkInterval,
    },
    checks,
  };
}

/* ------------------------------------------------------------------ report */

function withholdManagerRows(rows, seat, matrix) {
  const aboveCeiling = Boolean(seat) && !seat.fullAccess && Number(seat.rank) >= MATRIX_FLOORS.detailRank;
  return rows.map((row) => {
    if (!aboveCeiling) return row;
    return {
      ...row,
      name: null,
      role: null,
      withheld: true,
      withheldReason: `Above the declared detail ceiling (rank ${seat.rank}), a manager’s allocation is item detail; counts and the attributed total survive.`,
    };
  });
}

/**
 * The full report. Everything is re-derived on read; nothing is stored.
 */
export function buildMatrixReport(state, { now = new Date(), settings = null } = {}) {
  const effective = settings || state?.settings || null;
  const matrix = buildMatrix(state, { now, settings: effective });
  // ADR-0141: the declared lines are handed to the seat engine BEFORE the seats
  // are built, so a manager who holds people only on a line has a seat here —
  // otherwise choosing them as the operating seat made the whole workspace
  // read-only ("that seat no longer exists"), which was a silent matrix failure.
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now, settings: effective, lineScope: lineScope.byManager });
  const seat = activeSeat(built);

  const allocationsAll = matrixAllocations(matrix);
  const scope = seat?.fullAccess
    ? null
    : new Set([...(seat?.scope || []), ...(seat?.lineScope || [])]);
  const inScope = (personId) => !scope || scope.has(personId);
  const allocations = allocationsAll.filter((p) => inScope(p.personId));

  const reconciliation = matrixReconciliation(matrix, allocations);
  const spansAll = matrixManagerSpans(matrix, allocations);
  const spans = withholdManagerRows(spansAll, seat, matrix).slice(0, MATRIX_LIMITS.managers);
  const spansRemainderN = Math.max(0, spansAll.length - spans.length);
  const rightsAll = matrixRightsRows(matrix, allocations);
  const rightsSummary = matrixRightsSummary(rightsAll);
  const findings = matrixFindings(matrix, { allocations, rightsRows: rightsAll, spans: spansAll });
  const people = allocations.slice(0, MATRIX_LIMITS.people);
  const peopleRemainderN = Math.max(0, allocations.length - people.length);

  const expiringN = findings.rows.filter((f) => f.finding === 'expiring').length;

  /* ADR-0141 — the seat reading. Who the matrix made accountable, who the
     workspace can actually seat, and how much open work reaches a manager only
     through a line. Counts reconcile against the work total, so the panel can
     print an identity rather than a reassurance. */
  const seatRows = lineScope.rows.filter((row) => inScope(row.managerId));
  const seatRefused = seatRows.filter((row) => !row.seatEligible);
  const workItems = harvestWork(state, matrix.chain, { now, settings: effective });
  const scopedWork = workItems.filter((item) => !scope
    || scope.has(item.ownerNodeId)
    || item.people.some((pid) => scope.has(pid)));
  const reach = matrixWorkReach(matrix, lineScope, scopedWork);
  const coveredByLine = reach.filter((r) => r.lineManagers.length > 0);
  const workLineOnly = coveredByLine.filter((r) => r.lineManagers.some((m) => m.lineOnly));
  const sharedWork = reach.filter((r) => r.shared);
  const seatsSection = {
    rowN: seatRows.length,
    rows: seatRows.slice(0, MATRIX_LIMITS.managers),
    remainderN: Math.max(0, seatRows.length - MATRIX_LIMITS.managers),
    managerN: seatRows.length,
    seatableN: seatRows.length - seatRefused.length,
    refusedN: seatRefused.length,
    refused: seatRefused,
    // People held on a line, and the subset the tree hides from that manager.
    peopleOnLinesN: new Set(seatRows.flatMap((r) => lineScope.byManager.get(r.managerId)?.personIds || [])).size,
    lineOnlyPeopleN: seatRows.reduce((acc, r) => acc + r.lineOnlyN, 0),
    // Open work, three claims that must reconcile:
    workTotalN: scopedWork.length,
    workReachN: reach.length,
    workTreeN: reach.length - workLineOnly.length,
    workLineOnlyN: workLineOnly.length,
    workSharedN: sharedWork.length,
    workSensitiveN: workLineOnly.filter((r) => r.sensitive).length,
    coveredN: coveredByLine.length,
    // Identity: tree-only + line-only rows = every scoped open item, exactly.
    // Both terms are counted from the same one-row-per-item list, so the panel
    // can print an equality instead of a reassurance.
    identityHolds: (reach.length - workLineOnly.length) + workLineOnly.length === scopedWork.length
      && reach.length === scopedWork.length,
    identityLabel: 'every open item in scope is reachable either only through the reporting tree or only through a declared line, and the two columns add to the total',
    scopeLineN: seat ? (seat.lineScopeN || 0) : 0,
  };

  const governance = matrixGovernance(matrix, {
    allocations,
    rightsRows: rightsAll,
    reach,
    seatRows,
    reconciliation,
    seat,
  });

  return {
    engineVersion: MATRIX_ENGINE_VERSION,
    method: MATRIX_METHOD,
    panels: MATRIX_PANELS,
    findings: MATRIX_FINDINGS,
    conventions: {
      balanceHundredths: matrix.conventions.matrixBalanceHundredths,
      expiringDays: matrix.conventions.matrixExpiringDays,
      autoPropagate: matrix.conventions.matrixAutoPropagate,
      linesPerPerson: MATRIX_LIMITS.linesPerPerson,
      queueCap: MATRIX_LIMITS.queue,
      managerCap: MATRIX_LIMITS.managers,
      peopleCap: MATRIX_LIMITS.people,
      detailRank: MATRIX_FLOORS.detailRank,
    },
    seat: {
      id: seat?.id || null,
      label: seat?.label || 'Undeclared operator view',
      rank: seat?.rank ?? null,
      fullAccess: Boolean(seat?.fullAccess),
    },
    today: matrix.today,
    reconciliation,
    people,
    peopleRemainderN,
    spans,
    spansRemainderN,
    rights: rightsAll,
    rightsSummary,
    findings,
    expiringN,
    seats: seatsSection,
    governance,
    defects: matrix.defects,
    inactiveLines: matrix.inactiveLines,
    limits: MATRIX_LIMITS,
    // ADR-0145: the decision-right execution concordance. A pure read over
    // the same seat scope and the same declared lines — every figure is
    // re-derived from the decision log and the typed graph on every render,
    // and nothing is stored.
    concordance: buildRightsConcordance(state, { now, settings: effective, seat, scope }),
  };
}

/** Attention badge: the count the shell shows before the leader opens the page. */
export function matrixAttentionCount(state, { now = new Date(), settings = null } = {}) {
  try {
    const report = buildMatrixReport(state, { now, settings: settings || state?.settings || null });
    const r = report.reconciliation;
    return r.undeclaredN + r.overN + report.rightsSummary.contestedN + report.defects.length;
  } catch {
    return 0;
  }
}

/* -------------------------------------------------------------- csv + brief */

function aggregateBand(row) {
  if (row.undeclaredN > 0) return 'has-undeclared';
  if (row.overN > 0) return 'has-over-committed';
  if (row.sharedN > 0) return 'has-shared-people';
  return 'clean';
}

/**
 * CSV scope #105 (Schema v119, ADR-0140). Aggregate-only: a manager row is
 * named only when it clears the declared cell floor, and a person is never
 * named at all — an individual's allocation is item detail about an individual.
 */
export function matrixCsvRows(report) {
  const rows = [];
  const r = report.reconciliation;

  rows.push({
    row_kind: 'workspace',
    scope: 'workspace',
    altitude: report.seat.rank === null ? '' : String(report.seat.rank),
    person_n: r.peopleN,
    line_n: r.lineN,
    secondary_line_n: r.secondaryLineN,
    multi_line_n: r.multiLineN,
    attributed_h: r.assertedH,
    attributable_people_n: r.resolvedN,
    undeclared_people_n: r.undeclaredN,
    net_fte_error_h: r.netErrorH,
    balances: r.balances ? 'yes' : 'no',
    over_committed_n: r.overN,
    under_allocated_n: r.underN,
    balanced_n: r.balancedN,
    contested_right_n: report.rightsSummary.contestedN,
    unowned_right_n: report.rightsSummary.unownedN,
    expiring_n: report.expiringN,
    manager_rank: '',
    manager_attributed_h: r.fanOutH,
    manager_direct_n: '',
    manager_shared_n: '',
    manager_withheld: '',
    right_key: '',
    right_state: '',
    right_holders_n: '',
    share_state: '',
    share_total_h: '',
    finding: '',
    band: '',
    withheld: '',
    withheld_reason: '',
    line_scope_n: report.seats.peopleOnLinesN,
    line_only_n: report.seats.lineOnlyPeopleN,
    line_work_n: report.seats.workLineOnlyN,
    line_work_shared_n: report.seats.workSharedN,
    seat_state: '',
    apex_contested_n: report.governance ? (report.governance.contestedOperationalN + report.governance.contestedStewardshipN) : 0,
    apex_operational_contested_n: report.governance?.contestedOperationalN ?? 0,
    apex_shared_work_n: report.governance?.coupling?.workSharedN ?? 0,
    apex_ambiguous_n: report.governance?.apexAmbiguousN ?? 0,
    coupled_span_pairs_n: report.governance?.coupling?.coupledSpanPairsN ?? 0,
    governance_alert_n: report.governance?.alertN ?? 0,
  });

  for (const span of report.spans) {
    const named = !span.withheld && span.directN >= MATRIX_FLOORS.cellN;
    rows.push({
      row_kind: 'manager',
      scope: named ? span.name : (span.isLeader ? 'workspace-leader' : 'withheld'),
      altitude: '',
      person_n: span.directN,
      line_n: '',
      secondary_line_n: '',
      multi_line_n: span.sharedN,
      attributed_h: span.attributedH,
      attributable_people_n: span.directN - span.undeclaredN,
      undeclared_people_n: span.undeclaredN,
      net_fte_error_h: '',
      balances: '',
      over_committed_n: span.overN,
      under_allocated_n: '',
      balanced_n: '',
      contested_right_n: '',
      unowned_right_n: '',
      expiring_n: '',
      manager_rank: '',
      manager_attributed_h: span.attributedH,
      manager_direct_n: span.directN,
      manager_shared_n: span.sharedN,
      manager_withheld: span.withheld ? 'yes' : (named ? '' : 'yes'),
      right_key: '',
      right_state: '',
      right_holders_n: '',
      share_state: '',
      share_total_h: '',
      finding: '',
      band: aggregateBand(span),
      withheld: named ? '' : 'yes',
      withheld_reason: named ? '' : (span.withheldReason || `Fewer than ${MATRIX_FLOORS.cellN} attributed people — a named allocation is item detail.`),
    });
  }

  for (const right of report.rightsSummary.byRight) {
    rows.push({
      row_kind: 'right',
      scope: 'workspace',
      altitude: '',
      person_n: '',
      line_n: '',
      secondary_line_n: '',
      multi_line_n: '',
      attributed_h: '',
      attributable_people_n: '',
      undeclared_people_n: '',
      net_fte_error_h: '',
      balances: '',
      over_committed_n: '',
      under_allocated_n: '',
      balanced_n: '',
      contested_right_n: right.contested,
      unowned_right_n: right.unowned,
      expiring_n: '',
      manager_rank: '',
      manager_attributed_h: '',
      manager_direct_n: '',
      manager_shared_n: '',
      manager_withheld: '',
      right_key: right.key,
      right_state: right.contested > 0 ? 'contested' : (right.unowned > 0 ? 'unowned' : 'held'),
      right_holders_n: '',
      share_state: '',
      share_total_h: '',
      finding: '',
      band: '',
      withheld: '',
      withheld_reason: '',
    });
  }

  for (const finding of report.findings.rows) {
    rows.push({
      row_kind: 'finding',
      scope: 'workspace',
      altitude: '',
      person_n: '',
      line_n: '',
      secondary_line_n: '',
      multi_line_n: finding.managers,
      attributed_h: '',
      attributable_people_n: '',
      undeclared_people_n: '',
      net_fte_error_h: '',
      balances: '',
      over_committed_n: '',
      under_allocated_n: '',
      balanced_n: '',
      contested_right_n: '',
      unowned_right_n: '',
      expiring_n: '',
      manager_rank: '',
      manager_attributed_h: '',
      manager_direct_n: '',
      manager_shared_n: '',
      manager_withheld: '',
      right_key: '',
      right_state: '',
      right_holders_n: '',
      share_state: '',
      share_total_h: '',
      finding: finding.finding,
      band: '',
      withheld: '',
      withheld_reason: '',
    });
  }

  for (const row of report.seats.rows) {
    const named = row.lineOnlyN >= MATRIX_FLOORS.cellN || row.treeSpanN >= MATRIX_FLOORS.cellN;
    rows.push({
      row_kind: 'seat',
      scope: named ? row.name : (row.isLeader ? 'workspace-leader' : 'withheld'),
      altitude: row.rank ? String(row.rank) : '',
      person_n: row.linePersonN,
      line_n: row.lineN,
      secondary_line_n: row.lineOnlyN,
      multi_line_n: '',
      attributed_h: '',
      attributable_people_n: '',
      undeclared_people_n: '',
      net_fte_error_h: '',
      balances: '',
      over_committed_n: '',
      under_allocated_n: '',
      balanced_n: '',
      contested_right_n: '',
      unowned_right_n: '',
      expiring_n: '',
      manager_rank: row.rank ? String(row.rank) : '',
      manager_attributed_h: '',
      manager_direct_n: row.treeSpanN,
      manager_shared_n: row.lineOnlyN,
      manager_withheld: named ? '' : 'yes',
      right_key: '',
      right_state: '',
      right_holders_n: '',
      share_state: '',
      share_total_h: '',
      finding: '',
      band: row.seatEligible ? 'seated' : 'refused',
      withheld: named ? '' : 'yes',
      withheld_reason: named ? '' : `Fewer than ${MATRIX_FLOORS.cellN} people on either side of the line — a named line holder is item detail.`,
      line_scope_n: row.linePersonN,
      line_only_n: row.lineOnlyN,
      line_work_n: '',
      line_work_shared_n: '',
      seat_state: row.seatEligible ? 'seated' : 'refused',
    });
  }

  for (const apex of report.governance?.apexRows || []) {
    const named = !apex.withheld && !apex.ambiguous && !apex.disconnected
      && (apex.affectedPeopleN >= MATRIX_FLOORS.cellN || apex.sharedWorkN >= MATRIX_FLOORS.cellN);
    rows.push({
      row_kind: 'apex',
      scope: apex.disconnected ? 'disconnected-apex' : apex.ambiguous ? 'ambiguous-apex' : apex.isLeader ? 'workspace-leader' : (named ? apex.name : 'withheld'),
      altitude: apex.rank ? String(apex.rank) : '',
      person_n: apex.affectedPeopleN,
      line_n: '',
      secondary_line_n: '',
      multi_line_n: '',
      attributed_h: '',
      attributable_people_n: '',
      undeclared_people_n: '',
      net_fte_error_h: '',
      balances: '',
      over_committed_n: '',
      under_allocated_n: '',
      balanced_n: '',
      contested_right_n: apex.contestedRightsN,
      unowned_right_n: '',
      expiring_n: '',
      manager_rank: apex.rank ? String(apex.rank) : '',
      manager_attributed_h: '',
      manager_direct_n: '',
      manager_shared_n: '',
      manager_withheld: named || apex.isLeader ? '' : 'yes',
      right_key: '',
      right_state: '',
      right_holders_n: '',
      share_state: '',
      share_total_h: '',
      finding: '',
      band: apex.ambiguous || apex.disconnected ? 'ambiguous-apex' : 'unique-apex',
      withheld: named || apex.isLeader || apex.ambiguous || apex.disconnected ? '' : 'yes',
      withheld_reason: named || apex.isLeader || apex.ambiguous || apex.disconnected
        ? ''
        : (apex.withheldReason || `Fewer than ${MATRIX_FLOORS.cellN} affected people or shared items — a named leadership apex below the cell floor is withheld.`),
      apex_contested_n: apex.contestedRightsN,
      apex_operational_contested_n: apex.operationalContestedN,
      apex_shared_work_n: apex.sharedWorkN,
      apex_ambiguous_n: apex.ambiguous ? 1 : 0,
      coupled_span_pairs_n: '',
      governance_alert_n: '',
    });
  }

  return rows;
}

export const MATRIX_CSV_HEADER = MATRIX_CSV_COLUMNS;

/**
 * Identity-free brief for Today/Signals. Counts and the reconciliation verdict
 * only — never a person, a manager or an allocation.
 */
export function matrixBriefText(report) {
  if (!report || !isPlainObject(report.reconciliation)) return 'No matrix accountability reading is available.';
  const r = report.reconciliation;
  const lines = [];
  lines.push(`Matrix: ${r.peopleN} people on ${r.lineN} reporting lines, ${r.multiLineN} on more than one.`);
  lines.push(r.balances
    ? `Every span adds back to the headcount: ${r.assertedDisplay} attributed across ${r.resolvedN} attributable people, net error ${r.netErrorDisplay}.`
    : `The allocations do NOT add back to the headcount: ${r.assertedDisplay} attributed against ${r.expectedDisplay} expected — net error ${r.netErrorDisplay}.`);
  if (!r.auditClean) lines.push('THE LEDGER IS UNSOUND: the printed total is not the sum of the printed rows. Treat every figure on this page as unverified.');
  lines.push(`${r.overN} over-committed, ${r.underN} under-allocated, ${r.balancedN} balanced, ${r.undeclaredN} undeclared.`);
  lines.push(`Decision rights: ${report.rightsSummary.contestedN} contested, ${report.rightsSummary.unownedN} unowned across ${report.rightsSummary.contestedPeopleN + report.rightsSummary.unownedPeopleN} people on more than one line.`);
  if (report.seats) {
    lines.push(`Seats: ${report.seats.managerN} manager(s) hold people on a declared line; ${report.seats.workLineOnlyN} open item(s) reach a manager only through a line and ${report.seats.workSharedN} have more than one accountable manager.`);
    if (report.seats.refusedN > 0) lines.push(`${report.seats.refusedN} declared line holder(s) carry no leadership altitude on the roster and are refused a seat rather than invented.`);
  }
  if (report.governance?.hasMatrix) {
    const g = report.governance;
    lines.push(`Governance: ${g.contestedOperationalN} contested operational right(s), ${g.apexRows.length} joint escalation apex(es) (${g.apexAmbiguousN} ambiguous tie(s)), ${g.coupling.coupledSpanPairsN} coupled span pair(s), ${g.alertN} structural alert(s).`);
  }
  if (r.undeclaredN > 0) lines.push('An undeclared allocation is attributed to nobody; it is never split by guesswork.');
  const concordanceText = rightsConcordanceBriefText(report?.concordance);
  if (concordanceText) lines.push(concordanceText);
  return lines.join(' ');
}
