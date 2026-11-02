/**
 * app/core/domain/chain.js — the Command Chain engine (`#/chain`, Schema v82).
 *
 * Pure: no DOM, no storage, no wall-clock globals, no unseeded randomness. Every
 * function takes `now`. Everything is derived on read from records the workspace
 * already holds, so a reading can never drift away from the record it describes.
 *
 * THE THREE COMPUTATIONS
 * ----------------------
 *  1. THE CHAIN. `person.managerId` is already a real tree in this workspace: a
 *     report of the workspace leader has no manager, and anyone else points at a
 *     person. This module reads that tree — decayed pointers, cycles and spans
 *     included — and assigns every node an altitude from its recorded level,
 *     escalating a person who has reports but no manager title to the frontline
 *     altitude with a printed reason, because a person with reports is doing a
 *     lead's work whatever their title says.
 *
 *  2. RESPONSIBILITY. Work is owned by the leader of the people it concerns. For
 *     one person that is their manager; for several it is the *lowest common
 *     ancestor* of their managers — the smallest span that contains everyone the
 *     item touches. Nothing about that is a judgement call: it is a property of
 *     the tree, and it is why cross-unit work rises without anyone escalating it
 *     by hand.
 *
 *  3. THE CLOCK. Each altitude has a time span (Jaques): the longest its work can
 *     run without review. An item whose age has passed its owner's span belongs
 *     to the level above. `requiredAltitude` is the higher of the altitude its
 *     consequence places it at and the altitude its age places it at, so an item
 *     can be misrouted by *what it touches* or by *how long it has sat there*.
 *
 * WHAT THE ROLL-UP REFUSES
 * ------------------------
 *  - A rate below the evidence floor is withheld with a printed reason, not
 *    shown as a proportion of four. A cell of one identifies a person.
 *  - A pooled rate and the mean of unit rates are BOTH printed. When they differ
 *    by more than the declared materiality bar, the reading is marked
 *    composition-sensitive and the crude comparison is shown beside a directly
 *    standardised one, because a unit with a different mix of work is not
 *    comparable on a crude rate — that is Simpson's paradox, not a ranking.
 *  - A probability that the record cannot support (an item already older than
 *    every item this workspace has ever seen close) is refused by name.
 *
 * WHAT IT NEVER READS
 * -------------------
 * `conflicts` and `pulses` are forbidden endpoints in the shared link contract
 * and are never harvested here. A confidential conflict record and an anonymous
 * pulse response must not become an input to an org chart.
 */

import { addDays, dayKey, daysBetween, mean, round, toDate } from '../time.js';
import {
  ALTITUDES,
  CHAIN_LIMITS,
  LEVEL_ALTITUDE,
  RATE_METRICS,
  SIGNAL_SOURCES,
  altitudeByKey,
  altitudeByRank,
  altitudeRank,
  signalSource,
} from './chainRegistry.js';
import { chainConventions } from './chainSchema.js';

/* ------------------------------------------------------------------ utils */

const LEADER_ID = 'leader';

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function readPath(obj, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), obj);
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function median(values) {
  const nums = (values || []).filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : round((nums[mid - 1] + nums[mid]) / 2, 1);
}

function pctOf(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return round((num / den) * 100, 1);
}

/* ------------------------------------------------------- 1. the chain tree */

/**
 * Read the reporting tree out of the roster.
 *
 * Returns a tree that is *always acyclic and always rooted*, plus the findings
 * that describe why the raw data was not. A cycle is not repaired by deleting a
 * person: both people are kept, the loop is broken at the entry point for
 * aggregation purposes, and the defect is reported so a human can fix the
 * roster. Silent repair of a reporting line would be inventing an organisation.
 */
