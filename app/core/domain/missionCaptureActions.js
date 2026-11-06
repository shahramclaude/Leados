/** Reviewed Command Flow writes, mounted on the existing guarded API. */
import { addDays, dayKey } from '../time.js';
import { toCaseInput } from './intake.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildMission } from './mission.js';
import { fingerprint } from './actionBundles.js';
import { cleanBundlePreview } from './actionBundleSchema.js';
import { normalizeMissionCaptures } from './missionCaptureSchema.js';
import { analyzeCapture, captureInputFingerprint, captureReceiptText, captureSourceFingerprint, capturesForSeat, prepareCapturePlan, transactMissionCapture } from './missionCapture.js';
import { MISSION_EVENTS, MISSION_LIMITS } from './missionRegistry.js';

export function createMissionCaptureActions(store, { now, idFactory, createApi }) {
  const clock = () => now() instanceof Date ? now() : new Date(now());
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const saved = (extra = {}) => ({ ok: true, ...extra, saved: !store.persistError, warning: store.persistError || null, propagations: store.lastPropagations || [] });
  const own = (id) => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings });
    const seat = activeSeat(built);
    if (seat.readOnly) return { error: 'Declare a valid seat before acting.' };
    const right = canAct('coordinate-intervention', seat);
    if (!right.allow) return { error: right.reason };
    const capture = (store.state.missionCaptures || []).find((c) => c.id === id);
    if (!capture) return { error: 'That capture no longer exists.' };
    if (capture.ownerSeatId !== seat.id) return { error: 'Only the seat that prepared this note may read or change it. Ancestors receive governed work, not the note.' };
    return { capture, seat };
  };
  function record(input, existing = null) {
    const m = buildMission(store.state, { now: clock() });
    if (!m.ok) return m;
    const text = typeof input.text === 'string' ? input.text : existing?.sourceText;
    const analyzed = analyzeCapture(text, store.state, { now: clock() });
    if (!analyzed.ok) return analyzed;
    const ownerId = typeof input.ownerId === 'string' ? input.ownerId.trim() : existing?.ownerId;
    if (!ownerId || !m.owners.some((p) => p.id === ownerId)) return fail('Choose an accountable owner inside this operating span.', 'ownerId');
    const title = String(input.title || `${analyzed.classification.primaryLabel} · leadership review`).trim();
    if (title.length < 3 || title.length > 180) return fail('Use a 3–180 character case title.', 'title');
    const reviewOn = input.reviewOn || existing?.reviewOn || addDays(dayKey(clock()), m.profile.reviewDays);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewOn) || !Number.isFinite(Date.parse(reviewOn)) || new Date(reviewOn).toISOString().slice(0, 10) !== reviewOn || reviewOn < dayKey(clock()) || reviewOn > addDays(dayKey(clock()), 365)) return fail('Choose a valid review date within the next year.', 'reviewOn');
    const kinds = input.kinds ?? existing?.kinds ?? m.profile.commands.filter((k) => ['decision', 'delegation', 'premise', 'coaching'].includes(k));
    if (!Array.isArray(kinds) || !kinds.length || new Set(kinds).size !== kinds.length || kinds.some((k) => !m.profile.commands.includes(k))) return fail('Choose at least one action permitted at this altitude.', 'kinds');
    const severity = input.severity === '' || input.severity == null ? analyzed.analysis.fmeaPrior?.severity || 5 : Number(input.severity);
    if (!Number.isInteger(severity) || severity < 1 || severity > 10) return fail('Severity must be a whole number from 1 to 10.', 'severity');
    const caseInput = toCaseInput(analyzed.analysis, { title, ownerId, reviewOn, openedOn: dayKey(clock()), fmeaSeverity: severity, autoPropagate: true });
    caseInput.summary = `Command Flow: ${title}. Local heuristic class: ${analyzed.classification.primaryLabel}. The source note stays with the preparing seat; confirm the facts with the accountable owner.`;
    caseInput.linkedGoalId = null; // A fuzzy goal match is not a reviewed commitment.
    caseInput.involvedPersonIds = m.seat.rank <= 2 ? analyzed.matchedOwnerIds : [];
    const budgetId = kinds.includes('budget') ? String(input.budgetId ?? existing?.budgetId ?? '') : null;
    const amount = kinds.includes('budget') ? Number(input.amount ?? existing?.amount) : null;
    if (kinds.includes('budget') && (!m.budgets.some((b) => b.id === budgetId) || !Number.isFinite(amount) || amount <= 0 || amount > 1e12)) return fail('Choose an eligible envelope and enter a positive commitment amount. An extracted loss is not approved spend.', 'amount');
    const priorPct = Number(input.priorPct ?? existing?.priorPct ?? 70);
    if (!Number.isInteger(priorPct) || priorPct < 5 || priorPct > 95) return fail('An assumption prior must be a whole percentage from 5 to 95.', 'priorPct');
    const row = {
      id: existing?.id || idFactory('capture'), title, sourceText: text.trim(), ownerId, ownerSeatId: m.seat.id,
      rank: m.seat.rank, altitudeKey: m.seat.altitudeKey, reviewOn, status: 'draft', caseInput, kinds: [...kinds],
      classification: analyzed.classification, commands: [], budgetId, amount, priorPct,
      inputFingerprint: '', sourceFingerprint: '', planFingerprint: '', baseRevision: store.state.meta.revision,
      evaluatedAt: null, preview: null, caseId: existing?.caseId || null, bundleId: existing?.bundleId || null,
      createdAt: existing?.createdAt || clock().toISOString(), updatedAt: clock().toISOString(), adoptedAt: existing?.adoptedAt || null,
      dismissedAt: null, dismissReason: '', history: [...(existing?.history || []), { at: clock().toISOString(), type: existing ? 'updated' : 'prepared', summary: 'Human-reviewed proposal; no operational record has been created.' }].slice(-60),
    };
    row.inputFingerprint = captureInputFingerprint(row); row.sourceFingerprint = captureSourceFingerprint(store.state, row);
    const plan = prepareCapturePlan(store.state, row, clock());
    if (!plan.ok) return plan;
    const warnings = []; const normalized = normalizeMissionCaptures([row], store.state, warnings, { now: clock() });
    if (warnings.length || normalized.length !== 1) return fail(warnings[0] || 'The capture could not be validated.');
    return { ok: true, capture: normalized[0], updating: Boolean(existing) };
  }
  return {
    missionCaptureAnalyze(text) {
      const result = analyzeCapture(text, store.state, { now: clock() });
      if (!result.ok) return result;
      // The internal mapper needs the full analysis; the public adapter must not
      // disclose out-of-span person matches or copy the note into a case body.
      return { ok: true, classification: result.classification, matchedOwnerIds: result.matchedOwnerIds, stakesReviewRequired: result.stakesReviewRequired, fmeaPrior: result.analysis.fmeaPrior || null };
    },
    missionCaptureRead(captureId) {
      const access = own(captureId); if (access.error) return fail(access.error);
      return { ok: true, capture: capturesForSeat(store.state, access.seat.id, { now: clock() }).find((c) => c.id === captureId) };
    },
    missionCapturePrepare(input = {}) {
      const existing = input.captureId ? own(input.captureId) : null;
      if (existing?.error) return fail(existing.error);
      if (existing && !['draft', 'rehearsed'].includes(existing.capture.status)) return fail('An adopted or dismissed capture is history. Prepare a new response instead.');
      if (!existing && (store.state.missionCaptures || []).length >= MISSION_LIMITS.captures) return fail('The capture ledger is full. Export a backup before continuing; nothing was silently deleted.');
      const prepared = record(input, existing?.capture || null); if (!prepared.ok) return prepared;
      store.update((draft) => {
        if (prepared.updating) draft.missionCaptures[draft.missionCaptures.findIndex((c) => c.id === prepared.capture.id)] = prepared.capture;
        else draft.missionCaptures.unshift(prepared.capture);
      }, { type: prepared.updating ? MISSION_EVENTS.CAPTURE_UPDATED : MISSION_EVENTS.CAPTURE_PREPARED, entity: 'missioncapture', entityId: prepared.capture.id, summary: 'Situation classified and scoped; operational writes await rehearsal and human approval' });
      return saved({ id: prepared.capture.id, capture: store.state.missionCaptures.find((c) => c.id === prepared.capture.id) });
    },
    saveMissionCapturePreview(captureId, result) {
      const access = own(captureId); if (access.error) return fail(access.error);
      const capture = access.capture;
      if (!['draft', 'rehearsed'].includes(capture.status)) return fail('This capture is no longer open for rehearsal.');
      if (!result || result.captureId !== captureId || result.baseRevision !== store.state.meta.revision || result.evaluatedAt?.slice(0, 10) !== dayKey(clock())
        || result.inputFingerprint !== captureInputFingerprint(capture) || result.sourceFingerprint !== captureSourceFingerprint(store.state, capture)) return fail('The rehearsal is stale or belongs to another capture. Run it again.');
      const plan = prepareCapturePlan(store.state, capture, clock());
      if (!plan.ok) return plan;
      if (result.planFingerprint !== plan.fingerprint || fingerprint(result.commands) !== plan.fingerprint) return fail('The worker commands do not match the reviewed proposal.');
      const preview = cleanBundlePreview(result.preview);
      if (!preview || preview.failureCount || fingerprint(preview) !== fingerprint(result.preview)) return fail('The rehearsal is incomplete or contains rule failures. Adoption remains blocked.');
      const candidate = { ...capture, status: 'rehearsed', commands: plan.commands, planFingerprint: plan.fingerprint, preview, evaluatedAt: result.evaluatedAt, baseRevision: result.baseRevision, updatedAt: clock().toISOString(), history: [...capture.history, { at: clock().toISOString(), type: 'rehearsed', summary: 'The exact case and action transaction completed in a disposable workspace.' }].slice(-60) };
      const warnings = []; const normalized = normalizeMissionCaptures([candidate], store.state, warnings, { now: clock() });
      if (warnings.length || normalized.length !== 1 || normalized[0].status !== 'rehearsed') return fail(warnings[0] || 'The rehearsal could not be validated.');
      store.update((draft) => { draft.missionCaptures[draft.missionCaptures.findIndex((c) => c.id === captureId)] = normalized[0]; },
        { type: MISSION_EVENTS.CAPTURE_REHEARSED, entity: 'missioncapture', entityId: captureId, summary: 'Whole response rehearsed off the main thread; no live operational record changed' },
        { afterRules: (draft) => { draft.missionCaptures.find((c) => c.id === captureId).baseRevision = draft.meta.revision; } });
      return saved({ id: captureId, capture: store.state.missionCaptures.find((c) => c.id === captureId) });
    },
    missionCaptureCommit(captureId, expectedRevision, reviewed) {
      const access = own(captureId); if (access.error) return fail(access.error);
      return transactMissionCapture(store, captureId, { expectedRevision, reviewed }, { now: clock(), idFactory, createApi });
    },
    missionCaptureDismiss(captureId, reason) {
      const access = own(captureId); if (access.error) return fail(access.error);
      if (!['draft', 'rehearsed'].includes(access.capture.status)) return fail('Only an uncommitted capture can be dismissed.');
      const note = typeof reason === 'string' ? reason.trim() : '';
      if (note.length < 5 || note.length > 600) return fail('Record a 5–600 character reason for dismissing this proposal.', 'reason');
      store.update((draft) => { const c = draft.missionCaptures.find((r) => r.id === captureId); Object.assign(c, { status: 'dismissed', dismissReason: note, dismissedAt: clock().toISOString(), updatedAt: clock().toISOString() }); c.history.push({ at: clock().toISOString(), type: 'dismissed', summary: note }); },
        { type: MISSION_EVENTS.CAPTURE_DISMISSED, entity: 'missioncapture', entityId: captureId, summary: 'Uncommitted capture dismissed with a recorded reason' });
      return saved({ id: captureId });
    },
    missionCaptureWithdraw(captureId, reason) {
      const access = own(captureId); if (access.error) return fail(access.error);
      if (access.capture.status !== 'adopted' || !access.capture.bundleId) return fail('Only an adopted capture has actions to withdraw.');
      const result = createApi(store, { now, idFactory }).missionWithdraw(access.capture.bundleId, reason);
      return result.ok ? saved({ id: captureId, caseId: access.capture.caseId, caseRetained: true }) : result;
    },
    missionCaptureReceipt(captureId) {
      const access = own(captureId); if (access.error) return fail(access.error);
      return { ok: true, text: captureReceiptText(store.state, access.capture) };
    },
  };
}
