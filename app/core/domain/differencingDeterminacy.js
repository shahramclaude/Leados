/**
 * app/core/domain/differencingDeterminacy.js — exact integer determinacy over a
 * SEQUENCE of published aggregates (ADR-0092, Schema v96).
 *
 * WHAT PROBLEM THIS SOLVES
 * ------------------------
 * `aggregateDeterminacy.js` (ADR-0091) audits ONE published table: given the
 * printed cells, the printed totals and an integer box for each withheld cell, it
 * decides whether a withheld value is recoverable by subtraction. That audit is
 * exact and it is not enough. Disclosure is a property of the RELEASE, not of the
 * page:
 *
 *   Release 1     span A 6 · span B withheld · total 7      → 7 − 6 = 1
 *   Release 2     span A 6 · span B withheld · total 9      → B grew by exactly 2
 *   Child         span A 6 · sibling withheld · total 6     → the sibling is 0
 *
 * Every one of those tables can be individually safe after complementary
 * suppression. The arithmetic that breaks them is spread across pages, seats,
 * modules and dates, so no per-table guard can ever see it. The reader is not
 * doing anything clever — they are subtracting the only two numbers they were
 * given.
 *
 * WHAT THIS MODULE DOES
 * ---------------------
 * It re-poses the whole publication history as ONE integer feasibility system and
 * asks the only question that matters: which latent cell values admit exactly one
 * value? A value that is feasible at exactly one integer is DETERMINED — the
 * workspace withheld it and arithmetic handed it back, which is the same
 * disclosure with a longer proof.
 *
 * The model, in full:
 *
 *   - One variable per (cell, measure). A cell is a span, identified by the
 *     span's own node id, so the SAME span is the same variable in every release
 *     that mentioned it — which is what makes a series comparable at all.
 *   - Every PRINTED cell is a constant: a box of lo = hi = the printed value.
 *   - Every WITHHELD cell is a box. The box is derived only from what the act of
 *     withholding itself reveals to a reader — a sub-floor cell is below the
 *     floor, a complementary cell survived the floor, an OPEN or OVERDUE load is
 *     never greater than the record count of the same cell — never from the
 *     hidden value.
 *   - Every PUBLISHED total is one linear equation over those variables.
 *
 * TWO SOLVING PASSES
 * -----------------
 * 1. BOUND PROPAGATION (the fixpoint). Substitute every pinned value, then
 *    tighten every remaining box against every equation. A single equation with
 *    one unknown pins it. A single equation with n unknowns pins each one when
 *    its feasible interval collapses to a point — and that collapse is EXACT,
 *    because a collapsed interval leaves no room for a second integer.
 *
 * 2. BOUNDED ELIMINATION (the differencing engine). Two equations sharing a
 *    variable are combined into their integer-scaled difference, a valid implied
 *    constraint that removes that variable. This is what collapses the attacks
 *    above: "total(2026-10-01) − total(2026-10-29)" becomes one equation over the
 *    cells whose state changed, and "parent total − child total" becomes one
 *    equation over the sibling spans the child could not see.
 *
 * WHERE THE CONSERVATISM POINTS, AND WHY THAT IS THE SAFE DIRECTION
 * ----------------------------------------------------------------
 * Pinning is exact. NON-pinning is deliberately conservative: interval narrowing
 * over a SYSTEM of equations is a relaxation, so it can miss a pin that a cleverer
 * argument would find, but it can never invent one. That asymmetry is the whole
 * point — a false "safe" is a disclosure, a false "unsafe" is one table suppressed
 * unnecessarily. So `determined` is a list of PROVEN recoveries, and `safe: true`
 * means "this procedure could not determine any withheld value", which every
 * screen states in exactly those words.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not differential privacy. Not noise injection. Not a formal privacy guarantee.
 * It proves that THIS register does not determine a withheld value by integer
 * arithmetic. Auxiliary data outside the workspace, timing side channels, and
 * releases this workspace cannot see are stated as limits, never modelled away.
 *
 * Pure module: every input is an argument. No storage, no clock, no DOM, no
 * floating point in any decision.
 */

