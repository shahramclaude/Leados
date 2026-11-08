/**
 * app/core/domain/boardContinuity.js — the carry-forward ledger of the Board
 * Room (Session 182, ADR-0135).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `board.js` (ADR-0085) adjudicates ONE memo: it measures the seven declared
 * claims now, decides each verdict on the conservative end of its interval, and
 * freezes the result into `memo.snapshot` when the pack is committed. What it
 * never did — and what no reader in this workspace could do — is read ACROSS
 * those frozen snapshots.
 *
 * That is the chief's actual duty at the second board meeting and every one
 * after it. The board has already seen one pack. The question is not "what do
 * the numbers say today" but "what moved since the pack you froze — and what is
 * still broken?" Without that read the chief regenerates a fresh pack each
 * cycle, re-presents figures the board has already argued about, and quietly
 * loses the thread: a claim that has failed three quarters running reads
 * exactly like a claim that failed for the first time, and a figure the
 * organisation could not produce last cycle reads like a figure it cannot
 * produce today. The written record has held the answer since ADR-0085 shipped;
 * nothing was reading it.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * A pure READER over stored `boardMemos[].snapshot`. It stores nothing, writes
 * nothing, adds no collection, no node, no relation, no rule and no setting. It
 * cannot change a verdict, a threshold or a frozen figure — the snapshots are
 * taken as given, exactly as RULE-BRD-01 takes them.
 *
 * For every claim it derives, from the ordered sequence of looks the record
 * committed to:
 *
 *   transition      why the verdict between the last two looks differs, if it
 *                   does: the bar moved, the interval closed, the interval
 *                   overlapped, or the figure cannot be compared at all
 *   streaks         consecutive looks the claim has carried a FAILING verdict,
 *                   or carried a figure the workspace REFUSED to produce
 *   carryForward    whether that streak reaches the declared floor (2)
 *   movement        the point-estimate change in percentage points, or null
 *
 * STATISTICAL DISCIPLINE (named, and printed wherever it is used)
 * ---------------------------------------------------------------
 *  - Interval separation (Wilson 1927, the intervals already stored by ADR-0085)
 *    is used as a CONSERVATIVE SCREEN, not a significance test. Two intervals
 *    that do not overlap are evidence the readings differ; two that overlap are
 *    NOT evidence they are the same. Consecutive looks also share the record
 *    they are drawn from, so the samples are dependent and a formal two-sample
 *    test would be dishonest here. The ledger therefore prints `separated` or
 *    `inside-noise` and refuses to print a p-value.
 *  - Pre-registration (ADR-0085's post-hoc mark) still governs: a claim whose
 *    DECLARED THRESHOLD changed between looks is classified `ruler-moved`, so
 *    movement produced by the ruler is never reported as movement in the record.
 *  - A REFUSED figure repeated across packs is a MEASUREMENT debt (the
 *    organisation has had N cycles to make the number producible and has not),
 *    not a performance finding about anyone.
 *  - Two consecutive packs is a DECLARED CONVENTION, not a measured optimum. It
 *    is printed as a convention everywhere it is used, and it is the only
 *    threshold this module has.
 *
 * No person, no name, no note, no role and no rating is read, because the
 * snapshot carries none. The ledger is identity-free by construction.
 */

import { BOARD_CLAIMS, BOARD_CONTINUITY } from './boardRegistry.js';

const T = BOARD_CONTINUITY.transitions;
const round1 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : null);
const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const day = (iso) => (typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : null);

/**
 * Every look the record has committed to, oldest first.
 *
 * A `look` is one frozen snapshot — a pack whose verdicts were written down at a
 * known instant. Draft memos are excluded: a draft has no snapshot, and a
 * verdict nobody froze is not something the board was shown.
 */
