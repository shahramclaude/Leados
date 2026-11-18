/** ADR-0252: evidence on an existing abnormal check, not a second quality
 * workflow. No inference from a note, no new escalation, no release authority. */
import { STANDARD_WORK_RIGHTS } from './standardWorkRegistry.js';
import { LOOKBACK_LIMITS as L, traceInstrumentUses } from './instrumentLookback.js';
import { LOOKBACK_WARNING, readInstrumentPaper } from './instrumentLookbackSchema.js';

const fail = (error, field = null) => ({ ok: false, error, field });
const denied = () => fail('No instrument workpaper is readable at that reference from this seat.');

/** seatFor is Standard Work’s existing, matrix-aware read/write boundary. */
export function createInstrumentLookbackActions(store, { seatFor, idFactory }) {
  const papers = () => store.state.instrumentLookbacks;
  function context(check) {
    const stamp = check.at.toISOString();
    const parents = new Map(store.state.standardWorkChecks.filter((c) => c.outcome === 'abnormal'
      && c.recordedOn <= check.today && (!c.recordedAt || c.recordedAt <= stamp)).map((c) => [c.id, c]));
    const addressed = new Set(store.state.standardWorkTierActs.filter((act) => act.act === 'escalated' && act.toId === check.actorId
      && act.actedOn <= check.today && (!act.actedAt || act.actedAt <= stamp)).map((act) => act.checkId));
    function grant(parent) {
      if (!parent) return 'none';
      if (check.seat.fullAccess || parent.recordedById === check.actorId) return 'source';
      if (parent.disposition === 'escalated' && (parent.toId === check.actorId || addressed.has(parent.id))) return 'worklist';
      return check.seat.scope?.has(parent.recordedById) || check.seat.lineScope?.has(parent.recordedById) ? 'counts' : 'none';
    }
    return { parents, grant };
  }

  return {
    instrumentLookbackIndex() {
      const check = seatFor(STANDARD_WORK_RIGHTS.READ);
      if (!check.ok) return check;
      const { parents, grant } = context(check);
      const titles = new Map(store.state.standardWorkRoutines.map((r) => [r.id, r.title]));
      const candidates = [...parents.values()].filter((p) => p.recordedById === check.actorId)
        .map((p) => ({ checkId: p.id, checkOn: p.recordedOn, title: titles.get(p.routineId), note: p.note }))
        .sort((a, b) => b.checkOn.localeCompare(a.checkOn) || a.checkId.localeCompare(b.checkId));
      const entries = [];
      let supported = 0, withheld = 0, countOnly = 0;
      for (const paper of papers()) {
        const parent = parents.get(paper.checkId);
        const access = grant(parent);
        if (access === 'none') continue;
        const trace = traceInstrumentUses(paper);
        if (trace.decisionTotal === null) withheld += 1;
        else supported += 1;
        if (access === 'counts') { countOnly += 1; continue; }
        entries.push({ id: paper.id, instrumentRef: paper.instrumentRef, sourceRef: paper.sourceRef, recordedAt: paper.recordedAt,
          title: titles.get(parent.routineId), checkOn: parent.recordedOn, totalWithheld: trace.decisionTotal === null });
      }
      entries.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id));
      const warnings = store.warnings.filter((w) => typeof w === 'string' && w.startsWith(LOOKBACK_WARNING));
      return { ok: true, today: check.today, candidates, entries, countOnly, supported, withheld, inScope: supported + withheld,
        persistError: store.persistError, warnings: !check.seat.fullAccess && warnings.length
          ? ['Instrument evidence was refused on load. These counts describe readable workpapers only; the operator can inspect the import warnings.'] : warnings };
    },

    instrumentLookbackRead(id) {
      const check = seatFor(STANDARD_WORK_RIGHTS.READ);
      if (!check.ok) return check;
      const paper = papers().find((p) => p.id === id);
      const { parents, grant } = context(check);
      const parent = parents.get(paper?.checkId);
      const access = grant(parent);
      if (!paper || (access !== 'source' && access !== 'worklist')) return denied();
      const trace = traceInstrumentUses(paper);
      // An explicitly addressed tier needs the relevant references, not other
      // lines' out-of-window inspections from the same source extract.
      if (access === 'worklist') trace.rows = trace.rows.filter((r) => r.placement === 'matched' || r.placement === 'possible');
      return { ok: true, access, trace, checkOn: parent.recordedOn, note: parent.note,
        withheldRows: trace.distinctUses - trace.rows.length, persistError: store.persistError };
    },

    async instrumentLookbackRecord(input = {}) {
      const check = seatFor(STANDARD_WORK_RIGHTS.RECORD);
      if (!check.ok) return check;
      if (store.writeBlockReason) return fail(store.writeBlockReason);
      const parent = store.state.standardWorkChecks.find((p) => p.id === input?.checkId);
      if (parent?.outcome !== 'abnormal' || parent.recordedById !== check.actorId) {
        return fail('Only the original recorder may attach evidence to their own abnormal check. No record was changed.', 'checkId');
      }
      const recordedAt = check.at.toISOString();
      const built = readInstrumentPaper({ ...input, id: idFactory('ilb'), recordedById: check.actorId, recordedAt }, parent, recordedAt);
      if (!built.ok) return built;
      const { paper } = built;
      if (papers().some((p) => p.id === paper.id)) return fail('Generated workpaper ID already exists. Nothing was overwritten.');
      if (papers().some((p) => p.checkId === paper.checkId && p.instrumentRef === paper.instrumentRef && p.sourceRef === paper.sourceRef)) {
        return fail('That source version is already recorded for this instrument and check. Use a new version reference for revised evidence; the original stays on record.', 'sourceRef');
      }
      if (papers().length >= L.papers || papers().reduce((n, p) => n + p.uses.length, paper.uses.length) > L.workspaceRows) {
        return fail(`The workspace limit is ${L.papers} workpapers and ${L.workspaceRows} source rows. Nothing was saved or truncated.`);
      }
      store.update((draft) => { draft.instrumentLookbacks.push(paper); }, {
        type: 'standardWork.instrument-traced', entity: 'standardWork', entityId: parent.routineId,
        summary: 'A dated instrument-use extract was recorded on an abnormal check. No disposition or release was made.',
      });
      if (store.isEncrypted) await store.flush();
      return { ok: true, id: paper.id, saved: !store.persistError, warning: store.persistError || null };
    },
  };
}
