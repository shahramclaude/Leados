/**
 * app/views/matrixConsentPanel.js — `#/matrix?panel=consent`, Matrix Line
 * Consent (ADR-0148, Schema v123).
 *
 * Three sections, three questions the ledger cannot answer on its own:
 *
 *   Board     how much of these people has been DECLARED, how much has been
 *             ACCEPTED by the managers it was given to, and how much has been
 *             acknowledged by the people whose hours it takes?
 *   Register  one row per declared line: who holds it, at what share, what
 *             state it is in, and the one action that moves it.
 *   Method    what is stored, what is derived, and what this register refuses
 *             to print.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - A declared share as an accepted one. `unanswered` is its own word and its
 *    own colour.
 *  - A total over the lines that happen to carry a number. If any line in scope
 *    has no allocation, the share total is REFUSED with the reason.
 *  - A decline as a deletion. The share stays charged, and the row says so.
 *  - A consent nobody gave: no button here accepts a line on a manager's behalf
 *    or acknowledges one for a person.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { LINE_CONSENT_CSV_COLUMNS, LINE_CONSENT_LIMITS_TEXT, LINE_CONSENT_METHOD } from '../core/domain/lineConsentRegistry.js';

const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pct = (v) => (v === null || v === undefined ? 'refused' : `${v}%`);

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The consent action was refused.', 'bad'); return false; }
  toast(message, 'good');
  return true;
}

function stateBadge(line) {
  return badge(line.stateLabel, line.tone === 'bad' ? 'bad' : line.tone === 'warn' ? 'warn' : line.tone === 'good' ? 'good' : 'neutral');
}

/* ------------------------------------------------------------------ dialogs */

function acceptDialog(ctx, line) {
  const form = buildForm([
    {
      name: 'expiresOn', label: 'Acceptance runs until (YYYY-MM-DD)', type: 'date', value: '',
      help: 'Blank uses the declared convention. An acceptance must carry an expiry: consent that never lapses cannot be distinguished from consent nobody revisited.',
    },
    {
      name: 'basis', label: 'What is this line on the hook to deliver? (optional)', type: 'textarea', value: '', rows: 3,
      help: 'Your own words, stored with the acceptance. Blank prints as “no basis stated”, which is honest; a three-word basis would be worse than none.',
    },
  ]);
  openModal({
    title: `Accept — ${line.personName} → ${line.managerName}`,
    description: `A ${line.kind} line at ${line.shareDisplay}. Accepting records that you hold this share of ${line.personName} and the rights declared on the line.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineConsentAccept({
            declarationId: line.declarationId,
            expiresOn: values.expiresOn || null,
            basis: values.basis || '',
          });
          if (!notify(result, `Accepted${result.expiresOn ? ` until ${result.expiresOn}` : ''}. The person is asked to acknowledge it.`)) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Accept the share'),
    ],
  });
}

function declineDialog(ctx, line) {
  const form = buildForm([
    {
      name: 'reason', label: 'Why is this share refused?', type: 'textarea', value: '', rows: 3,
      help: 'Required. The declaration is not removed by this: only the manager who declared it, or the span above both of you, can end the line — so the share stays charged and this register will keep saying so.',
    },
  ]);
  openModal({
    title: `Decline — ${line.personName} → ${line.managerName}`,
    description: `Refusing the ${line.kind} line at ${line.shareDisplay} records an answer. It does not withdraw the declaration.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.lineConsentDecline({ declarationId: line.declarationId, reason: values.reason || '' });
          if (!notify(result, 'Declined, with your reason on the record.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the refusal'),
    ],
  });
}

