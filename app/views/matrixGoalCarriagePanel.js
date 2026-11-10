/** Read-only current-state goal carriage and branch-overlap audit. */
import { h } from '../ui/dom.js';
import { banner, card, stat, table } from '../ui/components.js';
import { buildGoalCarriageReport } from '../core/domain/goalCarriage.js';
import { MATRIX_FLOORS } from '../core/domain/matrixRegistry.js';

const shown = (value) => value === null || value === undefined ? 'Withheld' : String(value);

export function renderGoalCarriagePanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const seat = opts.seat || null;
  const scopeIds = seat && !seat.fullAccess
    ? [...new Set([...(seat.scope || []), ...(seat.lineScope || []), ...(seat.id ? [seat.id] : [])])]
    : null;
  const report = buildGoalCarriageReport(state, { now: opts.now || new Date(), scopeIds });
  const totals = report.totals;
  const namesAllowed = !seat || seat.fullAccess || Number(seat.rank) < MATRIX_FLOORS.detailRank;
  const spanLabel = (row) => {
    if (row.spanId === 'leader') return 'Workspace leader span';
    if (!namesAllowed) return 'Manager span (name withheld)';
    const person = (state.people || []).find((candidate) => candidate.id === row.spanId);
    return person?.name || 'Manager span';
  };
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'An objective has one recorded owner; the reporting graph may give that person several managers. This read-only audit counts a goal once in each manager span, never selects an exclusive line, and shows exactly how many branch appearances would be duplicated if added together.'),
    !report.matrix
      ? banner({ tone: 'neutral', title: 'Single-chain structure', body: 'No additional active reporting line is present. The same canonical hierarchy reader is used; no matrix attribution is inferred.' })
      : null,
    h('div', { class: 'row gap' },
      stat({ label: 'Active goals', value: totals.activeGoalN, hint: 'in this seat’s scope' }),
      stat({ label: 'Multi-line owners', value: totals.multiLineGoalN, hint: 'attributed to no exclusive line', tone: totals.multiLineGoalN ? 'warn' : '' }),
      stat({ label: 'Unplaced owners', value: totals.unplacedGoalN, hint: 'not silently dropped', tone: totals.unplacedGoalN ? 'bad' : '' }),
      stat({ label: 'Manager spans', value: report.spanRowsN, hint: 'from the canonical hierarchy DAG' }),
    ),
    card({
      title: 'Goal-state reconciliation',
      subtitle: 'Every active goal is classified exactly once. A multi-line goal remains unattributed until the line managers’ first-person carriage stances are implemented.',
      body: h('div', { class: 'stack-sm' },
        h('p', {}, `State rows sum to ${Object.values(totals.stateCounts).reduce((sum, n) => sum + n, 0)}; active goals in scope: ${totals.activeGoalN}. Reconciles: ${totals.stateReconciles ? 'yes' : 'NO — do not rely on these figures'}.`),
        h('p', { class: 'muted small' }, Object.entries(totals.stateCounts).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No active goals.'),
      ),
    }),
    card({
      title: 'Span and branch reconciliation',
      subtitle: 'Branch appearances are the sum of distinct goals visible beneath each immediate reporting branch plus the manager’s own goals. The span total deduplicates goal IDs. These are different quantities by design.',
      body: table({
        caption: 'Active goals by manager span and immediate branch',
        columns: [
          { label: 'Span', key: 'span' },
          { label: 'Distinct goals', key: 'goals' },
          { label: 'Branch appearances', key: 'appearances' },
          { label: 'Repeated appearances', key: 'duplicates' },
          { label: 'Unattributed multi-line goals', key: 'multiLine' },
          { label: 'Reconciliation', key: 'status' },
          { label: 'Refusal', key: 'reason' },
        ],
        rows: report.rows.map((row) => ({
          span: spanLabel(row),
          goals: shown(row.goalN),
          appearances: shown(row.branchAppearanceN),
          duplicates: shown(row.duplicateAppearanceN),
          multiLine: shown(row.multiLineGoalN),
          status: row.refused ? 'REFUSED' : row.reconciles ? 'reconciled' : 'FAILED',
          reason: row.refusalReason || '—',
        })),
      }),
    }),
    card({
      title: 'Two distinct trust checks',
      subtitle: 'A count can reconcile internally while still being computed over an incomplete display set. These checks are kept separate.',
      body: h('ul', { class: 'stack-sm' },
        h('li', {}, `Goal classifications equal active goals: ${report.reconciliation.goalStatesEqualActive ? 'yes' : 'NO'}.`),
        h('li', {}, `Every printed span reconciles to its printed goal count: ${report.reconciliation.eachSpanStatesEqualDisplayedGoals ? 'yes' : 'NO'}.`),
        report.reconciliation.reason ? h('li', {}, report.reconciliation.reason) : null,
      ),
    }),
    h('p', { class: 'muted small' }, report.method),
    h('p', { class: 'muted small' }, 'Scope limitation: this slice is a live, read-only reconciliation. It does not yet persist manager stances, generate answer obligations, export the register, or change goal scores.'),
  );
}

export default renderGoalCarriagePanel;