export function boardLooks(state = {}) {
  const memos = Array.isArray(state?.boardMemos) ? state.boardMemos : [];
  const all = [];
  for (const memo of memos) {
    if (!memo || typeof memo !== 'object') continue;
    const snapshot = memo.snapshot;
    if (!snapshot || !Array.isArray(snapshot.claims) || !snapshot.claims.length) continue;
    const at = typeof snapshot.takenAt === 'string' ? snapshot.takenAt : null;
    if (!at) continue;
    const claims = new Map();
    for (const claim of snapshot.claims) {
      if (!claim || typeof claim !== 'object' || !claim.key) continue;
      claims.set(claim.key, {
        verdict: String(claim.verdict || 'refused'),
        value: num(claim.value),
        lower: num(claim.lower),
        upper: num(claim.upper),
        n: Number.isFinite(Number(claim.n)) ? Math.max(0, Math.round(Number(claim.n))) : 0,
        threshold: num(claim.threshold),
        tag: String(claim.tag || 'refused'),
      });
    }
    all.push({
      memoId: memo.id || null,
      revision: Math.max(1, Math.round(Number(memo.revision) || 1)),
      cycle: String(memo.cycle || ''),
      status: String(memo.status || ''),
      at,
      day: day(at),
      fingerprint: snapshot.fingerprint || null,
      claims,
    });
  }
  // Deterministic order: the instant the pack was frozen, then the memo id, so
  // two packs frozen in the same millisecond still read in one fixed order.
  all.sort((a, b) => (a.at === b.at ? String(a.memoId).localeCompare(String(b.memoId)) : (a.at < b.at ? -1 : 1)));
  return all;
}

/** `separated` when two stored 95% intervals do not overlap, else `inside-noise`. */
function compareIntervals(latest, prior) {
  if (latest.lower === null || latest.upper === null || prior.lower === null || prior.upper === null) return T.UNCLASSIFIED;
  return (latest.lower > prior.upper || prior.lower > latest.upper) ? T.SEPARATED : T.INSIDE_NOISE;
}

const TRANSITION_REASON = Object.freeze({
  [T.FIRST_LOOK]: 'One look is a reading, not a movement. Nothing can be said about direction until a second pack exists.',
  [T.STEADY]: 'The verdict did not change between the last two looks.',
  [T.SEPARATED]: 'The verdict changed and the two stored 95% intervals do not overlap — the only form of movement this ledger will call evidence.',
  [T.INSIDE_NOISE]: 'The verdict changed but the two stored 95% intervals overlap, so the change is not evidence of movement: the conservative end crossed the declared bar.',
  [T.RULER_MOVED]: 'The declared threshold changed between these two looks, so any apparent movement belongs to the ruler, not to the record.',
  [T.UNCLASSIFIED]: 'The verdict changed but at least one of the two readings carries no interval, so the change cannot be screened. It is printed unresolved rather than assumed either way.',
});

/**
 * The carry-forward read.
 *
 * `seatId` is accepted for parity with the other board reads and is recorded,
 * but it cannot redact anything: a board snapshot carries no person, note or
 * span name in the first place, and the claim register is public assertion.
 */
