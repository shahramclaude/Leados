/**
 * app/core/domain/interfaceAlignment.js — pure derived read model for the
 * Product–Organisation Interface Alignment Matrix (ADR-0189, Schema v149
 * unchanged, `#/matrix?panel=alignment`, CSV scope #142).
 *
 * Pure module: no storage, no clock globals, no DOM. Every arc class, channel
 * state, pair verdict, refusal and roll-up is recomputed from the live typed
 * link spine (`state.links`), the ONE canonical matrix engine (`buildMatrix`,
 * `matrixJointApex`, `matrixAllocations`), the append-only bilateral interface
 * acts (ADR-0162) and live cadence forums. Nothing derived is stored, no clock
 * is read except the injected `now`, and no input object is mutated — so a
 * printed figure is the computed figure by construction.
 *
 * THE QUESTION IT ANSWERS (Sosa, Eppinger & Rowles, 2004)
 * -------------------------------------------------------
 * Where declared work depends across two spans, does a recorded coordination
 * channel connect their holders — and where a channel is recorded, does any
 * work or shared contributor stand behind it? The two canonical failure modes
 * are printed as separate states and separate counts: UNATTENDED TECHNICAL
 * INTERFACES (`unattended-interface` / `channel-not-live`) and IDLE
 * COORDINATION CHANNELS (`idle-channel`, scoped to active agreements).
 */

import { dayKey, daysBetween } from '../time.js';
import {
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_COLLECTIONS,
  LINK_RELATIONS,
} from './cases.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixAllocations, matrixJointApex } from './matrix.js';
import { normalizeMatrixInterfaceAgreements } from './matrixInterfaceSchema.js';
import {
  INTERFACE_ALIGNMENT_ADR,
  INTERFACE_ALIGNMENT_ARC_STATES,
  INTERFACE_ALIGNMENT_ASK_STATES,
  INTERFACE_ALIGNMENT_CHANNEL_STATES,
  INTERFACE_ALIGNMENT_CONVENTIONS,
  INTERFACE_ALIGNMENT_ENGINE_VERSION,
  INTERFACE_ALIGNMENT_ESCALATION_STATES,
  INTERFACE_ALIGNMENT_EXCLUDED_RELATIONS,
  INTERFACE_ALIGNMENT_FINDINGS,
  INTERFACE_ALIGNMENT_FRAMEWORKS,
  INTERFACE_ALIGNMENT_LIMITS,
  INTERFACE_ALIGNMENT_METHOD,
  INTERFACE_ALIGNMENT_NODE_TYPES,
  INTERFACE_ALIGNMENT_PAIR_VERDICTS,
  INTERFACE_ALIGNMENT_PEOPLE_RELATIONS,
  INTERFACE_ALIGNMENT_REFUSALS,
  INTERFACE_ALIGNMENT_RELATIONS,
  INTERFACE_ALIGNMENT_RULE_ID,
  INTERFACE_ALIGNMENT_WORKSPACE_VERDICTS,
  interfaceAlignmentChannelState,
  interfaceAlignmentPairVerdict,
  interfaceAlignmentWorkspaceVerdict,
} from './interfaceAlignmentRegistry.js';
import {
  interfaceAlignmentSignature,
  normalizeInterfaceAlignmentSettings,
  parseInterfaceAlignmentAskSummary,
} from './interfaceAlignmentSchema.js';

const NODE_TYPES = new Set(INTERFACE_ALIGNMENT_NODE_TYPES);
const PEOPLE_RELATIONS = new Set(INTERFACE_ALIGNMENT_PEOPLE_RELATIONS);
const RELATIONS = new Map(INTERFACE_ALIGNMENT_RELATIONS.map((row) => [row.relation, row]));
const EXCLUDED = new Map(INTERFACE_ALIGNMENT_EXCLUDED_RELATIONS.map((row) => [row.relation, row.reason]));
const REFUSAL_LABELS = new Map(INTERFACE_ALIGNMENT_REFUSALS.map((row) => [row.key, row.label]));

const str = (value) => (typeof value === 'string' ? value.trim() : '');
const sorted = (values) => [...values].sort((a, b) => String(a).localeCompare(String(b)));
const nodeKey = (type, id) => `${str(type)}:${str(id)}`;

/** Resolve a work node against the record the workspace actually holds. */
function resolveNode(state, type, id) {
  if (!NODE_TYPES.has(type) || FORBIDDEN_LINK_TYPES.includes(type)) return null;
  const collection = LINK_ENTITY_COLLECTIONS[type];
  if (typeof collection !== 'string') return null;
  const rows = state[collection];
  if (!Array.isArray(rows)) return null;
  const target = str(id);
  const record = rows.find((row) => row && str(row.id) === target);
  if (!record) return null;
  const title = str(record.title || record.name || record.label || type).slice(0, 80) || type;
  return { type, id: target, key: nodeKey(type, target), title };
}

function linkSortKey(link) {
  return [
    str(link?.sourceType), str(link?.sourceId), str(link?.relation),
    str(link?.targetType), str(link?.targetId), str(link?.id),
  ].join('|');
}

function emptyBoard(reason) {
  const verdict = interfaceAlignmentWorkspaceVerdict('no-cross-holder-interfaces');
  return {
    verdict: verdict.key,
    verdictLabel: verdict.label,
    tone: verdict.tone,
    nodesN: 0, precedenceArcsN: 0, distinctPairsN: 0,
    crossHolderArcsN: 0, crossHolderInWindowN: 0, crossHolderOutOfWindowN: 0,
    sameHolderArcsN: 0, unattributedArcsN: 0,
    pairRowsN: 0, unattendedPairsN: 0, darkChannelPairsN: 0, idleAgreementPairsN: 0,
    attendedPairsN: 0, standingPairsN: 0, forumOnlyPairsN: 0, channelWithoutInterfaceN: 0,
    sharedPeopleOnlyPairsN: 0, liveAgreementsN: 0, partialAgreementsN: 0, sharedActiveForumsN: 0,
    failureModeInterfacesN: 0, failureModeIdleN: 0,
    rollupApexN: 0, ambiguousApexN: 0,
    excludedRelationsN: 0, refusalsN: 0, duplicateArcsN: 0, selfArcsN: 0, undatedArcsN: 0,
    countsReconcile: false, figuresComplete: false, interfacesClaim: false,
    reason: reason || 'No declared precedence arc could be read.',
  };
}

