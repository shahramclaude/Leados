/**
 * app/views/standby.js — `#/standby`, Cover acknowledgement (ADR-0127).
 *
 * Three panels, and the first one is the surface this product did not have:
 *
 *   For me     "What have I been named answerable for, for which dates, and have
 *              I said yes?" — the named cover's own chair. Every row is an ask
 *              addressed to the acting seat, with the exact window it is about and
 *              the two first-person answers (accept / decline) as real buttons.
 *
 *   Asked      "Of the covers I have named in my span, who has answered?" — the
 *              director's and manager's chair: accepted / declined / lapsed /
 *              overdue / awaiting, the duty lines whose only live cover refused,
 *              and the derived exposure behind each one.
 *
 *   Method     what is declared, what is derived, and what is refused — including
 *              the two declared conventions and their re-declaration gate.
 *
 * The screen never prints a rate about a person. Its acknowledged percentage is
 * about the REGISTER: the share of declared covers whose named person said yes to
 * THE ASK IN FRONT OF THEM. An unanswered ask is printed as its own state, never
 * as a zero and never as a reassuring green badge.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { DUTY_STANDBY_PREMISE, DUTY_STANDBY_BOUNDS } from '../core/domain/dutyStandbyRegistry.js';

const PANELS = Object.freeze([
  Object.freeze({ key: 'asked', label: 'For my span' }),
  Object.freeze({ key: 'for-me', label: 'For me' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

const CSV_COLUMNS = ['row_kind', 'scope', 'altitude', 'standby_state', 'holder_rank', 'cover_rank',
  'cover_eligible', 'asserted_from', 'asserted_to', 'ask_basis', 'asked_on', 'days_since_asked',
  'response_deadline_on', 'days_past_deadline', 'answered_on', 'answer_window_from',
  'answer_window_to', 'answer_age_days', 'open_n', 'covers_n', 'rate_acknowledged_pct',
  'refused_reason'];

let apiRef = null;

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'asked';
};
const go = (ctx, panel) => ctx.navigate(`#/standby?panel=${encodeURIComponent(panel)}`);

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The standby action was refused.', 'bad'); return false; }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function exportCsv() {
  const result = apiRef?.exportWorkspaceCsv?.('cover-standby');
  if (!result?.ok) { toast(result?.error || 'The cover-acknowledgement export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-cover-standby-${new Date().toISOString().slice(0, 10)}.csv`,
    text: serializeCsv({ columns: CSV_COLUMNS.map((key) => ({ key, header: key })), rows: result.rows }),
    mime: 'text/csv',
  });
}

const stateBadge = (state) => {
  if (state === 'accepted') return badge('accepted', 'good', 'The named cover said yes to this exact ask window');
  if (state === 'declined') return badge('declined', 'bad', 'The named cover answered no, with their reason recorded');
  if (state === 'overdue') return badge('overdue — no answer', 'bad', 'The declared response deadline passed and nobody answered this ask');
  if (state === 'lapsed') return badge('answer lapsed', 'warn', 'A yes that does not cover the current ask window — consent does not move with the dates');
  return badge('awaiting answer', 'warn', 'Inside the declared response deadline; nobody has answered yet');
};

const windowText = (w) => (w ? `${w.from} → ${w.to}` : '—');
const basisText = (basis) => (basis === 'declared-absence'
  ? 'the holder’s declared absence'
  : 'a bounded forward window (no dated absence declared)');

/* ------------------------------------------------------------------ dialogs */

