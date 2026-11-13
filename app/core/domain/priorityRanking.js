/**
 * app/core/domain/priorityRanking.js — the pure read model for the Cross-Line
 * Priority Ballot & Social-Choice Aggregation register (ADR-0191, Schema v151,
 * `#/matrix?panel=priority`, CSV scope #144).
 *
 * ONE reader. The panel, the CSV, the brief, the nav badge and `RULE-SOC-01`
 * all read `buildPriorityRanking`; none of them computes a pairwise count, a
 * winner, a cycle, a beatpath or a ranking of its own. Nothing here writes.
 *
 * WHAT IT DERIVES
 *  - per frozen line, its coverage: answered · pending · overdue · line-ended ·
 *    holder-moved · person-off-roster (silence is never a ranking);
 *  - the exact pairwise majority matrix over the cast ballots;
 *  - the Condorcet winner, or the proof that none exists;
 *  - the Schwartz top cycle (the smallest set nothing outside it beats);
 *  - the Schulze beatpath strengths (Floyd–Warshall on the margin graph) and
 *    the beatpath order, which orders a cyclic field without inventing a winner;
 *  - the exact Kemeny–Young ranking (full enumeration up to the declared cap),
 *    with a tie printed as a tie rather than broken;
 *  - the ballot-coverage rate with its Wilson interval, withheld below the floor;
 *  - per-holder and per-joint-apex roll-ups in which a round is counted ONCE
 *    however many lines reach the apex.
 *
 * WHAT IT REFUSES
 *  - an aggregate on fewer ballots than the declared floor (counts only);
 *  - a substituted voter: a line that ended or whose holder changed is counted
 *    and printed, and the new holder is never asked on the old holder's behalf;
 *  - a Kemeny ranking above the exactness cap, or when two rankings tie;
 *  - a winner for a cyclic field: the cycle is printed as a disagreement;
 *  - a person name outside the seat's visible population (the id is printed).
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixWilson } from './matrix.js';
import {
  PRIORITY_BALLOT_COVERAGE_BY_KEY,
  PRIORITY_BALLOT_ENGINE_VERSION,
  PRIORITY_BALLOT_LIMITS,
  PRIORITY_BALLOT_VERDICTS,
  PRIORITY_BALLOT_REFUSAL_BY_KEY,
  PRIORITY_BALLOT_SETTING_KEYS,
  PRIORITY_BALLOT_FRAMEWORKS,
  PRIORITY_BALLOT_METHOD,
  PRIORITY_BALLOT_METHODS,
} from './priorityRankingRegistry.js';
import { normalizePriorityBallotSettings } from './priorityRankingSchema.js';

const list = (value) => (Array.isArray(value) ? value : []);
const round1 = (n) => Math.round(n * 10) / 10;
const VERDICT = new Map(PRIORITY_BALLOT_VERDICTS.map((row) => [row.key, row]));

/* ------------------------------------------------------- social choice core */

/**
 * Exact pairwise counts over the cast ballots. `counts[a][b]` is the number of
 * ballots that put `a` above `b`; every ballot ranks every item, so
 * `counts[a][b] + counts[b][a] === ballots.length` for every pair.
 */
export function priorityPairCounts(ballots, itemKeys) {
  const counts = {};
  for (const a of itemKeys) {
    counts[a] = {};
    for (const b of itemKeys) counts[a][b] = 0;
  }
  for (const ballot of ballots) {
    const position = new Map(ballot.ranking.map((key, index) => [key, index]));
    for (const a of itemKeys) {
      for (const b of itemKeys) {
        if (a === b) continue;
        if ((position.get(a) ?? Infinity) < (position.get(b) ?? Infinity)) counts[a][b] += 1;
      }
    }
  }
  return counts;
}

/** The item that strictly beats every other item, or null. */
export function priorityCondorcet(counts, itemKeys) {
  for (const a of itemKeys) {
    let beatsAll = true;
    for (const b of itemKeys) {
      if (a === b) continue;
      if (!(counts[a][b] > counts[b][a])) { beatsAll = false; break; }
    }
    if (beatsAll) return a;
  }
  return null;
}