export function buildChain(state, { now = new Date(), settings = null } = {}) {
  const conventions = chainConventions(settings || state?.settings || {});
  const people = (Array.isArray(state?.people) ? state.people : []).filter((p) => p && p.id && p.status !== 'archived');
  const byId = new Map();
  for (const person of people) {
    byId.set(person.id, {
      id: person.id,
      name: person.name || 'Unnamed',
      role: person.role || '',
      team: person.team || '',
      level: person.level || 'ic',
      isLeader: false,
      rawManagerId: person.managerId || null,
      parentId: null,
      childIds: [],
      depth: 0,
      subtreeIds: [],
      span: 0,
      altitude: null,
      altitudeReason: '',
      reachable: true,
      inCycle: false,
    });
  }

  const leader = {
    id: LEADER_ID,
    name: conventions.leaderName || state?.settings?.leaderName || 'You',
    role: 'Workspace leader',
    team: state?.settings?.teamName || 'My team',
    level: null,
    isLeader: true,
    rawManagerId: null,
    parentId: null,
    childIds: [],
    depth: 0,
    subtreeIds: [],
    span: 0,
    altitude: conventions.chainLeaderAltitude,
    altitudeReason: 'declared in Settings — the workspace leader holds no roster record',
    reachable: true,
    inCycle: false,
  };
  const nodes = new Map(byId);
  nodes.set(LEADER_ID, leader);

  const findings = [];

  /* Raw parent resolution: a pointer at an archived or missing person is an
     orphan and attaches to the workspace leader, which is where an unmanaged
     report actually sits. */
  for (const node of byId.values()) {
    const raw = node.rawManagerId;
    if (!raw) {
      node.parentId = LEADER_ID;
      continue;
    }
    if (raw === node.id) {
      node.inCycle = true;
      node.parentId = LEADER_ID;
      findings.push({
        key: 'self-manager',
        severity: 3,
        nodeId: node.id,
        title: 'A person is recorded as their own manager',
        detail: `${node.name} points at themselves in the reporting line. The line was treated as the workspace leader's so the tree stays acyclic; the roster entry needs fixing, not the reading.`,
      });
      continue;
    }
    if (!nodes.has(raw)) {
      node.parentId = LEADER_ID;
      findings.push({
        key: 'orphan',
        severity: 2,
        nodeId: node.id,
        title: 'A reporting line points at someone who is not on the roster',
        detail: `${node.name} reports to a person who is missing or archived. The line was anchored to the workspace leader for aggregation only — nothing about the person's work changed.`,
      });
      continue;
    }
    node.parentId = raw;
  }

  /* Cycle detection: walk up from each node; a revisit inside one walk is a loop.
     Every member of the loop is reported and the loop is attached to the leader
     so aggregation terminates. */
  const cycleMembers = new Set();
  for (const node of byId.values()) {
    const seen = new Set([node.id]);
    let cursor = node.parentId;
    while (cursor && cursor !== LEADER_ID) {
      if (seen.has(cursor)) {
        for (const id of seen) cycleMembers.add(id);
        break;
      }
      seen.add(cursor);
      cursor = nodes.get(cursor)?.parentId || null;
    }
  }
  if (cycleMembers.size) {
    for (const id of cycleMembers) {
      const node = nodes.get(id);
      node.inCycle = true;
      if (node.parentId && cycleMembers.has(node.parentId)) node.parentId = LEADER_ID;
    }
    findings.push({
      key: 'cycle',
      severity: 3,
      nodeId: [...cycleMembers][0],
      title: 'The reporting lines contain a loop',
      detail: `${cycleMembers.size} person(s) form a reporting cycle, so no one in it has a line to the top. The loop was broken at its entry point for aggregation and every member was kept; a cycle in a real roster is a structural defect nobody can escalate out of.`,
    });
  }

  /* Children, depth (BFS) and subtrees (DFS). Iterative, so a pathological
     chain cannot blow the stack. */
  for (const node of nodes.values()) node.childIds = [];
  for (const node of nodes.values()) {
    if (node.id === LEADER_ID) continue;
    const parent = nodes.get(node.parentId) || nodes.get(LEADER_ID);
    node.parentId = parent.id;
    parent.childIds.push(node.id);
  }
  const order = [];
  const queue = [LEADER_ID];
  const seenDepth = new Set([LEADER_ID]);
  while (queue.length) {
    const id = queue.shift();
    const node = nodes.get(id);
    order.push(id);
    for (const childId of node.childIds) {
      if (seenDepth.has(childId)) continue;
      seenDepth.add(childId);
      const child = nodes.get(childId);
      child.depth = node.depth + 1;
      queue.push(childId);
    }
  }
  for (const node of nodes.values()) if (!seenDepth.has(node.id)) node.reachable = false;

  const subtreeOf = (id) => {
    const out = [];
    const stack = [id];
    const visited = new Set();
    while (stack.length) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      out.push(current);
      for (const childId of nodes.get(current)?.childIds || []) stack.push(childId);
    }
    return out;
  };
  for (const node of nodes.values()) {
    node.span = node.childIds.length;
    node.subtreeIds = subtreeOf(node.id);
  }

  /* Altitude assignment. A title is a claim; a span is evidence. A person with
     reports is promoted to the frontline altitude when their title carries none,
     and a manager-or-above title with no reports is reported rather than
     demoted: the workspace cannot tell whether that is a vacancy, a new role or
     a stale title, and guessing would invent an org chart. */
  for (const node of byId.values()) {
    const mapped = LEVEL_ALTITUDE[node.level] ?? null;
    if (node.span > 0) {
      if (mapped) {
        node.altitude = mapped;
        node.altitudeReason = `title “${node.level}” with ${node.span} direct report(s)`;
      } else {
        node.altitude = 'frontline';
        node.altitudeReason = `no management title, but ${node.span} direct report(s) — a span is evidence of a lead's job`;
        findings.push({
          key: 'span-without-title',
          severity: 1,
          nodeId: node.id,
          title: 'Someone leads people without a leadership title',
          detail: `${node.name} carries the level “${node.level}” and ${node.span} direct report(s). The chain reads them at the frontline altitude because that is the work they are doing; the title is a separate problem.`,
        });
      }
    } else if (mapped) {
      node.altitude = mapped;
      node.altitudeReason = `title “${node.level}” with no direct reports`;
      findings.push({
        key: 'title-without-span',
        severity: 2,
        nodeId: node.id,
        title: 'A leadership title with no one reporting into it',
        detail: `${node.name} is recorded as “${node.level}” and has no direct reports. That may be a vacancy, a role about to be filled, or a stale title — the workspace cannot tell, so the chain reports it rather than inventing a span.`,
      });
    } else {
      node.altitude = null;
      node.altitudeReason = 'an individual contributor: no reports, no altitude';
    }
  }

  /* Structural findings: span band, depth, and title inversion (a node whose
     reports hold a higher altitude than the node itself). */
  for (const node of nodes.values()) {
    if (node.span > 0 && (node.span < conventions.chainSpanMin || node.span > conventions.chainSpanMax)) {
      findings.push({
        key: 'span-band',
        severity: node.span > conventions.chainSpanMax ? 2 : 1,
        nodeId: node.id,
        title: node.span > conventions.chainSpanMax ? 'Span of control above the declared band' : 'Span of control below the declared band',
        detail: `${node.name} holds ${node.span} direct report(s) against a declared band of ${conventions.chainSpanMin}–${conventions.chainSpanMax}. Graicunas (1933) and Urwick (1956) are conventions, not laws — but a span outside the band you declared is a decision you have not made on purpose.`,
      });
    }
    const ownRank = altitudeRank(node.altitude);
    for (const childId of node.childIds) {
      const child = nodes.get(childId);
      const childRank = altitudeRank(child.altitude);
      if (ownRank && childRank > ownRank) {
        findings.push({
          key: 'level-inversion',
          severity: 3,
          nodeId: childId,
          title: 'A more senior title reporting into a more junior one',
          detail: `${child.name} (${child.altitude}) reports to ${node.name} (${node.altitude}). Either the title or the line is wrong, and both possibilities change who is accountable for what — the chain will not guess which.`,
        });
      }
    }
    if (node.depth > conventions.chainMaxDepth) {
      findings.push({
        key: 'depth',
        severity: 2,
        nodeId: node.id,
        title: 'The chain is deeper than the declared layer limit',
        detail: `${node.name} sits ${node.depth} layers below the workspace leader against a declared limit of ${conventions.chainMaxDepth}. Every extra layer is a hop a decision must travel before anyone with authority sees it.`,
      });
    }
  }

  /* De-duplicate findings by key + node (one record can violate two rules). */
  const seenFinding = new Set();
  const uniqueFindings = findings.filter((finding) => {
    const key = `${finding.key}:${finding.nodeId || ''}:${finding.title}`;
    if (seenFinding.has(key)) return false;
    seenFinding.add(key);
    return true;
  });

  const leadershipNodes = [...nodes.values()].filter((node) => node.span > 0);
  const represented = ALTITUDES.filter((altitude) => [...nodes.values()].some((node) => node.altitude === altitude.key));

  return {
    conventions,
    nodes,
    leader,
    byId,
    order,
    findings: uniqueFindings,
    leadershipNodes,
    representedAltitudes: represented.map((a) => a.key),
    counts: {
      people: byId.size,
      nodes: nodes.size,
      spanning: leadershipNodes.length,
      depth: Math.max(0, ...order.map((id) => nodes.get(id).depth)),
      altitudes: represented.length,
    },
    now,
  };
}

/** Parent node id used for aggregation (never null; the leader is the root). */
function parentNodeId(chain, id) {
  if (id === LEADER_ID) return null;
  const node = chain.nodes.get(id);
  return node?.parentId || LEADER_ID;
}

/** Deepest node that is an ancestor-or-self of every id in `ids`. */
export function lowestCommonAncestor(chain, ids) {
  const clean = [...new Set((ids || []).filter((id) => chain.nodes.has(id)))];
  if (!clean.length) return LEADER_ID;
  if (clean.length === 1) return clean[0];
  const ancestorsOf = (id) => {
    const out = [];
    let cursor = id;
    const guard = new Set();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      out.push(cursor);
      cursor = parentNodeId(chain, cursor);
    }
    return out;
  };
  const first = ancestorsOf(clean[0]);
  for (const other of clean.slice(1)) {
    const set = new Set(ancestorsOf(other));
    for (let i = 0; i < first.length; i += 1) {
      if (!set.has(first[i])) continue;
      return first[i];
    }
  }
  return LEADER_ID;
}

/** The leader responsible for a person: their manager, or the workspace leader. */
export function managerNodeId(chain, personId) {
  const node = chain.nodes.get(personId);
  if (!node || node.id === LEADER_ID) return LEADER_ID;
  return node.parentId || LEADER_ID;
}

/**
 * The leader who owns work about these people. One person → their manager.
 * Several → the LCA of their managers. None → the workspace leader.
 */
export function responsibleNodeId(chain, peopleIds) {
  const people = [...new Set((peopleIds || []).filter((pid) => pid && chain.byId.has(pid)))];
  if (!people.length) return LEADER_ID;
  return lowestCommonAncestor(chain, people.map((pid) => managerNodeId(chain, pid)));
}

/* ---------------------------------------------------- 2. the work on record */

function isOpenFor(source, record) {
  const when = source.openWhen;
  if (!when) return false;
  const value = readPath(record, when.path);
  if (when.kind === 'in') return when.values.includes(value);
  if (when.kind === 'empty') return value === '' || value === null || value === undefined;
  if (when.kind === 'falsy') {
    if (when.requires) {
      const required = readPath(record, when.requires);
      if (required === null || required === undefined || required === '') return false;
    }
    return !value;
  }
  return false;
}

function severityWeight(source, record) {
  if (!source.severity || !source.severity.path) return 1;
  const raw = readPath(record, source.severity.path);
  if (source.severity.max === 'irreversible') return raw === 'irreversible' ? 3 : 1;
  if (source.severity.max === 'off-track') return raw === 'off-track' ? 3 : raw === 'at-risk' ? 2 : 1;
  if (source.severity.max === 'breached') return raw === 'breached' ? 3 : raw === 'watch' ? 2 : 1;
  if (source.severity.max === 'cost') {
    const cost = Number(raw);
    if (!Number.isFinite(cost) || cost <= 0) return 1;
    return cost > 500 ? 3 : 2;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n >= 8) return 3;
  if (n >= 5) return 2;
  return 1;
}