function answerDialog(ctx, row, mode) {
  const accepting = mode === 'accepted';
  const form = buildForm([
    {
      name: 'from', label: 'From (the dates you are answering for)', type: 'date',
      value: row.askWindow.from,
      help: `The ask runs ${windowText(row.askWindow)}. You may narrow it; you may not accept a wider window than you were asked about.`,
    },
    {
      name: 'to', label: 'To', type: 'date', value: row.askWindow.to,
      help: 'Inclusive. A yes is bounded: "I am your stand-in, indefinitely" is not an answer anyone can give.',
    },
    {
      name: 'note', label: accepting ? 'Anything the seat should know? (optional)' : 'Why can you not stand behind this duty for these dates?',
      type: 'textarea', value: '', rows: 3,
      help: accepting
        ? 'Optional. Anything you want the holder to see before they are away.'
        : 'Required. The person who named you reads this, and the governed decision opened with your refusal quotes it verbatim.',
    },
  ]);
  openModal({
    title: `${accepting ? 'Accept' : 'Decline'} standby — “${row.dutyLabel}”`,
    description: `Held by ${row.holderName || row.holderLabel} (${row.holderLabel}). Ask window ${windowText(row.askWindow)} (${basisText(row.askWindow.basis)}). Declared ${row.askedOn}.`,
    body: h('div', { class: 'stack' },
      form.node,
      h('p', { class: 'muted small' }, accepting
        ? 'Accepting records that YOU answered this ask. The record is yours: the seat that named you cannot answer it for you, and the register keeps your words.'
        : 'A refusal opens a governed decision naming what stops during those dates. It is a recorded answer, not a black mark — the register would rather print your no than count your silence as a yes.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: accepting ? 'btn btn-primary' : 'btn btn-danger',
        type: 'button',
        onClick: () => {
          const v = form.getValues();
          const payload = { coverRowId: row.coverRowId, from: v.from, to: v.to, note: v.note };
          const result = accepting
            ? ctx.api.dutyStandbyAcknowledge(payload)
            : ctx.api.dutyStandbyDecline(payload);
          if (!notify(result, accepting
            ? 'Standby accepted — the seat that named you can now read your answer.'
            : 'Refusal recorded — and what stops is now a governed decision.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, accepting ? 'Accept the ask' : 'Decline the ask'),
    ],
  });
}

function revokeDialog(ctx, row) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this answer no longer hold?', type: 'textarea', value: '', rows: 3 },
  ]);
  openModal({
    title: 'Revoke this answer',
    description: 'The answer is marked revoked with its day and reason and kept in the record. Nothing is deleted, and the ask returns to the state it was in before you answered.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: () => {
          const v = form.getValues();
          const result = ctx.api.dutyStandbyRevoke({ id: row.answer.id, reason: v.reason });
          if (!notify(result, 'Answer revoked — the ask is open again.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Revoke the answer'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function forMePanel(ctx) {
  const result = ctx.api.dutyStandbyForMe?.();
  if (!result || result.ok === false) {
    return card({ title: 'Your standby asks are unavailable', body: emptyState({ title: 'The board could not be built', body: result?.error || 'No board is available.' }) });
  }
  const board = result.board;
  const s = board.summary;
  const open = board.rows.filter((r) => r.state !== 'accepted');
  if (!board.rows.length) {
    return card({
      title: 'Nobody has named you as a stand-in',
      subtitle: 'This is the chair the product was missing: when someone declares you answerable for their duty, the ask appears here.',
      body: h('div', { class: 'stack' },
        emptyState({
          title: board.refusal || 'No open ask',
          body: 'A cover declaration is an ask, not an answer. When a leader names you as the person answerable for a duty line, you will be able to accept it for specific dates — or refuse it, with a reason, and have that refusal open a governed decision instead of quietly becoming a blank.',
          action: h('a', { class: 'btn btn-primary', href: '#/duty-cover?panel=plan' }, 'See the duty register'),
        }),
        h('p', { class: 'muted small' }, DUTY_STANDBY_PREMISE)),
    });
  }
  return h('div', { class: 'stack' },
    open.length
      ? banner({
        tone: open.some((r) => r.state === 'overdue') ? 'bad' : 'warn',
        title: `${open.length} standby ask(s) need your answer`,
        body: `${s.overdueN} are past the declared response deadline and ${s.awaitingN} are still inside it. ${board.addedWorkN} open work item(s) sit behind the duties you have been named for. Accept or decline each one — the seat that named you cannot answer for you.`,
      })
      : banner({
        tone: 'good',
        title: 'Every ask addressed to you has been answered',
        body: `${s.acceptedN} accepted. If a window no longer works, revoke the answer rather than letting a yes stand for dates you never agreed to.`,
      }),
    card({
      title: 'What you have been asked to stand behind',
      subtitle: `Answers are yours to give, dated, and kept. Conventions: ${board.conventions.dutyStandbyResponseDays} day(s) to answer before an ask reads overdue.`,
      body: h('div', { class: 'stat-grid' },
        stat({ label: 'Asks addressed to you', value: String(s.assignedN), hint: `${s.acceptedN} accepted · ${s.declinedN} declined · ${s.lapsedN} lapsed` }),
        stat({ label: 'Overdue', value: String(s.overdueN), tone: s.overdueN ? 'bad' : 'good', hint: 'past the declared response deadline and unanswered' }),
        stat({ label: 'Lapsed answers', value: String(s.lapsedN), tone: s.lapsedN ? 'warn' : '', hint: 'you said yes, but the ask window moved — re-asking is the human act' }),
        stat({ label: 'Open work behind these duties', value: String(board.addedWorkN), hint: 'items that sit in the duty lines you have been named for' })),
    }),
    ...board.rows.map((row) => card({
      title: `${row.dutyLabel} — ${row.holderName || row.holderLabel}`,
      subtitle: row.dutyQuestion,
      actions: [stateBadge(row.state)],
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, row.stateReason),
        h('div', { class: 'stat-grid' },
          stat({ label: 'Ask window', value: windowText(row.askWindow), hint: `basis: ${basisText(row.askWindow.basis)}` }),
          stat({ label: 'Declared', value: row.askedOn, hint: `response deadline ${row.deadlineOn}` }),
          stat({ label: 'Your answer', value: row.answer ? row.answer.answer : 'not answered', hint: row.answer ? `for ${row.answer.from} → ${row.answer.to}` : 'the register prints this as overdue or awaiting, never as ready' }),
          stat({ label: 'Open work', value: String(row.openN), hint: 'items currently in this duty line' })),
        row.answer?.note ? h('p', { class: 'muted small' }, h('strong', null, 'Your words: '), row.answer.note) : null,
        row.answer?.decisionId ? h('p', { class: 'muted small' }, `Your refusal opened a governed decision (${row.answer.decisionId}) naming what stops on those dates.`) : null,
        h('div', { class: 'row-actions' },
          row.answer
            ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => revokeDialog(ctx, row) }, 'Revoke this answer')
            : h('div', { class: 'row-actions' },
              h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: () => answerDialog(ctx, row, 'accepted') }, 'I accept — for these dates'),
              h('button', { class: 'btn btn-small', type: 'button', onClick: () => answerDialog(ctx, row, 'declined') }, 'I cannot — here is why')),
          h('a', { class: 'btn btn-ghost btn-small', href: '#/duty-cover?panel=plan' }, 'Open the register'))),
    })),
  );
}

