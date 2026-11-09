/**
 * app/views/arbitration.js — `#/arbitration`, the Cross-Line Priority Arbitration
 * (ADR-0143, Schema v120).
 *
 * Four panels, and the whole reason the screen exists is the sentence printed
 * above every case:
 *
 *   Board  "Which people in my span have two managers pulling at them, and has
 *           anything actually been agreed?"
 *   Case   ONE case at a time: the frozen demands side by side with the integers
 *           each line declared, the measured order and the exact comparison that
 *           produced it, the arbiter above both lines, and the two acts that end
 *           it — propose (recommendation, binds nobody) and agree (binding,
 *           issues work).
 *   Log    concluded and withdrawn cases, append-only, with the reason each ended.
 *   Method what is declared, derived and refused, and the three conventions.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - An order while any demand is unscored. It prints `insufficient-evidence`,
 *    names the missing figure and the line that owes it, and offers no ranking.
 *  - A tie broken for you. Two demands with equal cross-products are printed as
 *    `contested`, with the exact integer products beside them.
 *  - A proposal as an agreement. `PROPOSED — NOT AGREED` is a banner, not a grey
 *    badge, and the obligations section is empty until an arbiter agrees.
 *  - A zero for a refused figure. `job size`, `cost of delay` and `chain` print
 *    as "not stated" and the rank column prints an em dash with the reason.
 *  - One word for two claims. `ranked` and `reconciles` are separate lines.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { recordFocus, isFocused, focusRowProps, focusCardClass, focusAbsentNote } from '../ui/recordFocus.js';
import { serializeCsv } from '../core/csv.js';
import {
  PRIORITY_BOUNDS,
  PRIORITY_CSV_COLUMNS,
  PRIORITY_DISPOSITIONS,
  PRIORITY_FINDINGS,
  PRIORITY_PANELS,
  PRIORITY_STATE_LABELS,
} from '../core/domain/priorityArbitrationRegistry.js';

const PANELS = PRIORITY_PANELS;
let apiRef = null;

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'board';
};
const caseIdFor = (query) => query?.get?.('case') || null;
const go = (ctx, panel, caseId = null) => ctx.navigate(`#/arbitration?panel=${encodeURIComponent(panel)}${caseId ? `&case=${encodeURIComponent(caseId)}` : ''}`);
const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const findingsLabel = (key) => PRIORITY_FINDINGS.find((f) => f.key === key)?.label || key;
const dispositionLabel = (key) => PRIORITY_DISPOSITIONS.find((d) => d.key === key)?.label || key;

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The arbitration action was refused.', 'bad'); return false; }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

const toneForState = (state) => (state === 'agreed' ? 'good' : state === 'proposed' ? 'warn' : state === 'withdrawn' ? 'neutral' : 'bad');

function exportCsv() {
  const result = apiRef?.priorityCsvRows?.();
  if (!result?.ok) { toast(result?.error || 'The arbitration export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-priority-arbitration-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv(PRIORITY_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
  });
}

/* ------------------------------------------------------------------ dialogs */

