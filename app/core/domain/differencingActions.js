/**
 * app/core/domain/differencingActions.js — commands for the Differencing Defender
 * (ADR-0092, Schema v96).
 *
 * Reads are pure adapters. The ONE write is a publication: plan the aggregate
 * against the register, take the cheapest suppression pattern that recovers
 * nothing, store what was actually published, and let RULE-DFR-01..04 do the
 * cross-module and cross-altitude propagation on the shared spine.
 *
 * A publication is REFUSED rather than downgraded. When no suppression pattern
 * makes the release safe, the action returns the proof and the structural remedy
 * and writes nothing — the register must never contain a figure the engine knows
 * can be subtracted back out.
 */
import { dayKey } from '../time.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import {
  buildDifferencesReport,
  differencesBriefText,
  differencesCsvRows,
  differencesCsvSummary,
  planRelease,
} from './differencing.js';
import { DIFFERENCING_ENGINE_VERSION, DIFFERENCING_LIMITS, DIFFERENCING_VERDICTS } from './differencingRegistry.js';
import { differencesConventions } from './differencingSchema.js';
import { manifestFor } from './disclosureManifests.js';

export function createDifferencingActions(store, { now, idFactory }) {
  const fail = (error, field = null) => ({ ok: false, error, ...(field ? { field } : {}) });
  const clock = () => (now() instanceof Date ? now() : new Date());
  const saved = (extra = {}) => ({
    ok: true,
    ...extra,
    saved: !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  });
  const report = () => buildDifferencesReport(store.state, { now: clock() });
  const seatRight = (action = 'publish-aggregate') => {
    const built = buildSeats(store.state, { now: clock(), settings: store.state.settings || {} });
    const seat = activeSeat(built);
    if (!seat || seat.readOnly) {
      return { ok: false, error: 'The declared seat is unresolved and read-only. Choose a valid seat before publishing an aggregate.' };
    }
    const right = canAct(action, seat);
    return right.allow ? { ok: true, seat, built } : { ok: false, error: right.reason };
  };

  return {
    differencesRead() {
      return report();
    },

    differencesBriefText() {
      const current = report();
      return current.ok ? { ok: true, text: differencesBriefText(current) } : current;
    },

    differencesCsvRows() {
      const current = report();
      if (!current.ok) return current;
      return { ok: true, rows: differencesCsvRows(current), summary: differencesCsvSummary(current) };
    },

    differencesAttentionCount() {
      const current = report();
      if (!current.ok) return 0;
      return Math.min(99, current.summary.determinedRoutesN + current.summary.crossAltitudeN + current.summary.decisionsN);
    },

    /**
     * The advisory read every altitude uses BEFORE writing a deck: what would
     * publishing this module's aggregate right now actually disclose?
     */
    differencesPlan({ route = null } = {}) {
      const right = seatRight('publish-aggregate');
      if (!right.ok) return fail(right.error);
      const manifest = manifestFor(String(route || ''));
      if (!manifest) return fail('That module has no disclosure manifest, so it has no published aggregate to plan.');
      const plan = planRelease({
        state: store.state,
        route: manifest.route,
        now: clock(),
        seatId: right.seat.id,
        settings: store.state.settings || {},
        register: store.state.differenceReleases || [],
      });
      return plan;
    },

    /**
     * Publish this module's aggregate. One release per module per day per seat:
     * a second release of the SAME table on the SAME day from a different
     * suppression pattern is the pairwise differencing attack, so it is refused
     * by construction rather than audited afterwards.
     */
    differencesPublish({ route = null } = {}) {
      const right = seatRight('publish-aggregate');
      if (!right.ok) return fail(right.error);
      const manifest = manifestFor(String(route || ''));
      if (!manifest) return fail('That module has no disclosure manifest, so it has no published aggregate.');
      const today = dayKey(clock());
      const existing = (store.state.differenceReleases || []).find((row) => row
        && row.route === manifest.route
        && String(row.releasedOn).slice(0, 10) === today
        && row.scopeSeatId === right.seat.id);
      if (existing) {
        return fail(`This module was already published today from this seat (release ${existing.id}). A second release of the same table with a different suppression pattern is the differencing attack itself, so it is refused rather than audited.`);
      }
      if ((store.state.differenceReleases || []).length >= DIFFERENCING_LIMITS.releases) {
        return fail(`The publication register is full at ${DIFFERENCING_LIMITS.releases} releases. Export the current reading and prune the register before publishing.`);
      }
      const plan = planRelease({
        state: store.state,
        route: manifest.route,
        now: clock(),
        seatId: right.seat.id,
        settings: store.state.settings || {},
        register: store.state.differenceReleases || [],
      });
      // `refusedEmpty` is a refusal too: a span with no records inside it has no
      // publicable table, and "an empty screen" must never be registered as the
      // claim "nothing happened".
      if (!plan.ok || plan.refusedEmpty === true) {
        // A refused publication is a real outcome with a real remedy. Nothing is
        // written: the register must never hold a figure the engine can subtract.
        return {
          ok: false,
          refused: true,
          verdict: plan.verdict,
          error: plan.error,
          remedy: plan.remedy || '',
          exposures: plan.exposures || [],
          drift: plan.drift || null,
          recoveredN: plan.recoveredN || 0,
          attempts: plan.attempts || [],
          report: report(),
        };
      }
      const candidate = plan.candidate;
      if (!candidate) {
        return {
          ok: false,
          refused: true,
          verdict: plan.verdict,
          error: 'The planner reached no release candidate, so nothing was written. An unplanned publication is refused rather than registered.',
          report: report(),
        };
      }
      const release = {
        id: idFactory('dfr'),
        route: manifest.route,
        scopeSeatId: right.seat.id,
        altitudeKey: plan.seat.altitudeKey,
        rank: plan.seat.rank,
        releasedOn: today,
        cellFloor: plan.conventions.differencesCellFloor,
        attemptN: candidate.attemptN,
        verdict: plan.verdict,
        protection: {
          withheldTotals: candidate.totals.filter((total) => !total.printed).map((total) => total.measure),
          withheldCells: candidate.withheldCells,
          protectedN: plan.removals.reduce((sum, row) => sum + (row.kind === 'cells' ? row.n : 1), 0),
          reason: plan.removals.map((row) => row.why).join(' ').slice(0, 240),
        },
        recoveredN: 0,
        equationN: plan.equationN || 0,
        withheldN: plan.withheldN || 0,
        cells: candidate.cells,
        totals: candidate.totals,
        engineVersion: DIFFERENCING_ENGINE_VERSION,
        createdAt: clock().toISOString(),
      };
      store.update((draft) => {
        draft.differenceReleases = Array.isArray(draft.differenceReleases) ? draft.differenceReleases : [];
        draft.differenceReleases.unshift(release);
      }, {
        type: 'differences.released',
        entity: 'differencingrelease',
        entityId: release.id,
        summary: `Published ${manifest.label} aggregate (${plan.verdict}); roll-up edges and any protection work requested`,
      });
      return saved({ id: release.id, verdict: plan.verdict, release, report: report() });
    },

    /** Withdraw a publication from the register. The register is how you comply. */
    differencesWithdraw({ id = null } = {}) {
      const right = seatRight('publish-aggregate');
      if (!right.ok) return fail(right.error);
      const target = (store.state.differenceReleases || []).find((row) => row && row.id === String(id || ''));
      if (!target) return fail('That release is not in the register.');
      if (!right.seat.fullAccess && target.scopeSeatId && target.scopeSeatId !== right.seat.id) {
        return fail('A release belongs to the seat that published it; you cannot withdraw another span\'s publication.');
      }
      if (!right.seat.fullAccess && right.seat.rank < 3) {
        return fail('Withdrawing a published release is a director-and-above act: it changes what the register says the house published.');
      }
      store.update((draft) => {
        draft.differenceReleases = (Array.isArray(draft.differenceReleases) ? draft.differenceReleases : [])
          .filter((row) => row && row.id !== target.id);
      }, {
        type: 'differences.withdrawn',
        entity: 'differencingrelease',
        entityId: target.id,
        summary: `Withdrew the registered ${target.route} release of ${target.releasedOn} from the publication register`,
      });
      return saved({ id: target.id, report: report() });
    },

    differencesScan() {
      const right = seatRight('publish-aggregate');
      if (!right.ok) return fail(right.error);
      store.update(() => {}, {
        type: 'differences.scan',
        entity: right.seat.fullAccess ? 'workspace' : 'differencingrelease',
        entityId: right.seat.fullAccess ? 'all' : right.seat.id,
        summary: 'Explicitly re-audited the publication register and opened any bounded publication findings',
      });
      return saved({ report: report() });
    },

    differencesSetConventions({ cellFloor = null, windowReleases = null, minPoints = null } = {}) {
      const right = seatRight('govern-differencing');
      if (!right.ok) return fail(right.error);
      if (right.seat.rank < 3) {
        return fail('The differencing conventions are set at director rank and above; the floor and window bound what every altitude can publish.');
      }
      const current = differencesConventions(store.state.settings || {});
      const next = differencesConventions({
        ...store.state.settings,
        ...(cellFloor === null ? {} : { differencesCellFloor: cellFloor }),
        ...(windowReleases === null ? {} : { differencesWindowReleases: windowReleases }),
        ...(minPoints === null ? {} : { differencesMinPoints: minPoints }),
      });
      if (next.differencesCellFloor === current.differencesCellFloor
        && next.differencesWindowReleases === current.differencesWindowReleases
        && next.differencesMinPoints === current.differencesMinPoints) {
        return fail('The declared floor and window are unchanged; nothing was written.');
      }
      store.update((draft) => {
        draft.settings = { ...draft.settings, ...next };
      }, {
        type: 'differences.conventions',
        entity: 'settings',
        entityId: 'differencing',
        summary: `Differencing conventions set: cell floor ${next.differencesCellFloor}, window ${next.differencesWindowReleases} releases, drift floor ${next.differencesMinPoints} points`,
      });
      return saved({ conventions: next, report: report() });
    },

    differencesCreateRecoveryDecision() {
      const right = seatRight('publish-aggregate');
      if (!right.ok) return fail(right.error);
      const current = report();
      if (!current.ok) return fail(current.error || 'No differencing reading is available.');
      if (!current.summary.determinedRoutesN) {
        return fail('The register determines nothing right now, so there is no publication-integrity decision to open.');
      }
      if (store.state.settings?.differencesAutoPropagate === false) {
        // Auto-propagation paused: the explicit scan runs the same rules once.
        store.update(() => {}, {
          type: 'differences.scan',
          entity: right.seat.fullAccess ? 'workspace' : 'differencingrelease',
          entityId: right.seat.fullAccess ? 'all' : right.seat.id,
          summary: 'Explicit scan while automatic propagation is paused: re-audited the register and opened bounded findings',
        });
        return saved({ report: report() });
      }
      return fail('Automatic propagation is on: the register\'s findings are already opened as governed decisions by RULE-DFR-02. Use the explicit scan to re-check them.');
    },

    /** The verdict a screen prints beside a plan, never instead of it. */
    differencesVerdictLabels() {
      return Object.entries(DIFFERENCING_VERDICTS).reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    },
  };
}