function peopleFrom(source, record, chain) {
  const out = [];
  for (const spec of source.peoplePaths || []) {
    const value = readPath(record, spec.path);
    if (spec.many) {
      if (Array.isArray(value)) out.push(...value.filter((pid) => chain.byId.has(pid)));
    } else if (value && chain.byId.has(value)) {
      out.push(value);
    }
  }
  return [...new Set(out)];
}

/** The altitude an age places an item at: the first altitude whose span covers it. */
export function altitudeForAge(ageDays) {
  if (!Number.isFinite(ageDays)) return ALTITUDES[0];
  for (const altitude of ALTITUDES) {
    if (ageDays <= altitude.horizonDays) return altitude;
  }
  return ALTITUDES[ALTITUDES.length - 1];
}

/**
 * Harvest every open item the workspace holds into one list, each attributed to
 * the leader whose span contains the people it concerns.
 *
 * `derived: 'cadence'` sources are computed per person rather than per record:
 * the question is "has this person had a conversation inside the cadence", and
 * counting missed rows would count the absences of a meeting that never got
 * scheduled in the first place.
 */
export function harvestWork(state, chain, { now = new Date(), settings = null } = {}) {
  const conventions = chainConventions(settings || state?.settings || {});
  const cadenceDays = clampInt(state?.settings?.oneOnOneCadenceDays, 1, 90, 7);
  const nowDay = dayKey(now);
  const items = [];

  const push = (source, record, openedOn, dueOn, people) => {
    const ageDays = daysBetween(openedOn, nowDay);
    if (ageDays === null) return;
    const ownerNodeId = responsibleNodeId(chain, people);
    const ownerNode = chain.nodes.get(ownerNodeId);
    const ownerAltitude = ownerNode?.altitude || null;
    const ageAltitude = altitudeForAge(ageDays);
    const requiredRank = Math.max(altitudeRank(ownerAltitude), ageAltitude.rank);
    const requiredAltitude = altitudeByRank(requiredRank) || ageAltitude;
    const overdueDays = dueOn ? daysBetween(dueOn, nowDay) : null;
    items.push({
      type: source.key,
      typeLabel: source.label,
      unit: source.unit,
      entityId: record.id,
      title: source.derived === 'cadence'
        ? `1:1 with ${chain.byId.get(record.personId)?.name || 'a team member'}`
        : record.title || record.label || source.singular,
      openedOn,
      ageDays: Math.max(0, ageDays),
      dueOn: dueOn || null,
      overdueDays: overdueDays !== null && overdueDays > 0 ? overdueDays : 0,
      people,
      ownerNodeId,
      ownerAltitude,
      ownerRank: altitudeRank(ownerAltitude),
      ageAltitude: ageAltitude.key,
      requiredAltitude: requiredAltitude.key,
      requiredRank,
      severity: severityWeight(source, record),
      route: source.route,
      sensitive: source.sensitive === true,
    });
  };

  for (const source of SIGNAL_SOURCES) {
    if (source.derived === 'cadence') {
      const meetings = Array.isArray(state?.oneOnOnes) ? state.oneOnOnes : [];
      const lastHeld = new Map();
      for (const meeting of meetings) {
        if (!meeting || meeting.status !== 'held' || !meeting.personId) continue;
        const current = lastHeld.get(meeting.personId);
        if (!current || String(meeting.date) > String(current)) lastHeld.set(meeting.personId, meeting.date);
      }
      for (const person of chain.byId.values()) {
        const last = lastHeld.get(person.id) || null;
        const anchor = last || dayKey(person.createdAt) || nowDay;
        const age = daysBetween(anchor, nowDay);
        if (age === null || age <= cadenceDays) continue;
        push(source, { id: `cadence-${person.id}`, personId: person.id, title: `1:1 with ${person.name}` }, anchor, addDays(anchor, cadenceDays), [person.id]);
      }
      continue;
    }
    const rows = Array.isArray(state?.[source.collection]) ? state[source.collection] : [];
    for (const record of rows) {
      if (!record || !record.id) continue;
      if (!isOpenFor(source, record)) continue;
      const openedOn = dayKey(readPath(record, source.datePath)) || dayKey(record.createdAt);
      if (!openedOn) continue;
      const dueOn = source.duePath ? dayKey(readPath(record, source.duePath)) : null;
      push(source, record, openedOn, dueOn, peopleFrom(source, record, chain));
    }
  }

  items.sort((a, b) => b.ageDays - a.ageDays || b.severity - a.severity);
  return items;
}

/**
 * Where an item owned at `ownerRank` should be decided, given the chain that
 * actually exists. The nearest ancestor whose altitude is at least `requiredRank`;
 * the workspace leader if no such node exists. `aboveTop` is true when the
 * requirement is above the highest altitude the chain can offer — the honest
 * label for "there is no one above you to escalate this to".
 */
export function escalationTarget(chain, ownerNodeId, requiredRank) {
  let cursor = ownerNodeId;
  let guard = 0;
  while (cursor && guard <= chain.counts.nodes + 1) {
    guard += 1;
    const node = chain.nodes.get(cursor);
    if (node && altitudeRank(node.altitude) >= requiredRank) return { nodeId: cursor, aboveTop: false };
    cursor = parentNodeId(chain, cursor);
  }
  return { nodeId: LEADER_ID, aboveTop: altitudeRank(chain.leader.altitude) < requiredRank };
}

/* ----------------------------------------------------------- 3. the reading */

function emptyMetric(metric, floor) {
  return { key: metric.key, label: metric.label, question: metric.question, num: 0, den: 0, rate: null, floor, refused: 'no observation yet' };
}

/**
 * Rate readings for one span. Every denominator is a record the workspace
 * recorded; anything without one is a count, not a rate.
 */
export function spanRates(state, chain, scopeIds, { now = new Date(), settings = null, conventions = null } = {}) {
  const conv = conventions || chainConventions(settings || state?.settings || {});
  const floor = conv.chainFloorN;
  const nowDay = dayKey(now);
  const scope = new Set(scopeIds);
  const people = [...scope].filter((id) => chain.byId.has(id));

  const delegations = (state?.delegations || []).filter((d) => d && d.status === 'done' && scope.has(d.personId) && d.dueOn && d.completedOn);
  const onTime = delegations.filter((d) => d.completedOn <= d.dueOn).length;
  const cadenceDays = clampInt(state?.settings?.oneOnOneCadenceDays, 1, 90, 7);
  const held = new Map();
  for (const meeting of state?.oneOnOnes || []) {
    if (!meeting || meeting.status !== 'held' || !meeting.personId) continue;
    const current = held.get(meeting.personId);
    if (!current || String(meeting.date) > String(current)) held.set(meeting.personId, meeting.date);
  }
  const inside = people.filter((pid) => {
    const last = held.get(pid);
    if (!last) return false;
    const age = daysBetween(last, nowDay);
    return age !== null && age <= cadenceDays;
  }).length;
  const goals = (state?.goals || []).filter((g) => g && g.status === 'active' && g.dueDate
    && (scope.has(g.ownerId) || (!g.ownerId && scope.has(LEADER_ID))));
  const onTrack = goals.filter((g) => g.confidence === 'on-track').length;

  const raw = {
    'delegation-on-time': { num: onTime, den: delegations.length },
    'oneonone-cadence': { num: inside, den: people.length },
    'goal-on-track': { num: onTrack, den: goals.length },
  };

  return RATE_METRICS.map((metric) => {
    const entry = raw[metric.key] || { num: 0, den: 0 };
    const metricFloor = Math.max(floor, metric.floorDefault);
    const base = {
      key: metric.key,
      label: metric.label,
      question: metric.question,
      num: entry.num,
      den: entry.den,
      floor: metricFloor,
      rate: null,
      refused: null,
    };
    if (!entry.den) return { ...base, refused: 'nothing of this kind on record for this span' };
    if (entry.den < metricFloor) {
      return { ...base, refused: `${entry.num} of ${entry.den} — below the ${metricFloor}-observation floor, so the proportion is withheld rather than shown as a finding` };
    }
    return { ...base, rate: pctOf(entry.num, entry.den) };
  });
}