function openCaseDialog(ctx, candidates) {
  const people = (candidates.people || []).filter((p) => p.multiLine);
  if (!people.length) {
    toast('Nobody in this span carries more than one live reporting line, so there is no cross-line contention to arbitrate. Declare the second line on the Matrix panel first.', 'bad');
    return;
  }
  const personOptions = people.map((p) => ({ value: p.personId, label: `${p.name} — ${p.lineN} line(s)` }));
  const first = people[0];
  const managerOptions = first.managers.map((m) => ({ value: m.managerId, label: `${m.name} · ${m.kind}` }));

  // Two demand blocks, because a contention has at least two sides. A third can
  // be added by re-opening the case file; the form stays honest about the common
  // case rather than growing twelve empty rows.
  const demandFields = [0, 1].flatMap((i) => [
    { type: 'divider', label: `Demand ${i + 1}` },
    {
      name: `manager${i}`, label: 'Which line placed it?', type: 'select',
      value: managerOptions[i % managerOptions.length]?.value || '',
      help: 'Only managers with a LIVE reporting line to this person are offered. An arbitration over a line the matrix register does not hold is a precedence nobody can be held to.',
      options: managerOptions,
    },
    {
      name: `title${i}`, label: 'The demand, in the line’s own words', type: 'text', value: '',
      help: 'One line. This is what the arbiter weighs and what the person reads.',
    },
    {
      name: `cod${i}`, label: 'Cost of delay (whole units)', type: 'number', value: '',
      help: 'The declared unit is whatever this workspace prices delay in — days of value, euros, story points. It is never converted and never guessed. Required: a demand with no cost of delay cannot be ranked.',
    },
    {
      name: `jobSize${i}`, label: 'Job size (whole units of work)', type: 'number', value: '',
      help: 'How much work this demand is. WSJF ranks cost of delay per unit of size. Required, and must be at least 1.',
    },
    {
      name: `chain${i}`, label: 'Remaining chain (days, optional)', type: 'number', value: '',
      help: 'Goldratt’s CCPM: a demand on the longest remaining chain outranks a larger one beside it. Unstated counts as 0 and the row says so.',
    },
  ]);

  const form = buildForm([
    {
      name: 'personId', label: 'Whose capacity is contested?', type: 'select', value: first.personId,
      help: 'Only a person with two or more live lines can be the subject of a cross-line contention.',
      options: personOptions,
    },
    ...demandFields,
    { name: 'note', label: 'What happened, briefly?', type: 'textarea', value: '', rows: 2, help: 'Optional. The opener’s own words, kept with the case.' },
  ]);

  openModal({
    title: 'Open a cross-line priority case',
    description: 'Freeze the competing demands NOW, as each line stated them. The case records the contention; it does not decide it. Nothing becomes binding until an arbiter agrees a precedence.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const demands = [0, 1].map((i) => ({
            managerId: v[`manager${i}`],
            title: v[`title${i}`],
            cod: v[`cod${i}`],
            jobSize: v[`jobSize${i}`],
            chainDays: v[`chain${i}`],
          }));
          const result = ctx.api.priorityOpenCase({ personId: v.personId, demands, note: v.note });
          if (!notify(result, 'Case opened — the demands are frozen as each line stated them.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Freeze the case'),
    ],
  });
}

