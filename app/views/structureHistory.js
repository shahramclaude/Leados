/**
 * app/views/structureHistory.js — `#/structure-history`, Matrix Reorganisation
 * Reconciliation & As-Of Structure Reads (ADR-0149, Schema v124).
 *
 * Three panels, three questions a present-tense org chart cannot answer:
 *
 *   As of          what did the structure look like on THIS day, and is that a
 *                  reading of the record or a projection of today?
 *   Reconciliation how many stored acts still read against the structure of
 *                  their own day, and which ones no longer do?
 *   Method         what is stored, what is derived, and what this screen refuses
 *                  to print.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A span over the people the ledger happens to cover, presented as the span
 *    of the day. When the day is not fully recorded the spans are WITHHELD with
 *    the reason, never shown as a smaller but tidy list.
 *  - A comparison that silently counts a joiner as a mover. `appeared`,
 *    `disappeared` and `moved` are three different words and are printed as
 *    three different figures.
 *  - A changed/unchanged verdict for a person who is unrecorded on either date.
 *    They are counted as uncomparable, with the number printed.
 *  - A "corrected" act. Drift is reported so a human can decide what the act
 *    means now; nothing here rewrites a historical record to match today's
 *    roster.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, emptyState, table, tabs } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  STRUCTURE_HISTORY_CSV_COLUMNS,
  STRUCTURE_HISTORY_LIMITS_TEXT,
  STRUCTURE_HISTORY_METHOD,
} from '../core/domain/structureHistoryRegistry.js';

const PANELS = [
  { key: 'asof', label: 'As of', hint: 'What the structure was recorded as, on the day you ask about.' },
  { key: 'reconcile', label: 'Reconciliation', hint: 'Which stored acts still read against the structure of their own day.' },
  { key: 'method', label: 'Method', hint: 'What is declared, what is derived, and what is refused.' },
];

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'asof';
};
const go = (ctx, panel) => ctx.navigate(`#/structure-history?panel=${encodeURIComponent(panel)}`);
const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const tone = (t) => (t === 'bad' ? 'bad' : t === 'warn' ? 'warn' : t === 'good' ? 'good' : 'neutral');

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The structure action was refused.', 'bad'); return false; }
  toast(message, 'good');
  return true;
}

/* ------------------------------------------------------------------ dialogs */

function moveDialog(ctx) {
  const candidates = ctx.api.structureHistoryCandidates?.();
  if (!candidates?.ok) {
    toast(candidates?.error || 'The roster could not be read for a home-line change.', 'bad');
    return;
  }
  const people = candidates.people || [];
  if (!people.length) {
    toast('No person in your span can have their home line moved.', 'bad');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const form = buildForm([
    {
      name: 'personId',
      label: 'Which person’s home line changed?',
      type: 'select',
      value: '',
      options: [
        { value: '', label: '— choose a person —' },
        ...people.map((p) => ({
          value: p.personId,
          label: `${p.name}${p.role ? ` — ${p.role}` : ''}${p.historyRecorded ? '' : ' (no history recorded yet)'}`,
        })),
      ],
      help: 'Only people in your span or on a line you hold. A peer cannot restructure another span.',
    },
    {
      name: 'managerId',
      label: 'Who do they report to from that day?',
      type: 'select',
      value: '',
      options: [
        { value: '', label: '— choose a manager —' },
        ...(candidates.managers || []).map((m) => ({ value: m.managerId, label: m.isLeader ? `${m.name} (workspace leader)` : `${m.name}${m.role ? ` — ${m.role}` : ''}` })),
      ],
    },
    {
      name: 'fromISO',
      label: 'The day it took effect (YYYY-MM-DD)',
      type: 'date',
      value: today,
      help: 'Recorded on the day it happens. A future-dated change is refused, because recording it early would make today’s structure read as something it is not yet.',
    },
    {
      name: 'reason',
      label: 'Why did the home line change?',
      type: 'textarea',
      value: '',
      rows: 3,
      help: 'Required. A reporting line that moved for no recorded reason is an accountability nobody can be asked about.',
    },
  ]);
  openModal({
    title: 'Record a home-line change',
    description: 'This writes one dated period to the structure ledger AND moves the person’s manager pointer in the same transaction, so the two cannot disagree even for one revision. Any stored act that no longer reads against its own day’s structure is reported and a reconciliation ask is issued — nothing is rewritten.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.structureRecordMove({
            personId: values.personId,
            managerId: values.managerId,
            fromISO: values.fromISO,
            reason: values.reason,
          });
          if (!notify(result, `Home line recorded from ${values.fromISO}.`)) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the change'),
    ],
  });
}