/** Strongly connected components of the strict-majority graph (Tarjan, iterative). */
function strictComponents(counts, itemKeys) {
  const edges = new Map(itemKeys.map((a) => [a, itemKeys.filter((b) => b !== a && counts[a][b] > counts[b][a])]));
  let index = 0;
  const indices = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  const strongConnect = (v) => {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) || []) {
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      components.push(component);
    }
  };
  for (const key of itemKeys) if (!indices.has(key)) strongConnect(key);
  // Condensation: a component HAS an incoming edge if any item outside it beats
  // an item inside it. The Schwartz set is the union of source components.
  const componentOf = new Map();
  components.forEach((component, i) => component.forEach((key) => componentOf.set(key, i)));
  const incoming = new Set();
  for (const a of itemKeys) {
    for (const b of edges.get(a) || []) {
      if (componentOf.get(a) !== componentOf.get(b)) incoming.add(componentOf.get(b));
    }
  }
  const source = components.filter((_, i) => !incoming.has(i)).flat();
  const order = new Map(itemKeys.map((key, i) => [key, i]));
  source.sort((a, b) => order.get(a) - order.get(b));
  return { components, schwartz: source };
}

/** The Schwartz top cycle: the smallest set no item outside it beats. */
export function prioritySchwartz(counts, itemKeys) {
  return strictComponents(counts, itemKeys).schwartz;
}

/**
 * Schulze beatpaths: the widest path between every ordered pair on the graph
 * whose edge weight is the majority margin (0 when the pair is not won). Floyd–
 * Warshall maximises the minimum edge on the path, exactly, in integers.
 */
export function prioritySchulze(counts, itemKeys) {
  const strength = {};
  for (const a of itemKeys) {
    strength[a] = {};
    for (const b of itemKeys) strength[a][b] = a === b ? 0 : (counts[a][b] > counts[b][a] ? counts[a][b] : 0);
  }
  for (const k of itemKeys) {
    for (const i of itemKeys) {
      for (const j of itemKeys) {
        if (i === j) continue;
        const through = Math.min(strength[i][k], strength[k][j]);
        if (through > strength[i][j]) strength[i][j] = through;
      }
    }
  }
  const beats = (a, b) => strength[a][b] > strength[b][a];
  let strictEdgesN = 0;
  for (const a of itemKeys) for (const b of itemKeys) if (a !== b && beats(a, b)) strictEdgesN += 1;
  // Kahn's algorithm over the strict beatpath relation, deterministic on the
  // frozen item order. The relation is transitive, so the result is a total
  // preorder; anything left in a cycle is appended and the flag is printed.
  const indegree = new Map(itemKeys.map((a) => [a, 0]));
  for (const a of itemKeys) for (const b of itemKeys) if (a !== b && beats(a, b)) indegree.set(b, indegree.get(b) + 1);
  const remaining = new Set(itemKeys);
  const order = [];
  while (remaining.size) {
    const next = itemKeys.find((key) => remaining.has(key) && indegree.get(key) === 0);
    if (next === undefined) break;
    order.push(next);
    remaining.delete(next);
    for (const b of itemKeys) if (b !== next && remaining.has(b) && beats(next, b)) indegree.set(b, indegree.get(b) - 1);
  }
  const incomplete = remaining.size > 0;
  for (const key of itemKeys) if (remaining.has(key)) order.push(key);
  const leader = itemKeys.find((a) => itemKeys.every((b) => b === a || beats(a, b))) || null;
  // A completely tied field has no strict beatpath relation at all: no order is
  // claimed rather than printing the frozen item order as though it were one.
  return {
    strength,
    order: strictEdgesN ? order : [],
    leader,
    incomplete,
    strict: strictEdgesN > 0,
    strictEdgesN,
    beats,
  };
}

/**
 * Exact Kemeny–Young ranking. Scores every permutation inside the declared cap
 * and returns the unique optimum, or the number of optima when two or more
 * rankings agree with the same number of ballot pairs.
 */
export function priorityKemeny(counts, itemKeys, cap = PRIORITY_BALLOT_LIMITS.kemenyMaxItems) {
  if (itemKeys.length > cap) return { state: 'capped', ranking: null, optimalN: null, score: null };
  const n = itemKeys.length;
  let best = null;
  let bestScore = -1;
  let bestRanking = null;
  let optimalN = 0;
  const used = new Array(n).fill(false);
  const current = [];
  const scoreOf = () => {
    let score = 0;
    for (let i = 0; i < current.length; i += 1) {
      for (let j = i + 1; j < current.length; j += 1) score += counts[current[i]][current[j]];
    }
    return score;
  };
  const walk = () => {
    if (current.length === n) {
      const score = scoreOf();
      if (score > bestScore) { bestScore = score; optimalN = 1; best = score; bestRanking = [...current]; }
      else if (score === bestScore) optimalN += 1;
      return;
    }
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      used[i] = true;
      current.push(itemKeys[i]);
      walk();
      current.pop();
      used[i] = false;
    }
  };
  walk();
  return optimalN === 1
    ? { state: 'unique', ranking: bestRanking, optimalN, score: best }
    : { state: 'tied', ranking: null, optimalN, score: best };
}

