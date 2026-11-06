/** RULE-MIS-01: a frozen brief becomes a governed review and span provenance. */
import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { MISSION_EVENTS, MISSION_RULES } from './missionRegistry.js';
import { displayBound } from './mission.js';
import { buildSeats } from './seat.js';
import { LEADER_ID } from './chain.js';

export function missionRule(draft, ctx = {}) {
  if (ctx.event?.type === MISSION_EVENTS.CAPTURE_ADOPTED && ctx.event.entity === 'missioncapture') {
    const capture = (draft.missionCaptures || []).find((r) => r.id === ctx.event.entityId);
    if (!capture || capture.status !== 'adopted' || !capture.caseId || !capture.bundleId) return [];
    const effects = [];
    const add = (targetType, targetId, relation, summary) => {
      const result = ensureEntityLink(draft, { sourceType: 'missioncapture', sourceId: capture.id, targetType, targetId, relation,
        ruleId: MISSION_RULES.ROLLUP, summary }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() });
      if (result.created) effects.push({ ruleId: MISSION_RULES.ROLLUP, action: 'linked', targetType, targetId, summary });
    };
    add('case', capture.caseId, 'responds-to', 'The reviewed source case created in this capture transaction.');
    add('bundle', capture.bundleId, 'coordinates', 'The atomic action bundle adopted with the source case.');
    const built = buildSeats(draft, { now: ctx.now, settings: draft.settings });
    let cursor = capture.ownerSeatId; const seen = new Set();
    while (cursor && !seen.has(cursor) && seen.size < 16) {
      seen.add(cursor);
      if (cursor === LEADER_ID || built.byId.has(cursor)) add('person', cursor, 'rolls-up-to', 'Hierarchy provenance only. The source note and classifier evidence remain at the preparing seat.');
      if (cursor === LEADER_ID) break;
      cursor = built.chain.nodes.get(cursor)?.parentId || LEADER_ID;
    }
    return effects;
  }
  if (ctx.event?.type !== MISSION_EVENTS.FROZEN || ctx.event.entity !== 'missionbrief') return [];
  const brief = (draft.missionBriefs || []).find((r) => r.id === ctx.event.entityId);
  if (!brief) return [];
  const effects = [];
  const add = (sourceType, sourceId, targetType, targetId, relation, summary) => {
    const result = ensureEntityLink(draft, { sourceType, sourceId, targetType, targetId, relation,
      ruleId: MISSION_RULES.ROLLUP, summary }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() });
    if (result.created) effects.push({ ruleId: MISSION_RULES.ROLLUP, action: 'linked', targetType, targetId, summary });
  };
  for (const cell of brief.cells) {
    if (cell.seatId) add('missionbrief', brief.id, 'person', cell.seatId, 'summarizes-span', 'Identity-free aggregate provenance; no individual work detail is copied upward.');
  }
  const existing = (draft.links || []).find((l) => l.sourceType === 'missionbrief' && l.sourceId === brief.id && l.relation === 'tracks-followup' && (draft.decisions || []).some((d) => d.id === l.targetId));
  if (!existing) {
    const decision = { id: ctx.idFactory('dec'), title: 'Review the frozen enterprise mission brief',
      question: `At revision ${brief.sourceRevision}, open work was ${displayBound(brief.open)} and overdue work ${displayBound(brief.overdue)}. Maintain, revise or stop the current commitments; record what evidence would change the choice.`,
      date: dayKey(ctx.now), reviewOn: brief.reviewOn, reversibility: 'reversible', driver: 'Mission Control', approver: 'Workspace leader', contributors: '', informed: '',
      options: [{ id: 'maintain', label: 'Maintain the current commitments', pros: 'Preserves continuity', cons: 'May retain an obsolete constraint' }, { id: 'revise', label: 'Revise the operating plan', pros: 'Adapts to the evidence', cons: 'Consumes coordination capacity' }, { id: 'stop', label: 'Stop or defer a commitment', pros: 'Releases scarce capacity', cons: 'May forgo upside' }],
      chosen: '', rationale: '', decidedOn: null, reviewedOn: null, outcome: 'pending', outcomeNotes: '', forecastProbability: null, portfolioNotes: [] };
    draft.decisions.unshift(decision);
    add('missionbrief', brief.id, 'decision', decision.id, 'tracks-followup', 'A frozen brief opens one explicit board review; it never chooses an option.');
    effects.push({ ruleId: MISSION_RULES.ROLLUP, action: 'created', targetType: 'decision', targetId: decision.id, summary: 'One governed review opened from the frozen aggregate.' });
  }
  return effects;
}
