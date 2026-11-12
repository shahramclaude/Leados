/**
 * app/core/domain/pausePermitActions.js — the reviewed API doors of the
 * Automation Pause Permit Register (ADR-0182).
 *
 *   pausePermitReport       seat-scoped read (SAFE_READS);
 *   pausePermitRevoke       withdraw an authority and bring its switch back up;
 *   pausePermitScan         re-run RULE-PMP-01 on the shared spine;
 *   pausePermitSetConventions  change the declared conventions. A value outside
 *                           its bounds is REFUSED with the bound printed —
 *                           never clamped into something nobody chose.
 *
 * THERE USED TO BE NO `grant` DOOR HERE, AND THAT IS THE POINT OF ADR-0182.
 *
 * A pause already exists as a bare `updateSettings({ '…AutoPropagate': false })`.
 * That door stays open (it is how every existing control in the app is switched
 * off) and now takes a SECOND, optional argument: a permit. Passing one records
 * the authority and writes the switch in the SAME atomic commit. Omitting one
 * still pauses — but the pause is then `unpermitted`, printed as such, and
 * escalated by RULE-PMP-01. The register does not block the leader's hand; it
 * refuses to let the silence be anonymous.
 */
import { addDays, dayKey } from '../time.js';
import { buildMatrix, matrixJointApex, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildPausePermits, declaredSwitches } from './pausePermits.js';
import { normalizePausePermitSettings, permitInForce } from './pausePermitSchema.js';
import {
  PAUSE_PERMIT_BOUNDS,
  PAUSE_PERMIT_DEFAULTS,
  PAUSE_PERMIT_EVENTS,
  PAUSE_PERMIT_LIMITS,
  PAUSE_PERMIT_REFUSALS,
  PAUSE_PERMIT_RIGHTS,
  PAUSE_PERMIT_RULE_ID,
  PAUSE_PERMIT_SCOPES,
  PAUSE_PERMIT_SETTING_KEYS,
  PAUSE_PERMIT_SETTING_LABELS,
  isPermittableSwitchKey,
} from './pausePermitRegistry.js';

const fail = (error, field = 'scope', extra = {}) => ({ ok: false, error, field, ...extra });

function seatOf(state, at) {
  const settings = state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings });
  const scope = matrixLineScope(matrix);
  return { seat: activeSeat(buildSeats(state, { now: at, settings, lineScope: scope.byManager })), matrix };
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

const SETTING_NAME_BY_KEY = new Map(Object.entries(PAUSE_PERMIT_SETTING_KEYS).map(([name, key]) => [key, name]));

/**
 * Everything that can be wrong with a permit request, checked against the
 * record as it stands. Returns the FIRST refusal in the closed order plus every
 * reason it failed, so a caller is told the whole truth and the register never
 * reports one failure as if it were the only one.
 */
export function validatePermitRequest(state, { key, reason, mitigation, from, to, counterpartId, scope }, { asPause = false, today = null } = {}) {
  const failed = [];
  const switches = new Set(declaredSwitches(state?.settings || {}));
  if (!key || typeof key !== 'string') failed.push('unknown-switch');
  else if (!isPermittableSwitchKey(key)) failed.push('not-a-switch');
  else if (!switches.has(key)) failed.push('unknown-switch');

  // `already-on` is a refusal only when the caller is NOT the one switching it
  // off: `updateSettings(patch, permit)` has not applied the patch yet, so the
  // switch still reads on and refusing there would refuse every honest pause.
  const on = state?.settings?.[key] !== false;
  if (failed.length === 0 && on && !asPause) failed.push('already-on');

  // The reading day is INJECTED. Reading the wall clock here made the grant path
  // disagree with every other reader in the app under a fixture clock.
  const readDay = today || dayKey(new Date());
  const live = failed.length === 0 ? permitInForce(state?.pausePermits || [], key, readDay) : null;
  if (failed.length === 0 && live) failed.push('already-permitted');

  const reasonText = typeof reason === 'string' ? reason.trim() : '';
  if (reasonText.length < PAUSE_PERMIT_LIMITS.reasonMinChars || reasonText.length > PAUSE_PERMIT_LIMITS.reasonMaxChars) {
    failed.push('reason-too-short');
  }
  const mitigationText = typeof mitigation === 'string' ? mitigation.trim() : '';
  if (mitigationText.length < PAUSE_PERMIT_LIMITS.mitigationMinChars || mitigationText.length > PAUSE_PERMIT_LIMITS.mitigationMaxChars) {
    failed.push('no-mitigation');
  }

  // The window: both ends present, ordered, not already over, inside the cap.
  const first = typeof from === 'string' ? from.slice(0, 10) : null;
  const last = typeof to === 'string' ? to.slice(0, 10) : null;
  const days = first && last
    ? Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000) + 1
    : null;
  if (!first || !last || Number.isNaN(Date.parse(`${first}T00:00:00Z`)) || Number.isNaN(Date.parse(`${last}T00:00:00Z`))
    || last < first || last < readDay || (days !== null && days > PAUSE_PERMIT_LIMITS.maxDays)) failed.push('bad-window');

  if (scope !== undefined && scope !== null && !PAUSE_PERMIT_SCOPES.includes(scope)) failed.push('bad-window');

  if (counterpartId) {
    const roster = new Set((state?.people || []).map((p) => p.id));
    if (!roster.has(String(counterpartId))) failed.push('counterpart-not-on-record');
  }

  return { failed, first: failed[0] || null, reasonText, mitigationText, first, last, days, today: readDay };
}

