/**
 * app/core/domain/changeSaturationActions.js — the reviewed API doors of the
 * Cross-Line Change Saturation & Absorptive-Capacity Ledger (ADR-0186).
 *
 *   changeSaturationReport          seat-scoped read (SAFE_READS);
 *   changeSaturationDeclareDemand   one line declares what an open change puts on
 *                                   one person, at one weight band, over one
 *                                   dated window — the act every figure rests on;
 *   changeSaturationWithdrawDemand  withdraw a demand recorded in error. The row
 *                                   is marked, never deleted: a demand that
 *                                   silently disappeared would move every
 *                                   person's total and no reader could tell;
 *   changeSaturationDeclareCeiling  declare the capacity a person or a pool will
 *                                   absorb, in whole concurrent units, for a dated
 *                                   window — the only place a capacity enters;
 *   changeSaturationRetireCeiling   retire a declaration whose period has changed;
 *   changeSaturationScan            re-run RULE-CSA-01 on the shared spine;
 *   changeSaturationSetConventions  change the declared conventions. A value
 *                                   outside its bounds is REFUSED with the bound
 *                                   printed — never clamped into something nobody
 *                                   chose.
 *
 * Every write goes through `store.update`, so RULE-CSA-01, the Operating Seat's
 * roll-up and the seal all run in the same atomic commit.
 *
 * There is deliberately NO command that infers a demand from a change's status,
 * its go-live date or its effort triple, and no command that sets a capacity from
 * headcount, level or meeting load. Either would put a number under an approval
 * that no human made, which is the failure this ledger exists to prevent.
 */
import { dayKey } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildChangeSaturation } from './changeSaturation.js';
import {
  normalizeChangeSaturationSettings,
  validateChangeDemand,
  validateChangeCeiling,
} from './changeSaturationSchema.js';
import {
  CHANGE_SATURATION_BANDS,
  CHANGE_SATURATION_BOUNDS,
  CHANGE_SATURATION_EVENTS,
  CHANGE_SATURATION_LIMITS,
  CHANGE_SATURATION_RIGHTS,
  CHANGE_SATURATION_RULE_ID,
  CHANGE_SATURATION_SETTING_KEYS,
  CHANGE_SATURATION_SETTING_LABELS,
  CHANGE_SATURATION_DETAIL_LEVELS,
  changeSaturationBand,
  changeSaturationScope,
} from './changeSaturationRegistry.js';

// A refusal is a plain result object. `extra` carries the clause list so the
// caller — and the panel — can name EXACTLY which clauses failed instead of
// re-parsing them out of a sentence.
const fail = (error, field = 'scope', extra = null) => ({
  ok: false,
  error,
  field,
  ...(extra && typeof extra === 'object' ? extra : {}),
});

function seatOf(state, at) {
  const settings = state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings });
  const scope = matrixLineScope(matrix);
  return activeSeat(buildSeats(state, { now: at, settings, lineScope: scope.byManager }));
}

function saved(store, extra = {}) {
  return {
    ok: true,
    ...extra,
    saved: store.isEncrypted ? null : !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  };
}

const SETTING_NAME_BY_KEY = new Map(Object.entries(CHANGE_SATURATION_SETTING_KEYS).map(([name, key]) => [key, name]));

/** The disclosure level a seat is entitled to. Printed, never silently narrowed. */
function detailFor(seat) {
  if (seat.fullAccess) return 'full';
  const rank = Number.isInteger(seat.rank) ? seat.rank : 1;
  if (rank >= 3) return 'full';
  if (rank >= 1) return 'span';
  return 'none';
}