export function boardContinuity(state = {}, { now = new Date(), seatId = null } = {}) {
  const floor = BOARD_CONTINUITY.streakFloor;
  const looks = boardLooks(state);
  const dropped = Math.max(0, looks.length - BOARD_CONTINUITY.looks);
  const kept = dropped ? looks.slice(dropped) : looks;

  const claims = [];
  for (const declared of BOARD_CLAIMS) {
    const readings = [];
    for (const look of kept) {
      const reading = look.claims.get(declared.key);
      if (!reading) continue;
      readings.push({
        ...reading,
        at: look.at,
        day: look.day,
        cycle: look.cycle,
        revision: look.revision,
        memoId: look.memoId,
        status: look.status,
      });
    }
    if (!readings.length) continue;

    const latest = readings[readings.length - 1];
    const prior = readings.length > 1 ? readings[readings.length - 2] : null;

    let transition = T.FIRST_LOOK;
    if (prior) {
      if (latest.threshold !== null && prior.threshold !== null && latest.threshold !== prior.threshold) transition = T.RULER_MOVED;
      else if (latest.verdict === prior.verdict) transition = T.STEADY;
      else transition = compareIntervals(latest, prior);
    }

    let failingStreak = 0;
    for (let i = readings.length - 1; i >= 0; i -= 1) {
      if (readings[i].verdict !== 'failing') break;
      failingStreak += 1;
    }
    let unverifiedStreak = 0;
    for (let i = readings.length - 1; i >= 0; i -= 1) {
      if (!BOARD_CONTINUITY.unverified.includes(readings[i].verdict)) break;
      unverifiedStreak += 1;
    }
    let holdingStreak = 0;
    for (let i = readings.length - 1; i >= 0; i -= 1) {
      if (readings[i].verdict !== 'holding') break;
      holdingStreak += 1;
    }

    const recurring = failingStreak >= floor;
    const repeatedUnverified = unverifiedStreak >= floor;
    const carryReason = recurring && repeatedUnverified ? 'both' : (repeatedUnverified ? 'repeated-unverified' : (recurring ? 'recurring-failure' : null));
    // The oldest look in the CURRENT unbroken carry — what the chief would have
    // to tell the board if asked "how long has this been on the list?".
    const carryLength = Math.max(recurring ? failingStreak : 0, repeatedUnverified ? unverifiedStreak : 0);
    const firstCarried = carryLength ? readings[readings.length - carryLength] : null;

    claims.push({
      key: declared.key,
      label: declared.label,
      assertion: declared.assertion,
      module: declared.module,
      unit: declared.unit,
      comparator: declared.comparator,
      route: declared.route,
      looks: readings.length,
      latest,
      prior,
      readings,
      transition,
      transitionReason: TRANSITION_REASON[transition],
      movePp: latest.value !== null && prior && prior.value !== null ? round1(latest.value - prior.value) : null,
      gapPp: latest.value !== null && latest.threshold !== null ? round1(latest.value - latest.threshold) : null,
      failingStreak,
      unverifiedStreak,
      holdingStreak,
      carryForward: Boolean(carryReason),
      carryReason,
      carryLength,
      carriedSince: firstCarried ? firstCarried.day : null,
      lastMoved: transition === T.STEADY ? null : (prior ? latest.day : null),
    });
  }

  const byOrder = new Map(BOARD_CLAIMS.map((c, i) => [c.key, i]));
  const queue = claims
    .filter((c) => c.carryForward)
    .sort((a, b) => {
      // Constraint-first, and printed as such: the item that has been on the
      // board's list longest is dispatched first; ties break on the longer
      // current streak, then on the register's own order for determinism.
      if (a.carriedSince !== b.carriedSince) {
        if (a.carriedSince === null) return 1;
        if (b.carriedSince === null) return -1;
        return a.carriedSince < b.carriedSince ? -1 : 1;
      }
      if (a.carryLength !== b.carryLength) return b.carryLength - a.carryLength;
      return (byOrder.get(a.key) || 0) - (byOrder.get(b.key) || 0);
    });

  const slice = queue.slice(0, BOARD_CONTINUITY.queue);
  const counts = {
    looks: kept.length,
    looksTotal: looks.length,
    looksDropped: dropped,
    claimsTracked: claims.length,
    claimsNeverLooked: BOARD_CLAIMS.length - claims.length,
    firstLook: claims.filter((c) => c.transition === T.FIRST_LOOK).length,
    steady: claims.filter((c) => c.transition === T.STEADY).length,
    separated: claims.filter((c) => c.transition === T.SEPARATED).length,
    insideNoise: claims.filter((c) => c.transition === T.INSIDE_NOISE).length,
    rulerMoved: claims.filter((c) => c.transition === T.RULER_MOVED).length,
    unclassified: claims.filter((c) => c.transition === T.UNCLASSIFIED).length,
    carryForward: queue.length,
    recurringFailure: claims.filter((c) => c.carryReason === 'recurring-failure' || c.carryReason === 'both').length,
    repeatedUnverified: claims.filter((c) => c.carryReason === 'repeated-unverified' || c.carryReason === 'both').length,
    queueDeferred: Math.max(0, queue.length - slice.length),
    failingNow: claims.filter((c) => c.latest.verdict === 'failing').length,
    holdingNow: claims.filter((c) => c.latest.verdict === 'holding').length,
    unverifiedNow: claims.filter((c) => BOARD_CONTINUITY.unverified.includes(c.latest.verdict)).length,
  };

  const refusals = [];
  if (!looks.length) {
    refusals.push('No frozen or committed pack exists, so there is no continuity to read. Open a memo, look at it and commit it — a draft has no snapshot and nothing to carry forward.');
  } else if (looks.length === 1) {
    refusals.push('One pack is a reading, not a movement. Every claim is reported at its first look and no direction is claimed.');
  }
  for (const claim of claims) {
    if (claim.transition === T.UNCLASSIFIED) {
      refusals.push(`“${claim.label}” changed verdict between looks but one reading carries no interval, so the change is unresolved rather than adjudicated.`);
    }
  }
  if (counts.queueDeferred) {
    refusals.push(`${counts.queueDeferred} carry-forward item(s) are counted and not printed: the review queue is bounded at ${BOARD_CONTINUITY.queue}.`);
  }

  return {
    now,
    seatId: seatId || null,
    floor,
    queue,
    slice,
    claims,
    counts,
    looks: kept,
    refusals,
    transitions: T,
    method: BOARD_CONTINUITY.method,
    conventions: {
      streakFloor: floor,
      looksRead: BOARD_CONTINUITY.looks,
      queueCap: BOARD_CONTINUITY.queue,
      unverifiedVerdicts: BOARD_CONTINUITY.unverified.slice(),
    },
  };
}