function acknowledgeDialog(ctx, line) {
  openModal({
    title: `Acknowledge — ${line.personName} → ${line.managerName}`,
    description: `${line.managerName} accepted this ${line.kind} line on ${line.acceptedOn} and it stands until ${line.acceptanceExpiresOn}. Acknowledging records that you have been told the share is taken from your hours.`,
    body: h('div', { class: 'stack-tight' },
      h('p', {}, `Share: ${line.shareDisplay}. ${line.acceptanceBasis ? `Stated basis: “${line.acceptanceBasis}”.` : 'The line stated no basis for the share.'}`),
      h('p', { class: 'muted small' }, 'Only you can record this. A manager cannot acknowledge on your behalf, because that is exactly the shadow accountability this register exists to name.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const result = ctx.api.lineConsentAcknowledge({ declarationId: line.declarationId });
          if (!notify(result, 'Acknowledged. The line now reads as consented by both sides.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'I have been told'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function boardPanel(ctx, report) {
  const b = report.board;
  if (!report.isMatrix) {
    return h('div', { class: 'stack' },
      banner({
        tone: 'neutral',
        title: 'Single-chain workspace: nothing to consent',
        body: report.singleChainNote || 'No person in scope reports to more than one manager.',
      }));
  }

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A declared share is an ask until two people answer it: the manager it was given to, and the person whose hours it takes. This board prints both numbers beside the declared one, because “the roll-up adds up” and “somebody agreed to it” are different facts.'),

    h('div', { class: 'stat-grid' },
      stat({ label: 'People on a second line', value: num(b.peopleN), hint: `${b.linesN} declared line(s) in scope` }),
      stat({ label: 'Declared', value: pct(b.declaredShareH), hint: 'shares on the ledger, agreed or not', tone: b.sharesRefused ? 'warn' : '' }),
      stat({ label: 'Accepted by the line', value: pct(b.acceptedShareH), hint: 'managers who said yes', tone: b.unansweredN ? 'warn' : '' }),
      stat({ label: 'Acknowledged by the person', value: pct(b.acknowledgedShareH), hint: 'both sides answered', tone: b.awaitingPersonN ? 'warn' : '' }),
      stat({ label: 'Never answered', value: num(b.unansweredN), hint: 'share is an ask, not an agreement', tone: b.unansweredN ? 'warn' : '' }),
      stat({ label: 'Declined, still charged', value: num(b.chargedDespiteDeclineN), hint: 'only a human can end the declaration', tone: b.chargedDespiteDeclineN ? 'bad' : '' }),
      stat({ label: 'Accepted a different share', value: num(b.changedN), hint: 'retuned after the manager said yes', tone: b.changedN ? 'bad' : '' }),
      stat({ label: 'Past one whole person', value: num(b.personsOverAcceptedN), hint: 'accepted shares sum above 100%', tone: b.personsOverAcceptedN ? 'bad' : '' }),
      stat({ label: 'Withheld from this seat', value: num(b.withheldN), hint: 'counted, not shown', tone: '' }),
    ),

    b.sharesRefused
      ? banner({
          tone: 'warn',
          title: 'Share totals are refused',
          body: b.sharesRefusedReason || 'A declared line in scope carries no allocation, so a total would be printed over a part.',
        })
      : null,

    card({
      title: 'The reconciliation',
      subtitle: 'Each figure below is a count of printed rows — one person, one line, never a line-person.',
      body: table({
        caption: 'Consent identities',
        columns: [
          { label: 'Identity', key: 'label' },
          { label: 'Reading', key: 'detail' },
        ],
        rows: [
          {
            label: 'Lines in scope',
            detail: b.linesN === b.unansweredN + b.declinedN + b.changedN + b.lapsedN + b.awaitingPersonN + b.acceptedN
              ? `${b.unansweredN} never answered + ${b.declinedN} declined + ${b.changedN} retuned after acceptance + ${b.lapsedN} lapsed + ${b.awaitingPersonN} awaiting the person + ${b.acceptedN} accepted = ${b.linesN}`
              : 'THE COUNTS DO NOT ADD UP',
          },
          {
            label: 'People in scope',
            detail: `${b.peopleN} on a second line, ${b.personsConsentedN} fully consented, ${b.personsUndeclaredN} with an undeclared share, ${b.withheldN} withheld.`,
          },
          {
            label: 'Accepted vs declared',
            detail: b.sharesRefused ? 'refused — see the refusal above' : `${b.acceptedShareH}% of ${b.declaredShareH}% of a person has been accepted; ${(b.declaredShareH || 0) - (b.acceptedShareH || 0)}% has not.`,
          },
        ],
      }),
    }),

    card({
      title: 'The reading, in one paragraph',
      subtitle: 'Identity-free, printable, and safe to paste into a leadership note.',
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.lineConsentBriefText?.();
            if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
            downloadText({ filename: `leados-line-consent-brief-${new Date().toISOString().slice(0, 10)}.md`, text: result.text });
          },
        }, 'Download brief'),
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.lineConsentCsvRows?.();
            if (!result?.ok) { toast(result?.error || 'The export was refused.', 'bad'); return; }
            downloadText({
              filename: `leados-line-consent-${new Date().toISOString().slice(0, 10)}.csv`,
              text: serializeCsv(LINE_CONSENT_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
            });
          },
        }, 'Download CSV'),
      ],
      body: h('p', { class: 'muted' }, ctx.api.lineConsentBriefText?.()?.text || 'The brief is unavailable.'),
    }),
  );
}