/**
 * A span's dossier: its own work, the work rolled up from below it, the rates it
 * can defend, and the debt its own items have accumulated.
 */
export function nodeDossier(state, chain, items, nodeId, { now = new Date(), settings = null, conventions = null } = {}) {
  const conv = conventions || chainConventions(settings || state?.settings || {});
  const node = chain.nodes.get(nodeId);
  if (!node) return null;
  const scope = new Set(node.subtreeIds);
  const rolled = items.filter((item) => scope.has(item.ownerNodeId));
  const own = rolled.filter((item) => item.ownerNodeId === nodeId);
  const nodeRank = altitudeRank(node.altitude);
  const debt = own.filter((item) => item.requiredRank > nodeRank);
  const bySource = {};
  for (const item of rolled) bySource[item.type] = (bySource[item.type] || 0) + 1;
  const ownBySource = {};
  for (const item of own) ownBySource[item.type] = (ownBySource[item.type] || 0) + 1;

  const children = node.childIds.map((childId) => {
    const childScope = new Set(chain.nodes.get(childId)?.subtreeIds || []);
    const childRolled = items.filter((item) => childScope.has(item.ownerNodeId));
    const childNode = chain.nodes.get(childId);
    const childRank = altitudeRank(childNode?.altitude);
    return {
      nodeId: childId,
      name: childNode?.name || 'Unnamed',
      altitude: childNode?.altitude || null,
      rank: childRank,
      peopleN: (childNode?.subtreeIds || []).length - 1,
      openN: childRolled.length,
      ownOpenN: childRolled.filter((item) => item.ownerNodeId === childId).length,
      debtN: childRolled.filter((item) => item.ownerNodeId === childId && item.requiredRank > childRank).length,
      overdueN: childRolled.filter((item) => item.overdueDays > 0).length,
      severityLoad: childRolled.reduce((sum, item) => sum + item.severity, 0),
    };
  });

  const metrics = spanRates(state, chain, [...scope], { now, settings, conventions: conv });

  return {
    nodeId,
    name: node.name,
    altitude: node.altitude,
    altitudeLabel: altitudeByKey(node.altitude)?.label || 'Individual contributor',
    altitudeReason: node.altitudeReason,
    rank: nodeRank,
    depth: node.depth,
    span: node.span,
    peopleN: Math.max(0, node.subtreeIds.length - 1),
    openN: rolled.length,
    ownOpenN: own.length,
    overdueN: rolled.filter((item) => item.overdueDays > 0).length,
    severityLoad: rolled.reduce((sum, item) => sum + item.severity, 0),
    oldestAgeDays: rolled.length ? Math.max(...rolled.map((item) => item.ageDays)) : null,
    medianAgeDays: median(rolled.map((item) => item.ageDays)),
    debtN: debt.length,
    debtSeverity: debt.reduce((sum, item) => sum + item.severity, 0),
    oldestDebtDays: debt.length ? Math.max(...debt.map((item) => item.ageDays)) : null,
    bySource,
    ownBySource,
    metrics,
    children,
    debtItems: debt.slice().sort((a, b) => b.ageDays - a.ageDays),
  };
}

/**
 * Pooled rate against the equal-weight mean of unit rates, over the metrics that
 * a span can actually defend.
 *
 * The pooled figure is what actually happened to the work; the mean-of-means is
 * what a "team average" dashboard reports. They differ when units carry
 * different mixes, and that difference is the thing a roll-up must not hide.
 */
export function compositeRate(dossier, { conventions = null } = {}) {
  const conv = conventions || { chainMaterialityPp: CHAIN_LIMITS.materialityPpDefault };
  const usable = (dossier?.metrics || []).filter((metric) => metric.rate !== null);
  const num = usable.reduce((sum, metric) => sum + metric.num, 0);
  const den = usable.reduce((sum, metric) => sum + metric.den, 0);
  const pooled = den > 0 ? pctOf(num, den) : null;
  const meanOfRates = usable.length ? round(mean(usable.map((metric) => metric.rate)), 1) : null;
  const gapPp = pooled !== null && meanOfRates !== null ? round(pooled - meanOfRates, 1) : null;
  return {
    metricsUsed: usable.length,
    metricsRefused: (dossier?.metrics || []).length - usable.length,
    num,
    den,
    pooled,
    meanOfRates,
    gapPp,
    compositionSensitive: gapPp !== null && Math.abs(gapPp) >= conv.chainMaterialityPp,
    refused: den === 0 ? 'no metric on this span has a defensible denominator yet' : null,
  };
}

/**
 * Direct standardisation: what would this span's composite rate be if its work
 * were mixed the way the whole workspace's work is mixed? Unavailable when the
 * span has no observations for a metric the standard carries, because imputing
 * the missing cell would produce a comparison the record does not support.
 */
export function standardisedRate(dossier, standard) {
  const usable = (dossier?.metrics || []).filter((metric) => metric.rate !== null);
  if (!usable.length || !standard || !Object.keys(standard.weights || {}).length) {
    return { rate: null, refused: 'no defensible rate on this span' };
  }
  const missing = Object.entries(standard.weights)
    .filter(([, weight]) => weight > 0)
    .map(([key]) => key)
    .filter((key) => !usable.some((metric) => metric.key === key));
  if (missing.length) {
    return { rate: null, refused: `this span has no ${missing.map((key) => RATE_METRICS.find((m) => m.key === key)?.label.toLowerCase() || key).join(', ')} observation, so standardising it would impute a number` };
  }
  let total = 0;
  for (const [key, weight] of Object.entries(standard.weights)) {
    if (!weight) continue;
    const metric = usable.find((entry) => entry.key === key);
    total += metric.rate * weight;
  }
  return { rate: round(total, 1), refused: null };
}

/** The workspace-wide metric mix, which is the standard every span is weighted to. */
export function metricStandard(enterpriseDossier) {
  const usable = (enterpriseDossier?.metrics || []).filter((metric) => metric.rate !== null && metric.den > 0);
  const den = usable.reduce((sum, metric) => sum + metric.den, 0);
  const weights = {};
  for (const metric of usable) weights[metric.key] = den > 0 ? round(metric.den / den, 4) : 0;
  return { weights, den, metricsUsed: usable.length };
}

/**
 * Crude vs standardised comparison of one span against the whole workspace.
 * `flipped` is the Simpson-shaped finding: the crude number says one thing and
 * the mix-adjusted number says the opposite.
 */
export function compareToEnterprise(dossier, enterprise, standard, { settings = null } = {}) {
  const conv = chainConventions(settings || {});
  const crude = compositeRate(dossier, { conventions: conv });
  const baseCrude = compositeRate(enterprise, { conventions: conv });
  if (crude.pooled === null || baseCrude.pooled === null) {
    return { crudeDiffPp: null, standardisedDiffPp: null, flipped: false, refused: crude.refused || baseCrude.refused || 'no defensible rate' };
  }
  const ownStd = standardisedRate(dossier, standard);
  const baseStd = standardisedRate(enterprise, standard);
  const crudeDiffPp = round(crude.pooled - baseCrude.pooled, 1);
  let standardisedDiffPp = null;
  let refused = ownStd.refused || baseStd.refused || null;
  if (ownStd.rate !== null && baseStd.rate !== null) standardisedDiffPp = round(ownStd.rate - baseStd.rate, 1);
  const material = conv.chainMaterialityPp;
  const flipped = standardisedDiffPp !== null
    && ((crudeDiffPp >= material && standardisedDiffPp <= -material)
      || (crudeDiffPp <= -material && standardisedDiffPp >= material));
  const materialGate = standardisedDiffPp === null
    ? Math.abs(crudeDiffPp) >= material
    : Math.abs(standardisedDiffPp) >= material;
  return {
    crudeDiffPp,
    standardisedDiffPp,
    crude: crude.pooled,
    standardised: ownStd.rate,
    basePooled: baseCrude.pooled,
    baseStandardised: baseStd.rate,
    flipped,
    material: materialGate,
    refused,
  };
}