function emptyAsks(conventions) {
  return {
    ruleId: INTERFACE_ALIGNMENT_RULE_ID,
    autoPropagate: conventions.interfaceAlignmentAutoPropagate,
    askDueDays: conventions.interfaceAlignmentAskDueDays,
    findingsN: 0,
    escalationStates: Object.fromEntries(INTERFACE_ALIGNMENT_ESCALATION_STATES.map((s) => [s.key, 0])),
    askStates: Object.fromEntries(INTERFACE_ALIGNMENT_ASK_STATES.map((k) => [k, 0])),
    openN: 0, answeredN: 0, notIssuedN: 0, notApplicableN: 0, observationsN: 0,
    reconciles: true,
  };
}

/** Index rule-issued asks from `links` + `delegations` so reader and rule agree. */
export function indexInterfaceAlignmentAsks(state) {
  const rawLinks = Array.isArray(state?.links) ? state.links : [];
  const delegations = Array.isArray(state?.delegations) ? state.delegations : [];
  const taskById = new Map();
  for (const task of delegations) {
    if (task && typeof task.id === 'string') taskById.set(task.id, task);
  }
  const asks = [];
  for (const link of rawLinks) {
    if (!link || link.ruleId !== INTERFACE_ALIGNMENT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseInterfaceAlignmentAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({
      signature: parsed.signature,
      seatId: str(link.sourceId),
      taskId: str(link.targetId),
      task: taskById.get(str(link.targetId)) || null,
    });
  }
  return asks;
}

/* ------------------------------------------------------------ agreement channel */

function compareActs(a, b) {
  if (a.decidedOn !== b.decidedOn) return a.decidedOn < b.decidedOn ? -1 : 1;
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function termsMatch(a, b) {
  if (!a || !b) return false;
  return (
    a.consultationRule === b.consultationRule
    && (a.forumId || null) === (b.forumId || null)
    && a.escalationSeatId === b.escalationSeatId
    && a.effectiveFrom === b.effectiveFrom
    && a.reviewByOn === b.reviewByOn
  );
}

/**
 * This register's OWN channel question, derived from the SAME append-only acts
 * ADR-0162 governs: is there a channel that can carry coordination TODAY?
 * ADR-0162's richer governance states (escalation staleness, structurally
 * unresolvable diamonds) stay authoritative THERE; here they surface as the
 * printed `agreementStateDetail` and `escalationStale` flag beside the row.
 */
function deriveAgreementChannel(pairActs, today, forumById, sharedForumIds) {
  const acts = [...pairActs].sort(compareActs);
  let latestRetire = null;
  for (let i = acts.length - 1; i >= 0; i -= 1) {
    if (acts[i].outcome === 'retire') { latestRetire = acts[i]; break; }
  }
  let liveA = null;
  let liveB = null;
  for (const act of acts) {
    if (act.outcome !== 'affirm') continue;
    if (latestRetire && compareActs(act, latestRetire) <= 0) continue;
    if (act.actingSide === 'a') liveA = act;
    else if (act.actingSide === 'b') liveB = act;
  }
  const bothLive = Boolean(liveA && liveB);
  const matched = bothLive && termsMatch(liveA, liveB);
  const activeAgreement = matched ? liveA : null;

  const sharedForum = sharedForumIds.length ? sharedForumIds[0] : null;
  const sharedForumName = sharedForum ? (sharedForum.title || sharedForum.name || sharedForum.id) : null;

  if (matched && activeAgreement) {
    const forumId = activeAgreement.forumId || null;
    const forum = forumId ? forumById.get(forumId) || null : null;
    const forumAvailable = !forumId || Boolean(forum && forum.status === 'active');
    if (activeAgreement.effectiveFrom > today) {
      return {
        state: 'future-agreement', live: false, activeAgreement, liveA, liveB, matched: true,
        detail: `Bilateral terms start ${activeAgreement.effectiveFrom}; not yet in force on ${today}.`,
        forumId, forumName: forum ? (forum.title || forum.name || forum.id) : (forumId ? 'Missing forum' : null),
      };
    }
    if (activeAgreement.reviewByOn && activeAgreement.reviewByOn < today) {
      return {
        state: 'expired-agreement', live: false, activeAgreement, liveA, liveB, matched: true,
        detail: `Review deadline ${activeAgreement.reviewByOn} passed ${daysBetween(activeAgreement.reviewByOn, today)} day(s) ago; never auto-renewed.`,
        forumId, forumName: forum ? (forum.title || forum.name || forum.id) : (forumId ? 'Missing forum' : null),
      };
    }
    if (!forumAvailable) {
      return {
        state: 'forum-unavailable', live: false, activeAgreement, liveA, liveB, matched: true,
        detail: 'The bilateral terms name a cadence forum that is missing or retired.',
        forumId, forumName: 'Missing forum',
      };
    }
    return {
      state: 'live-agreement', live: true, activeAgreement, liveA, liveB, matched: true,
      detail: `Matched bilateral terms in force through ${activeAgreement.reviewByOn}.`,
      forumId, forumName: forum ? (forum.title || forum.name || forum.id) : null,
    };
  }
  if (bothLive && !matched) {
    return {
      state: 'contested-terms', live: false, activeAgreement: null, liveA, liveB, matched: false,
      detail: 'Both counterparts signed live acts whose terms diverge; there is no one agreement in force.',
      forumId: null, forumName: null,
    };
  }
  if (liveA || liveB) {
    return {
      state: 'one-sided', live: false, activeAgreement: null, liveA, liveB, matched: false,
      detail: 'One counterpart signed terms and the other never answered; silence is not agreement.',
      forumId: null, forumName: null,
    };
  }
  if (sharedForum) {
    return {
      state: 'shared-forum', live: true, activeAgreement: null, liveA: null, liveB: null, matched: false,
      detail: `Both holders attend the active cadence forum “${sharedForumName}”.`,
      forumId: sharedForum.id, forumName: sharedForumName,
    };
  }
  return {
    state: 'none', live: false, activeAgreement: null, liveA: null, liveB: null, matched: false,
    detail: 'Neither an interface agreement nor a shared active cadence forum connects the two holders.',
    forumId: null, forumName: null,
  };
}

/* ---------------------------------------------------------------- the reader */

/**
 * Build the alignment matrix. Options:
 *   `now`               injected clock (the read date and the window)
 *   `settings`          canonical settings override
 *   `visiblePersonIds`  Set of person ids a scoped seat may read; null = all
 */
export function buildInterfaceAlignment(state, { now = new Date(), settings = null, visiblePersonIds = null } = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const generatedOn = dayKey(now);
  const resolvedSettings = normalizeInterfaceAlignmentSettings(settings || source.settings || {});
  const windowDays = resolvedSettings.interfaceAlignmentWindowDays;
  const rawLinks = Array.isArray(source.links) ? source.links : [];

  let matrix;
  try {
    matrix = buildMatrix(source, { now, settings: settings || source.settings || null });
  } catch (error) {
    const refused = emptyBoard(`The canonical matrix engine could not be built: ${String(error?.message || error)}`);
    return {
      engineVersion: INTERFACE_ALIGNMENT_ENGINE_VERSION, adr: INTERFACE_ALIGNMENT_ADR,
      ruleId: INTERFACE_ALIGNMENT_RULE_ID, generatedOn, settings: resolvedSettings,
      board: refused, pairs: [], interfaces: [], channels: [], rollUps: [], refusals: [],
      excluded: [], asks: emptyAsks(resolvedSettings),
      matrix: { hasMatrix: false, declaredLinesN: 0, activeLinesN: 0, defectsN: 0 },
      method: [...INTERFACE_ALIGNMENT_METHOD], conventions: INTERFACE_ALIGNMENT_CONVENTIONS,
      frameworks: INTERFACE_ALIGNMENT_FRAMEWORKS,
      pairVerdicts: INTERFACE_ALIGNMENT_PAIR_VERDICTS,
      arcStates: INTERFACE_ALIGNMENT_ARC_STATES,
      findings: INTERFACE_ALIGNMENT_FINDINGS,
    };
  }

  const today = generatedOn;
  const windowStart = new Date(now.getTime());
  windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
  const windowStartKey = dayKey(windowStart);

  const refusalCounts = new Map();
  const refusalReasons = new Map();
  const noteRefusal = (key, detail = null) => {
    refusalCounts.set(key, (refusalCounts.get(key) || 0) + 1);
    if (detail) {
      if (!refusalReasons.has(key)) refusalReasons.set(key, new Set());
      refusalReasons.get(key).add(String(detail).slice(0, 160));
    }
  };

  const links = [...rawLinks].sort((a, b) => linkSortKey(a).localeCompare(linkSortKey(b)));
  let boundsExceeded = false;
  if (links.length > INTERFACE_ALIGNMENT_LIMITS.maxLinks) {
    boundsExceeded = true;
    noteRefusal('limit-exceeded', `${links.length - INTERFACE_ALIGNMENT_LIMITS.maxLinks} link(s) beyond the ${INTERFACE_ALIGNMENT_LIMITS.maxLinks}-link bound were not read.`);
  }
  const scan = links.slice(0, INTERFACE_ALIGNMENT_LIMITS.maxLinks);

  /* -------------------------------------------- 1. people attribution edges */
  const peopleByNode = new Map();
  for (const link of scan) {
    if (!link || typeof link !== 'object') continue;
    const relation = str(link.relation);
    if (!PEOPLE_RELATIONS.has(relation)) continue;
    const st = str(link.sourceType);
    const tt = str(link.targetType);
    if (FORBIDDEN_LINK_TYPES.includes(st) || FORBIDDEN_LINK_TYPES.includes(tt)) continue;
    let workType = null;
    let workId = null;
    let personId = null;
    if (st === 'person' && tt !== 'person') {
      workType = tt; workId = str(link.targetId); personId = str(link.sourceId);
    } else if (tt === 'person' && st !== 'person') {
      workType = st; workId = str(link.sourceId); personId = str(link.targetId);
    } else {
      continue;
    }
    const key = nodeKey(workType, workId);
    if (!peopleByNode.has(key)) peopleByNode.set(key, new Set());
    peopleByNode.get(key).add(personId);
  }

  /* ----------------------------------------------- 2. declared precedence arcs */
  const nodes = new Map();
  const arcs = [];
  const arcKeys = new Set();
  const distinctPairs = new Set();
  const excludedCounts = new Map();
  let duplicateArcsN = 0;
  let selfArcsN = 0;
  for (const link of scan) {
    if (!link || typeof link !== 'object') continue;
    const relation = str(link.relation);
    const declared = RELATIONS.get(relation);
    if (!declared) {
      if (relation) {
        excludedCounts.set(relation, (excludedCounts.get(relation) || 0) + 1);
        if (!LINK_RELATIONS.includes(relation)) {
          noteRefusal('unknown-relation', `“${relation}” is not a declared relation on the typed graph`);
        }
      }
      continue;
    }
    const st = str(link.sourceType);
    const tt = str(link.targetType);
    const sid = str(link.sourceId);
    const tid = str(link.targetId);
    if (FORBIDDEN_LINK_TYPES.includes(st) || FORBIDDEN_LINK_TYPES.includes(tt)) {
      noteRefusal('forbidden-type', `${st} → ${tt}`);
      continue;
    }
    if (st === 'person' || tt === 'person') {
      noteRefusal('person-node', `${st} → ${tt}`);
      continue;
    }
    if (!NODE_TYPES.has(st) || !NODE_TYPES.has(tt)) {
      noteRefusal('outside-node-vocabulary', `${st} → ${tt}`);
      continue;
    }
    const sourceNode = resolveNode(source, st, sid);
    const targetNode = resolveNode(source, tt, tid);
    if (!sourceNode || !targetNode) {
      noteRefusal('unresolved-endpoint', `${st}:${sid} → ${tt}:${tid}`);
      continue;
    }
    nodes.set(sourceNode.key, sourceNode);
    nodes.set(targetNode.key, targetNode);
    const from = declared.direction === 'source-first' ? sourceNode.key : targetNode.key;
    const to = declared.direction === 'source-first' ? targetNode.key : sourceNode.key;
    const arcKey = `${from}>${to}|${relation}`;
    if (arcKeys.has(arcKey)) { duplicateArcsN += 1; noteRefusal('duplicate-arc', arcKey); continue; }
    arcKeys.add(arcKey);
    const self = from === to;
    if (self) {
      selfArcsN += 1;
      noteRefusal('self-arc', `${from} (${relation})`);
      continue;
    }
    // The window test: a link is in-window only when its recorded creation day
    // falls inside the declared window. A link with no readable date is an
    // `undated-link` refusal and is NEVER counted in-window — never guessed.
    const createdOn = str(link.createdOn);
    let inWindow = false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(createdOn)) {
      noteRefusal('undated-link', link.id || `${from}>${to}`);
    } else {
      inWindow = createdOn >= windowStartKey && createdOn <= today;
    }
    arcs.push({ from, to, relation, linkId: str(link.id), inWindow, createdOn });
    distinctPairs.add(`${from}>${to}`);
  }

  if (nodes.size > INTERFACE_ALIGNMENT_LIMITS.maxNodes || arcs.length > INTERFACE_ALIGNMENT_LIMITS.maxArcs) {
    boundsExceeded = true;
    noteRefusal('limit-exceeded', `${nodes.size} node(s) / ${arcs.length} arc(s) exceed the declared ${INTERFACE_ALIGNMENT_LIMITS.maxNodes}/${INTERFACE_ALIGNMENT_LIMITS.maxArcs} bound; no structural claim is made.`);
  }

  /* ------------------------------------------------- 3. line reach per node */
  const defectN = Array.isArray(matrix.defects) ? matrix.defects.length : 0;
  if (defectN) noteRefusal('matrix-defect', `${defectN} defect(s) in the declared reporting graph`);
  const lineReach = new Map();
  const nodeLabels = new Map();
  for (const key of sorted(nodes.keys())) {
    const node = nodes.get(key);
    const personIds = sorted(peopleByNode.get(key) || []);
    const managerIds = new Set();
    let known = defectN === 0;
    const reasons = [];
    if (!personIds.length) {
      known = false;
      reasons.push('No declared people-edge names anyone for this record.');
    }
    for (const personId of personIds) {
      if (visiblePersonIds && !visiblePersonIds.has(personId)) {
        known = false;
        noteRefusal('outside-seat', 'Named person outside this seat’s visible population.');
        reasons.push('A named person is outside this seat’s visible population.');
        continue;
      }
      if (!matrix.roster.has(personId)) {
        known = false;
        noteRefusal('untraced-person', visiblePersonIds ? 'off-roster person' : personId);
        reasons.push('A named person is not on the active roster.');
        continue;
      }
      const active = (matrix.linesByPerson.get(personId) || []).filter((line) => line && line.active !== false);
      if (!active.length) {
        known = false;
        noteRefusal('no-active-line', visiblePersonIds ? 'person with no active line' : personId);
        reasons.push('A named person has no active reporting line.');
        continue;
      }
      for (const line of active) managerIds.add(line.managerId);
    }
    const withheld = Boolean(visiblePersonIds && !personIds.length);
    nodeLabels.set(key, {
      withheld,
      label: withheld ? `${node.type}: withheld outside seat span` : `${node.type}: ${node.title}`,
    });
    lineReach.set(key, {
      state: known && managerIds.size ? 'known' : 'unattributed',
      personIds,
      managerIds: sorted(managerIds),
      reason: reasons.length ? sorted(new Set(reasons)).join(' ') : null,
    });
  }

  /* ------------------------------------- 4. arc classes (the technical side) */
  let crossHolderArcsN = 0;
  let crossHolderInWindowN = 0;
  let crossHolderOutOfWindowN = 0;
  let sameHolderArcsN = 0;
  let unattributedArcsN = 0;
  let undatedArcsN = 0;
  // pairKey (canonical unordered holder pair) -> interface accumulator
  const interfaceAcc = new Map();
  for (const arc of arcs) {
    const fromReach = lineReach.get(arc.from);
    const toReach = lineReach.get(arc.to);
    const exactlyOne = (reach) => reach && reach.state === 'known' && reach.managerIds.length === 1;
    if (!exactlyOne(fromReach) || !exactlyOne(toReach)) {
      unattributedArcsN += 1;
      noteRefusal('unattributed-endpoint', `${arc.from} → ${arc.to}`);
      continue;
    }
    const holderA = fromReach.managerIds[0];
    const holderB = toReach.managerIds[0];
    if (!arc.inWindow && !/^\d{4}-\d{2}-\d{2}$/.test(arc.createdOn)) undatedArcsN += 1;
    if (holderA === holderB) {
      sameHolderArcsN += 1;
      continue;
    }
    crossHolderArcsN += 1;
    if (arc.inWindow) crossHolderInWindowN += 1;
    else crossHolderOutOfWindowN += 1;
    const [managerAId, managerBId] = holderA < holderB ? [holderA, holderB] : [holderB, holderA];
    const pairKey = `${managerAId}|${managerBId}`;
    if (!interfaceAcc.has(pairKey)) {
      interfaceAcc.set(pairKey, {
        pairKey, managerAId, managerBId,
        flowsAB: 0, flowsBA: 0, depsN: 0, depsInWindowN: 0, depsOutOfWindowN: 0,
        members: new Map(),
      });
    }
    const entry = interfaceAcc.get(pairKey);
    entry.depsN += 1;
    if (arc.inWindow) entry.depsInWindowN += 1;
    else entry.depsOutOfWindowN += 1;
    if (holderA === managerAId) entry.flowsAB += 1;
    else entry.flowsBA += 1;
    const memberKey = `${arc.from}>${arc.to}`;
    if (!entry.members.has(memberKey)) {
      entry.members.set(memberKey, {
        fromKey: arc.from,
        toKey: arc.to,
        fromLabel: nodeLabels.get(arc.from)?.label || arc.from,
        toLabel: nodeLabels.get(arc.to)?.label || arc.to,
        relations: new Set(),
        arcsN: 0, inWindowN: 0,
      });
    }
    const member = entry.members.get(memberKey);
    member.arcsN += 1;
    if (arc.inWindow) member.inWindowN += 1;
    member.relations.add(arc.relation);
  }

  /* -------------------------------- 5. coordination channels (the org side) */
  const forumById = new Map((source.cadenceForums || []).filter(Boolean).map((f) => [f.id, f]));
  const activeForums = [...forumById.values()].filter((f) => f && f.status === 'active');
  const holderIds = new Set();
  for (const list of matrix.linesByPerson.values()) {
    for (const line of list || []) {
      if (line && line.active !== false && line.managerId) holderIds.add(line.managerId);
    }
  }
  // Shared active-forum membership between two HOLDERS (both in `attending`).
  const sharedForumByPair = new Map();
  for (const forum of activeForums) {
    const attending = sorted(new Set((Array.isArray(forum.attending) ? forum.attending : []).filter(Boolean)))
      .filter((id) => holderIds.has(id));
    for (let i = 0; i < attending.length; i += 1) {
      for (let j = i + 1; j < attending.length; j += 1) {
        const pairKey = `${attending[i]}|${attending[j]}`;
        if (!sharedForumByPair.has(pairKey)) sharedForumByPair.set(pairKey, []);
        sharedForumByPair.get(pairKey).push(forum);
      }
    }
  }
  const acts = normalizeMatrixInterfaceAgreements(source.matrixInterfaceAgreements, []);
  const actsByPair = new Map();
  for (const act of acts) {
    if (!actsByPair.has(act.pairKey)) actsByPair.set(act.pairKey, []);
    actsByPair.get(act.pairKey).push(act);
  }

  // Live shared contributors per pair (multi-line people, matrix engine only).
  const allocations = matrixAllocations(matrix);
  const allocList = Array.isArray(allocations) ? (allocations.people || allocations) : [];
  const sharedPeopleByPair = new Map();
  for (const alloc of allocList) {
    if (!alloc || !alloc.multiLine) continue;
    const managers = sorted(new Set((alloc.lines || []).map((l) => l && l.managerId).filter(Boolean)));
    for (let i = 0; i < managers.length; i += 1) {
      for (let j = i + 1; j < managers.length; j += 1) {
        const pairKey = `${managers[i]}|${managers[j]}`;
        if (!sharedPeopleByPair.has(pairKey)) sharedPeopleByPair.set(pairKey, new Set());
        sharedPeopleByPair.get(pairKey).add(alloc.personId);
      }
    }
  }

  /* ------------------------------------------------------- 6. pair verdicts */
  const pairKeys = sorted(new Set([
    ...interfaceAcc.keys(),
    ...actsByPair.keys(),
    ...sharedForumByPair.keys(),
  ]));
  const pairs = [];
  const channelStateCounts = new Map();
  const verdictCounts = new Map();
  const rollUpByApex = new Map();
  let liveAgreementsN = 0;
  let partialAgreementsN = 0;
  let ambiguousApexN = 0;

  const personLabel = (id) => {
    const key = str(id);
    if (visiblePersonIds && !visiblePersonIds.has(key)) return key;
    return matrix?.nodes?.get?.(key)?.name || key;
  };

  for (const pairKey of pairKeys) {
    const [managerAId, managerBId] = pairKey.split('|');
    const depEntry = interfaceAcc.get(pairKey) || {
      flowsAB: 0, flowsBA: 0, depsN: 0, depsInWindowN: 0, depsOutOfWindowN: 0, members: new Map(),
    };
    const sharedPeople = sharedPeopleByPair.get(pairKey) || new Set();
    const channel = deriveAgreementChannel(
      actsByPair.get(pairKey) || [],
      today,
      forumById,
      sharedForumByPair.get(pairKey) || [],
    );
    channelStateCounts.set(channel.state, (channelStateCounts.get(channel.state) || 0) + 1);
    if (channel.matched && channel.live) liveAgreementsN += 1;
    else if (actsByPair.has(pairKey)) partialAgreementsN += 1;

    let verdictKey;
    if (channel.state === 'live-agreement' && sharedPeople.size === 0 && depEntry.depsInWindowN === 0) {
      verdictKey = 'idle-channel';
    } else if (depEntry.depsN > 0) {
      if (channel.live) verdictKey = 'attended';
      else if (channel.state === 'none') verdictKey = 'unattended-interface';
      else verdictKey = 'channel-not-live';
    } else if (channel.live && sharedPeople.size > 0) {
      verdictKey = 'standing';
    } else if (channel.state === 'shared-forum') {
      verdictKey = 'forum-without-interface';
    } else if (channel.state !== 'none') {
      verdictKey = 'channel-without-interface';
    } else {
      // A pair with no dependency, no channel and no shared person is not a row.
      continue;
    }
    const verdict = interfaceAlignmentPairVerdict(verdictKey);
    verdictCounts.set(verdictKey, (verdictCounts.get(verdictKey) || 0) + 1);

    const isFinding = Boolean(verdict.failureMode);
    const apex = matrixJointApex(matrix, [managerAId, managerBId]);
    const apexIds = sorted(apex.apexIds || []);
    let escalationState = 'not-applicable';
    let escalationSeatId = null;
    if (isFinding) {
      if (!apex.unique || !apex.apexId) escalationState = 'ambiguous';
      else if (apex.apexId === LEADER_ID) escalationState = 'leader-held';
      else if (!matrix.roster.has(apex.apexId)) escalationState = 'off-roster';
      else { escalationState = 'unique'; escalationSeatId = apex.apexId; }
    }
    if (isFinding && escalationState === 'ambiguous') ambiguousApexN += 1;

    const signature = isFinding ? interfaceAlignmentSignature(pairKey, verdict.failureMode === 'agreement-idle' ? 'agreement-idle' : 'interface-unattended') : null;
    const memberRows = [...depEntry.members.values()]
      .sort((a, b) => `${a.fromLabel}|${a.toLabel}`.localeCompare(`${b.fromLabel}|${b.toLabel}`))
      .slice(0, INTERFACE_ALIGNMENT_LIMITS.maxPrintedInterfaces)
      .map((m) => ({
        fromLabel: m.fromLabel,
        toLabel: m.toLabel,
        relations: sorted(m.relations),
        arcsN: m.arcsN,
        inWindowN: m.inWindowN,
      }));

    const row = {
      pairKey,
      managerAId,
      managerBId,
      // Manager NAMES carry the same seat scoping as node labels: outside the
      // visible population the reader prints the id and never the name.
      managerAName: personLabel(managerAId),
      managerBName: personLabel(managerBId),
      flowsAB: depEntry.flowsAB,
      flowsBA: depEntry.flowsBA,
      depsN: depEntry.depsN,
      depsInWindowN: depEntry.depsInWindowN,
      depsOutOfWindowN: depEntry.depsOutOfWindowN,
      sharedPeopleN: sharedPeople.size,
      channelState: channel.state,
      channelStateLabel: interfaceAlignmentChannelState(channel.state).label,
      channelLive: channel.live,
      channelDetail: channel.detail,
      agreementStateDetail: channel.matched ? channel.detail : null,
      forumName: channel.forumName,
      verdict: verdictKey,
      verdictLabel: verdict.label,
      tone: verdict.tone,
      failureMode: verdict.failureMode,
      isFinding,
      signature,
      apexIds,
      apexUnique: Boolean(apex.unique && apex.apexId),
      escalationState,
      escalationSeatId,
      members: memberRows,
      membersN: depEntry.members.size,
      membersTruncatedN: Math.max(0, depEntry.members.size - memberRows.length),
    };
    pairs.push(row);

    const rollupKey = escalationState === 'unique' && escalationSeatId
      ? escalationSeatId
      : (apex.unique && apex.apexId ? apex.apexId : 'ambiguous');
    if (!rollUpByApex.has(rollupKey)) {
      rollUpByApex.set(rollupKey, {
        apexId: rollupKey === 'ambiguous' ? null : rollupKey,
        apexName: rollupKey === 'ambiguous' ? null : personLabel(rollupKey),
        pairsN: 0, unattendedN: 0, darkChannelN: 0, idleN: 0,
        attendedN: 0, standingN: 0, otherN: 0, findingsN: 0,
      });
    }
    const roll = rollUpByApex.get(rollupKey);
    roll.pairsN += 1;
    if (verdictKey === 'unattended-interface') roll.unattendedN += 1;
    else if (verdictKey === 'channel-not-live') roll.darkChannelN += 1;
    else if (verdictKey === 'idle-channel') roll.idleN += 1;
    else if (verdictKey === 'attended') roll.attendedN += 1;
    else if (verdictKey === 'standing') roll.standingN += 1;
    else roll.otherN += 1;
    if (isFinding) roll.findingsN += 1;
  }

  // Pairs that share a live contributor but carry no dependency and no channel:
  // context only — ADR-0162's `unagreed` territory, counted, never a row here.
  let sharedPeopleOnlyPairsN = 0;
  for (const pairKey of sharedPeopleByPair.keys()) {
    if (pairKeys.includes(pairKey)) continue;
    sharedPeopleOnlyPairsN += 1;
  }

  /* ------------------------------------------------------ 7. asks & markers */
  const indexedAsks = indexInterfaceAlignmentAsks(source);
  const askStates = Object.fromEntries(INTERFACE_ALIGNMENT_ASK_STATES.map((k) => [k, 0]));
  const escalationCounts = Object.fromEntries(INTERFACE_ALIGNMENT_ESCALATION_STATES.map((s) => [s.key, 0]));
  let openN = 0;
  let answeredN = 0;
  for (const pair of pairs) {
    escalationCounts[pair.escalationState] = (escalationCounts[pair.escalationState] || 0) + 1;
    if (!pair.isFinding) {
      pair.askState = 'not-applicable';
      pair.askDueOn = null;
      pair.askId = null;
      askStates['not-applicable'] += 1;
      continue;
    }
    const matching = indexedAsks.filter((a) => (
      a.signature === pair.signature && a.seatId === pair.escalationSeatId && a.task && a.task.personId === pair.escalationSeatId
    ));
    const openAsk = matching.find((a) => a.task.status === 'active');
    const answeredAsk = matching.find((a) => (
      (a.task.status === 'done' && !str(a.task.completionNote).startsWith(`Closed by ${INTERFACE_ALIGNMENT_RULE_ID}:`))
      || a.task.status === 'returned'
    ));
    if (openAsk) {
      pair.askState = 'open';
      pair.askDueOn = str(openAsk.task.dueOn) || null;
      pair.askId = openAsk.taskId;
      openN += 1;
    } else if (answeredAsk) {
      pair.askState = 'answered';
      pair.askDueOn = null;
      pair.askId = answeredAsk.taskId;
      answeredN += 1;
    } else if (pair.escalationState === 'unique' && pair.escalationSeatId) {
      pair.askState = 'not-issued';
      pair.askDueOn = null;
      pair.askId = null;
    } else {
      pair.askState = 'not-issued';
      pair.askDueOn = null;
      pair.askId = null;
    }
    askStates[pair.askState] = (askStates[pair.askState] || 0) + 1;
  }
  const markers = Array.isArray(source.matrixMarkers) ? source.matrixMarkers : [];
  const observationsN = markers.filter((m) => m && m.ruleId === INTERFACE_ALIGNMENT_RULE_ID && m.kind === 'interface-alignment').length;

  /* ------------------------------------------------------------- 8. board */
  const pairRowsN = pairs.length;
  const unattendedPairsN = verdictCounts.get('unattended-interface') || 0;
  const darkChannelPairsN = verdictCounts.get('channel-not-live') || 0;
  const idleAgreementPairsN = verdictCounts.get('idle-channel') || 0;
  const attendedPairsN = verdictCounts.get('attended') || 0;
  const standingPairsN = verdictCounts.get('standing') || 0;
  const forumOnlyPairsN = verdictCounts.get('forum-without-interface') || 0;
  const channelWithoutInterfaceN = verdictCounts.get('channel-without-interface') || 0;
  const failureModeInterfacesN = unattendedPairsN + darkChannelPairsN;
  const failureModeIdleN = idleAgreementPairsN;

  let verdictKey = 'no-cross-holder-interfaces';
  if (failureModeInterfacesN > 0) verdictKey = 'unattended-interfaces';
  else if (failureModeIdleN > 0) verdictKey = 'idle-channels';
  else if (pairRowsN > 0) verdictKey = 'aligned';
  const verdict = interfaceAlignmentWorkspaceVerdict(verdictKey);

  const countsReconcile = (crossHolderArcsN + sameHolderArcsN + unattributedArcsN === arcs.length)
    && (unattendedPairsN + darkChannelPairsN + idleAgreementPairsN + attendedPairsN + standingPairsN
      + forumOnlyPairsN + channelWithoutInterfaceN === pairRowsN)
    && (crossHolderInWindowN + crossHolderOutOfWindowN === crossHolderArcsN);
  const interfacesClaim = !boundsExceeded && unattributedArcsN === 0 && defectN === 0 && nodes.size > 0;
  const claimReason = boundsExceeded
    ? 'The graph exceeded a declared processing bound; the census is refused rather than partial.'
    : (defectN
      ? 'The declared reporting graph carries a load-time defect; holder sets are not provable.'
      : (unattributedArcsN
        ? `${unattributedArcsN} precedence arc(s) end on a record whose holder set is not exactly one accountable manager; those arcs are refused, never charged to a home line, and the census is incomplete.`
        : (nodes.size ? null : 'No declared precedence arc could be read.')));

  const refusals = INTERFACE_ALIGNMENT_REFUSALS
    .map((row) => ({
      key: row.key,
      label: row.label,
      count: refusalCounts.get(row.key) || 0,
      details: sorted(refusalReasons.get(row.key) || []),
    }))
    .filter((row) => row.count > 0);
  const refusalsN = refusals.reduce((sum, row) => sum + row.count, 0);
  const excluded = INTERFACE_ALIGNMENT_EXCLUDED_RELATIONS
    .map((row) => ({ relation: row.relation, reason: row.reason, count: excludedCounts.get(row.relation) || 0 }))
    .filter((row) => row.count > 0);
  const excludedRelationsN = excluded.reduce((sum, row) => sum + row.count, 0);

  const board = {
    verdict: verdictKey,
    verdictLabel: verdict.label,
    tone: verdict.tone,
    nodesN: nodes.size,
    precedenceArcsN: arcs.length,
    distinctPairsN: distinctPairs.size,
    crossHolderArcsN,
    crossHolderInWindowN,
    crossHolderOutOfWindowN,
    sameHolderArcsN,
    unattributedArcsN,
    undatedArcsN,
    pairRowsN,
    unattendedPairsN,
    darkChannelPairsN,
    idleAgreementPairsN,
    attendedPairsN,
    standingPairsN,
    forumOnlyPairsN,
    channelWithoutInterfaceN,
    sharedPeopleOnlyPairsN,
    liveAgreementsN,
    partialAgreementsN,
    sharedActiveForumsN: activeForums.length,
    failureModeInterfacesN,
    failureModeIdleN,
    rollupApexN: rollUpByApex.size,
    ambiguousApexN,
    excludedRelationsN,
    refusalsN,
    duplicateArcsN,
    selfArcsN,
    countsReconcile,
    figuresComplete: true,
    interfacesClaim,
    claimReason,
    reason: claimReason,
  };

  return {
    engineVersion: INTERFACE_ALIGNMENT_ENGINE_VERSION,
    adr: INTERFACE_ALIGNMENT_ADR,
    ruleId: INTERFACE_ALIGNMENT_RULE_ID,
    generatedOn,
    settings: resolvedSettings,
    board,
    pairs,
    pairsTotalN: pairRowsN,
    pairsTruncatedN: 0,
    verdictCounts: Object.fromEntries(INTERFACE_ALIGNMENT_PAIR_VERDICTS.map((row) => [row.key, verdictCounts.get(row.key) || 0])),
    channelStateCounts: Object.fromEntries(INTERFACE_ALIGNMENT_CHANNEL_STATES.map((row) => [row.key, channelStateCounts.get(row.key) || 0])),
    rollUps: [...rollUpByApex.values()].sort((a, b) => b.findingsN - a.findingsN || String(a.apexId || 'zz').localeCompare(String(b.apexId || 'zz'))),
    refusals,
    excluded,
    asks: {
      ruleId: INTERFACE_ALIGNMENT_RULE_ID,
      autoPropagate: resolvedSettings.interfaceAlignmentAutoPropagate,
      askDueDays: resolvedSettings.interfaceAlignmentAskDueDays,
      findingsN: pairs.filter((p) => p.isFinding).length,
      escalationStates: escalationCounts,
      askStates,
      openN,
      answeredN,
      notIssuedN: askStates['not-issued'] || 0,
      notApplicableN: askStates['not-applicable'] || 0,
      observationsN,
      reconciles: openN + answeredN + (askStates['not-issued'] || 0) + (askStates['not-applicable'] || 0) === pairRowsN,
    },
    matrix: {
      hasMatrix: matrix.roster.size > 0,
      declaredLinesN: Array.isArray(source.reportingLines) ? source.reportingLines.length : 0,
      activeLinesN: [...matrix.linesByPerson.values()].reduce((sum, list) => sum + (list || []).filter((l) => l && l.active !== false).length, 0),
      defectsN: defectN,
    },
    method: [...INTERFACE_ALIGNMENT_METHOD],
    conventions: INTERFACE_ALIGNMENT_CONVENTIONS,
    frameworks: INTERFACE_ALIGNMENT_FRAMEWORKS,
    pairVerdicts: INTERFACE_ALIGNMENT_PAIR_VERDICTS,
    arcStates: INTERFACE_ALIGNMENT_ARC_STATES,
    findings: INTERFACE_ALIGNMENT_FINDINGS,
  };
}

/**
 * Identity-free brief: never carries any person name, manager name, forum
 * title, pair key, record id or free text.
 */
export function interfaceAlignmentBriefText(report) {
  const b = report.board;
  const verdict = interfaceAlignmentWorkspaceVerdict(b.verdict);
  return [
    `Product–organisation interface alignment (${report.generatedOn}, window ${report.settings.interfaceAlignmentWindowDays} day(s))`,
    `Declared precedence arcs: ${b.precedenceArcsN} (${b.crossHolderArcsN} cross-holder, ${b.sameHolderArcsN} same-holder, ${b.unattributedArcsN} refused as unattributable).`,
    `Organisational interface rows: ${b.pairRowsN} — unattended ${b.unattendedPairsN}, dark channel ${b.darkChannelPairsN}, idle active agreements ${b.idleAgreementPairsN}, attended ${b.attendedPairsN}, standing ${b.standingPairsN}, forum-only context ${b.forumOnlyPairsN}.`,
    `Failure modes (printed apart): unattended technical interfaces ${b.failureModeInterfacesN}; idle coordination channels ${b.failureModeIdleN}.`,
    `Verdict: ${verdict.label}. Claims — counts reconcile: ${b.countsReconcile ? 'verified' : 'NOT verified'}; figures complete: ${b.figuresComplete ? 'verified' : 'NOT verified'}; census complete: ${b.interfacesClaim ? 'verified' : `REFUSED${b.claimReason ? ` (${b.claimReason})` : ''}`}.`,
  ].join('\n');
}

/**
 * Aggregate-only CSV rows (scope #142). Never names a person, manager, pair
 * key, forum, record id or free-text field beyond declared refusal reasons.
 * Counts come from the reader's own tallies (never from the truncated print
 * list), so an exported count is provably the count the board printed.
 */
export function interfaceAlignmentCsvRows(report) {
  const b = report.board;
  const s = report.settings;
  const blank = '';
  const base = {
    ...Object.fromEntries(INTERFACE_ALIGNMENT_CSV_COLUMNS_ALL.map((key) => [key, blank])),
    engine: report.engineVersion,
    generated_on: report.generatedOn,
    window_days: String(s.interfaceAlignmentWindowDays),
  };
  const rows = [
    {
      ...base,
      row_kind: 'workspace',
      nodes_n: String(b.nodesN),
      precedence_arcs_n: String(b.precedenceArcsN),
      cross_holder_arcs_n: String(b.crossHolderArcsN),
      cross_holder_in_window_n: String(b.crossHolderInWindowN),
      cross_holder_out_of_window_n: String(b.crossHolderOutOfWindowN),
      same_holder_arcs_n: String(b.sameHolderArcsN),
      unattributed_arcs_n: String(b.unattributedArcsN),
      pair_rows_n: String(b.pairRowsN),
      unattended_pairs_n: String(b.unattendedPairsN),
      dark_channel_pairs_n: String(b.darkChannelPairsN),
      idle_agreement_pairs_n: String(b.idleAgreementPairsN),
      attended_pairs_n: String(b.attendedPairsN),
      standing_pairs_n: String(b.standingPairsN),
      forum_only_pairs_n: String(b.forumOnlyPairsN),
      shared_people_only_pairs_n: String(b.sharedPeopleOnlyPairsN),
      live_agreements_n: String(b.liveAgreementsN),
      partial_agreements_n: String(b.partialAgreementsN),
      shared_active_forums_n: String(b.sharedActiveForumsN),
      failure_mode_interfaces_n: String(b.failureModeInterfacesN),
      failure_mode_idle_n: String(b.failureModeIdleN),
      rollup_apex_n: String(b.rollupApexN),
      ambiguous_apex_n: String(b.ambiguousApexN),
      escalation_unique_n: String(report.asks.escalationStates.unique || 0),
      asks_open_n: String(report.asks.openN),
      asks_answered_n: String(report.asks.answeredN),
      asks_not_issued_n: String(report.asks.notIssuedN),
      counts_reconcile: b.countsReconcile ? 'yes' : 'no',
      figures_complete: b.figuresComplete ? 'yes' : 'no',
      interfaces_claim: b.interfacesClaim ? 'yes' : 'no',
      claim_reason: b.claimReason || blank,
      verdict: b.verdict,
    },
  ];
  for (const verdictRow of INTERFACE_ALIGNMENT_PAIR_VERDICTS) {
    rows.push({
      ...base,
      row_kind: 'pair-verdict',
      state_key: verdictRow.key,
      state_count: String(report.verdictCounts?.[verdictRow.key] ?? 0),
    });
  }
  for (const channelRow of INTERFACE_ALIGNMENT_CHANNEL_STATES) {
    rows.push({
      ...base,
      row_kind: 'channel-state',
      state_key: channelRow.key,
      state_count: String(report.channelStateCounts?.[channelRow.key] ?? 0),
    });
  }
  for (const refusal of report.refusals) {
    rows.push({
      ...base,
      row_kind: 'refusal',
      refusal_key: refusal.key,
      refusal_count: String(refusal.count),
      refusal_reason: REFUSAL_LABELS.get(refusal.key) || refusal.key,
    });
  }
  return rows;
}

const INTERFACE_ALIGNMENT_CSV_COLUMNS_ALL = [
  'row_kind', 'engine', 'generated_on', 'window_days', 'nodes_n', 'precedence_arcs_n',
  'cross_holder_arcs_n', 'cross_holder_in_window_n', 'cross_holder_out_of_window_n',
  'same_holder_arcs_n', 'unattributed_arcs_n', 'pair_rows_n',
  'unattended_pairs_n', 'dark_channel_pairs_n', 'idle_agreement_pairs_n',
  'attended_pairs_n', 'standing_pairs_n', 'forum_only_pairs_n',
  'shared_people_only_pairs_n', 'live_agreements_n', 'partial_agreements_n',
  'shared_active_forums_n', 'failure_mode_interfaces_n', 'failure_mode_idle_n',
  'rollup_apex_n', 'ambiguous_apex_n', 'escalation_unique_n',
  'asks_open_n', 'asks_answered_n', 'asks_not_issued_n',
  'counts_reconcile', 'figures_complete', 'interfaces_claim', 'claim_reason',
  'verdict', 'state_key', 'state_count', 'refusal_key', 'refusal_count', 'refusal_reason',
];