function registerPanel(ctx, report) {
  if (!report.isMatrix) {
    return banner({
      tone: 'neutral',
      title: 'Single-chain workspace: no line to answer',
      body: report.singleChainNote || 'No person in scope reports to more than one manager, so there is no second share to accept.',
    });
  }
  const rows = [];
  for (const person of report.persons) {
    for (const line of person.lines) {
      rows.push({
        person: h('div', { class: 'stack-tight' },
          h('strong', {}, line.personName),
          h('span', { class: 'muted small' }, line.kind ? String(line.kind) : 'kind not declared')),
        line: h('div', { class: 'stack-tight' },
          h('span', {}, line.managerName),
          line.shareDeclared ? null : h('span', { class: 'muted small' }, 'allocation undeclared')),
        share: pct(line.sharePct),
        state: h('div', { class: 'stack-tight' }, stateBadge(line), h('span', { class: 'muted small' }, line.reason)),
        window: h('div', { class: 'stack-tight' },
          h('span', {}, line.acceptedOn ? `${line.acceptedOn} → ${line.acceptanceExpiresOn}` : '—'),
          line.state === 'changed' ? h('span', { class: 'muted small' }, `accepted at ${line.acceptedSharePct === null ? 'no declared share' : `${line.acceptedSharePct}%`}, now ${line.sharePct === null ? 'no share' : `${line.sharePct}%`}`) : null,
          line.declinedOn ? h('span', { class: 'muted small' }, `declined ${line.declinedOn}: ${line.declineReason}`) : null,
          line.acknowledgedOn ? h('span', { class: 'muted small' }, `acknowledged ${line.acknowledgedOn}`) : null),
        action: h('div', { class: 'row-actions' },
          line.state === 'unanswered' || line.state === 'lapsed'
            ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => acceptDialog(ctx, line) }, 'Accept')
            : null,
          line.state === 'awaiting-person'
            ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => acknowledgeDialog(ctx, line) }, 'Acknowledge')
            : null,
          line.state !== 'declined'
            ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => declineDialog(ctx, line) }, 'Decline')
            : null),
      });
    }
  }

  return h('div', { class: 'stack' },
    report.board.chargedDespiteDeclineN
      ? banner({
          tone: 'bad',
          title: `${report.board.chargedDespiteDeclineN} declined line(s) are still charged`,
          body: 'A refusal is an answer, not a withdrawal. The declaration stands until the manager who made it — or the span above both — ends it, so the share still counts in every roll-up. The row tells you which.',
        })
      : null,
    card({
      title: 'Every declared line, and who answered',
      subtitle: `${report.persons.length} person(s) on a second line, read from ${report.scopeLabel}.`,
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const result = ctx.api.lineConsentScan?.();
            if (!notify(result, 'Consent obligations retried. No declaration was changed.')) return;
            ctx.refresh();
          },
        }, 'Retry outstanding asks'),
      ],
      body: table({
        caption: 'Declared lines and their consent state',
        emptyMessage: 'No declared line is in force in this seat.',
        columns: [
          { label: 'Person', key: 'person' },
          { label: 'Line', key: 'line' },
          { label: 'Share', key: 'share' },
          { label: 'State', key: 'state' },
          { label: 'Window', key: 'window' },
          { label: '', key: 'action' },
        ],
        rows,
      }),
    }),
  );
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register does',
      subtitle: 'Printed on every load, from the same registry the rule and the export read.',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, `Engine ${report.engineVersion}; conventions: an acceptance stands ${report.conventions.lineConsentAcceptDays} days unless a date is given, a line manager has ${report.conventions.lineConsentAskDueDays} days to answer the ask, and a person is chased ${report.conventions.lineConsentAckDays} days after an acceptance stands unacknowledged.`),
        ...LINE_CONSENT_METHOD.map((m) => h('div', { class: 'stack-tight' },
          h('strong', {}, m.name),
          h('p', { class: 'muted small' }, m.why))),
      ),
    }),
    card({
      title: 'What is stored, and what is derived',
      subtitle: 'A stored state is a verdict waiting to disagree with the acts it was computed from.',
      body: h('ul', { class: 'muted small' },
        h('li', {}, 'Stored: the dated acts only — a manager-side acceptance (with the window it runs to and an optional stated basis), a reasoned decline, or the person’s own acknowledgement. The ledger is bounded, and when the oldest act is displaced the displacement is printed on the event that caused it.'),
        h('li', {}, 'Derived on every read: every line state, every lapse, every day count, every person verdict and every share total.'),
        h('li', {}, 'Never stored: a share on a consent row. The allocation lives on the declaration, so a retune cannot leave a consent claiming agreement to a number that no longer exists.'),
      ),
    }),
    card({
      title: 'Honest limits',
      subtitle: 'Printed on the page, so the reading cannot be mistaken for a survey of willingness.',
      body: h('ul', { class: 'muted small' },
        ...LINE_CONSENT_LIMITS_TEXT.map((text) => h('li', {}, text))),
    }),
  );
}

/* -------------------------------------------------------------------- route */

export function renderConsentPanel(ctx) {
  const result = ctx.api.lineConsentBoard?.();
  if (!result?.ok) {
    return banner({ tone: 'bad', title: 'Line consent is not available', body: result?.error || 'The consent register could not be built.' });
  }
  const report = result.report;
  return h('div', { class: 'stack' },
    boardPanel(ctx, report),
    report.isMatrix ? registerPanel(ctx, report) : null,
    methodPanel(report),
  );
}

export default renderConsentPanel;