/* ------------------------------------------------- 4. escalation forecast */

/**
 * Empirical survival of an open item's age, from the ages at which this
 * workspace's own items actually closed. `S(t)` is the share of observed
 * closures that happened after `t` days.
 *
 * Refuses below the observation floor, and refuses a conditional probability
 * when the item is already older than anything the record has ever seen close:
 * past that point the workspace has no evidence at all, and a number invented
 * there would be the most confident one on the page.
 */
export function survivalEstimate(state, { now = new Date(), settings = null, conventions = null } = {}) {
  const conv = conventions || chainConventions(settings || state?.settings || {});
  const ages = [];
  const nowDay = dayKey(now);
  for (const source of SIGNAL_SOURCES) {
    if (!source.closePaths?.length || source.derived) continue;
    for (const record of state?.[source.collection] || []) {
      if (!record) continue;
      const opened = dayKey(readPath(record, source.datePath)) || dayKey(record.createdAt);
      if (!opened) continue;
      let closed = null;
      for (const path of source.closePaths) {
        const value = dayKey(readPath(record, path));
        if (value) {
          closed = value;
          break;
        }
      }
      if (!closed) continue;
      const age = daysBetween(opened, closed);
      if (age === null || age < 0) continue;
      ages.push(age);
    }
  }
  ages.sort((a, b) => a - b);
  const n = ages.length;
  const floor = Math.max(conv.chainFloorN, 8);
  const survivalAt = (t) => {
    if (!n) return null;
    let count = 0;
    for (const age of ages) if (age > t) count += 1;
    return count / n;
  };
  return {
    n,
    floor,
    medianAgeDays: median(ages),
    maxAgeDays: n ? ages[n - 1] : null,
    survivalAt,
    refused: n < floor
      ? `${n} closed item(s) on record against a ${floor}-observation floor — no survival curve, so no escalation probability can be quoted`
      : null,
    // A printed read of the same curve, so the page can show the shape.
    quantiles: n
      ? [0.25, 0.5, 0.75, 0.9].map((q) => ({ q, days: ages[Math.min(n - 1, Math.floor(q * n))] }))
      : [],
    nowDay,
  };
}

/**
 * The chance that this span's own open work is still open when it crosses the
 * next altitude's horizon — the one prospective claim a frozen reading makes.
 *
 * Headline is the Fréchet lower bound `max(pᵢ)`, which assumes nothing about
 * dependence between items; the independence product is printed beside it. An
 * item already past the threshold is counted as certain, not modelled.
 */
export function escalationForecast(chain, items, nodeId, survival, { settings = null, conventions = null } = {}) {
  const conv = conventions || chainConventions(settings || {});
  const node = chain.nodes.get(nodeId);
  if (!node) return { refused: 'no such node', members: [], predictedAnyBreachPct: null };
  const nodeRank = altitudeRank(node.altitude);
  const nextAltitude = altitudeByRank(nodeRank + 1);
  if (!nextAltitude) {
    return {
      refused: 'this is the highest altitude the ladder defines — there is no level above it to breach into',
      members: [],
      predictedAnyBreachPct: null,
      predictedAnyBreachIndependencePct: null,
      predictedBreachN: null,
      nextThresholdDays: null,
    };
  }
  if (survival.refused) {
    return {
      refused: survival.refused,
      members: [],
      predictedAnyBreachPct: null,
      predictedAnyBreachIndependencePct: null,
      predictedBreachN: null,
      nextThresholdDays: nextAltitude.horizonDays,
    };
  }
  const own = items.filter((item) => item.ownerNodeId === nodeId && item.requiredRank <= nodeRank);
  const members = [];
  let unquotable = 0;
  for (const item of own) {
    const thresholdDays = nextAltitude.horizonDays;
    const thresholdOn = item.openedOn ? addDays(item.openedOn, thresholdDays) : null;
    if (!thresholdOn) continue;
    let p = null;
    let refused = null;
    if (item.ageDays >= thresholdDays) {
      p = 1;
    } else {
      const sAtThreshold = survival.survivalAt(thresholdDays);
      const sAtAge = survival.survivalAt(item.ageDays);
      if (sAtAge === null || sAtAge === 0) {
        refused = `nothing on this record has ever stayed open ${item.ageDays} days, so there is no survival estimate beyond it`;
      } else if (sAtThreshold === null) {
        refused = 'no survival estimate';
      } else {
        p = Math.min(1, Math.max(0, sAtThreshold / sAtAge));
      }
    }
    if (p === null) {
      unquotable += 1;
      members.push({ type: item.type, id: item.entityId, pBreachPct: null, thresholdDays, thresholdOn, refused });
      continue;
    }
    members.push({ type: item.type, id: item.entityId, pBreachPct: round(p * 100, 1), thresholdDays, thresholdOn, refused: null });
  }
  const quoted = members.filter((member) => member.pBreachPct !== null);
  if (!quoted.length) {
    return {
      refused: own.length
        ? `every one of the ${own.length} open item(s) needs a probability the record cannot support (${unquotable} unquotable)`
        : 'this span holds no open work of its own, so there is nothing to breach',
      members: members.slice(0, CHAIN_LIMITS.maxMembers),
      predictedAnyBreachPct: null,
      predictedAnyBreachIndependencePct: null,
      predictedBreachN: null,
      nextThresholdDays: nextAltitude.horizonDays,
      unquotable,
    };
  }
  const probabilities = quoted.map((member) => member.pBreachPct / 100);
  const bound = Math.max(...probabilities);
  const independence = 1 - probabilities.reduce((product, p) => product * (1 - p), 1);
  return {
    refused: null,
    nextThresholdDays: nextAltitude.horizonDays,
    nextAltitude: nextAltitude.key,
    members: members.slice(0, CHAIN_LIMITS.maxMembers),
    quotedN: quoted.length,
    unquotable,
    predictedAnyBreachPct: round(bound * 100, 1),
    predictedAnyBreachIndependencePct: round(independence * 100, 1),
    predictedBreachN: quoted.filter((member) => member.pBreachPct >= 50).length,
    excluded: members.filter((member) => member.pBreachPct === null).length,
    conventions: { floor: conv.chainFloorN },
  };
}

/* ------------------------------------------------------ 5. altitude drift */

/**
 * Work sitting at the wrong altitude, in both directions:
 *   - `driftN` items owned by this span whose requirement is BELOW it. The span
 *     is doing work its own reports should be doing.
 *   - `aboveN` items whose requirement is ABOVE it. Nobody has taken them.
 * The share is measured against the span's own open work, and the bar is the
 * leader's declared one.
 */
export function altitudeDrift(chain, items, nodeId, { conventions = null } = {}) {
  const conv = conventions || { chainDriftPct: CHAIN_LIMITS.driftPctDefault };
  const node = chain.nodes.get(nodeId);
  if (!node) return null;
  const rank = altitudeRank(node.altitude);
  const own = items.filter((item) => item.ownerNodeId === nodeId);
  const drift = own.filter((item) => item.requiredRank < rank);
  const above = own.filter((item) => item.requiredRank > rank);
  const below = own.filter((item) => item.requiredRank === rank);
  const share = own.length ? round((drift.length / own.length) * 100, 1) : null;
  return {
    nodeId,
    altitude: node.altitude,
    rank,
    ownN: own.length,
    atAltitudeN: below.length,
    driftN: drift.length,
    aboveN: above.length,
    driftSharePct: share,
    overBar: share !== null && share >= conv.chainDriftPct,
    bar: conv.chainDriftPct,
    driftItems: drift.slice().sort((a, b) => b.ageDays - a.ageDays),
    aboveItems: above.slice().sort((a, b) => b.ageDays - a.ageDays),
  };
}

/* ------------------------------------------------------ 6. the whole report */

/**
 * The full reading: tree, work, per-node dossiers, the enterprise roll-up, the
 * ladder, drift and the forecast for the workspace leader's own span.
 */