/** Why a claim is carried, in the chief's own terms — never a person judgement. */
function carrySentence(claim) {
  const n = claim.carryLength;
  if (claim.carryReason === 'repeated-unverified') {
    return `This figure could not be produced in ${n} consecutive frozen packs. That is a measurement debt the organisation has had ${n} cycles to clear; it is not a finding about anyone.`;
  }
  if (claim.carryReason === 'both') {
    return `Failed in ${n} consecutive frozen packs AND was not producible in the same window — the board has seen this claim twice without a defensible number.`;
  }
  return `This claim has FAILED in ${n} consecutive frozen packs. The board has already seen it fail, so the next pack owes a movement or a stated reason there is none.`;
}

const VERDICT_LABEL = Object.freeze({
  holding: 'HOLDS', failing: 'FAILS', inconclusive: 'INCONCLUSIVE', withheld: 'WITHHELD', refused: 'REFUSED',
});
const pct = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${v}%`);

function figure(reading) {
  if (!reading) return 'no reading';
  if (reading.value === null) return reading.n ? `${reading.n} observation(s), rate withheld` : 'no reading';
  const interval = reading.lower !== null && reading.upper !== null ? ` (interval ${pct(reading.lower)}–${pct(reading.upper)})` : ' (no interval)';
  return `${pct(reading.value)}${interval}`;
}

/**
 * The ledger as text. Deterministic: the same stored snapshots produce the same
 * document, and it names no memo id, operator, span or person.
 */
export function boardCarryForwardText(state = {}, { now = new Date(), seatId = null } = {}) {
  const report = boardContinuity(state, { now, seatId });
  const { counts: c, slice, claims, refusals } = report;
  const lines = [];
  lines.push('BOARD CARRY-FORWARD LEDGER');
  if (!c.looks) {
    lines.push('');
    lines.push('No pack has been frozen. Nothing is carried forward and nothing is claimed.');
    lines.push('');
    lines.push(...refusals);
    return lines.join('\n');
  }
  lines.push(`Looks read: ${c.looks} of ${c.looksTotal} frozen snapshot(s) · oldest ${report.looks[0].day || '—'} · newest ${report.looks[report.looks.length - 1].day || '—'}${c.looksDropped ? ` · ${c.looksDropped} older look(s) outside the ${report.conventions.looksRead}-look window` : ''}`);
  lines.push(`Claims tracked: ${c.claimsTracked}${c.claimsNeverLooked ? ` · ${c.claimsNeverLooked} declared claim(s) never looked at` : ''}`);
  lines.push(`Carried forward: ${c.carryForward} · recurring failure: ${c.recurringFailure} · figure still not producible: ${c.repeatedUnverified} · carry floor: ${report.floor} consecutive packs (declared convention)`);
  lines.push(`Movement: ${c.separated} beyond its interval · ${c.insideNoise} inside noise · ${c.rulerMoved} because the bar moved · ${c.steady} steady · ${c.firstLook} at a first look`);
  lines.push('');
  lines.push('CARRY-FORWARD (oldest carry first)');
  if (!slice.length) {
    lines.push('- Nothing has carried for two consecutive packs. This is a statement about the packs, not about the organisation.');
  }
  for (const claim of slice) {
    const label = claim.carryReason === 'both' ? 'RECURRING FAILURE + NOT PRODUCIBLE'
      : claim.carryReason === 'repeated-unverified' ? 'FIGURE STILL NOT PRODUCIBLE' : 'RECURRING FAILURE';
    lines.push(`- [${label} · ${claim.carryLength} pack(s) · since ${claim.carriedSince || '—'}] ${claim.label}`);
    lines.push(`    ${claim.assertion}`);
    lines.push(`    Trail: ${claim.readings.map((r) => `${VERDICT_LABEL[r.verdict] || r.verdict} ${r.day || '—'}`).join(' · ')}`);
    lines.push(`    Latest figure: ${figure(claim.latest)} against a ${pct(claim.latest.threshold)} ${claim.comparator === 'gte' ? 'floor' : 'ceiling'}${claim.gapPp === null ? '' : ` · ${claim.gapPp >= 0 ? '+' : ''}${claim.gapPp}pp`}.`);
    if (claim.movePp !== null) lines.push(`    Movement against the previous look: ${claim.movePp >= 0 ? '+' : ''}${claim.movePp}pp (${claim.transition}).`);
    lines.push(`    Why it is on this list: ${carrySentence(claim)}`);
    lines.push(`    How the last two looks compare: ${claim.transitionReason}`);
  }
  if (c.queueDeferred) lines.push(`    ${c.queueDeferred} further carried claim(s) are counted and not printed (queue bounded at ${BOARD_CONTINUITY.queue}).`);
  lines.push('');
  lines.push('EVERY OTHER CLAIM');
  for (const claim of claims) {
    if (claim.carryForward) continue;
    lines.push(`- [${VERDICT_LABEL[claim.latest.verdict] || claim.latest.verdict}] ${claim.label} · ${claim.transition}${claim.movePp === null ? '' : ` · ${claim.movePp >= 0 ? '+' : ''}${claim.movePp}pp`}`);
  }
  if (refusals.length) {
    lines.push('');
    lines.push('REFUSALS');
    for (const reason of refusals) lines.push(`- ${reason}`);
  }
  lines.push('');
  lines.push('METHOD');
  for (const entry of report.method) lines.push(`- ${entry.name}: ${entry.note}`);
  return lines.join('\n');
}

/** One identity-free sentence for the upward brief. Cheap: snapshots only. */
export function boardContinuityBrief(state = {}, { now = new Date() } = {}) {
  const report = boardContinuity(state, { now });
  const c = report.counts;
  if (!c.looks) return 'Board carry-forward: no frozen pack exists, so nothing is carried forward.';
  if (c.looks === 1) return 'Board carry-forward: one pack frozen — a single look has no movement to report.';
  if (!c.carryForward && !c.separated) return `Board carry-forward across ${c.looks} packs: nothing carried and nothing moved beyond its interval.`;
  return `Board carry-forward across ${c.looks} packs: ${c.carryForward} claim(s) carried for ${report.floor}+ packs (${c.recurringFailure} recurring failure, ${c.repeatedUnverified} figure still not producible), ${c.separated} moved beyond its interval, ${c.insideNoise} moved inside noise.`;
}