/* ---------------------------------------------------------------- helpers */

function nameLookup(state, matrix) {
  const former = new Map(list(state?.people).map((person) => [person.id, person.name]));
  return (id) => (id ? (matrix.nodes.get(id)?.name || former.get(id) || 'Former colleague') : '—');
}

function emptyLineRow(line, holderName) {
  return {
    lineKey: line.lineKey,
    holderId: line.managerId,
    holderName,
    kind: line.kind,
    role: line.role,
    shareH: line.shareH,
    state: 'pending',
    stateLabel: PRIORITY_BALLOT_COVERAGE_BY_KEY.pending.label,
    ballotId: null,
    castOn: null,
    ranking: null,
  };
}

/* ---------------------------------------------------------------- the read */

export function buildPriorityRanking(state, { now = new Date(), settings = null, seat = null } = {}) {
  const effective = settings || state?.settings || {};
  const conv = normalizePriorityBallotSettings(effective);
  const K = {
    ballotDueDays: conv[PRIORITY_BALLOT_SETTING_KEYS.ballotDueDays],
    askDueDays: conv[PRIORITY_BALLOT_SETTING_KEYS.askDueDays],
    minBallots: conv[PRIORITY_BALLOT_SETTING_KEYS.minBallots],
    auto: conv[PRIORITY_BALLOT_SETTING_KEYS.autoPropagate],
  };
  const today = dayKey(now);
  const matrix = buildMatrix(state, { now, settings: effective });
  const nameOfRaw = nameLookup(state, matrix);
  const operator = !seat || seat.fullAccess === true;
  const actorId = operator ? LEADER_ID : (seat.nodeId || seat.id);
  const reach = operator ? null : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
  const inReach = (id) => operator || id === actorId || reach.has(id);
  const detailLevel = operator ? 'full' : (seat.detailLevel || 'span');
  const personName = (id) => (detailLevel !== 'full' && !inReach(id) ? id : nameOfRaw(id));

  const rounds = list(state?.priorityRounds);
  const ballots = list(state?.priorityBallots);
  const ballotsByRound = new Map();
  for (const ballot of ballots) {
    if (!ballotsByRound.has(ballot.roundId)) ballotsByRound.set(ballot.roundId, []);
    ballotsByRound.get(ballot.roundId).push(ballot);
  }

  const portfolioById = new Map(list(state?.portfolio).map((item) => [item.id, item]));
  const refusalCounts = new Map();
  const refuse = (key, n = 1) => refusalCounts.set(key, (refusalCounts.get(key) || 0) + n);

  const rows = [];
  let excludedByDisclosure = 0;
  for (const round of rounds) {
    const personOnRoster = round.personId === LEADER_ID || matrix.roster.has(round.personId);
    const ballotRows = ballotsByRound.get(round.id) || [];
    const ballotByLine = new Map(ballotRows.map((ballot) => [ballot.lineKey, ballot]));
    const currentLines = new Map(list(matrix.linesByPerson.get(round.personId))
      .map((line) => [line.role === 'primary' ? 'home' : line.id, line]));

    const frozenLines = round.lineSnapshot.map((line) => {
      const row = emptyLineRow(line, personName(line.managerId));
      const ballot = ballotByLine.get(line.lineKey) || null;
      if (ballot) {
        row.state = 'answered';
        row.ballotId = ballot.id;
        row.castOn = ballot.castOn;
        row.ranking = ballot.ranking;
      } else if (!personOnRoster) {
        row.state = 'person-off-roster';
      } else {
        const live = currentLines.get(line.lineKey) || null;
        if (!live) row.state = 'line-ended';
        else if (live.managerId !== line.managerId) row.state = 'holder-moved';
        else if (today > round.dueOn) row.state = 'overdue';
        else row.state = 'pending';
      }
      row.stateLabel = PRIORITY_BALLOT_COVERAGE_BY_KEY[row.state].label;
      return row;
    });

    const answered = frozenLines.filter((line) => line.state === 'answered');
    const coverage = {
      answeredN: answered.length,
      pendingN: frozenLines.filter((line) => line.state === 'pending').length,
      overdueN: frozenLines.filter((line) => line.state === 'overdue').length,
      lineEndedN: frozenLines.filter((line) => line.state === 'line-ended').length,
      holderMovedN: frozenLines.filter((line) => line.state === 'holder-moved').length,
      offRosterN: frozenLines.filter((line) => line.state === 'person-off-roster').length,
      linesN: frozenLines.length,
    };
    const unresolvableN = coverage.lineEndedN + coverage.holderMovedN + coverage.offRosterN;
    if (unresolvableN) refuse('line-unreachable', unresolvableN);
    if (!personOnRoster) refuse('owner-off-roster');

    const itemKeys = round.itemSnapshot.map((item) => item.key);
    const itemRows = round.itemSnapshot.map((item) => {
      const live = item.sourceType === 'portfolio' ? portfolioById.get(item.sourceId) || null : null;
      const closed = !live || live.status !== 'open';
      if (closed) refuse('item-closed');
      return {
        key: item.key,
        title: item.title,
        closedOn: closed ? (live?.completedOn || live?.releasedOn || today) : null,
        live: !closed,
      };
    });

    const voteBallots = answered.map((line) => ({ ranking: line.ranking }));
    let verdict = 'insufficient';
    let pairwise = [];
    let condorcet = { winnerKey: null, exists: false };
    let schwartz = [];
    let schulze = { strength: {}, order: [], leader: null, incomplete: false, beats: () => false };
    let kemeny = { state: 'capped', ranking: null, optimalN: null, score: null };
    let counts = null;
    let cycleEdges = [];

    if (round.withdrawnOn) {
      verdict = 'withdrawn';
    } else if (frozenLines.length < 2) {
      verdict = 'inert';
    } else if (answered.length < K.minBallots) {
      verdict = 'insufficient';
      refuse('thin-ballots');
    } else {
      counts = priorityPairCounts(voteBallots, itemKeys);
      const winner = priorityCondorcet(counts, itemKeys);
      condorcet = { winnerKey: winner, exists: Boolean(winner) };
      schwartz = prioritySchwartz(counts, itemKeys);
      schulze = prioritySchulze(counts, itemKeys);
      kemeny = priorityKemeny(counts, itemKeys);
      if (kemeny.state === 'capped') refuse('kemeny-capped');
      if (kemeny.state === 'tied') refuse('kemeny-tied');
      verdict = winner ? 'condorcet' : 'cycle';
      const titleOf = (key) => round.itemSnapshot.find((item) => item.key === key)?.title || key;
      for (let i = 0; i < itemKeys.length; i += 1) {
        for (let j = i + 1; j < itemKeys.length; j += 1) {
          const a = itemKeys[i];
          const b = itemKeys[j];
          pairwise.push({
            aKey: a, bKey: b,
            aTitle: titleOf(a), bTitle: titleOf(b),
            ab: counts[a][b], ba: counts[b][a],
            margin: Math.abs(counts[a][b] - counts[b][a]),
            winnerKey: counts[a][b] > counts[b][a] ? a : (counts[b][a] > counts[a][b] ? b : null),
          });
        }
      }
      if (verdict === 'cycle') {
        const inCycle = new Set(schwartz);
        for (const a of schwartz) {
          for (const b of schwartz) {
            if (a === b || !inCycle.has(b)) continue;
            if (counts[a][b] > counts[b][a]) cycleEdges.push({ fromKey: a, toKey: b, margin: counts[a][b] - counts[b][a] });
          }
        }
      }
    }

    const verdictMeta = VERDICT.get(verdict);
    const row = {
      roundId: round.id,
      title: round.title,
      personId: round.personId,
      personName: personName(round.personId),
      personOnRoster,
      openedOn: round.openedOn,
      dueOn: round.dueOn,
      withdrawnOn: round.withdrawnOn,
      withdrawnReason: round.withdrawnReason,
      items: itemRows,
      itemsN: itemRows.length,
      itemsClosedN: itemRows.filter((item) => !item.live).length,
      lines: frozenLines,
      coverage,
      unresolvableN,
      votesN: answered.length,
      ballots: answered.map((line) => ({
        lineKey: line.lineKey,
        holderId: line.holderId,
        holderName: line.holderName,
        castOn: line.castOn,
        ranking: (line.ranking || []).map((key, index) => ({
          key,
          rank: index + 1,
          title: round.itemSnapshot.find((item) => item.key === key)?.title || key,
        })),
      })),
      verdict,
      verdictLabel: verdictMeta.label,
      verdictTone: verdictMeta.tone,
      verdictSays: verdictMeta.says,
      pairwise,
      condorcet,
      schwartz,
      schulze: {
        order: schulze.order,
        leaderKey: schulze.leader,
        uniqueLeader: Boolean(schulze.leader),
        strict: Boolean(schulze.strict),
        strictEdgesN: schulze.strictEdgesN || 0,
        incomplete: Boolean(schulze.incomplete),
        strengths: schulze.order.map((a) => ({ key: a, row: schulze.order.map((b) => schulze.strength?.[a]?.[b] ?? 0) })),
      },
      kemeny,
      cycleEdges,
      countsReconcile: frozenLines.length === coverage.answeredN + coverage.pendingN + coverage.overdueN + coverage.lineEndedN + coverage.holderMovedN + coverage.offRosterN,
    };
    if (detailLevel !== 'full' && !inReach(round.personId) && !frozenLines.some((line) => line.holderId === actorId)) {
      excludedByDisclosure += 1;
      refuse('below-disclosure');
      continue;
    }
    rows.push(row);
  }

  if (excludedByDisclosure) refuse('below-disclosure', excludedByDisclosure);

  const shown = rows.slice(0, PRIORITY_BALLOT_LIMITS.roundsShown);
  if (rows.length > shown.length) refuse('truncated', rows.length - shown.length);

  /* Totals are computed over EVERY live round, never over the printed rows. A
     WITHDRAWN round owes nothing: its ballots stay on the record as history and
     are printed on their own row, but they are not charged to the coverage rate
     of rounds that are still asking for an answer. */
  const liveRows = rows.filter((row) => row.verdict !== 'withdrawn');
  const totals = {
    roundsN: rows.length,
    withdrawnN: rows.length - liveRows.length,
    inertN: liveRows.filter((row) => row.verdict === 'inert').length,
    insufficientN: liveRows.filter((row) => row.verdict === 'insufficient').length,
    condorcetN: liveRows.filter((row) => row.verdict === 'condorcet').length,
    cycleN: liveRows.filter((row) => row.verdict === 'cycle').length,
    liveN: liveRows.length,
    linesAskedN: liveRows.reduce((sum, row) => sum + row.coverage.linesN, 0),
    answeredN: liveRows.reduce((sum, row) => sum + row.coverage.answeredN, 0),
    pendingN: liveRows.reduce((sum, row) => sum + row.coverage.pendingN, 0),
    overdueN: liveRows.reduce((sum, row) => sum + row.coverage.overdueN, 0),
    unresolvableN: liveRows.reduce((sum, row) => sum + row.unresolvableN, 0),
    itemsN: liveRows.reduce((sum, row) => sum + row.itemsN, 0),
    itemsClosedN: liveRows.reduce((sum, row) => sum + row.itemsClosedN, 0),
  };
  const coverageRate = totals.linesAskedN >= K.minBallots
    ? (() => {
      const interval = matrixWilson(totals.answeredN, totals.linesAskedN);
      return {
        pct: round1((totals.answeredN / totals.linesAskedN) * 100),
        low: interval.lower,
        high: interval.upper,
        withheld: false,
        reason: null,
      };
    })()
    : {
      pct: null, low: null, high: null, withheld: true,
      reason: `${totals.linesAskedN} frozen line(s) is fewer than the declared ballot floor of ${K.minBallots}; the counts are printed and the coverage rate is withheld.`,
    };

  const countsReconcile = rows.every((row) => row.countsReconcile);
  const figuresComplete = countsReconcile && matrix.defects.length === 0 && rows.length === rounds.length;
  if (matrix.defects.length) refuse('matrix-defect', matrix.defects.length);
  const claimReason = figuresComplete
    ? null
    : matrix.defects.length
      ? `${matrix.defects.length} reporting line(s) were refused by the matrix engine; every roll-up that crosses one is printed as incomplete.`
      : !countsReconcile
        ? 'At least one round’s frozen-line coverage does not add up to its frozen line count.'
        : 'Some rounds are withheld at this seat’s disclosure level.';

  /* Roll-ups: per holder (the seat that owed a ballot) and per joint apex. */
  const holderMap = new Map();
  const apexMap = new Map();
  for (const row of rows) {
    if (row.verdict === 'withdrawn') continue;
    const seenApex = new Set();
    for (const line of row.lines) {
      const holderId = line.holderId;
      if (!holderMap.has(holderId)) holderMap.set(holderId, { holderId, holderName: personName(holderId), roundsN: 0, answeredN: 0, owedN: 0, cycleN: 0 });
      const entry = holderMap.get(holderId);
      entry.roundsN += 1;
      entry.owedN += 1;
      if (line.state === 'answered') entry.answeredN += 1;
      if (row.verdict === 'cycle') entry.cycleN += 1;
    }
    const apex = matrixJointApex(matrix, row.lines.map((line) => line.holderId));
    const apexKey = apex.unique ? apex.apexId : `ambiguous:${[...new Set(row.lines.map((line) => line.holderId))].sort().join('|')}`;
    if (seenApex.has(apexKey)) continue; // one round, one apex row — never two
    seenApex.add(apexKey);
    if (!apexMap.has(apexKey)) {
      apexMap.set(apexKey, {
        apexKey,
        apexId: apex.unique ? apex.apexId : null,
        apexName: apex.unique ? personName(apex.apexId) : null,
        unique: apex.unique,
        ambiguous: apex.ambiguous,
        disconnected: apex.disconnected,
        roundsN: 0,
        cycleN: 0,
        answeredN: 0,
        linesN: 0,
      });
    }
    const entry = apexMap.get(apexKey);
    entry.roundsN += 1;
    entry.linesN += row.lines.length;
    entry.answeredN += row.coverage.answeredN;
    if (row.verdict === 'cycle') entry.cycleN += 1;
  }

  const refusals = [...refusalCounts.entries()]
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      reason: PRIORITY_BALLOT_REFUSAL_BY_KEY[key]?.says || 'A read was withheld.',
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const board = {
    ...totals,
    ballotsCastN: totals.answeredN,
    roundsShownN: shown.length,
    coveragePct: coverageRate.pct,
    coverageLowPct: coverageRate.low,
    coverageHighPct: coverageRate.high,
    coverageWithheld: coverageRate.withheld,
    coverageWithheldReason: coverageRate.reason,
    countsReconcile,
    figuresComplete,
    claimReason,
    matrixDefectsN: matrix.defects.length,
    refusalsN: refusals.reduce((sum, row) => sum + row.count, 0),
    attentionN: totals.cycleN + totals.overdueN,
    detailLevel,
  };

  const conventions = [
    { key: 'ballotDueDays', label: 'Ballot deadline', value: K.ballotDueDays, detail: `${K.ballotDueDays} day(s) after the round opens, unless the round names its own date.` },
    { key: 'askDueDays', label: 'Follow-up ask window', value: K.askDueDays, detail: `An overdue ballot or a majority cycle files an ask due within ${K.askDueDays} day(s).` },
    { key: 'minBallots', label: 'Ballot floor', value: K.minBallots, detail: `Fewer than ${K.minBallots} ballots prints counts only; no winner, cycle or ranking is claimed.` },
  ];

  return {
    engineVersion: PRIORITY_BALLOT_ENGINE_VERSION,
    generatedOn: today,
    today,
    seat: { operator, actorId, detailLevel },
    settings: conv,
    conventions,
    methods: PRIORITY_BALLOT_METHODS.map((row) => ({ key: row.key, label: row.label, says: row.says })),
    frameworks: PRIORITY_BALLOT_FRAMEWORKS.map((row) => ({ key: row.key, label: row.label, detail: row.says })),
    method: [PRIORITY_BALLOT_METHOD.unit, PRIORITY_BALLOT_METHOD.snapshot, PRIORITY_BALLOT_METHOD.ballot, PRIORITY_BALLOT_METHOD.aggregate, PRIORITY_BALLOT_METHOD.escalation, PRIORITY_BALLOT_METHOD.notSaid],
    board,
    rounds: shown,
    rollups: {
      holders: [...holderMap.values()].sort((a, b) => b.owedN - a.owedN || a.holderName.localeCompare(b.holderName)),
      apexes: [...apexMap.values()].sort((a, b) => b.cycleN - a.cycleN || b.roundsN - a.roundsN || String(a.apexKey).localeCompare(String(b.apexKey))),
    },
    refusals,
    internal: { matrix, nameOf: personName, today, allRounds: rows },
  };
}