function treatDialog(ctx, caseRow, demand, onDone) {
  const form = buildForm([
    {
      name: 'disposition', label: 'What happens to this demand?', type: 'select',
      value: demand.disposition === 'pending' ? 'sequenced' : demand.disposition,
      options: PRIORITY_DISPOSITIONS.filter((d) => d.key !== 'pending').map((d) => ({ value: d.key, label: d.label })),
      help: 'Sequenced first = takes the person’s next available capacity. Deferred = waits. Reshaped = cut to fit. Released = the line gives it up. Each one needs a reason.',
    },
    { name: 'reason', label: 'Why?', type: 'textarea', value: '', rows: 2, help: 'One line. A disposition with no reason is a decision nobody can be asked about.' },
  ]);
  openModal({
    title: `Disposition — ${demand.title}`,
    description: `Placed by ${demand.managerName} (${demand.kindLabel}). Freezing the disposition is a human act; the engine does not choose which demand wins.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.priorityTreatDemand({ caseId: caseRow.id, demandId: demand.demandId, disposition: v.disposition, reason: v.reason });
          if (!notify(result, 'Disposition recorded.')) return;
          closeAllModals();
          if (onDone) onDone(); else ctx.refresh();
        },
      }, 'Record the disposition'),
    ],
  });
}

function agreeDialog(ctx, caseRow) {
  const rank = caseRow.rank;
  if (!rank.ranked) {
    toast(rank.reason, 'bad');
    return;
  }
  const form = buildForm([
    {
      type: 'static', label: 'The measured order (exact integer comparison)',
      value: h('ol', { class: 'stack-tight' }, ...rank.rows.map((r) => h('li', null,
        `${r.title} — ${r.managerName}: delay weight ${r.delayWeight} ÷ size ${r.jobSize}`))),
      help: 'Agreeing accepts this order unless you declare an override below. The engine’s order is a recommendation; you are the arbiter.',
    },
    { name: 'rationale', label: 'Your reasoning, in your own words', type: 'textarea', value: '', rows: 3, help: 'At least a sentence. This is what the next escalation will be argued against, and what the person reads when the other line pushes back.' },
    { name: 'effectiveFrom', label: 'In force from (YYYY-MM-DD)', type: 'date', value: '', help: 'Blank means today.' },
    { name: 'effectiveTo', label: 'In force until (YYYY-MM-DD)', type: 'date', value: '', help: 'Blank uses the declared precedence window.' },
    { name: 'reviewOn', label: 'Review on (YYYY-MM-DD)', type: 'date', value: '', help: 'Blank uses the declared review horizon. A precedence nobody revisits becomes a habit nobody chose.' },
    { name: 'overrideReason', label: 'If you reorder against the measured order, why?', type: 'textarea', value: '', rows: 2, help: 'Optional. An override is legal — you may know something the two integers do not — but it is recorded as human judgement, not as the engine’s finding.' },
  ]);
  openModal({
    title: `Agree the precedence — ${caseRow.personName}`,
    description: 'This is the only act that binds anything. On save, RULE-ARB-01 issues one owned, dated task per sequenced demand in the same transaction, and opens the governed decision that records the trade-off.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.priorityAgreePrecedence({
            caseId: caseRow.id,
            rationale: v.rationale,
            effectiveFrom: v.effectiveFrom || null,
            effectiveTo: v.effectiveTo || null,
            reviewOn: v.reviewOn || null,
            overrideReason: v.overrideReason || null,
          });
          if (!notify(result, 'Precedence agreed — the obligations were issued in the same transaction.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Agree and issue the work'),
    ],
  });
}

function answerDialog(ctx, caseRow) {
  const form = buildForm([
    {
      name: 'stance', label: 'Your answer', type: 'select', value: 'accept',
      options: [
        { value: 'accept', label: 'Accept — this is the order I will work to' },
        { value: 'object', label: 'Object — I do not accept this order' },
        { value: 'abstain', label: 'Abstain — I am not answering this one' },
      ],
    },
    { name: 'reason', label: 'In your own words', type: 'textarea', value: '', rows: 3, help: 'Required for an objection or an abstention. Silence and disagreement are not the same record.' },
  ]);
  openModal({
    title: `Answer the precedence — ${caseRow.personName}`,
    description: 'One answer per party, kept as given. Nobody answers on anybody else’s behalf, and a second answer does not overwrite the first.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.priorityRecordAnswer({ caseId: caseRow.id, stance: v.stance, reason: v.reason });
          if (!notify(result, 'Answer recorded.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record my answer'),
    ],
  });
}

function withdrawDialog(ctx, caseRow) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this case no longer apply?', type: 'textarea', value: '', rows: 3, help: 'Append-only: the case is closed with this reason and never deleted. Nothing it proposed becomes binding.' },
  ]);
  openModal({
    title: `Withdraw — ${caseRow.personName}`,
    description: 'Withdrawing leaves the record readable and issues nothing. If the contention is real but the figures were wrong, withdraw and open a fresh case rather than editing this one.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.priorityWithdraw({ caseId: caseRow.id, reason: v.reason });
          if (!notify(result, 'Case withdrawn. Nothing was agreed, so nothing is owed.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Withdraw the case'),
    ],
  });
}

function conventionsDialog(ctx) {
  const form = buildForm([
    { name: 'priorityPrecedenceDays', label: 'Default precedence window (days)', type: 'number', value: '', help: `Between ${PRIORITY_BOUNDS.precedenceDays.min} and ${PRIORITY_BOUNDS.precedenceDays.max}. How long an agreed precedence runs before the demand needs a fresh case.` },
    { name: 'priorityReviewDays', label: 'Default review horizon (days)', type: 'number', value: '', help: `Between ${PRIORITY_BOUNDS.reviewDays.min} and ${PRIORITY_BOUNDS.reviewDays.max}. When the precedence comes back to be argued again.` },
    { name: 'priorityCapacityShareH', label: 'Declared capacity ceiling (hundredths of a person)', type: 'number', value: '', help: `Between ${PRIORITY_BOUNDS.capacityShareH.min} and ${PRIORITY_BOUNDS.capacityShareH.max}; 100 = one whole person. A set of sequenced demands above this prints as over-committed.` },
  ]);
  openModal({
    title: 'Re-declare the arbitration conventions',
    description: 'These numbers are printed on the Method panel precisely so they can be argued with before they are changed. Changing them re-prices nothing already agreed.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.prioritySetConventions({
            priorityPrecedenceDays: v.priorityPrecedenceDays,
            priorityReviewDays: v.priorityReviewDays,
            priorityCapacityShareH: v.priorityCapacityShareH,
          });
          if (!notify(result, 'Conventions re-declared.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Re-declare'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function boardPanel(ctx, report) {
  const t = report.totals;
  const cards = h('div', { class: 'stat-grid' },
    stat({ label: 'Live cases', value: t.caseN, hint: `${t.personN} person(s), ${t.demandN} frozen demand(s)` }),
    stat({ label: 'Proposed, unagreed', value: t.proposedN, tone: t.proposedN ? 'warn' : '', hint: 'A recommendation binds nobody' }),
    stat({ label: 'Agreed', value: t.agreedN, tone: t.agreedN ? 'good' : '', hint: `${t.obligatedN} obligation(s) issued` }),
    stat({ label: 'Open, nothing proposed', value: t.openN, hint: t.ambiguousApexN ? `${t.ambiguousApexN} with no single arbiter` : 'The trade-off is still informal' }),
  );

  const identity = t.identity
    ? h('p', { class: 'muted small' }, `Audit: ${t.openN} open + ${t.proposedN} proposed + ${t.agreedN} agreed = ${t.caseN} live cases. The state counts add exactly to the printed total; nothing on this page is derived from an undisclosed row.`)
    : banner({ tone: 'bad', title: 'The case states do not add up', body: `${t.openN} + ${t.proposedN} + ${t.agreedN} does not equal ${t.caseN}. Treat every figure on this panel as unverified and report it.` });

  const rows = report.cases.map((c) => ({
    className: c.state === 'proposed' ? 'row-warn' : '',
    attrs: focusRowProps('arbitration', c.id),
    person: c.personName,
    state: badge(PRIORITY_STATE_LABELS[c.state] || c.state, toneForState(c.state)),
    demands: `${c.demandN} demand(s) · ${c.apex.managers.length} line(s)`,
    verdict: c.rank.ranked
      ? `${c.rank.verdict}${c.rank.contestedN ? ` (${c.rank.contestedN} tied)` : ''}`
      : 'no order — see case',
    capacity: c.state === 'agreed'
      ? `${c.capacity.claimedDisplay} / ${c.capacity.limitDisplay}${c.capacity.overCapacity ? ' OVER' : ''}`
      : '—',
    action: h('button', { class: 'btn btn-small', type: 'button', onClick: () => go(ctx, 'case', c.id) }, 'Open case'),
  }));

  return h('div', { class: 'stack' },
    cards,
    identity,
    banner({
      tone: 'info',
      title: 'A recommendation is not an agreement',
      body: 'Until an arbiter records the precedence, both lines still believe their demand comes first — which is exactly the state that produced the missed date. The agreed state is the only one that issues work.',
    }),
    card({
      title: 'Live cases in this span',
      subtitle: report.caseRemainderN
        ? `${report.cases.length} shown, ${report.caseRemainderN} further case(s) counted and not printed on this panel.`
        : 'Worst state first, then oldest. The board never reorders by a derived score.',
      actions: [h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openCaseDialog(ctx, ctx.api.priorityCandidates?.() || {}) }, 'Open a case')],
      body: table({
        caption: 'Live cross-line priority cases',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'State', key: 'state' },
          { label: 'Frozen', key: 'demands' },
          { label: 'Measured order', key: 'verdict' },
          { label: 'Capacity claim', key: 'capacity' },
          { label: '', key: 'action' },
        ],
        rows,
        emptyMessage: 'No cross-line priority case is open in this span.',
      }),
    }),
    report.findings.length
      ? card({
        title: 'What needs a decision',
        subtitle: report.findingsRemainderN
          ? `${report.findings.length} shown, ${report.findingsRemainderN} further finding(s) counted.`
          : 'Worst first. Every finding is a fact about the record, never a judgement of a person.',
        body: table({
          caption: 'Arbitration findings',
          columns: [
            { label: 'Finding', render: (r) => findingsLabel(r.finding) },
            { label: 'Detail', render: (r) => r.detail },
            { label: '', render: (r) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => go(ctx, 'case', r.caseId) }, 'Open case') },
          ],
          rows: report.findings,
          emptyMessage: 'Nothing needs a decision.',
        }),
      })
      : null,
  );
}

function casePanel(ctx, report, focusId) {
  const target = report.cases.find((c) => c.id === focusId)
    || report.logCases.find((c) => c.id === focusId)
    || report.cases[0]
    || null;
  if (!target) {
    return emptyState({
      title: 'No case to open',
      body: 'Open a case from the Board panel once a person in your span carries two live reporting lines and two managers have placed work on them.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'board') }, 'Back to the board'),
    });
  }
  return h('div', { class: `stack ${focusCardClass('arbitration', target.id)}` },
    isFocused('arbitration', target.id) ? null : focusAbsentNote('arbitration', focusId),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => go(ctx, 'board') }, '← All cases'),
      badge(PRIORITY_STATE_LABELS[target.state] || target.state, toneForState(target.state)),
      h('span', { class: 'muted small' }, `opened ${target.openedOn} · ${target.demandN} frozen demand(s)`)),

    banner({
      tone: target.state === 'agreed' ? 'good' : target.state === 'proposed' ? 'warn' : target.state === 'withdrawn' ? 'info' : 'bad',
      title: target.state === 'agreed' ? 'Binding precedence' : target.state === 'proposed' ? 'PROPOSED — NOT AGREED' : target.state === 'withdrawn' ? 'Withdrawn' : 'Open — no precedence yet',
      body: target.binding,
    }),

    card({
      title: `${target.personName} — the two claims on one person`,
      subtitle: target.contested.contested
        ? `BOTH lines declare the “priority” decision right on this person. This is not a disagreement the two managers can settle between themselves — the structure says both decide, so the arbiter above them must.`
        : 'Exactly one line declares the “priority” right on this person, so the arbiter is resolving a scheduling trade-off rather than a structural contradiction.',
      body: table({
        caption: 'Frozen demands',
        columns: [
          { label: '#', render: (r) => (target.rank.ranked ? target.rank.rankedIds.indexOf(r.demandId) + 1 : '—') },
          { label: 'Demand', render: (r) => h('div', null, h('strong', null, r.title), h('p', { class: 'muted small' }, `${r.managerName} · ${r.kindLabel || r.kind || 'line'}${r.dueOn ? ` · due ${r.dueOn}` : ''}`)) },
          { label: 'Cost of delay', render: (r) => (Number.isInteger(r.cod) ? String(r.cod) : 'not stated') },
          { label: 'Job size', render: (r) => (Number.isInteger(r.jobSize) ? String(r.jobSize) : 'not stated') },
          { label: 'Chain (days)', render: (r) => (r.chainStated ? String(r.chainDays) : 'not stated (counted 0)') },
          { label: 'Delay weight', render: (r) => (Number.isInteger(r.delayWeight) ? String(r.delayWeight) : '—') },
          { label: 'Weight ÷ size', render: (r) => (r.ratioDisplay ? r.ratioDisplay : '—') },
          { label: 'Disposition', render: (r) => (r.disposition === 'pending'
            ? h('div', null, badge('pending', 'warn'), h('p', { class: 'muted small' }, 'nobody has said what happens to this demand'))
            : h('div', null, badge(dispositionLabel(r.disposition), 'neutral'), h('p', { class: 'muted small' }, r.treatment?.reason || ''))) },
          { label: '', render: (r) => (target.state === 'open' || target.state === 'proposed'
            ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => treatDialog(ctx, target, r) }, 'Set disposition')
            : null) },
        ],
        rows: target.rank.rows,
        emptyMessage: 'No demand was frozen on this case.',
      }),
    }),

    card({
      title: 'The measured order',
      subtitle: target.rank.reason,
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, `${target.rank.verdictLabel}. `), `Delay weight = cost of delay × (1 + remaining chain days). The order compares delay weight ÷ job size by exact integer cross-multiplication, so the printed order is provably the order of the printed integers — no float decided it.`),
        target.rank.ranked
          ? h('ol', { class: 'stack-tight' }, ...target.rank.rows.map((r) => h('li', null,
            `${r.title} — ${r.managerName}: weight ${r.delayWeight} ÷ size ${r.jobSize} = ${r.ratioDisplay}`)))
          : h('p', { class: 'muted' }, 'No order is printed. The cases below are the reason, and each names the line that owes the missing figure.'),
        target.proposal
          ? h('p', { class: 'muted small' }, `A recommendation was recorded on ${target.proposal.at.slice(0, 10)} and is NOT binding. It issued no work.`)
          : null,
      ),
    }),

    card({
      title: 'Who arbitrates',
      subtitle: target.apex.label,
      body: h('div', { class: 'stack' },
        table({
          caption: 'Lines in this case',
          columns: [
            { label: 'Line manager', render: (r) => r.managerName },
            { label: 'Kind', render: (r) => r.kindLabel || '—' },
            { label: 'Demands placed', render: (r) => String(target.rank.rows.filter((x) => x.managerId === r.managerId).length) },
          ],
          rows: target.apex.managers.map((managerId) => ({
            managerId,
            managerName: (target.rank.rows.find((r) => r.managerId === managerId) || {}).managerName || managerId,
            kindLabel: (target.rank.rows.find((r) => r.managerId === managerId) || {}).kindLabel || '',
          })),
        }),
        target.apex.state === 'ambiguous'
          ? banner({ tone: 'warn', title: 'No single arbiter — a diamond tie', body: `The two lines meet at ${target.apex.apexIds.length} incomparable minimal ancestors in the reporting graph. The register names the tie instead of electing one branch. Recording an agreement still requires a seat above both lines, which is the honest resolution.` })
          : null,
      ),
    }),

    card({
      title: 'The agreement',
      subtitle: target.binding,
      body: target.agreement
        ? h('div', { class: 'stack' },
          h('p', null, `In force ${target.agreement.effectiveFrom} → ${target.agreement.effectiveTo}; review on ${target.agreement.reviewOn}.`),
          h('p', { class: 'muted' }, target.agreement.rationale),
          h('p', { class: 'muted small' }, target.window.label),
          h('h3', null, 'Issued obligations'),
          table({
            caption: 'Obligations issued by the agreement',
            columns: [
              { label: 'Demand', render: (i) => (target.rank.rows.find((r) => r.demandId === i.demandId) || {}).title || i.demandId },
              { label: 'Task', render: (i) => i.taskId },
              { label: 'Due', render: (i) => i.dueOn },
            ],
            rows: target.agreement.issued || [],
            emptyMessage: 'No task was issued. A precedence with nothing sequenced issues nothing — that is a record of a decision, not a failure.',
          }),
          h('h3', null, 'Capacity claim of the sequenced demands'),
          target.capacity.overCapacity
            ? banner({ tone: 'bad', title: 'The sequenced demands exceed the declared capacity', body: target.capacity.reason })
            : h('p', { class: 'muted' }, target.capacity.reason),
        )
        : h('div', { class: 'stack' },
          h('p', { class: 'muted' }, target.state === 'withdrawn'
            ? `Withdrawn on ${target.withdrawnOn}: ${target.withdrawReason}`
            : 'No precedence has been agreed on this case. Nothing below this line is binding, and no work has been issued.'),
          target.state !== 'withdrawn'
            ? h('div', { class: 'row-actions' },
              h('button', {
                class: 'btn btn-small', type: 'button',
                onClick: () => {
                  const result = ctx.api.priorityPropose({ caseId: target.id });
                  if (!notify(result, 'Recommendation recorded — it binds nobody.')) return;
                  ctx.refresh();
                },
              }, 'Record the measured recommendation'),
              h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => agreeDialog(ctx, target) }, 'Agree the precedence'),
              h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => withdrawDialog(ctx, target) }, 'Withdraw the case'))
            : null),
    }),

    card({
      title: 'Party answers',
      subtitle: 'One answer per party, kept as given. An objection is recorded with the same weight as an acceptance, and neither is invented.',
      body: h('div', { class: 'stack' },
        table({
          caption: 'Recorded party answers',
          columns: [
            { label: 'Party seat', render: (d) => d.seatId },
            { label: 'Answer', render: (d) => badge(d.stance, d.stance === 'accept' ? 'good' : d.stance === 'object' ? 'bad' : 'neutral') },
            { label: 'Their words', render: (d) => d.reason || '—' },
            { label: 'On', render: (d) => d.at.slice(0, 10) },
          ],
          rows: target.dissents,
          emptyMessage: 'No party has answered yet.',
        }),
        target.agreement
          ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => answerDialog(ctx, target) }, 'Answer as a party')
          : h('p', { class: 'muted small' }, 'Answers are recorded against an agreed precedence. A proposal nobody made binding has nothing to answer.'),
      ),
    }),

    card({
      title: 'Reconciliation of this case',
      subtitle: 'Two claims, printed separately — a case can add up perfectly and still have no order.',
      body: h('div', { class: 'stack' },
        h('p', null, h('strong', null, 'Ranked: '), target.rank.ranked ? 'yes — every demand carries both declared integers.' : `no — ${target.rank.incompleteN} demand(s) incomplete, so no order was printed.`),
        h('p', null, h('strong', null, 'Reconciles: '), target.reconciles
          ? `yes — ${target.dispositionTotal} disposition(s) across ${target.demandN} frozen demand(s)${target.agreement ? ', and the agreement names every demand once' : ''}.`
          : 'no — the printed disposition counts do not add to the frozen demand count. Treat this case as unverified and report it.'),
        h('p', { class: 'muted small' }, `apex: ${target.apex.state} · objections: ${target.objectionN} · capacity: ${target.capacity.claimedDisplay} of ${target.capacity.limitDisplay}${target.capacity.undeclaredN ? ` (${target.capacity.undeclaredN} line(s) undeclared)` : ''}`),
      ),
    }),
  );
}

function logPanel(ctx, report) {
  return card({
    title: 'Concluded and withdrawn cases',
    subtitle: report.logRemainderN
      ? `${report.logCases.length} shown, ${report.logRemainderN} further case(s) counted and not printed.`
      : 'Append-only. A withdrawn case keeps its reason; an agreed case keeps its window and its obligations.',
    body: table({
      caption: 'Concluded cross-line priority cases',
      columns: [
        { label: 'Person', key: 'personName' },
        { label: 'State', render: (c) => badge(PRIORITY_STATE_LABELS[c.state] || c.state, toneForState(c.state)) },
        { label: 'Opened', key: 'openedOn' },
        { label: 'Ended', render: (c) => (c.state === 'withdrawn' ? c.withdrawnOn : c.agreement ? `window to ${c.agreement.effectiveTo}` : '—') },
        { label: 'Why', render: (c) => (c.state === 'withdrawn' ? c.withdrawReason : c.agreement?.rationale || '—') },
        { label: '', render: (c) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => go(ctx, 'case', c.id) }, 'Open') },
      ],
      rows: report.logCases,
      emptyMessage: 'No case has been concluded or withdrawn in this span yet.',
    }),
  });
}

function methodPanel(ctx, report) {
  const c = report.conventions;
  return h('div', { class: 'stack' },
    card({
      title: 'What is declared, and by whom',
      body: h('div', { class: 'stack' },
        h('p', null, 'Three numbers are DECLARED, printed here, exported in every CSV, and re-declarable only by a rank-4+ full-access seat. None is fitted from the record.'),
        h('ul', { class: 'stack-tight' },
          h('li', null, h('strong', null, 'Default precedence window: '), `${c.precedenceDays} day(s) — how long an agreed precedence runs before the demands need a fresh case.`),
          h('li', null, h('strong', null, 'Default review horizon: '), `${c.reviewDays} day(s) — when the precedence comes back to be argued again.`),
          h('li', null, h('strong', null, 'Declared capacity ceiling: '), `${c.capacityShareDisplay} of a person — a set of sequenced demands above this prints as over-committed.`)),
        h('p', { class: 'muted small' }, `A case freezes at most ${c.demandsPerCase} demands and the board carries at most ${c.boardCases} live cases; the remainder is counted and printed, never dropped. Above rank ${c.detailRank} the arbiter’s identity is withheld from rows and exports.`),
        h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-small', type: 'button', onClick: () => conventionsDialog(ctx) }, 'Re-declare the conventions')),
      ),
    }),
    card({
      title: 'The four methods this module applies',
      subtitle: 'Named, not paraphrased. Each one answers a specific question the other three cannot.',
      body: h('div', { class: 'stack' }, ...report.method.map((m) => h('div', null,
        h('h3', null, m.name),
        h('p', null, m.why)))),
    }),
    card({
      title: 'What the engine refuses to do',
      body: h('ul', { class: 'stack-tight' },
        h('li', null, 'It does not pick a winner. It computes an exact order and prints it as a recommendation; only an arbiter’s recorded agreement binds anything.'),
        h('li', null, 'It does not guess a figure. A demand with no cost of delay or job size forces the whole case to insufficient-evidence and no order is printed at all.'),
        h('li', null, 'It does not break a tie. Two demands whose cross-products are exactly equal are printed contested, with both products shown.'),
        h('li', null, 'It does not treat an unstated chain as a critical one. Unstated counts as 0 and the row says “not stated”.'),
        h('li', null, 'It does not issue work from a proposal. RULE-ARB-01 fires only on an agreed precedence, and only for demands the agreement sequenced.'),
        h('li', null, 'It does not stack answers. Each party answers once; the first answer is kept and a second is refused with the date of the first.')),
    }),
    card({
      title: 'The identity this page is built on',
      body: h('p', null, `The lifecycle state is not stored. It is re-derived from the recorded acts: no acts → open; a proposal → proposed; an agreement → agreed; a withdrawal → withdrawn. That is why a hand-edited file cannot promote a recommendation into an agreement, and why the state counts above are checked against the live total on every render (${report.totals.identity ? 'they agree' : 'THEY DO NOT AGREE — see the Board banner'}).`),
    }),
  );
}

/* -------------------------------------------------------------------- render */

export function renderArbitration(ctx) {
  apiRef = ctx.api;
  const result = ctx.api.priorityReport?.();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Structure', title: 'Priority arbitration' }),
      banner({ tone: 'bad', title: 'This page is not available', body: result?.error || 'The arbitration report could not be built.' }));
  }
  const report = result.report;
  const panel = panelFor(ctx.query);
  const focusId = caseIdFor(ctx.query);
  const t = report.totals;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Structure',
      title: 'Priority arbitration',
      subtitle: 'Two managers, one person, incompatible dates — the precedence that was agreed, who agreed it, and until when.',
      actions: [
        h('button', { class: 'btn btn-small', type: 'button', onClick: exportCsv }, 'Download CSV'),
        report.totals.proposedN || report.totals.openN
          ? h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openCaseDialog(ctx, ctx.api.priorityCandidates?.() || {}) }, 'Open a case')
          : null,
      ].filter(Boolean),
      meta: h('div', { class: 'row-actions' },
        badge(t.proposedN ? `${t.proposedN} awaiting agreement` : 'no proposal outstanding', t.proposedN ? 'warn' : 'neutral'),
        badge(t.agreedN ? `${t.agreedN} agreed` : 'nothing agreed', t.agreedN ? 'good' : 'neutral'),
        t.identity ? badge('states add up', 'good') : badge('STATE TOTAL BROKEN', 'bad'),
        h('span', { class: 'muted small' }, `read from ${report.seat.label}`)),
    }),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label, hint: p.hint })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Priority arbitration sections' }),
    h('p', { class: 'muted small' }, PANELS.find((p) => p.key === panel)?.hint || ''),
    panel === 'board' ? boardPanel(ctx, report) : null,
    panel === 'case' ? casePanel(ctx, report, focusId) : null,
    panel === 'log' ? logPanel(ctx, report) : null,
    panel === 'method' ? methodPanel(ctx, report) : null,
  );
}

export default renderArbitration;