/* ------------------------------------------------------------------ panels */

function asOfPanel(ctx, report) {
  const r = report.reading;
  const b = report.board;

  if (!report.isRecorded) {
    return h('div', { class: 'stack' },
      banner({
        tone: 'warn',
        title: 'No home-line history has been recorded yet',
        body: report.singleChainNote || 'The structure of every day before today is unknown, not “probably like today”.',
        actions: [
          h('button', {
            class: 'btn btn-small btn-primary',
            type: 'button',
            onClick: () => {
              const result = ctx.api.structureSeedCurrent?.();
              if (!notify(result, result.writtenN
                ? `Recorded today’s structure for ${result.writtenN} person(s). Earlier days stay unknown — nothing was back-filled.`
                : 'Nothing needed recording.')) return;
              ctx.refresh();
            },
          }, 'Record the structure as it stands today'),
          h('button', { class: 'btn btn-small', type: 'button', onClick: () => moveDialog(ctx) }, 'Record a home-line change'),
        ],
      }),
      card({
        title: 'What this means for the record you already hold',
        subtitle: 'An absence of history is a finding, not an empty screen.',
        body: h('div', { class: 'stack' },
          h('p', { class: 'muted' }, `This workspace holds ${b.actsN} stored act(s) that name a manager. Until a home-line history exists, none of them can be read against the structure of its own day — their dates fall in a window the ledger does not cover.`),
          h('p', { class: 'muted' }, 'That is exactly what the Reconciliation panel prints: an act in an uncovered window is counted as unverifiable, never assumed current.'),
        ),
      }),
    );
  }

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A person’s manager is a pointer with no history: it holds where they sit now, and nothing records where they sat before. Ask this screen about a day and it answers from the dated periods that were RECORDED — or refuses, when the day was never recorded. It never projects today’s roster backwards, because a roll-up over a guessed structure is a comparability claim resting on a guess.'),

    h('div', { class: 'stat-grid' },
      stat({ label: 'Reading as of', value: r.asOf, hint: r.daysAgo === 0 ? 'today' : `${r.daysAgo} day(s) ago` }),
      stat({ label: 'Verdict', value: r.verdictLabel, hint: r.readingRefused ? 'derived figures withheld' : 'derived from recorded periods', tone: tone(r.verdictTone) }),
      stat({ label: 'People on the roster then', value: num(r.rowN), hint: `${r.notOnRosterN} not yet started / already left` }),
      stat({ label: 'Structure recorded', value: num(r.observedN), hint: 'a dated period covers this day', tone: r.unknownN ? 'warn' : 'good' }),
      stat({ label: 'Structure unknown', value: num(r.unknownN), hint: 'no period covers this day', tone: r.unknownN ? 'bad' : '' }),
      stat({ label: 'Recent moves', value: num(b.recentMoveN), hint: `inside ${report.conventions.structureHistoryReviewDays} days`, tone: b.recentMoveN ? 'warn' : '' }),
    ),

    r.readingRefused
      ? banner({
          tone: 'bad',
          title: `Every span is withheld — ${r.verdictLabel.toLowerCase()}`,
          body: r.refusedReason || 'The structure on this day is not fully recorded, so no span is printed over the part that happens to be.',
        })
      : card({
          title: 'The structure of that day',
          subtitle: r.spansReconcile
            ? `Every person observed is counted in exactly one span: ${r.spanTotal} observed across ${r.managerN} manager(s), and the two figures reconcile.`
            : 'THE SPANS DO NOT RECONCILE against the observed headcount. Do not rely on them.',
          body: table({
            caption: 'Span of control as recorded on the chosen day',
            emptyMessage: 'No manager held a span on this day.',
            columns: [
              { label: 'Manager', key: 'manager' },
              { label: 'Span', key: 'span' },
            ],
            rows: r.spans.map((s) => ({
              manager: s.isLeader ? `${s.managerName} (workspace leader)` : s.managerName,
              span: String(s.spanN),
            })),
          }),
        }),

    card({
      title: 'What the reading observed, person by person',
      subtitle: 'An unrecorded line is printed as unknown with its reason — never as today’s pointer.',
      body: table({
        caption: 'Per-person structure observation',
        emptyMessage: 'Nobody was on the roster on this day.',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'State', key: 'state' },
          { label: 'Manager that day', key: 'manager' },
          { label: 'Why', key: 'why' },
        ],
        rows: r.observations.slice(0, 60).map((o) => ({
          person: o.personName,
          state: badge(o.stateLabel, tone(o.tone)),
          manager: o.managerName || '—',
          why: h('span', { class: 'muted small' }, o.reason),
        })),
      }),
    }),

    report.comparison
      ? card({
          title: `What changed since ${report.comparison.fromISO}`,
          subtitle: report.comparison.comparable
            ? `${report.comparison.movedN} moved, ${report.comparison.appearedN} joined, ${report.comparison.disappearedN} left, ${report.comparison.heldN} unchanged. A joiner is not a mover: the three are counted separately on purpose.`
            : (report.comparison.comparableReason || 'The change set is not a complete account.'),
          body: h('div', { class: 'stack' },
            h('div', { class: 'stat-grid' },
              stat({ label: 'Changed manager', value: num(report.comparison.movedN), tone: report.comparison.movedN ? 'warn' : '' }),
              stat({ label: 'Joined the roster', value: num(report.comparison.appearedN) }),
              stat({ label: 'Left the roster', value: num(report.comparison.disappearedN) }),
              stat({ label: 'Unchanged', value: num(report.comparison.heldN) }),
              stat({ label: 'Cannot be compared', value: num(report.comparison.uncomparableN), hint: 'unrecorded on one of the two dates', tone: report.comparison.uncomparableN ? 'warn' : '' }),
            ),
            !report.comparison.anyMovement && report.comparison.comparable
              ? banner({ tone: 'good', title: 'No movement in the home lines', body: 'Between the two dates every compared person kept their home manager. That is a legitimate and frequently misreported answer.' })
              : null,
            table({
              caption: 'Per-person change between the two readings',
              columns: [
                { label: 'Person', key: 'person' },
                { label: 'Change', key: 'kind' },
                { label: 'From', key: 'from' },
                { label: 'To', key: 'to' },
              ],
              rows: report.comparison.rows.slice(0, 60).map((row) => ({
                person: row.personName,
                kind: badge(row.kindLabel || row.kind, row.kind === 'moved' ? 'warn' : row.kind === 'uncomparable' ? 'bad' : 'neutral'),
                from: row.fromManagerName || '—',
                to: row.toManagerName || '—',
              })),
            }),
          ),
        })
      : null,

    report.recentMoves.length
      ? card({
          title: `Home-line moves in the last ${report.conventions.structureHistoryReviewDays} days`,
          subtitle: 'Each one is a dated act with a stated reason. A move with no reason could not have been recorded.',
          body: table({
            caption: 'Recent home-line changes',
            columns: [
              { label: 'Person', key: 'person' },
              { label: 'Now reports to', key: 'manager' },
              { label: 'Effective', key: 'from' },
              { label: 'Reason', key: 'reason' },
            ],
            rows: report.recentMoves.map((m) => ({
              person: m.personName,
              manager: m.managerName,
              from: `${m.fromISO} (${m.daysAgo} day(s) ago)`,
              reason: h('span', { class: 'muted small' }, m.reason || '—'),
            })),
          }),
        })
      : null,

    report.defects.length
      ? card({
          title: 'Structure defects',
          subtitle: 'Reported, never resolved by picking one.',
          body: table({
            caption: 'Structure ledger defects',
            columns: [{ label: 'Detail', key: 'detail' }],
            rows: report.defects.map((d) => ({ detail: d.detail })),
          }),
        })
      : null,
  );
}