export function chainReport(state = {}, now = new Date(), rawSettings = null) {
  const settings = rawSettings || state.settings || {};
  const conventions = chainConventions(settings);
  const chain = buildChain(state, { now, settings: { ...settings, ...conventions } });
  const items = harvestWork(state, chain, { now, settings: { ...settings, ...conventions } });
  const survival = survivalEstimate(state, { now, settings: { ...settings, ...conventions }, conventions });

  const dossiers = new Map();
  for (const nodeId of chain.order) {
    dossiers.set(nodeId, nodeDossier(state, chain, items, nodeId, { now, settings, conventions }));
  }
  const enterprise = dossiers.get(LEADER_ID);
  const standard = metricStandard(enterprise);

  const spanNodes = [...chain.nodes.values()].filter((node) => node.span > 0 || node.id === LEADER_ID);
  const spans = spanNodes.map((node) => {
    const dossier = dossiers.get(node.id);
    return {
      nodeId: node.id,
      name: node.name,
      altitude: node.altitude,
      rank: altitudeRank(node.altitude),
      depth: node.depth,
      dossier,
      composite: compositeRate(dossier, { conventions }),
      comparison: compareToEnterprise(dossier, enterprise, standard, { settings }),
      drift: altitudeDrift(chain, items, node.id, { conventions }),
    };
  }).sort((a, b) => a.rank - b.rank || a.depth - b.depth || a.name.localeCompare(b.name));

  const ladder = ALTITUDES.map((altitude) => {
    const atAltitude = spans.filter((span) => span.rank === altitude.rank);
    const rollup = atAltitude.reduce((acc, span) => ({
      openN: acc.openN + span.dossier.openN,
      ownOpenN: acc.ownOpenN + span.dossier.ownOpenN,
      debtN: acc.debtN + span.dossier.debtN,
      overdueN: acc.overdueN + span.dossier.overdueN,
      peopleN: acc.peopleN + span.dossier.peopleN,
    }), { openN: 0, ownOpenN: 0, debtN: 0, overdueN: 0, peopleN: 0 });
    return {
      key: altitude.key,
      rank: altitude.rank,
      label: altitude.label,
      shortLabel: altitude.shortLabel,
      unitLabel: altitude.unitLabel,
      horizonDays: altitude.horizonDays,
      stance: altitude.stance,
      decisionForm: altitude.decisionForm,
      decisionQuestion: altitude.decisionQuestion,
      duties: altitude.duties,
      forbidden: altitude.forbidden,
      handUp: altitude.handUp,
      disclosure: altitude.disclosure,
      represented: atAltitude.length > 0,
      owners: atAltitude.map((span) => ({ nodeId: span.nodeId, name: span.name, span: span.dossier.span, peopleN: span.dossier.peopleN, openN: span.dossier.openN, debtN: span.dossier.debtN })),
      ownOpenN: rollup.ownOpenN,
      rollupOpenN: rollup.openN,
      debtN: rollup.debtN,
      overdueN: rollup.overdueN,
      peopleN: rollup.peopleN,
    };
  });

  const leaderId = LEADER_ID;
  const leaderDossier = dossiers.get(leaderId);
  const leaderDrift = altitudeDrift(chain, items, leaderId, { conventions });
  const leaderForecast = escalationForecast(chain, items, leaderId, survival, { settings, conventions });

  const escalationQueue = items
    .filter((item) => item.requiredRank > item.ownerRank)
    .map((item) => {
      const target = escalationTarget(chain, item.ownerNodeId, item.requiredRank);
      return {
        ...item,
        targetNodeId: target.nodeId,
        targetName: chain.nodes.get(target.nodeId)?.name || 'You',
        aboveTop: target.aboveTop,
      };
    })
    .sort((a, b) => b.requiredRank - a.requiredRank || b.ageDays - a.ageDays);

  const totals = {
    nodes: chain.counts.nodes,
    people: chain.counts.people,
    spanning: chain.counts.spanning,
    depth: chain.counts.depth,
    altitudesPresent: chain.representedAltitudes.length,
    openItems: items.length,
    ownItems: items.filter((item) => item.ownerNodeId === leaderId).length,
    overdue: items.filter((item) => item.overdueDays > 0).length,
    debt: escalationQueue.length,
    aboveTop: escalationQueue.filter((item) => item.aboveTop).length,
    severityLoad: items.reduce((sum, item) => sum + item.severity, 0),
    oldestAgeDays: items.length ? Math.max(...items.map((item) => item.ageDays)) : null,
    findings: chain.findings.length,
    structureBreaches: chain.findings.filter((finding) => finding.severity >= 3).length,
    rateRefusals: spans.reduce((sum, span) => sum + span.dossier.metrics.filter((metric) => metric.rate === null).length, 0),
    compositionFlags: spans.filter((span) => span.composite.compositionSensitive).length,
    comparableFlipped: spans.filter((span) => span.comparison.flipped).length,
  };

  const ungradedDue = (state.chainReadings || []).filter((reading) => reading && reading.reviewOn
    && reading.reviewOn <= dayKey(now) && !reading.graded);

  return {
    now,
    nowDay: dayKey(now),
    conventions,
    chain,
    items,
    dossiers,
    enterprise,
    standard,
    spans,
    ladder,
    survival,
    escalationQueue,
    leader: {
      nodeId: leaderId,
      name: chain.leader.name,
      altitude: chain.leader.altitude,
      altitudeLabel: altitudeByKey(chain.leader.altitude)?.label || '—',
      dossier: leaderDossier,
      composite: compositeRate(leaderDossier, { conventions }),
      comparison: compareToEnterprise(leaderDossier, enterprise, standard, { settings }),
      drift: leaderDrift,
      forecast: leaderForecast,
    },
    totals,
    findings: chain.findings,
    ungradedDue,
    readings: Array.isArray(state.chainReadings) ? state.chainReadings : [],
  };
}

/* ------------------------------------------------------- 7. disclosure */

/**
 * What this altitude is allowed to see of a span's item list. This is a
 * rendering contract, not a permission system: the workspace has one operator,
 * and pretending otherwise would be a security theatre claim. It exists so the
 * screen does not put a named individual in front of a director whose job is
 * structural, and so a test can prove it.
 */
export function discloseItems(items, altitudeKey, chain, { cap = 12 } = {}) {
  const altitude = altitudeByKey(altitudeKey);
  const mode = altitude?.disclosure?.names || 'visible';
  const detail = altitude?.disclosure?.itemDetail === true;
  const rows = items.slice(0, cap).map((item) => {
    const personNames = item.people.map((pid) => chain.byId.get(pid)?.name).filter(Boolean);
    let who = '';
    if (mode === 'visible') who = personNames.join(', ');
    else if (mode === 'leaders') {
      const leaders = item.people
        .map((pid) => chain.nodes.get(pid))
        .filter((node) => node && node.span > 0)
        .map((node) => node.name);
      who = leaders.length ? leaders.join(', ') : `${item.people.length || 'no'} person(s) inside a unit`;
    } else {
      who = `${item.people.length || 'no'} person(s)`;
    }
    return {
      type: item.type,
      typeLabel: item.typeLabel,
      unit: item.unit,
      title: detail ? item.title : item.unit,
      who,
      ageDays: item.ageDays,
      overdueDays: item.overdueDays,
      requiredAltitude: item.requiredAltitude,
      requiredAltitudeLabel: altitudeByKey(item.requiredAltitude)?.label || '—',
      severity: item.severity,
      route: detail ? item.route : null,
      hiddenDetail: !detail,
    };
  });
  return {
    mode,
    detail,
    rows,
    shownN: rows.length,
    hiddenN: Math.max(0, items.length - rows.length),
    reason: mode === 'visible'
      ? 'Names are shown because the work at this altitude is the person.'
      : mode === 'leaders'
        ? 'Only leaders of units are named; individuals inside them are counts. The reading is structural, so the individual is not the unit of analysis.'
        : 'No person is named at this altitude — the reading is counts by source and span.',
  };
}