/* ------------------------------------------------------------------- prose */

export function priorityBallotBriefText(report) {
  const b = report.board;
  const coverage = b.coverageWithheld
    ? `Ballot coverage is withheld: ${b.coverageWithheldReason}`
    : `Ballot coverage is ${b.coveragePct}% (95% CI ${b.coverageLowPct}–${b.coverageHighPct}%) over ${b.linesAskedN} frozen line(s).`;
  return [
    `Cross-line priority ballots, ${report.generatedOn}: ${b.roundsN} round(s) on the record, ${b.liveN} live, ${b.withdrawnN} withdrawn.`,
    `${b.linesAskedN} line(s) were asked for a ballot and ${b.answeredN} cast one (${b.pendingN} not yet due, ${b.overdueN} overdue, ${b.unresolvableN} unreachable because the line ended, its holder changed or the owner left the roster).`,
    coverage,
    `${b.condorcetN} round(s) produced a Condorcet winner; ${b.cycleN} hold a genuine majority cycle and are routed to the lines' lowest joint apex; ${b.insufficientN} have too few ballots for any aggregate and ${b.inertN} concern a person with a single line.`,
    b.figuresComplete
      ? 'Counts reconcile and the printed figures are the computed figures.'
      : `The figures are NOT complete: ${b.claimReason}`,
    'No score is aggregated, no person is rated and no cycle is broken silently.',
  ].join(' ');
}