export function createChangeSaturationActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const x = now(); return x instanceof Date ? x : new Date(x); };
  const id = (prefix) => (idFactory ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  return {
    /** Seat-scoped read of the ledger. The disclosure ladder is applied IN the read. */
    changeSaturationReport(input = {}) {
      const at = clock();
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('The operating seat is unresolved; the change-saturation ledger cannot be read.');
      const detailLevel = CHANGE_SATURATION_DETAIL_LEVELS.includes(input.detailLevel)
        ? input.detailLevel
        : detailFor(seat);
      const visiblePersonIds = seat.fullAccess ? null : new Set([...(seat.scope || []), ...(seat.lineScope || [])]);
      return {
        ok: true,
        report: buildChangeSaturation(store.state, { now: at, settings: store.state.settings || {}, visiblePersonIds, detailLevel }),
        seat: { id: seat.id, fullAccess: seat.fullAccess, rank: seat.rank, detailLevel },
      };
    },

    /**
     * Declare one change demand against one person, from one line. Validated by
     * the SAME function the loader uses, so an act this door accepts can never be
     * dropped by the next reload — the two can only disagree about a bug, never
     * about policy. The live line check is added here because a write has the
     * graph; the read re-checks it, and the loader must not.
     */
    changeSaturationDeclareDemand(input = {}) {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before declaring a change demand.');
      const right = canAct(CHANGE_SATURATION_RIGHTS.DECLARE, seat);
      if (!right.allow) return fail(right.reason || 'Declaring a change demand requires a leadership seat.');
      const matrix = buildMatrix(store.state, { now: at, settings: store.state.settings || {} });
      const { refusals, act } = validateChangeDemand(store.state, input, { today, matrix, idFactory: id });
      if (refusals.length) {
        return fail(`The demand was refused: ${refusals.join(', ')}. Nothing was saved.`, 'band', { refusals });
      }
      // A seat may only declare a demand for a person it reaches, and only DOWN A
      // LINE IT HOLDS — a manager cannot speak for another line's change work, and
      // cannot make an absent line's silence look like a declaration.
      if (!seat.fullAccess && !(seat.scope?.has(act.personId) || seat.lineScope?.has(act.personId))) {
        return fail('This person sits outside your span and your declared lines, so you cannot declare a demand for them.', 'personId');
      }
      // The home line is `home:<personId>` and is held by the roster's own
      // `managerId`; an additional line is held by the manager named on it. Either
      // way the seat must be that manager, so a peer cannot speak for a line and a
      // manager cannot put their change onto somebody else's person.
      if (!seat.fullAccess) {
        const personRow = (store.state.people || []).find((p) => p && p.id === act.personId) || null;
        const homeLineKey = `home:${act.personId}`;
        // A person with no home manager has no home line to speak for: the
        // workspace view can still declare, a seat cannot invent the ownership.
        const holds = act.lineKey === homeLineKey
          ? (personRow?.managerId || null) === seat.id
          : (matrix.linesByPerson?.get?.(act.personId) || [])
            .some((line) => String(line.id) === act.lineKey && line.managerId === seat.id);
        if (!holds) return fail('You can only declare a demand down a line you hold. Your counterpart may declare their own.', 'lineKey');
      }
      const person = (store.state.people || []).find((p) => p && p.id === act.personId);
      const change = (store.state.changes || []).find((c) => c && c.id === act.changeId);
      const row = {
        ...act,
        note: typeof input.note === 'string' ? input.note.trim().slice(0, CHANGE_SATURATION_LIMITS.noteMax) : '',
        declaredOn: today,
        declaredById: seat.fullAccess ? null : seat.id,
        at: at.toISOString(),
        // The withdrawal fields are written here rather than left for the loader to
        // invent, so the row this action accepted is byte-identical to the row the
        // next reload reads — the pair the ADR promises and a partial shape would
        // quietly break.
        withdrawn: false,
        withdrawnOn: null,
        withdrawnById: null,
        withdrawnReason: null,
        withdrawnAt: null,
      };
      store.update((draft) => {
        const list = Array.isArray(draft.changeSaturationActs) ? draft.changeSaturationActs : [];
        draft.changeSaturationActs = [...list, row];
      }, {
        type: CHANGE_SATURATION_EVENTS.DEMAND_DECLARED,
        entity: 'person',
        entityId: act.personId,
        summary: `Declared a change demand of band ${changeSaturationBand(act.band).label.toLowerCase()} on ${person?.name || act.personId} for “${change?.title || act.changeId}” (${row.fromOn} → ${row.toOn}).`,
      });
      return saved(store, { demandId: row.id, band: row.band, fromOn: row.fromOn, toOn: row.toOn });
    },

    /**
     * Withdraw a demand recorded in error. The row is MARKED, never deleted: the
     * record of who withdrew it, when and why is the only thing that makes the
     * correction auditable, and a deleted demand would silently move a verdict.
     */
    changeSaturationWithdrawDemand(demandId, reason = '') {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before withdrawing a change demand.');
      const right = canAct(CHANGE_SATURATION_RIGHTS.DECLARE, seat);
      if (!right.allow) return fail(right.reason || 'Withdrawing a change demand requires a leadership seat.');
      const demand = (store.state.changeSaturationActs || []).find((a) => a && a.id === demandId);
      if (!demand) return fail('Choose an existing recorded demand.', 'demandId');
      if (demand.withdrawn === true) return fail('This demand is already withdrawn; nothing was changed.', 'demandId');
      const isDeclarer = seat.fullAccess || demand.declaredById === seat.id;
      // The declaring line's holder, or the person the demand was put on: nobody
      // else can correct a statement that is not theirs. A counterpart manager who
      // disagrees files their own declaration; they do not delete this one.
      if (!isDeclarer && demand.personId !== seat.id) {
        return fail('Only the line that declared this demand, or the person it was declared on, can withdraw it. Disagreement is recorded as a dated statement of your own.', 'demandId');
      }
      const text = typeof reason === 'string' ? reason.trim().slice(0, CHANGE_SATURATION_LIMITS.noteMax) : '';
      if (text.length < 8) {
        return fail('Say why the demand is being withdrawn (at least 8 characters). A withdrawal with no reason is indistinguishable from a deletion nobody can audit.', 'reason');
      }
      store.update((draft) => {
        const list = Array.isArray(draft.changeSaturationActs) ? draft.changeSaturationActs : [];
        const target = list.find((a) => a && a.id === demandId);
        if (!target) return;
        target.withdrawn = true;
        target.withdrawnOn = today;
        target.withdrawnById = seat.fullAccess ? null : seat.id;
        target.withdrawnReason = text;
        target.withdrawnAt = at.toISOString();
      }, {
        type: CHANGE_SATURATION_EVENTS.DEMAND_WITHDRAWN,
        entity: 'person',
        entityId: demand.personId,
        summary: `Withdrew change demand ${demandId}: ${text.slice(0, 120)}`,
      });
      return saved(store, { demandId, withdrawnOn: today });
    },

    /**
     * Declare the capacity a person or a pool will absorb. There is no default
     * ceiling and no derived one: the register prints `no capacity declared` until
     * a human writes a sentence, and that refusal is the product.
     */
    changeSaturationDeclareCeiling(input = {}) {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before declaring a capacity ceiling.');
      const right = canAct(CHANGE_SATURATION_RIGHTS.GOVERN, seat);
      if (!right.allow) return fail(right.reason || 'Declaring an absorptive-capacity ceiling requires a leadership seat.');
      const scope = typeof input.scope === 'string' ? input.scope.trim() : '';
      if (!changeSaturationScope(scope)) return fail('A ceiling is declared for a person or for a pool. Nothing else.', 'scope');
      const { refusals, ceiling } = validateChangeCeiling(store.state, input, { today, idFactory: id });
      if (refusals.length) {
        return fail(`The ceiling was refused: ${refusals.join(', ')}. Nothing was saved.`, 'units', { refusals });
      }
      // A pool ceiling belongs to the manager who holds that pool; a person
      // ceiling belongs to one of that person's lines. A seat may not cap a span
      // it does not run, because that would be a limit imposed on another
      // manager's people by nobody.
      if (!seat.fullAccess) {
        if (scope === 'pool' && ceiling.subjectId !== seat.id) {
          return fail('A pool ceiling is declared by the manager who runs that pool.', 'subjectId');
        }
        if (scope === 'person' && !(seat.scope?.has(ceiling.subjectId) || seat.lineScope?.has(ceiling.subjectId))) {
          return fail('This person sits outside your span and your declared lines, so you cannot set their ceiling.', 'subjectId');
        }
      }
      const subject = (store.state.people || []).find((p) => p && p.id === ceiling.subjectId);
      const row = {
        ...ceiling,
        note: typeof input.note === 'string' ? input.note.trim().slice(0, CHANGE_SATURATION_LIMITS.noteMax) : '',
        declaredOn: today,
        declaredById: seat.fullAccess ? null : seat.id,
        retired: false,
        retiredOn: null,
        retiredById: null,
        at: at.toISOString(),
      };
      store.update((draft) => {
        const list = Array.isArray(draft.changeSaturationCeilings) ? draft.changeSaturationCeilings : [];
        draft.changeSaturationCeilings = [...list, row];
      }, {
        type: CHANGE_SATURATION_EVENTS.CEILING_DECLARED,
        entity: 'person',
        entityId: ceiling.subjectId,
        summary: `Declared an absorptive-capacity ceiling of ${ceiling.units} concurrent weight unit(s) for ${subject?.name || ceiling.subjectId} (${scope} scope, ${ceiling.fromOn} → ${ceiling.toOn}).`,
      });
      return saved(store, { ceilingId: row.id, scope: row.scope, units: row.units, fromOn: row.fromOn, toOn: row.toOn });
    },

    changeSaturationRetireCeiling(ceilingId, reason = '') {
      const at = clock();
      const today = dayKey(at) || at.toISOString().slice(0, 10);
      const seat = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before retiring a capacity ceiling.');
      const right = canAct(CHANGE_SATURATION_RIGHTS.GOVERN, seat);
      if (!right.allow) return fail(right.reason || 'Retiring a capacity ceiling requires a leadership seat.');
      const ceiling = (store.state.changeSaturationCeilings || []).find((c) => c && c.id === ceilingId);
      if (!ceiling) return fail('Choose an existing declaration.', 'ceilingId');
      if (ceiling.retired) return fail('This ceiling is already retired; nothing was changed.', 'ceilingId');
      if (!seat.fullAccess && ceiling.scope === 'pool' && ceiling.subjectId !== seat.id && ceiling.declaredById !== seat.id) {
        return fail('Only the manager who runs that pool, or the seat that declared the ceiling, can retire it.', 'ceilingId');
      }
      store.update((draft) => {
        const list = Array.isArray(draft.changeSaturationCeilings) ? draft.changeSaturationCeilings : [];
        const row = list.find((c) => c && c.id === ceilingId);
        if (!row) return;
        row.retired = true;
        row.retiredOn = today;
        row.retiredById = seat.fullAccess ? null : seat.id;
        row.retiredNote = typeof reason === 'string' ? reason.trim().slice(0, CHANGE_SATURATION_LIMITS.noteMax) : '';
      }, {
        type: CHANGE_SATURATION_EVENTS.CEILING_RETIRED,
        entity: 'person',
        entityId: ceiling.subjectId,
        summary: `Retired the ${ceiling.scope} capacity ceiling of ${ceiling.units} unit(s) (${ceiling.fromOn} → ${ceiling.toOn}).`,
      });
      return saved(store, { ceilingId, retiredOn: today });
    },

    /**
     * A scan issues asks and a convention changes the ground every seat reads
     * against, so both sit with the seat that owns the control environment. A
     * manager's OWN declarations above need no such floor — the register would be
     * useless to the altitude it exists for if a mid-manager could not record what
     * their line put on somebody.
     */
    changeSaturationScan() {
      const seat = seatOf(store.state, clock());
      const right = canAct(CHANGE_SATURATION_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && (seat.rank < 3 || !right.allow))) {
        return fail(right.reason || 'Scanning the change-saturation register requires rank 3 or the workspace view; a manager may still declare their own demands and ceilings.');
      }
      store.update(() => {}, {
        type: CHANGE_SATURATION_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'change-saturation',
        summary: `Scanned the cross-line change-saturation register (${CHANGE_SATURATION_RULE_ID}).`,
      });
      return saved(store, { effects: (store.lastPropagations || []).filter((x) => x?.ruleId === CHANGE_SATURATION_RULE_ID) });
    },

    changeSaturationSetConventions(patch) {
      const seat = seatOf(store.state, clock());
      const right = canAct(CHANGE_SATURATION_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && (seat.rank < 3 || !right.allow))) {
        return fail(right.reason || 'Changing the saturation conventions requires rank 3 or the workspace view; they are read by every seat, not only the one that owns them.');
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Conventions must be a declared patch object.', 'patch');
      const next = {};
      for (const [key, value] of Object.entries(patch)) {
        const name = SETTING_NAME_BY_KEY.get(key);
        if (!name) return fail(`“${String(key).slice(0, 60)}” is not a change-saturation convention. Nothing was saved.`, 'patch');
        if (name === 'autoPropagate') {
          if (typeof value !== 'boolean') return fail(`${CHANGE_SATURATION_SETTING_LABELS[name]} must be true or false. Nothing was saved.`, key);
          next[key] = value;
          continue;
        }
        const [min, max] = CHANGE_SATURATION_BOUNDS[name];
        if (!Number.isInteger(value) || value < min || value > max) {
          return fail(`${CHANGE_SATURATION_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
        }
        next[key] = value;
      }
      const before = normalizeChangeSaturationSettings(store.state.settings || {});
      const changed = Object.keys(next).filter((key) => before[key] !== next[key]);
      if (!changed.length) return fail('Those are already the conventions in force; nothing was changed.', 'patch');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: CHANGE_SATURATION_EVENTS.CONVENTIONS,
        entity: 'workspace',
        entityId: 'change-saturation',
        summary: `Changed change-saturation conventions: ${changed.join(', ')}.`,
      });
      return saved(store, { changed, conventions: normalizeChangeSaturationSettings(store.state.settings || {}) });
    },

    /** The five bands and their meaning, for a form that must not invent a sixth. */
    changeSaturationBands() {
      return { ok: true, bands: CHANGE_SATURATION_BANDS.map((band) => ({ value: band.value, key: band.key, label: band.label, meaning: band.meaning })) };
    },
  };
}