export const DETERMINACY_SOLVER_VERSION = 'differencing-solve-v1';

export const SOLVE_BUDGET = Object.freeze({
  iterations: 96,
  derived: 320,
  passes: 4,
  pairsPerPass: 24000,
});

export const MEASURES = Object.freeze(['count', 'open', 'overdue']);

const OPEN_BOX = Object.freeze({ lo: 0, hi: Infinity });

function intOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function finiteHi(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : Infinity;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

/** The canonical variable key for one measure on one cell. */
export function variableKey(cellKey, measure) {
  return `${cellKey}::${measure}`;
}

export function parseVariableKey(key) {
  const text = String(key || '');
  const at = text.lastIndexOf('::');
  if (at < 0) return { cellKey: text, measure: '' };
  return { cellKey: text.slice(0, at), measure: text.slice(at + 2) };
}

/**
 * Normalise an equation: one entry per variable, no zero coefficients, positive
 * leading coefficient so the sign convention is uniform. A malformed equation is
 * dropped, never repaired into something that looks like a constraint.
 */
export function normalizeEquation(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.members)) return null;
  const rhsRaw = Number(raw.rhs);
  if (!Number.isFinite(rhsRaw)) return null;
  const merged = new Map();
  for (const member of raw.members) {
    const key = typeof member?.v === 'string' ? member.v.trim() : '';
    const coef = Number(member?.coef);
    if (!key || !Number.isFinite(coef) || coef === 0) continue;
    merged.set(key, (merged.get(key) || 0) + Math.round(coef));
  }
  const members = [...merged.entries()]
    .filter(([, coef]) => coef !== 0)
    .map(([v, coef]) => ({ v, coef }))
    .sort((a, b) => a.v.localeCompare(b.v));
  const id = String(raw.id || `eq-${index}`);
  const role = String(raw.role || 'unknown');
  if (!members.length) return null;
  if (members[0].coef < 0) {
    for (const member of members) member.coef = -member.coef;
    return { id, role, members, rhs: -Math.round(rhsRaw), source: raw.source || null };
  }
  return { id, role, members, rhs: Math.round(rhsRaw), source: raw.source || null };
}

export function normalizeEquations(raw = []) {
  const out = [];
  const list = Array.isArray(raw) ? raw : [];
  for (let i = 0; i < list.length; i += 1) {
    const eq = normalizeEquation(list[i], i);
    if (eq) out.push(eq);
  }
  return out;
}

/**
 * The solver. Returns every value it can PROVE is determined, the narrowed box of
 * every value it cannot, and an explicit statement of whether the budget ran out.
 */