function askedPanel(ctx) {
  const result = ctx.api.dutyStandbyBoard?.();
  if (!result || result.ok === false) {
    return card({ title: 'The standby board is unavailable', body: emptyState({ title: 'The board could not be built', body: result?.error || 'No board is available.' }) });
  }
  const board = result.board;
  const s = board.summary;
  const rows = board.rows;
  if (!rows.length) {
    return card({
      title: 'No declared cover in this span',
      subtitle: 'This board answers one question: of the covers named in your span, who has answered?',
      body: emptyState({
        title: board.refusal || 'Nothing to grade',
        body: 'Declare a cover on the duty register first. The moment one is declared, this board asks that person to accept or refuse a bounded window — and prints who has not answered instead of counting their silence as readiness.',
        action: h('a', { class: 'btn btn-primary', href: '#/duty-cover?panel=gaps' }, 'Go to the duty register'),
      }),
    });
  }
  return h('div', { class: 'stack' },
    card({
      title: 'Who has answered the asks you named',
      subtitle: `Ask window is derived from each holder’s declared absence, or a bounded ${board.conventions.dutyStandbyWindowDays}-day forward window when none is declared. An answer is expected within ${board.conventions.dutyStandbyResponseDays} day(s) of the declaration.`,
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Declared covers', value: String(s.coversN), hint: `${s.acceptedN} accepted · ${s.declinedN} declined · ${s.lapsedN} lapsed` }),
          stat({ label: 'Overdue — no answer', value: String(s.overdueN), tone: s.overdueN ? 'bad' : 'good', hint: 'past the declared response deadline; the register will not read silence as yes' }),
          stat({ label: 'Awaiting answer', value: String(s.awaitingN), hint: 'inside the declared response deadline — a normal Monday, not a finding' }),
          stat({
            label: 'Acknowledged', value: s.acknowledgedPct === null ? 'refused' : `${s.acknowledgedPct}%`,
            tone: s.acknowledgedPct === null ? '' : (s.acknowledgedPct >= 80 ? 'good' : 'warn'),
            hint: 'share of declared covers whose named person said yes to THIS ask window — measures the REGISTER, not a person',
          })),
        (s.declinedN || s.overdueN)
          ? banner({
            tone: 'warn',
            title: `${s.declinedN} refusal(s) and ${s.overdueN} unanswered ask(s)`,
            body: `${s.openOpenWorkN} open work item(s) sit behind covers who have not accepted the ask in front of them. A refusal is a recorded answer and opens a governed decision; an unanswered ask past its deadline is printed as overdue. Nothing here chases anyone — the board names who has not answered and leaves the ask where it belongs.`,
          })
          : null,
        table({
          caption: 'Declared covers and their answers',
          columns: [
            { label: 'State', render: (r) => stateBadge(r.state) },
            { label: 'Duty line', render: (r) => `${r.dutyLabel}` },
            { label: 'Held by', render: (r) => `${r.holderLabel} (rank ${r.holderRank})` },
            { label: 'Cover', render: (r) => (board.namesVisible ? `${r.coverName || '—'} · rank ${r.coverRank}` : `rank ${r.coverRank} cover`) },
            { label: 'Ask window', render: (r) => `${windowText(r.askWindow)}${r.askWindow.basis === 'declared-absence' ? '' : ' (forward)'}` },
            { label: 'Asked', render: (r) => r.askedOn },
            { label: 'Deadline', render: (r) => r.deadlineOn || '—' },
            { label: 'Answered', render: (r) => (r.answeredOn ? `${r.answeredOn} (${r.answer.answer})` : '—') },
            { label: 'Open work', render: (r) => String(r.openN) },
            { label: 'Why', render: (r) => h('span', { class: 'muted small' }, r.stateReason) },
          ],
          rows,
          emptyMessage: 'No declared covers.',
        }),
        board.deferredN
          ? h('p', { class: 'muted small' }, `${board.deferredN} further cover(s) are not printed here: the board renders its first 40 rows worst-state-first and counts the remainder rather than silently truncating.`)
          : null),
    }),
    board.refusedOnly?.length
      ? card({
        title: `${board.refusedOnly.length} duty line(s) whose only declared covers refused`,
        subtitle: 'The concrete exposure: a named person considered the ask and said no, and nobody else is declared.',
        body: h('div', { class: 'stack' },
          table({
            caption: 'Duty lines with no accepting cover',
            columns: [
              { label: 'Duty line', render: (r) => r.dutyLabel },
              { label: 'Held by', render: (r) => r.holderLabel },
              { label: 'Ask window', render: (r) => windowText(r.askWindow) },
              { label: 'Covers', render: (r) => String(r.coversN) },
              { label: 'Open work', render: (r) => String(r.openN) },
              { label: 'Act', render: (r) => h('a', { class: 'btn btn-ghost btn-small', href: '#/duty-cover?panel=register' }, 'Declare another cover') },
            ],
            rows: board.refusedOnly,
            emptyMessage: 'No duty line is refused-only.',
          }),
          h('p', { class: 'muted small' }, 'No cover is re-assigned automatically. Naming a different person is a human act on the duty register, and it is asked of that person in their own chair.')),
      })
      : null,
    card({
      title: 'The identity-free upward brief',
      subtitle: 'Counts and states only — safe to carry upward unchanged.',
      body: h('pre', { class: 'brief-block' }, (board.brief || []).join('\n') || 'No standby reading to carry: no declared cover exists in this span.'),
    }));
}

