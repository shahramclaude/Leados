/** Mission Control commands. All operational writes reuse the production APIs. */
import { dayKey, addDays } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMission, missionBriefSnapshot, missionBriefText, validateMissionCommands } from './mission.js';
import { MISSION_EVENTS, MISSION_LIMITS } from './missionRegistry.js';
import { normalizeMissionBriefs } from './missionSchema.js';
import { proposeBundle, validateBundleCommands } from './actionBundleRegistry.js';
import { guardApiCall } from './accessGateway.js';

export function createMissionActions(store, { now, idFactory, createApi }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const current = (seatId = null) => buildMission(store.state, { now: now(), seatId });
  const saved = (extra = {}) => ({ ok: true, ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] });
  // Mission adapters are allowlisted at the shell, but every operational write
  // still passes the same record/person/budget gateway as a direct API call.
  const guarded = (name, ...args) => {
    const verdict = guardApiCall(store.state, name, args);
    if (!verdict.ok) return verdict;
    return createApi(store, { now, idFactory })[name](...args);
  };
  return {
    missionRead(seatId = null) { return current(seatId); },
    missionScan() {
      store.update(() => {}, { type: MISSION_EVENTS.SCAN, entity: 'workspace', entityId: '', summary: 'Mission Control reconciled vertical work provenance' });
      return saved({ report: current() });
    },
    setMissionFloor(value) {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 3 || n > 25) return fail('Choose a whole-number disclosure floor from 3 to 25.', 'missionCellFloor');
      store.update((d) => { d.settings.missionCellFloor = n; }, { type: 'mission.floor_set', entity: 'workspace', entityId: '', summary: `Small-cell disclosure floor set to ${n}; complementary suppression remains enabled` });
      return saved({ report: current() });
    },
    missionOpenCase(input = {}) {
      const api = createApi(store, { now, idFactory });
      const m = current(); if (!m.ok) return m;
      const ownerId = input.ownerId || null;
      if (ownerId && !m.owners.some((p) => p.id === ownerId)) return fail('Choose an owner inside the operating span.', 'ownerId');
      if (!ownerId && m.seat.rank <= 2) return fail('Choose an accountable owner inside this team.', 'ownerId');
      // An executive situation is owned at the executive altitude by naming the
      // child leaders whose common span is this seat. No individual IC is named.
      const involvedPersonIds = !ownerId && m.seat.rank >= 3 ? m.hierarchy.cells.map((c) => c.seatId).filter(Boolean) : [];
      if (!ownerId && m.seat.rank >= 3 && !involvedPersonIds.length) return fail('This altitude has no child leadership span to own the situation. Choose an accountable leader.', 'ownerId');
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (title.length < 3 || title.length > 180) return fail('Name the situation in 3–180 characters.', 'title');
      const reviewOn = input.reviewOn || addDays(dayKey(now()), m.profile.reviewDays);
      const result = api.addCase({ title, description: String(input.description || '').slice(0, 4000), kind: 'risk', ownerId,
        involvedPersonIds, reviewOn, fmea: { severity: Number(input.severity) || null }, autoPropagate: true });
      return result.ok ? saved({ id: result.id || result.caseId, result }) : result;
    },
    missionCreateIntervention(input = {}) {
      const m = current(); if (!m.ok) return m;
      const source = m.eligibleCases.find((c) => c.id === input.caseId);
      if (!source) return fail('Choose a case this altitude may read and act on.', 'caseId');
      const proposal = proposeBundle(store.state, source.id, now());
      if (!proposal.ok) return proposal;
      const kinds = Array.isArray(input.kinds) && input.kinds.length ? input.kinds : m.profile.commands.filter((k) => proposal.commands.some((c) => c.kind === k));
      const rankCheck = validateMissionCommands(kinds.map((kind) => ({ kind })), m.seat.rank);
      if (!rankCheck.ok) return rankCheck;
      if (kinds.includes('comms') && !proposal.commands.some((c) => c.kind === 'comms')) return fail('No key or opposing stakeholder qualifies for a brief. Add one on the case first.', 'kinds');
      const ownerId = input.ownerId || (m.owners.some((p) => p.id === source.ownerId) ? source.ownerId : m.owners[0]?.id);
      if (!ownerId) return fail('Choose an accountable leader inside this span.', 'ownerId');
      if (!m.owners.some((p) => p.id === ownerId)) return fail('The intervention owner is outside this span.', 'ownerId');
      const dueOn = input.reviewOn || addDays(dayKey(now()), m.profile.reviewDays);
      const proposed = proposal.commands.filter((c) => kinds.includes(c.kind));
      if (kinds.includes('budget') && !m.budgets.some((b) => b.id === input.budgetId)) return fail('Choose a budget envelope owned by this operating span.', 'budgetId');
      if (kinds.includes('budget') && !proposed.some((c) => c.kind === 'budget')) proposed.push({ kind: 'budget', title: 'Reviewed mission commitment', sourceId: source.id });
      const commands = proposed.map((c) => ({ ...c, ownerId, dueOn,
        ...(c.kind === 'budget' ? { budgetId: input.budgetId || '', amount: Number(input.amount) } : {}) }));
      const valid = validateBundleCommands(commands, store.state, now());
      if (!valid.ok) return valid;
      return guarded('createActionBundle', { name: `${m.profile.title} · ${source.title}`.slice(0, 180), sourceType: 'case', sourceId: source.id, reviewOn: dueOn, commands: valid.value });
    },
    saveMissionPreview(bundleId, preview) { return guarded('saveActionBundlePreview', bundleId, preview); },
    missionCommit(bundleId, expectedRevision, reviewed) { return guarded('commitActionBundle', bundleId, { expectedRevision, reviewed }); },
    missionWithdraw(bundleId, reason) { return guarded('withdrawActionBundle', bundleId, { reason }); },
    missionArchive(bundleId) { return guarded('archiveActionBundle', bundleId); },
    missionFreezeBrief(expectedRevision) {
      const built = buildSeats(store.state, { now: now() }); const seat = activeSeat(built);
      const right = canAct('freeze-board-summary', seat);
      if (!right.allow || seat.fullAccess || !seat.isLeader) return fail('Declare the enterprise root seat to freeze a board brief. The undeclared operator view is not a publisher identity.');
      if (expectedRevision !== store.state.meta.revision) return fail('The workspace changed. Refresh the reading before freezing it.', 'expectedRevision');
      if ((store.state.missionBriefs || []).length >= MISSION_LIMITS.briefs) return fail('The immutable brief ledger is full. Export an archive before continuing; no snapshot was silently deleted.');
      const m = current(); if (!m.ok) return m;
      const snapshot = { ...missionBriefSnapshot(store.state, m, now()), id: idFactory('mission') };
      const warnings = []; const normalized = normalizeMissionBriefs([snapshot], warnings);
      if (warnings.length || normalized.length !== 1) return fail(warnings[0] || 'The brief could not be validated.');
      store.update((d) => { d.missionBriefs.unshift(normalized[0]); }, { type: MISSION_EVENTS.FROZEN, entity: 'missionbrief', entityId: snapshot.id,
        summary: `Identity-free mission brief frozen at revision ${snapshot.sourceRevision}; one governed review and span provenance requested` });
      return saved({ id: snapshot.id, brief: store.state.missionBriefs.find((b) => b.id === snapshot.id) });
    },
    missionHandoffText(seatId = null) {
      const report = current(seatId); if (!report.ok) return report;
      return { ok: true, text: missionBriefText(missionBriefSnapshot(store.state, report, now())) };
    },
    missionBriefText(briefId) {
      const brief = (store.state.missionBriefs || []).find((b) => b.id === briefId);
      if (!brief) return fail('That brief no longer exists.');
      const built = buildSeats(store.state, { now: now() }); const seat = activeSeat(built);
      if (!seat.fullAccess && (seat.rank < 4 || (brief.seatId !== seat.id && !seat.scope.has(brief.seatId)))) return fail('This brief is outside the operating seat’s enterprise disclosure boundary.');
      return { ok: true, text: missionBriefText(brief), brief };
    },
  };
}
