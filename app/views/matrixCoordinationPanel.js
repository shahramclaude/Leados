/**
 * app/views/matrixCoordinationPanel.js — `#/matrix?panel=coordination`.
 *
 * The matrix ledger already tells a leader how much capacity a line declares.
 * This panel answers a different director/VP question: does a manager’s span
 * coordinate with one stable counterpart, or with many independent counterparts
 * that a tree span count cannot see? It reports declared topology only — never
 * hours, effort, performance, a recommended redraw, or a hidden allocation.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildMatrixCoordination,
  matrixCoordinationBriefText,
  matrixCoordinationCsvRows,
} from '../core/domain/matrixCoordination.js';
import {
  MATRIX_COORDINATION_CSV_COLUMNS,
  MATRIX_COORDINATION_STATES,
} from '../core/domain/matrixCoordinationRegistry.js';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const toneFor = (tone) => (tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : tone === 'good' ? 'good' : 'neutral');

function board(report) {
  const b = report.board;
  return h('div', { class: 'stack' },
    !b.topologyComplete
      ? banner({
        tone: 'bad',
        title: 'Workspace coordination topology is refused',
        body: b.topologyWithheldReason,
      })
      : null,
    b.topologyComplete && b.fragmentedSpansN
      ? banner({
        tone: 'warn',
        title: `${b.fragmentedSpansN} manager span(s) reach ${b.fragmentationCounterpartFloor}+ distinct counterpart managers`,
        body: 'This is a structural coordination prompt, not a manager score or a conclusion that the current structure is wrong. The interface and its terms remain a human decision.',
      })
      : null,
    b.topologyComplete && !b.fragmentedSpansN
      ? banner({
        tone: 'good',
        title: 'No measured span reaches the declared fragmentation triage floor',
        body: 'That is a fact about current counterpart topology, not proof that any interface is healthy or that a matrix agreement exists.',
      })
      : null,
    h('div', { class: 'row gap' },
      stat({ label: 'Manager spans', value: num(b.managerSpansN), hint: 'with a matrix interface in this seat' }),
      stat({ label: 'Matrix people', value: num(b.matrixPeopleN), hint: 'distinct people, never manager-line pairs' }),
      stat({ label: 'Fragmented', value: num(b.fragmentedSpansN), hint: `${b.fragmentationCounterpartFloor}+ counterparts`, tone: b.fragmentedSpansN ? 'warn' : '' }),
      stat({ label: 'Refused', value: num(b.refusedSpansN), hint: 'incomplete allocation, no partial total', tone: b.refusedSpansN ? 'bad' : '' }),
    ),
    h('div', { class: 'row gap' },
      stat({ label: 'Directed interfaces', value: b.topologyComplete ? num(b.directedPersonInterfaceN) : 'withheld', hint: 'manager → counterpart through a person' }),
      stat({ label: 'Unique manager pairs', value: b.topologyComplete ? num(b.uniqueManagerPairN) : 'withheld', hint: 'unordered pairs, deduplicated across people' }),
      stat({ label: 'Several counterparts', value: num(b.multipleSpansN), hint: 'exactly two' }),
      stat({ label: 'One counterpart', value: num(b.concentratedSpansN), hint: 'topology only' }),
    ),
    card({
      title: 'Two separate reconciliation claims',
      subtitle: 'One claim says every printed manager span has one declared state. The other says the printed directed interface count is the same set of person-interface edges the reader built. Neither substitutes for allocation completeness.',
      body: h('p', { class: 'muted small' },
        `State counts reconcile: ${b.statesReconcile ? 'verified' : 'NOT verified — treat this panel as unverified'}. `,
        `Directed-interface identity: ${b.directedReconcile === null ? 'withheld because one or more spans are incomplete' : b.directedReconcile ? 'verified' : 'NOT verified'}. `,
        b.rowsOmittedN ? `${b.rowsOmittedN} manager row(s) sit beyond the declared rendering cap and are counted here.` : 'No manager rows are omitted.'),
    }),
  );
}

function spanRows(report) {
  if (!report.isMatrix) {
    return emptyState({
      title: 'No matrix coordination topology to read',
      body: report.singleChainNote || 'No active additional reporting line reaches this seat.',
    });
  }
  return card({
    title: 'Manager spans and their counterpart topology',
    subtitle: 'One row is a manager’s own active matrix span. An interface is a directed manager → counterpart relationship reached through a person. A person with two counterpart managers contributes two interfaces to that manager; a unique manager pair is shown only in the aggregate because it is a different unit.',
    body: table({
      caption: 'Matrix coordination topology by manager span',
      emptyMessage: 'No active cross-line manager span is in scope.',
      columns: [
        { label: 'Manager span', render: (row) => row.managerWithheld ? h('span', { class: 'muted' }, 'withheld') : row.managerName },
        { label: 'People', key: 'people' },
        { label: 'Counterparts', key: 'counterparts' },
        { label: 'Directed interfaces', key: 'interfaces' },
        { label: 'Exact effective counterparts', key: 'dispersion' },
        { label: 'State', key: 'state' },
        { label: 'Why', key: 'reason' },
      ],
      rows: report.rows.map((row) => ({
        ...row,
        people: num(row.peopleN),
        counterparts: row.counterpartManagerN === null ? '—' : num(row.counterpartManagerN),
        interfaces: row.directedPersonInterfaceN === null ? '—' : num(row.directedPersonInterfaceN),
        dispersion: row.dispersion ? `${row.dispersion.display} (${row.dispersion.numerator} / ${row.dispersion.denominator})` : '—',
        state: badge(row.stateLabel, toneFor(row.stateTone)),
        reason: h('div', { class: 'stack-sm' },
          h('span', { class: 'muted small' }, row.reason),
          row.counterparts.length
            ? h('span', { class: 'muted tiny' }, `Counterparts: ${row.counterparts.map((counterpart) => counterpart.withheld ? `withheld (${counterpart.peopleN})` : `${counterpart.managerName} (${counterpart.peopleN})`).join(' · ')}${row.counterpartsOmittedN ? ` · ${row.counterpartsOmittedN} more withheld by cap` : ''}`)
            : null,
        ),
      })),
    }),
  });
}

function method(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Declared conventions',
      subtitle: 'The same conventions drive the screen, the aggregate CSV and the shared-spine trace.',
      body: table({
        caption: 'Coordination topology conventions',
        columns: [
          { label: 'Convention', key: 'label' },
          { label: 'Value', key: 'value' },
          { label: 'Why', key: 'detail' },
        ],
        rows: report.conventions.map((item) => ({
          label: item.label,
          value: item.value,
          detail: h('span', { class: 'muted small' }, item.detail),
        })),
      }),
    }),
    card({
      title: 'States',
      subtitle: 'A state describes the structure the reader can prove. It does not grade a manager or prescribe a reorganisation.',
      body: table({
        caption: 'Declared topology states',
        columns: [
          { label: 'State', key: 'state' },
          { label: 'What it means', key: 'detail' },
        ],
        rows: MATRIX_COORDINATION_STATES.map((item) => ({
          state: badge(item.label, toneFor(item.tone)),
          detail: h('span', { class: 'muted small' }, item.detail),
        })),
      }),
    }),
    card({
      title: 'Method and limits',
      subtitle: 'This reader counts declared interfaces; it does not observe meetings, messages, hours, latency or interpersonal quality.',
      body: table({
        caption: 'Named methods',
        columns: [
          { label: 'Basis', key: 'name' },
          { label: 'Why', key: 'why' },
        ],
        rows: report.method.map((item) => ({
          name: item.name,
          why: h('span', { class: 'muted small' }, item.why),
        })),
      }),
    }),
  );
}

export function renderMatrixCoordinationPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  const report = buildMatrixCoordination(state, { now, settings: state.settings || {} });
  const brief = matrixCoordinationBriefText(report);
  const csvRows = matrixCoordinationCsvRows(report);

  const scan = () => {
    const result = ctx?.api?.matrixCoordinationScan?.();
    if (!result?.ok) {
      toast(result?.error || 'The coordination scan was refused.', 'bad');
      return;
    }
    toast('Coordination topology scanned through the shared automation spine.', 'good');
    ctx.refresh?.();
  };

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A span of eight reports can be one coordination relationship repeated eight times, or eight different counterpart negotiations. The reporting tree gives both spans the same headcount. This matrix reading makes the difference visible from the declared lines — or refuses the number when an allocation is incomplete.'),
    board(report),
    spanRows(report),
    card({
      title: 'The brief (identity-free)',
      subtitle: 'A structural roll-up for a director, VP or chief. It names no person, manager, line or seat.',
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onclick: scan }, 'Scan through automation'),
      ],
      body: h('div', { class: 'stack-sm' },
        h('p', {}, brief),
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: 'leados-matrix-coordination-brief.txt',
              text: `${brief}\n`,
              mime: 'text/plain',
            }),
          }, 'Download brief'),
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: () => downloadText({
              filename: `leados-matrix-coordination-${report.generatedOn}.csv`,
              text: serializeCsv(MATRIX_COORDINATION_CSV_COLUMNS.map((key) => ({ key, header: key })), csvRows),
              mime: 'text/csv',
            }),
          }, 'Download aggregate CSV'),
        ),
      ),
    }),
    method(report),
  );
}

export default renderMatrixCoordinationPanel;