function methodPanel(ctx) {
  const settings = ctx.api.dutyStandbySettings?.();
  const conventions = settings?.conventions || { dutyStandbyResponseDays: 3, dutyStandbyWindowDays: 14 };
  const bounds = settings?.bounds || DUTY_STANDBY_BOUNDS;
  const result = ctx.api.dutyStandbyBoard?.();
  const seat = result?.board?.seat || null;
  const editable = Boolean(result?.board?.seat?.fullAccess) && (result?.board?.seat?.rank ?? 0) >= 4;
  return h('div', { class: 'stack' },
    card({ title: 'The premise', body: h('p', null, DUTY_STANDBY_PREMISE) }),
    card({
      title: 'Declared conventions (printed, clamped, never fitted)',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Response deadline', value: `${conventions.dutyStandbyResponseDays} day(s)`, hint: `an ask reads overdue after this many days without an answer; bounds ${bounds.dutyStandbyResponseDays.join('–')}` }),
          stat({ label: 'Forward standby window', value: `${conventions.dutyStandbyWindowDays} day(s)`, hint: `used only when the holder has declared no dated absence; bounds ${bounds.dutyStandbyWindowDays.join('–')}` })),
        editable
          ? h('button', {
            class: 'btn btn-small', type: 'button',
            onClick: () => {
              const form = buildForm([
                { name: 'dutyStandbyResponseDays', label: 'Days to answer before an ask reads overdue', type: 'number', min: bounds.dutyStandbyResponseDays[0], max: bounds.dutyStandbyResponseDays[1], value: conventions.dutyStandbyResponseDays },
                { name: 'dutyStandbyWindowDays', label: 'Forward standby window (days) where no absence is declared', type: 'number', min: bounds.dutyStandbyWindowDays[0], max: bounds.dutyStandbyWindowDays[1], value: conventions.dutyStandbyWindowDays },
              ]);
              openModal({
                title: 'Re-declare the cover-acknowledgement conventions',
                description: 'These move every ask’s deadline at once. Declared deliberately, then printed everywhere.',
                body: form.node,
                footer: [
                  h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
                  h('button', {
                    class: 'btn btn-primary', type: 'button',
                    onClick: () => {
                      const v = form.getValues();
                      const r = ctx.api.dutyStandbySetConventions({
                        dutyStandbyResponseDays: Number(v.dutyStandbyResponseDays),
                        dutyStandbyWindowDays: Number(v.dutyStandbyWindowDays),
                      });
                      if (!notify(r, 'Conventions re-declared.')) return;
                      closeAllModals();
                      ctx.refresh();
                    },
                  }, 'Re-declare'),
                ],
              });
            },
          }, 'Re-declare conventions')
          : h('p', { class: 'muted small' }, 'Only a rank-4 and above seat with full access may re-declare these. Below that they are read, not edited.')),
    }),
    card({
      title: 'What is stored, and what is derived',
      body: h('ul', { class: 'plain-list' },
        h('li', null, h('strong', null, 'Stored:'), ' the answer itself — accepted or declined, the bounded window it was given for, the answerer’s own words, the day and instant, and the governed decision opened when the answer was a refusal. Nothing else.'),
        h('li', null, h('strong', null, 'Derived on every read:'), ' the ask window (the holder’s declared absence, or a bounded forward window), whether an ask is awaiting / overdue / accepted / declined / lapsed, the days since the ask, and the counts behind the exposure.'),
        h('li', null, h('strong', null, 'Refused:'), ' an answer given on someone else’s behalf (the schema drops it on reload as well as the action refusing it), a window wider than the one asked about, a second stacked answer over an existing one, and a refusal without a reason.'),
        h('li', null, h('strong', null, 'Not done here:'), ' no reminder is sent, no cover is re-assigned, and no escalation fires. The register names who has not answered; the human acts stay human.'),
        h('li', null, h('strong', null, 'Schema v116 is additive.'), ' An upgraded workspace opens with an EMPTY answer ledger, so every existing declared cover reads awaiting or overdue from its declaration date. That is the truthful state: the ask has been outstanding since the day it was made.')),
    }),
    seat ? h('p', { class: 'muted small' }, `Reading as ${seat.label} (rank ${seat.rank}).`) : null,
  );
}