function reconcilePanel(ctx, report) {
  const a = report.acts;
  const b = report.board;

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'Every stored act that names a manager — a line acceptance, a declared reporting line, an arbitration’s arbiter — was written against the structure of its own day. Read it against today’s pointer and it can appear to mean something it never meant. This panel reads each act against the structure the ledger recorded for its own day, and prints four separate counts, because “still means what it meant”, “now reads against a structure that was never there”, “nobody can tell” and “this has no date” are four different facts.'),

    h('div', { class: 'stat-grid' },
      stat({ label: 'Stored acts naming a manager', value: num(a.actsN), hint: `across ${a.sources.length} family(ies)` }),
      stat({ label: 'Read against their own day', value: num(a.consistentN), tone: 'good' }),
      stat({ label: 'Read against a structure that was not there', value: num(a.driftedN), hint: 'drift — reported, never corrected', tone: a.driftedN ? 'bad' : '' }),
      stat({ label: 'Cannot be checked', value: num(a.unverifiableN), hint: 'the act’s day was never recorded', tone: a.unverifiableN ? 'warn' : '' }),
      stat({ label: 'Carry no readable date', value: num(a.undatedN), tone: a.undatedN ? 'warn' : '' }),
      stat({ label: 'Ledger begins', value: report.board.coverageStart || '—' }),
    ),

    card({
      title: 'The identity this panel prints as an equality, not a reassurance',
      subtitle: 'Three claims kept apart: the counts add up, every act reached a bucket, and no act drifts.',
      body: table({
        caption: 'Reconciliation identities',
        columns: [
          { label: 'Claim', key: 'label' },
          { label: 'Reading', key: 'detail' },
        ],
        rows: [
          {
            label: 'The four buckets are the whole set',
            detail: a.actsReconcile
              ? `${a.consistentN} consistent + ${a.driftedN} drifted + ${a.unverifiableN} unverifiable + ${a.undatedN} undated = ${a.countedN} of ${a.actsN} stored act(s)`
              : `THE BUCKETS DO NOT ADD UP — ${a.countedN} counted of ${a.actsN}. Treat every figure here as unverified and report it.`,
          },
          {
            label: 'No stored act reads against a structure that was not there',
            detail: a.driftedN
              ? `${a.driftedN} act(s) now read against a manager who was not part of that person’s structure on the act’s own day. Nothing was edited: a human decides what each one means now.`
              : 'Every act reads against the manager the structure recorded for its own day.',
          },
          {
            label: 'Every act could be checked',
            detail: a.unverifiableN
              ? `${a.unverifiableN} act(s) fall in a window the ledger does not cover${report.board.coverageStart ? ` (the ledger begins ${report.board.coverageStart})` : ''}. Neither confirmed nor contradicted.`
              : 'No act falls in an uncovered window.',
          },
        ],
      }),
    }),

    a.driftedN
      ? card({
          title: 'Acts that now read against a structure that was not there',
          subtitle: 'Reported for a human decision. This screen will not re-point, migrate or withdraw any of them.',
          body: table({
            caption: 'Drifted stored acts',
            emptyMessage: 'No act drifts.',
            columns: [
              { label: 'Family', key: 'family' },
              { label: 'Person', key: 'person' },
              { label: 'Act dated', key: 'day' },
              { label: 'Names', key: 'named' },
              { label: 'Structure that day', key: 'recorded' },
            ],
            rows: a.drifted.slice(0, 60).map((d) => ({
              family: d.sourceLabel,
              person: d.personName,
              day: d.actDay,
              named: d.namedManagerName,
              recorded: d.recordedManagerName,
            })),
          }),
        })
      : banner({
          tone: 'good',
          title: 'No stored act reads against a structure that was not there',
          body: a.actsN
            ? 'Every act that names a manager resolves against the structure its own day recorded.'
            : 'No stored act in this workspace names a manager yet, so there is nothing to reconcile.',
        }),

    card({
      title: 'Per stored-act family',
      subtitle: 'Declared in the registry, never discovered by grep: a family added later is not silently reconciled with the wrong date field.',
      body: h('div', { class: 'stack' },
        ...a.sources.map((s) => h('div', { class: 'stack-tight' },
          h('strong', {}, `${s.label} (${s.collection})`),
          h('p', { class: 'muted small' }, s.why),
          h('p', { class: 'small' }, `${s.actsN} act(s): ${s.consistentN} consistent, ${s.driftedN} drifted, ${s.unverifiableN} unverifiable, ${s.undatedN} undated.`)))),
    }),

    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => moveDialog(ctx) }, 'Record a home-line change'),
      h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => {
          const result = ctx.api.structureScan?.();
          if (!notify(result, `Scan complete: ${result.driftedN} drifted act(s), ${result.recentMoveN} recent move(s).`)) return;
          ctx.refresh();
        },
      }, 'Retry outstanding reconciliation asks'),
    ),
  );
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register does',
      subtitle: 'Printed on every load, from the same registry the rule and the export read.',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `Engine ${report.engineVersion}; a home-line move stays on the attention list for ${report.conventions.structureHistoryReviewDays} days.`),
        ...STRUCTURE_HISTORY_METHOD.map((m) => h('div', { class: 'stack-tight' },
          h('strong', {}, m.name),
          h('p', { class: 'muted small' }, m.why))),
      ),
    }),
    card({
      title: 'What is stored, and what is derived',
      subtitle: 'A stored span is a number waiting to disagree with the structure it describes.',
      body: h('ul', { class: 'muted small' },
        h('li', {}, 'Stored: one dated record per OBSERVED home-line period — person, manager, the day it started, the day it ended (or open), the day it was recorded, and the seat that recorded it. The valid-time period and the transaction time are separate fields.'),
        h('li', {}, 'Stored: the frozen before/after evidence of a COMMITTED structural design (ADR-0099), imported only for the moves that actually changed. A rehearsal or a reverted design writes nothing: it is a plan, not a past.'),
        h('li', {}, 'Derived on every read: every observation state, every span, every changed/joined/left/held verdict, every uncomparable count and every act reading.'),
        h('li', {}, 'Never stored: a span, a depth, a subtree, a comparability verdict or a corrected history. A back-dated correction is a NEW row; the period acts were judged against stays as evidence.'),
      ),
    }),
    card({
      title: 'Honest limits',
      subtitle: 'Printed on the page, so the reading cannot be mistaken for a present-tense org chart.',
      body: h('ul', { class: 'muted small' },
        ...STRUCTURE_HISTORY_LIMITS_TEXT.map((text) => h('li', {}, text))),
    }),
  );
}