export function solveDeterminacy({ equations = [], boxes = {}, budget = {} } = {}) {
  const limits = { ...SOLVE_BUDGET, ...budget };
  const work = new Map();
  for (const [key, value] of Object.entries(boxes || {})) {
    if (!key) continue;
    const lo = intOr(value?.lo, 0);
    const hi = finiteHi(value?.hi);
    work.set(key, { lo, hi: Math.max(lo, hi) });
  }

  const pinned = new Map();
  const sources = new Map();
  const noteSource = (key, source) => {
    if (!sources.has(key)) sources.set(key, []);
    const list = sources.get(key);
    if (list.length < 8) list.push(source);
  };

  // A box whose ends coincide is already one integer — the printed value, or a
  // value the workspace holds. Seeding it here instead of writing an equation per
  // printed cell keeps a 60-release register at ~100 equations rather than 13,000,
  // which is the difference between a read model and a blocked write.
  for (const [key, box] of [...work.entries()]) {
    if (box.lo === box.hi && Number.isFinite(box.hi)) {
      pinned.set(key, box.lo);
      noteSource(key, { equationId: 'fixed-box', role: 'printed-cell', kind: 'fixed-box' });
    }
  }

  const active = normalizeEquations(equations);
  const derived = [];
  const inconsistent = [];
  let iterations = 0;
  let pivots = 0;
  let exhausted = false;

  const recordInconsistency = (eq, reason) => {
    if (inconsistent.some((row) => row.equationId === eq.id)) return;
    inconsistent.push({ equationId: eq.id, role: eq.role, reason });
  };

  const pinValue = (key, value, eq) => {
    if (pinned.has(key)) {
      if (pinned.get(key) !== value) recordInconsistency(eq, 'two-equations-disagree');
      return false;
    }
    pinned.set(key, value);
    work.set(key, { lo: value, hi: value });
    noteSource(key, { equationId: eq.id, role: eq.role, kind: 'single-unknown' });
    pivots += 1;
    return true;
  };

  /* ------------------------------------------------ pass 1: bound propagation */
  const propagate = () => {
    let changed = true;
    while (changed && iterations < limits.iterations) {
      changed = false;
      iterations += 1;
      for (const eq of [...active, ...derived]) {
        let total = eq.rhs;
        const free = [];
        for (const member of eq.members) {
          if (pinned.has(member.v)) total -= member.coef * pinned.get(member.v);
          else free.push(member);
        }
        if (!free.length) {
          if (total !== 0) recordInconsistency(eq, 'published-total-not-satisfied');
          continue;
        }
        if (free.length === 1) {
          const [only] = free;
          const value = total / only.coef;
          if (!Number.isInteger(value)) {
            recordInconsistency(eq, 'integer-solution-does-not-exist');
            continue;
          }
          if (pinValue(only.v, value, eq)) changed = true;
          continue;
        }
        // Σ coef·x = total over ≥2 unknowns.
        //
        // SOUND SIGNED BOUNDS. The min and max of c·x depend on the SIGN of c:
        // c > 0 takes its min at lo and its max at hi, c < 0 the reverse. Keeping
        // one "low sum" and one "high sum" over the partners, with negative
        // coefficients folded in correctly and infinite ends counted separately,
        // is what makes the narrowing exact instead of merely plausible. Getting
        // this wrong in the other direction would PROVE a pin that does not hold,
        // which is a disclosure — the one error this module may never make.
        let posLo = 0;
        let posHi = 0;
        let negLo = 0;
        let negHi = 0;
        let posHiInf = 0;
        let negLoInf = 0;
        for (const member of free) {
          const box = work.get(member.v) || OPEN_BOX;
          if (member.coef > 0) {
            posLo += member.coef * box.lo;
            if (box.hi === Infinity) posHiInf += 1;
            else posHi += member.coef * box.hi;
          } else {
            if (box.hi === Infinity) negLoInf += 1;
            else negLo += member.coef * box.hi;
            negHi += member.coef * box.lo;
          }
        }
        for (const member of free) {
          const box = work.get(member.v) || OPEN_BOX;
          const isPos = member.coef > 0;
          const lowSum = (posLo - (isPos ? member.coef * box.lo : 0))
            + (negLo - (!isPos && box.hi !== Infinity ? member.coef * box.hi : 0));
          const lowInf = (isPos ? 0 : negLoInf) - (!isPos && box.hi === Infinity ? 1 : 0) > 0;
          const hiSum = (negHi - (!isPos ? member.coef * box.lo : 0))
            + (posHi - (isPos && box.hi !== Infinity ? member.coef * box.hi : 0));
          const hiInf = (isPos ? posHiInf : 0) - (isPos && box.hi === Infinity ? 1 : 0) > 0;
          // S ∈ [lowSum or -∞, hiSum or +∞]; t = total − S ∈ [tMin, tMax].
          const tMin = hiInf ? -Infinity : total - hiSum;
          const tMax = lowInf ? Infinity : total - lowSum;
          // x = t / c. Dividing by a negative reverses the interval.
          const loRaw = isPos ? tMin / member.coef : tMax / member.coef;
          const hiRaw = isPos ? tMax / member.coef : tMin / member.coef;
          const lo = Math.max(box.lo, Number.isFinite(loRaw) ? Math.ceil(loRaw) : loRaw);
          const hi = Math.min(box.hi, Number.isFinite(hiRaw) ? Math.floor(hiRaw) : hiRaw);
          if (lo > hi) {
            recordInconsistency(eq, 'box-and-total-disagree');
            continue;
          }
          if (lo !== box.lo || hi !== box.hi) {
            work.set(member.v, { lo, hi });
            changed = true;
            if (lo === hi && !pinned.has(member.v)) {
              pinned.set(member.v, lo);
              noteSource(member.v, { equationId: eq.id, role: eq.role, kind: 'interval-collapsed' });
              pivots += 1;
            }
          }
        }
      }
    }
    if (changed && iterations >= limits.iterations) exhausted = true;
  };

  /**
   * Pass 2: bounded elimination. Two equations sharing a variable combine into
   * their integer-scaled difference — a valid implied constraint with one fewer
   * unknown — which is exactly how a differencing chain collapses. Only a
   * difference that STRICTLY reduced the support is kept, so the derived set
   * cannot grow without bound.
   */
  const eliminate = () => {
    let added = 0;
    let pass = 0;
    let grew = true;
    while (grew && pass < limits.passes && derived.length < limits.derived && !exhausted) {
      pass += 1;
      grew = false;
      const pool = [...active, ...derived].filter((eq) => eq.members.some((m) => !pinned.has(m.v)));
      const seen = new Set();
      for (const eq of derived) {
        seen.add(`${eq.rhs}|${eq.members.map((m) => `${m.v}:${m.coef}`).join(',')}`);
      }
      let pairs = 0;
      for (let i = 0; i < pool.length && pairs < limits.pairsPerPass; i += 1) {
        for (let j = i + 1; j < pool.length && pairs < limits.pairsPerPass; j += 1) {
          pairs += 1;
          if (derived.length >= limits.derived) { exhausted = true; break; }
          const a = pool[i];
          const b = pool[j];
          const bMap = new Map(b.members.map((m) => [m.v, m.coef]));
          let shared = null;
          for (const member of a.members) {
            if (!pinned.has(member.v) && bMap.has(member.v)) { shared = member; break; }
          }
          if (!shared) continue;
          const ca = shared.coef;
          const cb = bMap.get(shared.v);
          const g = gcd(ca, cb);
          const multA = cb / g;
          const multB = ca / g;
          const merged = new Map();
          for (const member of a.members) merged.set(member.v, (merged.get(member.v) || 0) + member.coef * multA);
          for (const member of b.members) merged.set(member.v, (merged.get(member.v) || 0) - member.coef * multB);
          const members = [...merged.entries()].filter(([, coef]) => coef !== 0);
          // Keep only a strict support reduction: an equal or larger equation
          // buys no elimination and risks combinatorial growth.
          if (!members.length) continue;
          if (members.length >= Math.min(a.members.length, b.members.length)) continue;
          const rhs = a.rhs * multA - b.rhs * multB;
          const factor = members.reduce((acc, [, coef]) => gcd(acc, coef), 0) || 1;
          const sign = members[0][1] < 0 ? -1 : 1;
          const normalized = members
            .map(([v, coef]) => ({ v, coef: (coef * sign) / factor }))
            .sort((x, y) => x.v.localeCompare(y.v));
          const signature = `${(rhs * sign) / factor}|${normalized.map((m) => `${m.v}:${m.coef}`).join(',')}`;
          if (seen.has(signature)) continue;
          seen.add(signature);
          derived.push({
            id: `derived-${derived.length + 1}`,
            role: 'derived-difference',
            members: normalized,
            rhs: (rhs * sign) / factor,
            derivedFrom: [a.id, b.id],
          });
          added += 1;
          grew = true;
        }
      }
    }
    return added;
  };

  let derivedCount = 0;
  for (let round = 0; round < 6; round += 1) {
    const before = pinned.size;
    propagate();
    const addedNow = eliminate();
    derivedCount += addedNow;
    if (!addedNow && pinned.size === before) break;
  }

  /* ------------------------------------------------------------- the verdict */
  const determined = [...pinned.entries()]
    .map(([key, value]) => {
      const { cellKey, measure } = parseVariableKey(key);
      const list = sources.get(key) || [];
      return {
        key,
        cellKey,
        measure,
        value,
        sources: list.slice(0, 6),
        sourceN: list.length,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const narrowed = [];
  for (const [key, box] of work.entries()) {
    if (pinned.has(key)) continue;
    const { cellKey, measure } = parseVariableKey(key);
    narrowed.push({
      key,
      cellKey,
      measure,
      lo: box.lo,
      hi: box.hi === Infinity ? null : box.hi,
      openHigh: box.hi === Infinity,
    });
  }
  narrowed.sort((a, b) => a.key.localeCompare(b.key));

  /**
   * Companion analysis. An undetermined value is only undetermined because it has
   * somewhere to hide; this names where, so a leader who wants to reprint a total
   * knows which partners that total is holding open.
   */
  const companions = [];
  for (const eq of [...active, ...derived]) {
    const free = eq.members.filter((member) => !pinned.has(member.v));
    if (free.length < 2) continue;
    companions.push({
      equationId: eq.id,
      role: eq.role,
      unknowns: free.length,
      keys: free.slice(0, 24).map((member) => member.v),
      theorem: free.length === 2
        ? 'Two unknowns share one published total. With an exact integer total one can move a unit to the other, so neither is separable — unless their own boxes leave room at only one point.'
        : `${free.length} unknowns share one published total; no single value follows from that total alone.`,
    });
  }

  return {
    version: DETERMINACY_SOLVER_VERSION,
    determined,
    determinedN: determined.length,
    narrowed,
    companions,
    inconsistent,
    inconsistentN: inconsistent.length,
    pivots,
    derivedN: derivedCount,
    iterations,
    exhausted,
    equationN: active.length + derived.length,
    inputEquationN: active.length,
    safe: determined.length === 0 && inconsistent.length === 0,
  };
}

/**
 * Audit a publication REGISTER: every release of one module as ONE integer system.
 *
 * The surface modelled is exactly what a reader has received across the whole
 * series: printed cells (fixed integers), published totals (equations) and boxes
 * derived from the withholding itself. A withheld value that this system pins was
 * never printed and is recoverable anyway — a disclosure that has already
 * happened, which the register can name after the fact and the planner exists to
 * prevent before it.
 *
 * Deliberately NOT modelled: the workspace's own knowledge of the withheld values.
 * Feeding those in would make every withheld cell "determined" by construction and
 * prove nothing. The honest comparison is surface-vs-nothing, which is what a
 * reader has.
 *
 * `releases` are frozen register rows: `{ id, route, cells: [{ cellKey, state,
 * count, open, overdue }], totals: [{ measure, printed, value }] }`.
 */
export function auditSequence({ releases = [], floor = 3, budget = {}, timeAware = true } = {}) {
  const boxes = {};
  const printedKeys = new Set();
  const equations = [];
  const cellKeys = new Set();
  /**
   * TIME-AWARE IDENTITY, and why it gates the whole conclusion.
   *
   * A span's record count is a STOCK, not an attribute. "lead2 had 1 open case" on
   * 1 November and "lead2 had 3" on 8 November describe the same span at two
   * moments, not a contradiction. Treating them as one variable lets the solver
   * conclude `1 = 3`, call the register INCONSISTENT, and conclude nothing at all
   * — which is exactly the failure this module exists to prevent.
   *
   * So the solver's variable is (span, measure, DAY). The equation "the 8 November
   * total is the sum of the 8 November cells" is then true and solvable, and the
   * only cross-day relation the auditor asserts is the one a reader can make for
   * free: the printed CHANGE between two dates. `timeAware: false` is retained for
   * a surface whose cells are genuinely fixed attributes rather than counts.
   */
  const varFor = (cellKey, measure, day) => (timeAware ? variableKey(`${day}|${cellKey}`, measure) : variableKey(cellKey, measure));
  const floorN = Number.isFinite(floor) && floor > 1 ? Math.round(floor) : 2;
  const list = Array.isArray(releases) ? releases : [];

  for (const release of list) {
    if (!release || !Array.isArray(release.cells)) continue;
    const releaseId = String(release.id || `rel-${equations.length}`);
    for (let index = 0; index < release.cells.length; index += 1) {
      const cell = release.cells[index];
      if (!cell || !cell.cellKey) continue;
      const cellKey = String(cell.cellKey);
      const state = cell.state === 'printed'
        ? 'printed'
        : (cell.state === 'complementary' ? 'complementary' : 'withheld');
      cellKeys.add(cellKey);
      const day = String(release.releasedOn || '').slice(0, 10) || 'undated';
      for (const measure of MEASURES) {
        const key = varFor(cellKey, measure, day);
        // The FIRST statement of a cell fixes its box. A later release on the SAME
        // day that prints the cell replaces the box with the printed constant.
        if (!boxes[key]) {
          if (measure === 'count') {
            boxes[key] = state === 'complementary'
              ? { lo: floorN, hi: Infinity }
              : { lo: 0, hi: floorN - 1 };
          } else {
            boxes[key] = { lo: 0, hi: Infinity };
          }
        }
        if (state !== 'printed') continue;
        const raw = Number(cell[measure]);
        if (!Number.isFinite(raw)) continue;
        const value = Math.round(raw);
        boxes[key] = { lo: value, hi: value };
        printedKeys.add(key);
      }
    }
    for (const total of Array.isArray(release.totals) ? release.totals : []) {
      if (!total || total.printed !== true) continue;
      const measure = String(total.measure || '');
      if (!MEASURES.includes(measure)) continue;
      const value = Number(total.value);
      if (!Number.isFinite(value)) continue;
      const members = [];
      const seen = new Set();
      const totalDay = String(release.releasedOn || '').slice(0, 10) || 'undated';
      for (const cell of release.cells) {
        if (!cell || !cell.cellKey) continue;
        const key = varFor(String(cell.cellKey), measure, totalDay);
        if (seen.has(key) || !boxes[key]) continue;
        seen.add(key);
        members.push({ v: key, coef: 1 });
      }
      if (!members.length) continue;
      equations.push({
        id: `${releaseId}:total:${measure}`,
        role: 'published-total',
        members,
        rhs: Math.round(value),
      });
    }
  }

  /**
   * THE GROWTH HONESTY RULE.
   *
   * The one relation across days that is EXACT is this: if a cell's value is
   * printed on both dates, its CHANGE is disclosed exactly. That is a real
   * disclosure, and it is reported as one.
   *
   * Everything else across days is inference from an assumption this auditor will
   * not make — that nothing closed, opened, moved or was re-attributed between the
   * two dates. So the solver's answer is reported ONLY when the register is
   * time-aware, and the caller is told plainly that a cross-day finding beyond a
   * printed change needs its continuity assumed. Claiming a leak by assuming
   * continuity would be inventing evidence; denying one would be hiding it, so the
   * limit is printed instead of resolved.
   */
  const solved = solveDeterminacy({ equations, boxes, budget });
  // A printed value is published on purpose: only a value the workspace WITHHELD
  // can be "disclosed" by arithmetic, so printed pins are not recoveries.
  // Two exclusions, both load-bearing:
  //   1. a PRINTED value is published on purpose;
  //   2. a DETERMINED ZERO is not a disclosure — nothing about a person, a case or
  //      a span is learned from "there were none". ADR-0091 applies the same rule
  //      to the vertical axis, and a series that reported zeros as leaks would
  //      bury its real findings.
  const recoveredRows = solved.determined.filter((row) => !printedKeys.has(row.key) && row.value !== 0);
  const recovered = recoveredRows.map((row) => {
    const { cellKey, measure } = parseVariableKey(row.key);
    const at = cellKey.indexOf('|');
    return {
      ...row,
      // Strip the day back off the coordinate so the read model speaks in spans.
      cellKey: at > 0 ? cellKey.slice(at + 1) : cellKey,
      measure,
      day: at > 0 ? cellKey.slice(0, at) : null,
      // A determined value inside ONE day is a textbook subtraction. A determined
      // value across days rests on the continuity assumption and says so.
      basis: at > 0 && cellKey.slice(0, at) !== 'undated' ? 'same-day-arithmetic' : 'cross-day-continuity-assumed',
    };
  });
  const withheldKeys = Object.keys(boxes).filter((key) => !printedKeys.has(key));

  return {
    ...solved,
    recovered,
    recoveredN: recovered.length,
    surface: solved,
    withheldN: withheldKeys.length,
    printedN: printedKeys.size,
    cellN: cellKeys.size,
    releaseN: list.length,
    inconsistentN: solved.inconsistentN,
  };
}

/**
 * What-if: audit the register as it would stand if `candidate` were published.
 * The planner calls this against alternative suppression patterns and picks the
 * cheapest one that recovers nothing. Pure; the caller owns the search policy.
 */
export function auditWithCandidate({ releases = [], candidate = null, floor = 3, budget = {} } = {}) {
  const list = Array.isArray(releases) ? releases : [];
  const withCandidate = candidate ? [...list, candidate] : list;
  const audited = auditSequence({ releases: withCandidate, floor, budget });
  const before = candidate ? auditSequence({ releases: list, floor, budget }) : audited;
  const alreadyRecovered = new Set(before.recovered.map((row) => row.key));
  return {
    ...audited,
    // Only the recoveries this candidate CAUSES are actionable here; a value that
    // was already recoverable is the register's problem, not this release's.
    caused: audited.recovered.filter((row) => !alreadyRecovered.has(row.key)),
    alreadyRecoveredN: before.recoveredN,
    candidate: candidate ? String(candidate.id || 'candidate') : null,
  };
}

/** One line a screen can print as evidence, never as an assurance. */
export function determinacyLine(audit) {
  if (!audit) return 'No publication is registered, so there is nothing to recover.';
  if (audit.inconsistentN) {
    return `Determinacy: ${audit.inconsistentN} published total(s) do not agree with the cells under them. Nothing is reasoned about exactly until that is corrected by hand.`;
  }
  if (!audit.recoveredN) {
    return `Determinacy: exact integer check over ${audit.equationN} published equation(s) across ${audit.releaseN} release(s) — no withheld cell is recoverable by subtraction. ${audit.withheldN} withheld value(s) remain undetermined.`;
  }
  return `Determinacy: ${audit.recoveredN} withheld value(s) are exactly recoverable from the published surface. They were never printed; they were determined, which is the same disclosure with a longer proof.`;
}

/**
 * Compare two publications of the same module for the growth attack: a cell or a
 * total printed at both dates hands over the exact net change even when neither
 * level is small. Returned as data so the rule engine can price the exposure
 * without re-deriving it.
 */
export function growthExposures({ earlier = null, later = null, floor = 3 } = {}) {
  if (!earlier || !later) return [];
  const out = [];
  const earlierCells = new Map((earlier.cells || []).filter((cell) => cell && cell.cellKey).map((cell) => [String(cell.cellKey), cell]));
  for (const cell of later.cells || []) {
    if (!cell || !cell.cellKey) continue;
    const before = earlierCells.get(String(cell.cellKey));
    if (!before) continue;
    if (cell.state !== 'printed' || before.state !== 'printed') continue;
    const delta = Number(cell.count) - Number(before.count);
    if (!Number.isFinite(delta)) continue;
    out.push({
      cellKey: String(cell.cellKey),
      measure: 'count',
      delta,
      from: Number(before.count),
      to: Number(cell.count),
      // A printed level is not small-cell disclosure by itself; what the pair hands
      // over is the exact CHANGE. That is the number to price.
      exposure: Math.abs(delta),
    });
  }
  // A total printed at both dates is the coarsest growth channel of all.
  const totalsOf = (release) => new Map((release.totals || []).filter((t) => t && t.printed === true).map((t) => [String(t.measure), Number(t.value)]));
  const before = totalsOf(earlier);
  for (const [measure, value] of totalsOf(later)) {
    if (!before.has(measure) || !Number.isFinite(value) || !Number.isFinite(before.get(measure))) continue;
    out.push({
      cellKey: '__total__',
      measure,
      delta: value - before.get(measure),
      from: before.get(measure),
      to: value,
      exposure: Math.abs(value - before.get(measure)),
      scope: 'total',
    });
  }
  return out.filter((row) => Number.isFinite(row.exposure));
}