export function createPausePermitActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const x = now(); return x instanceof Date ? x : new Date(x); };
  const id = (prefix) => (idFactory ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  return {
    pausePermitReport() {
      const report = buildPausePermits(store.state, { now: clock() });
      if (report.seat.readOnly) return fail('The operating seat is unresolved; the pause-permit register cannot be read.');
      return { ok: true, report };
    },

    /**
     * Grant a permit AND flip the switch, in one atomic commit.
     *
     * `updateSettings` cannot do this: the permit has to exist before the
     * switch moves, or the commit's post-commit rules would read a pause with
     * no authority for it. Both writes therefore happen inside ONE `store.update`
     * mutator, and RULE-PMP-01 sees the finished pair.
     */
    pausePermitGrant(input = {}) {
      const at = clock();
      const { seat, matrix } = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before granting a pause permit.');
      const right = canAct(PAUSE_PERMIT_RIGHTS.GRANT, seat);
      if (!right.allow) return fail(right.reason || 'Silencing an automatic control for the whole workspace requires director rank.');

      const check = validatePermitRequest(store.state, input, { today: dayKey(at) });
      // The authoriser's rank is part of the refusal set, checked here so the
      // caller gets ONE answer listing every failure.
      if (!seat.fullAccess) {
        const apex = matrixJointApex(matrix, [...matrix.roster.keys()]);
        if (!apex.unique || apex.apexId !== seat.id) check.failed.push('authoriser-too-junior');
      }
      if (check.failed.length) {
        return fail(
          `The permit was refused: ${check.failed.join(', ')}. Nothing was saved and the switch did not move.`,
          'key',
          { refusals: check.failed },
        );
      }

      const existing = Array.isArray(store.state.pausePermits) ? store.state.pausePermits : [];
      if (existing.length >= PAUSE_PERMIT_LIMITS.permits) {
        return fail(`The permit ledger holds its declared cap of ${PAUSE_PERMIT_LIMITS.permits} permits and is full; revoke or export before granting another.`, 'key', { refusals: ['ledger-full'] });
      }

      const permit = {
        id: id('pmp'),
        key: input.key,
        authoriserId: seat.fullAccess ? null : seat.id,
        reason: check.reasonText,
        mitigation: check.mitigationText,
        scope: PAUSE_PERMIT_SCOPES.includes(input.scope) ? input.scope : 'workspace',
        scopeTargetId: input.scopeTargetId ? String(input.scopeTargetId).slice(0, PAUSE_PERMIT_LIMITS.idMax) : null,
        counterpartId: input.counterpartId ? String(input.counterpartId).slice(0, PAUSE_PERMIT_LIMITS.idMax) : null,
        from: check.first,
        to: check.last,
        at: at.toISOString(),
        revoked: false,
        revokedOn: null,
        revokedById: null,
        revokedReason: null,
      };

      store.update((draft) => {
        const list = Array.isArray(draft.pausePermits) ? draft.pausePermits : [];
        draft.pausePermits = [permit, ...list];
        // The switch moves in the SAME commit. A permit for a pause that never
        // happened would be authority in search of a silence.
        draft.settings = { ...(draft.settings || {}), [permit.key]: false };
      }, {
        type: PAUSE_PERMIT_EVENTS.REQUESTED,
        entity: 'settings',
        entityId: permit.key,
        summary: `Permitted the pause of ${permit.key} to ${permit.to} (${permit.scope}); the switch was set off in the same commit.`,
      });
      return saved(store, { permitId: permit.id, key: permit.key, to: permit.to });
    },

    /**
     * Withdraw the authority and bring the switch back up, in one commit. A
     * revoke that left the switch off would be the worst of both worlds: no
     * authoriser named and the control still silent.
     */
    pausePermitRevoke(permitId, revocationReason = '') {
      const at = clock();
      const { seat } = seatOf(store.state, at);
      if (seat.readOnly) return fail('Resolve the operating seat before revoking a pause permit.');
      const right = canAct(PAUSE_PERMIT_RIGHTS.GRANT, seat);
      if (!right.allow) return fail(right.reason || 'Bringing a silenced control back up requires director rank.');
      const permits = Array.isArray(store.state.pausePermits) ? store.state.pausePermits : [];
      const permit = permits.find((p) => p && p.id === permitId);
      if (!permit) return fail('Choose an existing permit.', 'permitId');
      if (permit.revoked) return fail('This permit is already revoked; nothing was changed.', 'permitId');
      if (!seat.fullAccess && permit.authoriserId && permit.authoriserId !== seat.id) {
        const apex = matrixJointApex(seat.matrix || buildMatrix(store.state, { now: at, settings: store.state.settings }), [...(store.state.people || []).map((p) => p.id)]);
        if (!apex.unique || apex.apexId !== seat.id) {
          return fail('Only the authoriser, or the one seat above every reporting line, may withdraw this permit.', 'permitId');
        }
      }
      const today = dayKey(at);
      const reasonText = typeof revocationReason === 'string' ? revocationReason.trim().slice(0, PAUSE_PERMIT_LIMITS.reasonMaxChars) : '';
      store.update((draft) => {
        const list = Array.isArray(draft.pausePermits) ? draft.pausePermits : [];
        const target = list.find((p) => p && p.id === permitId);
        if (!target) return;
        target.revoked = true;
        target.revokedOn = today;
        target.revokedById = seat.fullAccess ? null : seat.id;
        target.revokedReason = reasonText || null;
        // Only bring the switch back up if no OTHER live permit still names it.
        const stillPermitted = list.some((p) => p && p.id !== permitId && p.key === target.key && !p.revoked && p.from <= today && today <= p.to);
        if (!stillPermitted) {
          draft.settings = { ...(draft.settings || {}), [target.key]: true };
        }
      }, {
        type: PAUSE_PERMIT_EVENTS.REVOKED,
        entity: 'settings',
        entityId: permit.key,
        summary: `Revoked the pause permit for ${permit.key}; the switch was brought back up in the same commit unless another live permit still names it.`,
      });
      return saved(store, { permitId, key: permit.key, reason: reasonText || null });
    },

    pausePermitScan() {
      const { seat } = seatOf(store.state, clock());
      const right = canAct(PAUSE_PERMIT_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Scanning pause permits requires director rank.');
      }
      store.update(() => {}, {
        type: PAUSE_PERMIT_EVENTS.SCAN,
        entity: 'workspace',
        entityId: 'pause-permits',
        summary: `Scanned automation pause permits (${PAUSE_PERMIT_RULE_ID}).`,
      });
      return saved(store, { effects: (store.lastPropagations || []).filter((x) => x?.ruleId === PAUSE_PERMIT_RULE_ID) });
    },

    pausePermitSetConventions(patch) {
      const { seat } = seatOf(store.state, clock());
      const right = canAct(PAUSE_PERMIT_RIGHTS.GOVERN, seat);
      if (seat.readOnly || (!seat.fullAccess && !right.allow)) {
        return fail(right.reason || 'Changing the pause-permit conventions requires director rank.');
      }
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return fail('Conventions must be a declared patch object.', 'patch');
      const next = {};
      for (const [key, value] of Object.entries(patch)) {
        const name = SETTING_NAME_BY_KEY.get(key);
        if (!name) return fail(`“${String(key).slice(0, 60)}” is not a pause-permit convention. Nothing was saved.`, 'patch');
        if (name === 'autoPropagate') {
          if (typeof value !== 'boolean') return fail(`${PAUSE_PERMIT_SETTING_LABELS[name]} must be true or false. Nothing was saved.`, key);
          next[key] = value;
          continue;
        }
        const [min, max] = PAUSE_PERMIT_BOUNDS[name];
        if (!Number.isInteger(value) || value < min || value > max) {
          return fail(`${PAUSE_PERMIT_SETTING_LABELS[name]} must be a whole number from ${min} to ${max}. Nothing was clamped and nothing was saved.`, key);
        }
        next[key] = value;
      }
      const before = normalizePausePermitSettings(store.state.settings || {});
      const changed = Object.keys(next).filter((key) => before[key] !== next[key]);
      if (!changed.length) return fail('Those are already the conventions in force; nothing was changed.', 'patch');
      store.update((draft) => {
        draft.settings = { ...(draft.settings || {}), ...next };
      }, {
        type: PAUSE_PERMIT_EVENTS.CONVENTIONS,
        entity: 'workspace',
        entityId: 'pause-permits',
        summary: `Changed pause-permit conventions: ${changed.join(', ')}.`,
      });
      return saved(store, { changed, conventions: normalizePausePermitSettings(store.state.settings || {}) });
    },
  };
}

/** The default window a permit request starts from, so the UI never invents one. */
export function defaultPermitWindow(settings, today = dayKey(new Date())) {
  const conv = normalizePausePermitSettings(settings || {});
  const days = conv[PAUSE_PERMIT_SETTING_KEYS.defaultDays] || PAUSE_PERMIT_DEFAULTS.defaultDays;
  return { from: today, to: addDays(today, days - 1), days };
}

export { PAUSE_PERMIT_REFUSALS };