/* ------------------------------------------------------------------- render */

export function renderStandby(ctx) {
  apiRef = ctx.api;
  const panel = panelFor(ctx.query);
  const body = panel === 'for-me' ? forMePanel(ctx)
    : panel === 'method' ? methodPanel(ctx)
      : askedPanel(ctx);
  const me = ctx.api.dutyStandbyForMe?.();
  const openMine = me?.ok ? me.board.summary : null;
  return h('div', { class: 'stack standby-view' },
    pageHeader({
      eyebrow: 'Continuity · ADR-0127',
      title: 'Cover acknowledgement',
      subtitle: 'A declared cover is an ask, not an answer. This is where the person who was named says yes or no — and where the leader who named them sees who has still not answered.',
      actions: [
        openMine && openMine.openN
          ? badge(`${openMine.openN} ask(s) for you`, openMine.overdueN ? 'bad' : 'warn', 'Standby asks addressed to the acting seat that are not yet accepted')
          : null,
        h('a', { class: 'btn small', href: '#/standby?panel=for-me' }, 'My asks'),
        h('a', { class: 'btn ghost small', href: '#/duty-cover' }, 'Duty register'),
        h('button', { class: 'btn small', type: 'button', onClick: exportCsv }, 'Export CSV'),
      ].filter(Boolean),
      meta: h('p', { class: 'muted' }, DUTY_STANDBY_PREMISE),
    }),
    tabs({ items: PANELS.map((p) => ({ key: p.key, label: p.label })), active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Cover acknowledgement panels' }),
    body,
  );
}
