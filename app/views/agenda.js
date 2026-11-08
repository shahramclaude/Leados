/**
 * app/views/agenda.js — `#/agenda-ledger`, the 1:1 Agenda Ledger (ADR-0113).
 *
 * Six panels, six questions a lead actually asks on a Monday morning:
 *   Waiting list   "What stands on their list — and who does each line belong to?"
 *   Build agenda   "What do I raise next, in what order, and what am I about to drop?"
 *   Filed prompts  "What did I commit to raise, and which of those is overdue?"
 *   Receipts       "When I filed a prompt, did it actually get raised?"
 *   Span roll-up   "How is my span's agenda discipline reading?"
 *   Method         "What is claimed, what is refused, what can I re-declare?"
 *
 * The whole screen is a read model plus two human commands (file a line,
 * withdraw a line). It never writes a receipt: whether a filed prompt was raised
 * is read from the 1:1 the human logged.
 */
import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { formatDate } from '../core/time.js';
import { AGENDA_CSV_COLUMNS, AGENDA_PANELS } from '../core/domain/agendaProvenanceRegistry.js';

const PANELS = AGENDA_PANELS;
const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'queue';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/agenda-ledger?panel=${panel}${extra}`);
const pct = (v) => (v === null || v === undefined ? 'refused' : `${v}%`);
const statusBadge = (status) => {
  const meta = {
    raised: ['Raised', 'good', 'A held 1:1 on or after the filing date actually covered this exact prompt.'],
    open: ['Filed', 'neutral', 'Filed, and no held 1:1 has happened since. Silence is not a miss.'],
    stale: ['Stale', 'bad', 'Filed longer ago than the declared staleness window with no 1:1 held since. The promise is drifting.'],
    dropped: ['Not raised', 'warn', 'A held 1:1 happened after the filing and this prompt was not covered.'],
    closed: ['Withdrawn', 'neutral', 'You withdrew this line and recorded why.'],
  }[status] || ['Unknown', 'neutral', ''];
  return badge(meta[0], meta[1], meta[2]);
};
const groupTone = { theirs: 'good', 'owed-them': 'caution', bilateral: 'neutral', unclassified: 'bad', yours: 'warn' };

export function renderAgenda(ctx) {
  const panel = panelFor(ctx.query);
  const read = ctx.api.agendaRead();
  if (!read?.ok) {
    return h('div', { class: 'page' }, pageHeader({ title: '1:1 agenda ledger', subtitle: 'The ledger could not be read.' }),
      banner({ tone: 'bad', title: 'This ledger is unreadable right now', body: read?.error || 'The scoped read failed. Nothing has been changed.' }));
  }
  const ledger = read.row;
  const t = ledger.totals;
  // The full-access operator view sees detail; a declared seat sees prompts only
  // inside its own detail boundary (rank <= 2). Everything above that is counted.
  const rank = read.rank ?? 5;
  const named = Boolean(read.fullAccess) || rank <= 2;
  const people = read.people || [];
  const selectedPersonId = ctx.query.get('person') || people[0]?.id || null;
  const selectedPerson = people.find((p) => p.id === selectedPersonId) || null;

  const header = pageHeader({
    eyebrow: '1:1 agenda',
    title: 'Agenda provenance ledger',
    subtitle: 'Which prompts stand on a waiting list, who owes each one, what you committed to raise, and whether it actually got raised.',
    meta: [
      badge(`${t.queue} prompt${t.queue === 1 ? '' : 's'}`, 'neutral', 'Across every waiting list in your detail boundary.'),
      badge(`${t.engine} engine-authored`, t.engine ? 'caution' : 'good', 'Prompts the engine wrote onto a person’s list. The rest were raised by the people themselves.'),
      badge(`${t.filedOpen + t.filedStale} filed open`, t.filedStale ? 'bad' : 'neutral', 'Prompts you committed to raise that have not had a held 1:1 since.'),
      named ? badge('Named detail', 'neutral', 'At this altitude prompts and people are named: you hold the conversation.') : badge('Counts only', 'neutral', 'Above the manager altitude this screen prints counts, shares and refusals — never a prompt.'),
    ],
    actions: [
      h('button', {
        class: 'btn btn-ghost no-print', type: 'button',
        onClick: () => {
          const rows = ctx.api.agendaCsvRows();
          if (!Array.isArray(rows) || !rows.length) { toast('Nothing to export yet.', 'warn'); return; }
          downloadText({ filename: `agenda-ledger-${ledger.now}.csv`, mime: 'text/csv', text: serializeCsv({ columns: [...AGENDA_CSV_COLUMNS], rows }) });
        },
      }, 'Export aggregate CSV'),
      h('button', {
        class: 'btn btn-ghost no-print', type: 'button',
        onClick: () => {
          const result = ctx.api.agendaScan();
          toast(result.ok ? 'Ledger re-derived. Nothing was written to any promise.' : result.error, result.ok ? 'good' : 'bad');
        },
      }, 'Re-derive ledger'),
    ],
  });

  const bar = tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, onSelect: (key) => go(ctx, key) });

  const sections = {
    queue: () => queuePanel(ctx, { ledger, people, named, selectedPerson, selectedPersonId }),
    build: () => buildPanel(ctx, { selectedPerson, selectedPersonId, people, named }),
    filed: () => filedPanel(ctx, { ledger, named, rank }),
    receipt: () => receiptPanel(ctx, { ledger, t }),
    rollup: () => rollupPanel(ctx, { t, rank }),
    method: () => methodPanel(ctx),
  };

  return h('div', { class: 'page', 'data-testid': 'agenda-view' }, header, bar, sections[panel]());
}

/* ------------------------------------------------------------------ panels */

function queuePanel(ctx, { ledger, people, named, selectedPerson, selectedPersonId }) {
  const t = ledger.totals;
  const summary = card({
    title: 'What the waiting lists actually hold',
    subtitle: 'Every prompt is classified by the declared family table into who owes it. An unclassifiable prompt is counted, never credited to the person.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Raised by them', value: String(t.personRaised), hint: 'Their own topics — the line the engine prompts were burying.' }),
        stat({ label: 'Owed to them', value: String(t.self), hint: 'Prompts the leader owes this person.' }),
        stat({ label: 'Owed upward', value: String(t.above), hint: 'The leader’s own span duties filed on a person who owes nothing.' }),
        stat({ label: 'Bilateral', value: String(t.both), hint: 'Returned commitments both sides carry.' }),
        stat({ label: 'Unclassified', value: String(t.unclassified), hint: 'Prompts this ledger cannot classify. Counted, not credited.' }),
        stat({ label: 'At the 12-cap', value: String(t.atCap.length), hint: 'Lists at the declared cap. Their own topics are kept first and engine prompts survive newest-first.' }),
      ),
      t.atCap.length
        ? banner({ tone: 'warn', title: `${t.atCap.length} waiting list(s) sit at the cap`, body: `The declared cap is 12 lines. Prompts the person raised are kept first, and engine prompts survive newest-first, so the next rule that writes removes the OLDEST engine prompt — never their own topic and never the prompt just written. Anything the cap refuses is reported, not dropped in silence. Open Build agenda to see which line is next.` })
        : null,
    ),
  });

  if (!named) {
    return h('div', { class: 'stack' }, summary, card({
      title: 'Span reading (counts only)',
      subtitle: 'Above the manager altitude a waiting list is individual detail. This panel prints the span’s provenance counts and refuses the item detail.',
      body: table({
        caption: 'Queue provenance by span, counts only',
        columns: [
          { label: 'Span', render: (r) => `${r.total} prompt(s)` },
          { label: 'Raised by them', key: 'theirs' },
          { label: 'Owed to them', key: 'owedThem' },
          { label: 'Owed upward', key: 'yours' },
          { label: 'Unclassified', key: 'unclassified' },
          { label: 'At cap', render: (r) => (r.atCap ? badge('cap', 'bad') : '—') },
        ],
        rows: ledger.queues.map((q) => ({
          total: q.total,
          theirs: q.personRaised,
          owedThem: q.self,
          yours: q.above,
          unclassified: q.unclassified,
          atCap: q.atCap,
        })),
        emptyMessage: 'No waiting list in this span holds a prompt.',
      }),
    }));
  }

  const detail = card({
    title: 'Waiting lists in your boundary',
    subtitle: 'Select a person to see every line, its provenance and what the cap is about to drop.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'row wrap' }, ...people.map((p) => h('button', {
        class: `btn btn-tiny ${p.id === selectedPersonId ? 'btn-primary' : 'btn-ghost'}`,
        type: 'button',
        onClick: () => go(ctx, 'queue', `&person=${encodeURIComponent(p.id)}`),
      }, `${p.name} · ${p.queue.total}`))),
      selectedPerson ? queueTable(ctx, selectedPerson) : emptyState({ title: 'No people in your boundary yet', body: 'Add a person to your span first.' }),
    ),
  });
  return h('div', { class: 'stack' }, summary, detail);
}

function queueTable(ctx, person) {
  const q = person.queue;
  if (!q.rows.length) {
    return emptyState({ title: 'Nothing on their list', body: 'Ask what they want to talk about, then record it on their page so it appears here.' });
  }
  return table({
    caption: `Every prompt on ${person.name}’s waiting list, with its provenance`,
    columns: [
      { label: '#', render: (r) => String(r.index + 1) },
      { label: 'Prompt', render: (r) => h('div', { class: 'stack-tight' },
        h('span', null, r.text.length > 160 ? `${r.text.slice(0, 160)}…` : r.text),
        h('span', { class: 'muted tiny' }, [r.label, r.owner ? `· ${r.owner}` : null, r.why].filter(Boolean).join(' ')),
      ) },
      { label: 'Owed', render: (r) => badge(r.owedToLabel, groupTone[r.family === 'person-raised' ? 'theirs' : r.owedTo === 'self' ? 'owed-them' : r.owedTo === 'both' ? 'bilateral' : r.owedTo === 'above' ? 'yours' : 'unclassified'], r.framework || '') },
      { label: 'Eviction risk', render: (r) => (r.evictionRisk ? badge('next to drop', 'bad', 'The queue is at the cap and this is the line the declared policy displaces next: the oldest engine prompt.') : '—') },
      { label: 'Commit', render: (r) => h('button', {
        class: 'btn btn-tiny btn-ghost', type: 'button',
        onClick: () => filePrompt(ctx, { personId: person.id, prompt: r.text, sourceKind: r.engine ? 'engine-prompt' : 'their-topic' }),
      }, 'File to raise') },
    ],
    rows: q.rows,
    emptyMessage: 'Nothing on their list.',
  });
}

function filePrompt(ctx, input) {
  const result = ctx.api.agendaFile(input);
  if (!result.ok) { toast(result.error, 'bad'); return; }
  toast(`Filed: you will raise “${String(input.prompt).slice(0, 60)}”. This is a commitment — the receipt is read from the 1:1 you log.`, 'good');
  go(ctx, 'filed');
}

function buildPanel(ctx, { selectedPerson, selectedPersonId, people, named }) {
  if (!named) {
    return card({
      title: 'Build the agenda',
      subtitle: 'This panel names exact prompts, which is individual detail. Above the manager altitude it is withheld with the reason printed rather than silently blanked.',
      body: banner({ tone: 'warn', title: 'Withheld above the manager altitude', body: 'A 1:1 waiting list is the most individual record this workspace holds. The span reading is on the roll-up panel; the prompts themselves stay with the leader holding the conversation.' }),
    });
  }
  if (!selectedPerson) {
    return card({ title: 'Build the agenda', body: emptyState({ title: 'No people in your boundary yet' }) });
  }
  const result = ctx.api.agendaPlan(selectedPersonId);
  if (!result?.ok) return card({ title: 'Build the agenda', body: banner({ tone: 'bad', title: 'This plan could not be built', body: result?.error || 'Unknown refusal.' }) });
  const plan = result.plan;

  const controls = h('div', { class: 'row wrap' },
    ...people.map((p) => h('button', {
      class: `btn btn-tiny ${p.id === selectedPersonId ? 'btn-primary' : 'btn-ghost'}`,
      type: 'button',
      onClick: () => go(ctx, 'build', `&person=${encodeURIComponent(p.id)}`),
    }, p.name)));

  const lineRow = (row) => h('li', { class: 'prep-item' },
    h('div', { class: 'stack-tight' },
      h('div', { class: 'row wrap' }, badge(row.label, groupTone[row.group] || 'neutral', row.framework || ''), row.filed ? statusBadge(row.filed.status) : null, row.willBeEvicted ? badge('next to drop', 'bad') : null),
      h('span', { class: 'prep-item-text' }, row.text),
      h('span', { class: 'muted tiny' }, [row.owner ? `Owner: ${row.owner}` : null, row.why].filter(Boolean).join(' · ')),
    ),
    h('div', { class: 'row wrap' },
      row.filed
        ? h('span', { class: 'muted tiny' }, `Filed ${formatDate(row.filed.filedOn, { withYear: false })}`)
        : h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => filePrompt(ctx, { personId: selectedPersonId, prompt: row.text, sourceKind: row.engine ? 'engine-prompt' : 'their-topic' }) }, 'File to raise'),
    ),
  );

  return h('div', { class: 'stack' },
    card({
      title: `Next 1:1 with ${selectedPerson.name}`,
      subtitle: plan.lastHeldOn ? `Last held ${formatDate(plan.lastHeldOn, { withYear: false })}.` : 'No 1:1 has been held with this person yet.',
      body: controls,
    }),
    plan.capWarning ? banner({ tone: 'bad', title: 'The cap is about to drop a line you owe', body: plan.capWarning }) : null,
    ...plan.groups.map((group) => card({
      title: group.label,
      subtitle: group.note,
      body: h('ol', { class: 'prep-list prep-list-ordered' }, ...group.rows.map(lineRow)),
    })),
    !plan.groups.length
      ? card({ title: 'Nothing to raise', body: emptyState({ title: 'Their list is empty', body: 'A 1:1 with no recorded topics is not a clean 1:1 — ask what they want to cover and write it down.' }) })
      : null,
  );
}

function filedPanel(ctx, { ledger, named, rank }) {
  const entries = ledger.entries;
  const open = entries.filter((e) => e.status === 'open' || e.status === 'stale');
  const controls = h('div', { class: 'stack' },
    h('div', { class: 'stat-grid' },
      stat({ label: 'Filed open', value: String(open.filter((e) => e.status === 'open').length), hint: 'Filed, no held 1:1 since.' }),
      stat({ label: 'Stale', value: String(entries.filter((e) => e.status === 'stale').length), hint: 'Filed, no 1:1 since, older than the declared window.' }),
      stat({ label: 'Raised', value: String(entries.filter((e) => e.status === 'raised').length), hint: 'A held 1:1 covered the exact prompt.' }),
      stat({ label: 'Not raised', value: String(entries.filter((e) => e.status === 'dropped').length), hint: 'A held 1:1 happened and did not cover it.' }),
    ),
  );
  if (!named) {
    return h('div', { class: 'stack' }, controls, card({
      title: 'Filed lines (counts only)',
      subtitle: `Above rank ${rank} the lines are counted by status and provenance, never printed.`,
      body: table({
        caption: 'Filed agenda lines by status, counts only',
        columns: [
          { label: 'Status', key: 'status' },
          { label: 'Count', key: 'n' },
        ],
        rows: ['open', 'stale', 'raised', 'dropped', 'closed'].map((s) => ({ status: s, n: entries.filter((e) => e.status === s).length })),
        emptyMessage: 'No line has been filed in this span yet.',
      }),
    }));
  }
  const rows = entries.map((e) => ({
    ...e,
    className: e.status === 'stale' ? 'is-bad' : '',
    attrs: { 'data-status': e.status },
  }));
  return h('div', { class: 'stack' }, controls, card({
    title: 'Prompts you committed to raise',
    subtitle: 'Filing is a human act. Whether the line was raised is read from the 1:1 you logged — never ticked by hand.',
    body: table({
      caption: 'Filed 1:1 agenda lines',
      columns: [
        { label: 'Filed', render: (r) => formatDate(r.filedOn, { withYear: false }) },
        { label: 'Person', render: (r) => r.personName },
        { label: 'Prompt', render: (r) => h('div', { class: 'stack-tight' },
          h('span', null, r.prompt.length > 150 ? `${r.prompt.slice(0, 150)}…` : r.prompt),
          h('span', { class: 'muted tiny' }, `${r.sourceKind.replace('-', ' ')}${r.owedTo && r.owedTo !== 'unclassified' ? ` · owed ${r.owedTo}` : ' · unclassified'}${r.stillQueued ? '' : ' · no longer on their list'}`),
        ) },
        { label: 'Status', render: (r) => statusBadge(r.status) },
        { label: 'Age', render: (r) => (r.ageDays === null ? '—' : `${r.ageDays}d`) },
        { label: 'Action', render: (r) => (r.status === 'open' || r.status === 'stale')
          ? h('button', {
            class: 'btn btn-tiny btn-ghost', type: 'button',
            onClick: () => {
              const reason = window.prompt('Why are you withdrawing this line? The reason is recorded and never deleted.');
              if (!reason) return;
              const result = ctx.api.agendaWithdraw({ id: r.id, reason });
              toast(result.ok ? 'Line withdrawn with its reason recorded.' : result.error, result.ok ? 'good' : 'bad');
            },
          }, 'Withdraw')
          : '—' },
      ],
      rows,
      emptyMessage: 'No line has been filed yet. Open Build agenda and file the prompt you intend to raise.',
    }),
  }));
}

function receiptPanel(ctx, { ledger, t }) {
  const entries = ledger.entries;
  const hasRate = t.receiptRatePct !== null;
  return h('div', { class: 'stack' },
    card({
      title: 'Did the promise get kept?',
      subtitle: 'A receipt is derived from a held 1:1 on or after the filing date: covered in `resolvedTopics`, or a matching agenda line marked discussed. A missing 1:1 is never counted as a miss.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Receipt rate', value: hasRate ? `${t.receiptRatePct}%` : 'refused', hint: hasRate ? `95% Wilson ${t.receiptLowPct}–${t.receiptHighPct}%` : `Fewer than ${t.receiptFloor} filed lines have had a fair chance.` }),
          stat({ label: 'Raised', value: String(t.filedRaised), hint: 'Exact prompt covered in a held 1:1.' }),
          stat({ label: 'Not raised', value: String(t.filedDropped), hint: 'A held 1:1 happened and did not cover it.' }),
          stat({ label: 'Awaiting', value: String(t.filedOpen + t.filedStale), hint: 'No held 1:1 since filing. Not a miss.' }),
        ),
        hasRate ? null : banner({ tone: 'info', title: 'The rate is refused, not rounded', body: `${t.receiptN} filed line(s) have had a fair chance to be raised; the declared floor is ${t.receiptFloor}. A rate printed on two observations would be noise wearing a decimal point.` }),
      ),
    }),
    card({
      title: 'Receipts, line by line',
      subtitle: 'Derived on every read from the 1:1 record. The engine writes no receipt and cannot delete one.',
      body: table({
        caption: 'Receipt status per filed agenda line',
        columns: [
          { label: 'Person', render: (r) => r.personName },
          { label: 'Prompt', render: (r) => (r.prompt.length > 120 ? `${r.prompt.slice(0, 120)}…` : r.prompt) },
          { label: 'Status', render: (r) => statusBadge(r.status) },
          { label: 'Raised on', render: (r) => (r.raisedOn ? `${formatDate(r.raisedOn, { withYear: false })} (${r.raisedVia})` : '—') },
        ],
        rows: entries,
        emptyMessage: 'Nothing has been filed, so there is nothing to receive.',
      }),
    }),
  );
}

function rollupPanel(ctx, { t, rank }) {
  const roll = ctx.api.agendaRollUp();
  const span = roll?.span;
  const r = span?.reading || {};
  const brief = ctx.api.agendaBriefText();
  return h('div', { class: 'stack' },
    card({
      title: 'Span queue discipline',
      subtitle: 'Two measures, both refusal-honest: how much of the queue the leader did not author, and whether filed promises are actually raised.',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Queue pressure', value: pct(r.pressurePct), hint: r.pressurePct === null ? 'No prompt on any list.' : `engine-authored share · 95% Wilson ${pct(r.pressureLowPct)}–${pct(r.pressureHighPct)}%` }),
          stat({ label: 'Receipt rate', value: pct(r.receiptRatePct), hint: r.receiptRatePct === null ? `Refused below ${r.receiptFloor} filed lines with a fair chance.` : `95% Wilson ${pct(r.receiptLowPct)}–${pct(r.receiptHighPct)}%` }),
          stat({ label: 'Prompts on lists', value: String(r.queueN ?? 0), hint: `${r.personRaisedN ?? 0} raised by the people themselves.` }),
          stat({ label: 'Lists at cap', value: String(r.atCapN ?? 0), hint: 'At the declared cap. Their topics first, engine prompts newest-first.' }),
        ),
        ...(span?.refusals || []).map((refusal) => banner({ tone: 'warn', title: 'Refused, with the reason', body: refusal.reason })),
      ),
    }),
    card({
      title: 'What your own leader receives',
      subtitle: roll?.roll?.note || 'Identity-free above director rank.',
      body: h('div', { class: 'stack' },
        h('pre', { class: 'code-block', style: 'white-space:pre-wrap' }, brief?.text || 'No brief available.'),
        h('div', { class: 'row' }, h('button', {
          class: 'btn btn-ghost btn-tiny', type: 'button',
          onClick: async () => {
            try { await navigator.clipboard.writeText(brief?.text || ''); toast('Brief copied.', 'good'); } catch { toast('Copy failed — select the text above.', 'bad'); }
          },
        }, 'Copy brief')),
      ),
    }),
    rank <= 2 && roll?.roll?.rows?.length
      ? card({
        title: 'Per-person queue inside your boundary',
        subtitle: 'Named detail is available to you because you hold these conversations.',
        body: table({
          caption: 'Per-person queue provenance',
          columns: [
            { label: 'Person', render: (row) => row.personId },
            { label: 'On list', key: 'total' },
            { label: 'Raised by them', key: 'theirs' },
            { label: 'Owed to them', key: 'owedThem' },
            { label: 'Owed upward', key: 'yours' },
            { label: 'Unclassified', key: 'unclassified' },
          ],
          rows: roll.roll.rows,
        }),
      })
      : null,
  );
}

function methodPanel(ctx) {
  const conventions = ctx.api.agendaSettings?.()?.conventions || {};
  return h('div', { class: 'stack' },
    card({
      title: 'What this ledger claims',
      subtitle: 'A declared vocabulary, a derived status and two human commands. Nothing here rates a person.',
      body: h('div', { class: 'stack' },
        h('p', null, 'Provenance is DECLARED, never fitted: each prompt family is mapped by a versioned table to the rule that owns it and to who owes it. A prompt this table cannot classify is counted as unclassified and appears in every denominator — the ledger never guesses that an unknown prompt belongs to the person.'),
        h('p', null, 'A receipt is DERIVED from the 1:1 record a human already logged. The engine writes no receipt, cannot mark one raised, and never treats a missing 1:1 as a broken promise.'),
        h('p', null, 'The unit is the line, never the person. A span with a crowded queue learns that its preparation is being written by software; it does not learn that anyone is failing.'),
      ),
    }),
    card({
      title: 'What is refused',
      body: h('ul', null,
        h('li', null, `A receipt rate below ${conventions.agendaReceiptFloor ?? 5} filed lines with a fair chance is refused rather than printed.`),
        h('li', null, 'A prompt with no recognisable provenance is never credited to the person who raised it.'),
        h('li', null, 'A filed line is never edited or deleted — only withdrawn, with a reason, append-only.'),
        h('li', null, 'The ledger never writes to a waiting list: the fourteen writers that own `talkingPoints` keep ownership of it.'),
        h('li', null, 'No prompt, person name or 1:1 detail travels upward: above director rank the brief is identity-free by construction.'),
      ),
    }),
    card({
      title: 'Declared conventions',
      subtitle: 'Printed with their bounds. Re-declaring them re-prices every span, so it is a director-and-above, full-access command.',
      body: h('div', { class: 'stack' },
        kv('Receipt floor', `${conventions.agendaReceiptFloor ?? 5} filed lines (bounds 3–40)`),
        kv('Stale after', `${conventions.agendaStaleAfterDays ?? 21} days (bounds 3–120)`),
        kv('Auto-propagate', conventions.agendaAutoPropagate === false ? 'paused' : 'on'),
        h('p', { class: 'muted tiny' }, 'The queue cap of 12 and the 200-character topic length are not conventions: they are the existing behaviour of every writer, printed here so the lead can see the wall before hitting it.'),
      ),
    }),
  );
}