/* ---------------------------------------------------------- 8. freezing */

/**
 * Freeze one span's reading. Aggregate-only by contract: ids of *records* and
 * the ids of the span's own leader, never the people inside it.
 */
export function buildChainReading(report, nodeId, { now = new Date(), reviewDays = null, id = null } = {}) {
  const dossier = report.dossiers.get(nodeId);
  if (!dossier) return { ok: false, error: 'That span is not in the chain.' };
  const conventions = report.conventions;
  const horizon = clampInt(reviewDays, CHAIN_LIMITS.reviewHorizonDays[0], CHAIN_LIMITS.reviewHorizonDays[1], conventions.chainReviewHorizonDays);
  const forecast = escalationForecast(report.chain, report.items, nodeId, report.survival, { conventions });
  const composite = compositeRate(dossier, { conventions });
  const record = {
    id: id || null,
    nodeId,
    altitude: dossier.altitude || null,
    frozenAt: now.toISOString(),
    reviewOn: addDays(dayKey(now), horizon),
    reviewDays: horizon,
    windowDays: conventions.chainWindowDays,
    counts: {
      peopleN: dossier.peopleN,
      openN: dossier.openN,
      ownOpenN: dossier.ownOpenN,
      overdueN: dossier.overdueN,
      debtN: dossier.debtN,
      severityLoad: dossier.severityLoad,
      oldestAgeDays: dossier.oldestAgeDays,
    },
    rates: dossier.metrics.map((metric) => ({
      key: metric.key,
      num: metric.num,
      den: metric.den,
      rate: metric.rate,
      refused: metric.rate === null ? metric.refused : null,
    })),
    composite: {
      pooled: composite.pooled,
      meanOfRates: composite.meanOfRates,
      gapPp: composite.gapPp,
      compositionSensitive: composite.compositionSensitive,
    },
    nextThresholdDays: forecast.nextThresholdDays ?? null,
    predictedAnyBreachPct: forecast.predictedAnyBreachPct ?? null,
    predictedAnyBreachIndependencePct: forecast.predictedAnyBreachIndependencePct ?? null,
    predictedBreachN: forecast.predictedBreachN ?? null,
    quoteRefused: forecast.refused || null,
    members: (forecast.members || []).map((member) => ({
      type: member.type,
      id: member.id,
      pBreachPct: member.pBreachPct,
      thresholdDays: member.thresholdDays,
      thresholdOn: member.thresholdOn,
    })),
    graded: null,
    lapsedOn: null,
    challengeNotes: [],
  };
  if (record.predictedAnyBreachPct === null && !record.quoteRefused) {
    return { ok: false, error: 'This span cannot be quoted, and a reading without a probability would be decoration.' };
  }
  return { ok: true, record };
}

/**
 * Grade a frozen reading exactly once, after its window.
 *
 * A member that no longer exists is *unmeasurable*, not a breach: the record was
 * deleted, and inventing an outcome for it would be the one thing a forecast
 * ledger exists to prevent. If every member is unmeasurable the reading lapses.
 */
export function gradeChainReading(reading, state, { now = new Date() } = {}) {
  if (!reading) return { ok: false, error: 'No reading to grade.' };
  if (reading.graded) return { ok: false, error: 'This reading has already been graded. Grading is once, later, and never rewritten.' };
  // `Number(null)` is 0 and `Number(undefined)` is NaN, so a plain isFinite
  // check let a probability-free reading through as "0% any breach" and then
  // lapsed it with the note that its members had been deleted — a false
  // statement about a reading that never froze a member. Both are checked.
  if (
    reading.predictedAnyBreachPct === null
    || reading.predictedAnyBreachPct === undefined
    || !Number.isFinite(Number(reading.predictedAnyBreachPct))
  ) {
    // A refused reading is an honest gap, not a forecast. Scoring it would either
    // invent a probability (50%) or credit a claim nobody made.
    return {
      ok: false,
      error: `This reading quoted no probability, so there is nothing to score. The refusal stands on the record: ${reading.quoteRefused || 'no reason was stored'}.`,
    };
  }
  const today = dayKey(now);
  if (!reading.reviewOn || reading.reviewOn > today) {
    return { ok: false, error: `This reading cannot be graded before ${reading.reviewOn || 'its review date'}.` };
  }
  const members = Array.isArray(reading.members) ? reading.members : [];
  if (!members.length) {
    // A reading can be frozen with a probability and no members only if the
    // record changed between the freeze and the grade. Grading it as "lapsed —
    // every member was deleted" would invent an event: nothing was ever frozen
    // to be deleted. Refuse and say which reading is unusable.
    return {
      ok: false,
      error: 'This reading froze no members, so there is nothing to measure. Delete it and freeze a fresh reading rather than scoring an empty claim.',
    };
  }
  let observed = 0;
  let unmeasurable = 0;
  for (const member of members) {
    const source = signalSource(member.type);
    const collection = source ? state?.[source.collection] : null;
    const record = Array.isArray(collection) ? collection.find((row) => row && row.id === member.id) : null;
    if (!record) {
      unmeasurable += 1;
      continue;
    }
    let closedOn = null;
    for (const path of source.closePaths || []) {
      const value = dayKey(readPath(record, path));
      if (value) {
        closedOn = value;
        break;
      }
    }
    // Still open, or closed after the threshold: the item crossed into the
    // altitude above. Closed on or before it: it did not.
    const breached = !closedOn || (member.thresholdOn && closedOn > member.thresholdOn);
    if (breached) observed += 1;
  }
  const measurable = members.length - unmeasurable;
  if (!measurable) {
    return {
      ok: true,
      grade: {
        gradedAt: now.toISOString(),
        observedBreachN: null,
        anyBreach: null,
        brier: null,
        countError: null,
        unmeasurableN: unmeasurable,
        lapsed: true,
        note: 'Every member of this reading has been deleted, so nothing is measurable. The reading lapses rather than being credited or blamed.',
      },
    };
  }
  const anyBreach = observed > 0;
  const predictedPct = Number(reading.predictedAnyBreachPct);
  const brier = Number.isFinite(predictedPct) ? round((((predictedPct / 100) - (anyBreach ? 1 : 0)) ** 2), 4) : null;
  const countError = Number.isFinite(Number(reading.predictedBreachN))
    ? Math.abs(Number(reading.predictedBreachN) - observed)
    : null;
  return {
    ok: true,
    grade: {
      gradedAt: now.toISOString(),
      observedBreachN: observed,
      anyBreach,
      brier,
      countError,
      unmeasurableN: unmeasurable,
      measuredN: measurable,
      lapsed: false,
      note: unmeasurable
        ? `${unmeasurable} of ${members.length} member(s) no longer exist and were excluded from the grade, not counted as breaches.`
        : '',
    },
  };
}

/** Brier skill against the base rate of every graded reading — withheld below five. */
export function chainSkill(readings) {
  const graded = (readings || []).filter((reading) => reading?.graded && !reading.graded.lapsed && Number.isFinite(reading.graded.brier));
  const n = graded.length;
  if (n < 5) {
    return { n, floor: 5, skill: null, meanBrier: null, baseRate: null, refused: `${n} graded reading(s) against a 5-reading floor — no skill figure yet` };
  }
  const meanBrier = round(mean(graded.map((reading) => reading.graded.brier)), 4);
  const baseRate = graded.filter((reading) => reading.graded.anyBreach).length / n;
  const reference = baseRate * (1 - baseRate);
  const skill = reference > 0 ? round(1 - meanBrier / reference, 3) : null;
  return { n, floor: 5, meanBrier, baseRate: round(baseRate * 100, 1), skill, refused: null };
}

/* ----------------------------------------------------------- 9. surfaces */