/* -------------------------------------------------------------------- route */

export function renderStructureHistory(ctx) {
  const result = ctx.api.structureHistoryBoard?.();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Structure', title: 'Reorganisation & as-of structure' }),
      banner({ tone: 'bad', title: 'This page is not available', body: result?.error || 'The structure history could not be read.' }));
  }
  const report = result.report;
  const panel = panelFor(ctx.query);
  const r = report.reading;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Structure',
      title: 'Reorganisation & as-of structure',
      subtitle: 'What the reporting structure was on a given day, and whether the record you already hold still means what it meant.',
      actions: [
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          onClick: () => {
            const rows = ctx.api.structureHistoryCsv?.();
            if (!rows?.ok) { toast(rows?.error || 'The structure export was refused.', 'bad'); return; }
            downloadText({
              filename: `leados-structure-history-${new Date().toISOString().slice(0, 10)}.csv`,
              text: serializeCsv(STRUCTURE_HISTORY_CSV_COLUMNS.map((key) => ({ key, header: key })), rows.rows),
            });
          },
        }, 'Download CSV'),
        h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => moveDialog(ctx) }, 'Record a home-line change'),
      ],
      meta: h('div', { class: 'row-actions' },
        badge(r.verdictLabel, tone(r.verdictTone)),
        badge(report.acts.driftedN ? `${report.acts.driftedN} drifted act(s)` : 'no drift', report.acts.driftedN ? 'bad' : 'good'),
        badge(`${report.board.recordedPeopleN}/${report.board.peopleN} with history`, report.board.unrecordedPeopleN ? 'warn' : 'good'),
        h('span', { class: 'muted small' }, `read from ${report.scopeLabel}`)),
    }),

    tabs({
      items: PANELS.map((p) => ({ key: p.key, label: p.label, hint: p.hint })),
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Structure history sections',
    }),
    h('p', { class: 'muted small' }, PANELS.find((p) => p.key === panel)?.hint || ''),

    panel === 'asof' ? asOfPanel(ctx, report) : null,
    panel === 'reconcile' ? reconcilePanel(ctx, report) : null,
    panel === 'method' ? methodPanel(report) : null,
  );
}

export default renderStructureHistory;