/* --------------------------------------------------------------------- CSV */

export function priorityBallotCsvRows(report) {
  const b = report.board;
  const base = {
    generated_on: report.generatedOn,
    rounds_n: b.roundsN,
    live_rounds_n: b.liveN,
    withdrawn_n: b.withdrawnN,
    rounds_with_condorcet_n: b.condorcetN,
    rounds_with_cycle_n: b.cycleN,
    rounds_insufficient_n: b.insufficientN,
    rounds_inert_n: b.inertN,
    lines_asked_n: b.linesAskedN,
    ballots_cast_n: b.ballotsCastN,
    answered_n: b.answeredN,
    pending_n: b.pendingN,
    overdue_n: b.overdueN,
    unresolvable_n: b.unresolvableN,
    items_frozen_n: b.itemsN,
    items_closed_n: b.itemsClosedN,
    min_ballots: report.settings[PRIORITY_BALLOT_SETTING_KEYS.minBallots],
    ballot_due_days: report.settings[PRIORITY_BALLOT_SETTING_KEYS.ballotDueDays],
    ask_due_days: report.settings[PRIORITY_BALLOT_SETTING_KEYS.askDueDays],
    coverage_pct: b.coveragePct,
    coverage_withheld_reason: b.coverageWithheldReason,
    counts_reconcile: b.countsReconcile,
    figures_complete: b.figuresComplete,
    claim_reason: b.claimReason,
    engine_version: report.engineVersion,
  };
  const rows = [{
    ...base,
    row_type: 'workspace',
    key: 'workspace',
    label: 'Workspace summary',
  }];
  for (const verdict of PRIORITY_BALLOT_VERDICTS) {
    const count = {
      withdrawn: b.withdrawnN, inert: b.inertN, insufficient: b.insufficientN,
      condorcet: b.condorcetN, cycle: b.cycleN,
    }[verdict.key] ?? 0;
    rows.push({ ...base, row_type: 'verdict', key: verdict.key, label: verdict.label, rounds_n: count });
  }
  for (const state of ['answered', 'pending', 'overdue', 'line-ended', 'holder-moved', 'person-off-roster']) {
    const count = {
      answered: b.answeredN, pending: b.pendingN, overdue: b.overdueN,
      'line-ended': report.rounds.reduce((sum, row) => sum + row.coverage.lineEndedN, 0),
      'holder-moved': report.rounds.reduce((sum, row) => sum + row.coverage.holderMovedN, 0),
      'person-off-roster': report.rounds.reduce((sum, row) => sum + row.coverage.offRosterN, 0),
    }[state] ?? 0;
    rows.push({ ...base, row_type: 'coverage', key: state, label: PRIORITY_BALLOT_COVERAGE_BY_KEY[state]?.label || state, lines_asked_n: count });
  }
  for (const refusal of report.refusals) {
    rows.push({ ...base, row_type: 'refusal', key: refusal.key, label: refusal.reason, unresolvable_n: refusal.count });
  }
  return rows;
}