export function chainSignals(state, now = new Date(), settings = null) {
  const report = chainReport(state, now, settings);
  const signals = [];
  const add = (signal) => signals.push(signal);

  // A virgin workspace already gets exactly one setup nudge (SETUP-01), and this
  // is the same statement in a second voice. It is reported only when there is
  // work on file that has no chain to be owned by — which is a real defect.
  if (!report.chain.counts.people && report.items.length) {
    add({
      ruleId: 'CHN-08',
      domain: 'Command chain',
      severity: 1,
      confidence: 'high',
      title: 'There is no chain to read yet',
      detail: 'The workspace holds no roster, so every altitude reads the same single span: yours. Add the people you lead and the chain becomes a measurement instead of a map.',
      action: { label: 'Open People', route: '#/people' },
      evidence: ['0 people on the roster'],
    });
  }

  const debt = report.escalationQueue.filter((item) => !item.aboveTop);
  if (debt.length) {
    const worst = debt[0];
    add({
      ruleId: 'CHN-01',
      domain: 'Command chain',
      severity: worst.requiredRank - worst.ownerRank >= 2 ? 3 : 2,
      confidence: 'high',
      title: `${debt.length} item(s) have outlived the altitude that owns them`,
      detail: `The oldest is ${worst.ageDays} days old and sits at the ${worst.ownerAltitude || 'unassigned'} altitude, while its age places it at ${worst.requiredAltitude}. Its consequence places the decision with ${worst.targetName}. Nothing was re-typed to say this: the clock is each altitude's own time span.`,
      action: { label: 'Open the command chain', route: `#/chain?panel=escalation&node=${encodeURIComponent(worst.ownerNodeId)}` },
      evidence: [`${debt.length} past a horizon`, `oldest ${worst.ageDays}d`, `target ${worst.targetName}`],
    });
  }

  const aboveTop = report.escalationQueue.filter((item) => item.aboveTop);
  if (aboveTop.length) {
    add({
      ruleId: 'CHN-02',
      domain: 'Command chain',
      severity: 2,
      confidence: 'medium',
      title: `${aboveTop.length} item(s) demand an altitude the chain does not contain`,
      detail: `These items are older than your own declared horizon (${report.conventions.chainLeaderAltitude} · ${altitudeByKey(report.conventions.chainLeaderAltitude)?.horizonDays} days). There is nobody above you to escalate to, so the honest move is to decide them or to change the horizon you declared.`,
      action: { label: 'Open the altitude audit', route: '#/chain?panel=drift' },
      evidence: [`${aboveTop.length} above the top`, `horizon ${altitudeByKey(report.conventions.chainLeaderAltitude)?.horizonDays}d`],
    });
  }

  const structural = report.findings.filter((finding) => finding.severity >= 3);
  if (structural.length) {
    const first = structural[0];
    add({
      ruleId: 'CHN-03',
      domain: 'Command chain',
      severity: 3,
      confidence: 'high',
      title: `${structural.length} structural defect(s) in the reporting lines`,
      detail: `${first.title}. ${first.detail}`,
      action: { label: 'Open the chain map', route: '#/chain?panel=map' },
      evidence: structural.slice(0, 3).map((finding) => finding.key),
    });
  }

  if (report.leader.drift?.overBar) {
    add({
      ruleId: 'CHN-04',
      domain: 'Command chain',
      severity: 2,
      confidence: 'medium',
      title: `${report.leader.drift.driftSharePct}% of your open work sits below your altitude`,
      detail: `${report.leader.drift.driftN} of ${report.leader.drift.ownN} item(s) you own are, by their consequence and age, frontline or manager work. Your declared bar is ${report.leader.drift.bar}%. This is not a judgement about effort — it is the measurable form of altitude drift, and the fix is a hand-down, not a longer week.`,
      action: { label: 'Open the altitude audit', route: '#/chain?panel=drift' },
      evidence: [`${report.leader.drift.driftN}/${report.leader.drift.ownN}`, `bar ${report.leader.drift.bar}%`],
    });
  }

  if (report.ungradedDue.length) {
    add({
      ruleId: 'CHN-05',
      domain: 'Command chain',
      severity: 2,
      confidence: 'high',
      title: 'A frozen chain reading is due for grading',
      detail: `${report.ungradedDue.length} reading(s) passed their review date without a grade. A frozen forecast nobody scores cannot tell you whether your escalation judgement is any good.`,
      action: { label: 'Open frozen readings', route: '#/chain?panel=frozen' },
      evidence: report.ungradedDue.slice(0, 3).map((reading) => String(reading.reviewOn)),
    });
  }

  const thin = report.spans.filter((span) => span.dossier.metrics.every((metric) => metric.rate === null) && span.dossier.openN > 0);
  if (thin.length) {
    add({
      ruleId: 'CHN-06',
      domain: 'Command chain',
      severity: 1,
      confidence: 'high',
      title: `${thin.length} span(s) have work but no rate the record can defend`,
      detail: `Every rate on ${thin.slice(0, 2).map((span) => span.name).join(' and ')} is below its evidence floor. That is not a gap in the tool: closing delegations, holding conversations and dating goals is what turns a count into a rate.`,
      action: { label: 'Open the chain map', route: '#/chain?panel=map' },
      evidence: [`${report.totals.rateRefusals} withheld rate(s)`],
    });
  }

  const orphans = report.findings.filter((finding) => finding.key === 'orphan');
  if (orphans.length) {
    add({
      ruleId: 'CHN-07',
      domain: 'Command chain',
      severity: 2,
      confidence: 'high',
      title: `${orphans.length} reporting line(s) point at nobody on the roster`,
      detail: 'These people are anchored to the workspace leader for aggregation only. Until the roster says who they report to, every roll-up above them is a guess about which span their work belongs to.',
      action: { label: 'Open People', route: '#/people' },
      evidence: orphans.slice(0, 3).map((finding) => finding.key),
    });
  }

  return signals;
}

/** Badge: escalation debt inside the chain plus ungraded readings plus hard defects. */
export function chainAttentionCount(state, now = new Date(), settings = null) {
  const report = chainReport(state, now, settings);
  const debt = report.escalationQueue.filter((item) => !item.aboveTop).length;
  const defects = report.findings.filter((finding) => finding.severity >= 3).length;
  const drift = report.leader.drift?.overBar ? 1 : 0;
  return Math.min(99, debt + defects + report.ungradedDue.length + drift);
}

/** Identity-free brief: safe to paste upward or into a board pack. */
export function chainBrief(report) {
  const leaderAltitude = altitudeByKey(report.conventions.chainLeaderAltitude);
  const parts = [];
  parts.push(`Chain: ${report.totals.people} person(s), ${report.totals.spanning} span(s), ${report.totals.depth} layer(s), ${report.totals.altitudesPresent} of 5 altitudes represented.`);
  parts.push(`Open work: ${report.totals.openItems} item(s), ${report.totals.overdue} past a promised date, ${report.totals.debt} past their own altitude's horizon.`);
  if (report.totals.aboveTop) parts.push(`${report.totals.aboveTop} item(s) demand an altitude above yours (${leaderAltitude?.label || 'unset'} · ${leaderAltitude?.horizonDays || '—'}d).`);
  if (report.leader.drift) parts.push(`Your own span: ${report.leader.drift.ownN} item(s), ${report.leader.drift.driftSharePct ?? '—'}% below your altitude, ${report.leader.drift.aboveN} above it.`);
  if (report.leader.forecast?.predictedAnyBreachPct !== null && report.leader.forecast?.predictedAnyBreachPct !== undefined) {
    parts.push(`Forecast: at least one of your own items crosses the ${report.leader.forecast.nextThresholdDays}-day threshold with probability ≥ ${report.leader.forecast.predictedAnyBreachPct}% (assumption-free floor; ${report.leader.forecast.predictedAnyBreachIndependencePct}% under independence).`);
  } else if (report.leader.forecast?.refused) {
    parts.push(`Forecast refused: ${report.leader.forecast.refused}.`);
  }
  if (report.findings.length) parts.push(`Structure: ${report.findings.length} defect(s) reported, ${report.totals.structureBreaches} of them hard.`);
  parts.push(`Rates withheld: ${report.totals.rateRefusals}; composition-sensitive readings: ${report.totals.compositionFlags}.`);
  return parts.join(' ');
}

export { LEADER_ID, ALTITUDES };
export { chainConventions };
