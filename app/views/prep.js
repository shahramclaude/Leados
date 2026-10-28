/**
 * app/views/prep.js — the printable one-meeting preparation sheet.
 *
 * This is a document, not a dashboard: it is meant to be printed, saved as a
 * PDF, or read on a phone in the ten minutes before a 1:1. Every section comes
 * from a real record, and the two things that must never reach paper — a
 * confidential conflict working record and an anonymous pulse answer — are
 * excluded at the data layer (`domain/prep.js`) and named here so the person
 * holding the sheet knows exactly what is absent and why.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, emptyState, progressBar } from '../ui/components.js';
import { buildPrepSheet } from '../core/domain/prep.js';
import { formatDate, humanDays } from '../core/time.js';
import { openOneOnOneDialog, openPersonDialog } from '../ui/modals.js';

const MOOD_LABELS = { 1: 'low', 2: 'below average', 3: 'mixed', 4: 'good', 5: 'strong' };

function metaRow(items) {
  return h('div', { class: 'person-meta' }, ...items);
}

function topicList(topics, selectedTopics) {
  return h(
    'ol',
    { class: 'prep-list prep-list-ordered' },
    ...topics.map((topic) =>
      h(
        'li',
        { class: 'prep-item' },
        h(
          'label',
          { class: 'prep-check-row' },
          h('input', {
            type: 'checkbox',
            checked: selectedTopics.has(topic.text),
            onChange: (event) => {
              if (event.target.checked) selectedTopics.add(topic.text);
              else selectedTopics.delete(topic.text);
            },
          }),
          h('span', { class: 'prep-item-text' }, topic.text),
        ),
      ),
    ),
  );
}

function agendaList(agenda, selectedAgenda) {
  return h(
    'ol',
    { class: 'prep-list prep-list-ordered' },
    ...agenda.map((item) =>
      h(
        'li',
        { class: 'prep-item' },
        h(
          'label',
          { class: 'prep-check-row' },
          h('input', {
            type: 'checkbox',
            checked: selectedAgenda.has(item.text),
            onChange: (event) => {
              if (event.target.checked) selectedAgenda.add(item.text);
              else selectedAgenda.delete(item.text);
            },
          }),
          h(
            'span',
            { class: 'prep-check-body' },
            h('span', { class: 'prep-item-text' }, item.text),
            h('span', { class: 'agenda-item-reason' }, `${item.source} · ${item.reason}`),
          ),
        ),
      ),
    ),
  );
}

function commitmentGroup(title, items, renderItem) {
  return h(
    'div',
    { class: 'prep-commitment' },
    h(
      'h3',
      { class: 'prep-commitment-title' },
      title,
      items.length ? h('span', { class: 'band-count' }, String(items.length)) : null,
    ),
    items.length
      ? h('ul', { class: 'prep-list' }, ...items.map(renderItem))
      : h('p', { class: 'muted small' }, 'Nothing open.'),
  );
}

function itemMeta(item) {
  const bits = [];
  if (item.source === '1:1 action') {
    bits.push(item.owner === 'leader' ? 'you owe it' : item.owner === 'them' ? 'they owe it' : item.owner === 'shared' ? 'shared' : 'no owner named');
  }
  if (item.carryCount) {
    bits.push(`carried forward ${item.carryCount}×${item.firstAgreedOn ? ` since ${formatDate(item.firstAgreedOn, { withYear: false })}` : ''}`);
  }
  if (item.detail) bits.push(item.detail);
  if (item.due) bits.push(`${formatDate(item.due, { withYear: false })}${item.overdue ? ' · overdue' : ''}`);
  else if (item.overdue) bits.push('overdue');
  return bits.join(' · ');
}

function genericItem(item) {
  return h(
    'li',
    { class: `prep-item ${item.overdue ? 'is-overdue' : ''}` },
    h('span', { class: 'prep-item-text' }, item.text),
    itemMeta(item) ? h('span', { class: 'prep-item-meta' }, itemMeta(item)) : null,
    item.sourceLinkValid
      ? h('a', { class: 'link tiny', href: `#/onboarding?plan=${encodeURIComponent(item.sourcePlanId)}` }, `Open Day ${item.sourceHorizon} source check-in · ${formatDate(item.sourceHeldOn, { withYear: false })}`)
      : item.source === 'manager support'
        ? h('span', { class: 'muted tiny' }, 'Source check-in link unavailable')
        : null,
  );
}

function delegationItem(item) {
  return h(
    'li',
    { class: `prep-item ${item.overdue ? 'is-overdue' : ''}` },
    h('span', { class: 'prep-item-text' }, item.text),
    h('span', { class: 'prep-item-meta' }, item.detail || ''),
    h('span', { class: 'prep-item-meta muted' }, item.due ? `due ${formatDate(item.due, { withYear: false })}` : 'no due date'),
  );
}

function sinceLastCard(sheet) {
  const last = sheet.sinceLast;
  if (!last.lastHeldDate) {
    return card({
      title: 'Since we last spoke',
      body: emptyState({
        title: 'No 1:1 recorded yet',
        body: 'This will be the first meeting with this person. Start with what they want from you.',
      }),
    });
  }
  const notes = (last.notes || '').trim();
  return card({
    title: 'Since we last spoke',
    subtitle: `Last held ${formatDate(last.lastHeldDate)} · ${humanDays(last.daysSinceHeld)}`,
    body: h(
      'div',
      null,
      h(
        'div',
        { class: 'prep-since-head' },
        last.mood != null ? badge(`Mood ${last.mood}/5 (${MOOD_LABELS[last.mood] || ''})`, last.mood <= 2 ? 'warn' : 'neutral') : null,
        last.recognition ? h('span', { class: 'muted small' }, `Recognised ${formatDate(last.recognition.date)} for: ${last.recognition.what}`) : null,
      ),
      notes ? h('p', { class: 'review-text' }, notes) : h('p', { class: 'muted' }, 'No notes were recorded from that meeting.'),
      last.openActions.length
        ? h(
            'div',
            { class: 'prep-since-actions' },
            h('p', { class: 'prep-subhead' }, 'Still open from that meeting'),
            h('ul', { class: 'prep-list' }, ...last.openActions.map((text) => h('li', { class: 'prep-item' }, h('span', { class: 'prep-item-text' }, text)))),
          )
        : null,
    ),
  });
}

function riskCard(sheet) {
  const goals = sheet.goalsAtRisk;
  return card({
    title: 'Outcomes at risk',
    subtitle: goals.length ? 'Active goals this person owns that are not on track.' : 'Every active goal this person owns is on track.',
    body: goals.length
      ? h(
          'ul',
          { class: 'prep-list' },
          ...goals.map((goal) =>
            h(
              'li',
              { class: 'prep-item' },
              h(
                'div',
                { class: 'prep-item-head' },
                h('span', { class: 'prep-item-text' }, goal.title),
                badge(sheet.confidenceLabels[goal.confidence] || goal.confidence, goal.confidence === 'off-track' ? 'bad' : 'warn'),
              ),
              goal.progressPct == null
                ? h('p', { class: 'muted small' }, 'Unmeasured — this goal has no key results.')
                : progressBar(goal.progressPct, { label: `${goal.title} progress`, tone: goal.progressPct >= 50 ? 'good' : 'warn' }),
            ),
          ),
        )
      : emptyState({ title: 'Nothing at risk', body: 'No active goal is flagged off track.' }),
  });
}

function casesPrepCard(sheet) {
  const openCases = sheet.openCases || [];
  if (!openCases.length) return null;
  return card({
    title: 'Active operational cases (support & systemic barriers)',
    subtitle: 'Blameless operational context — check capacity trade-offs, stakeholder air-cover, and missing guardrails.',
    body: h(
      'ul',
      { class: 'prep-list' },
      ...openCases.map((c) =>
        h(
          'li',
          { class: 'prep-item' },
          h(
            'div',
            { class: 'prep-item-head' },
            h('span', { class: 'prep-item-text' }, `${c.title} (${c.role})`),
            c.actionPriority
              ? badge(`FMEA ${c.actionPriority.toUpperCase()} · RPN ${c.rpn}`, c.actionPriority === 'high' ? 'bad' : 'warn')
              : badge('FMEA not rated', 'caution'),
          ),
          c.systemicBarrier ? h('p', { class: 'muted small' }, `Systemic barrier: ${c.systemicBarrier}`) : null,
          c.opportunityCost ? h('p', { class: 'muted small' }, `Capacity trade-off: ${c.opportunityCost}`) : null,
        ),
      ),
    ),
  });
}

function changesPrepCard(sheet) {
  const openChanges = sheet.openChanges || [];
  if (!openChanges.length) return null;
  return card({
    title: 'Active organizational changes & role transitions',
    subtitle: 'Systemic boundary context — check role clarity, cognitive load, and temporary J-curve friction.',
    body: h(
      'ul',
      { class: 'prep-list' },
      ...openChanges.map((chg) =>
        h(
          'li',
          { class: 'prep-item' },
          h(
            'div',
            { class: 'prep-item-head' },
            h('span', { class: 'prep-item-text' }, `${chg.title} (${chg.role}${chg.newRoleLabel ? ` → ${chg.newRoleLabel}` : ''})`),
            badge(`${chg.status} · ${chg.kotterStageLabel}`, chg.status === 'active' ? 'accent' : 'neutral'),
          ),
          chg.vision ? h('p', { class: 'muted small' }, `Target vision: ${chg.vision}`) : null,
          chg.nonGoals ? h('p', { class: 'muted small' }, `Explicit non-goals: ${chg.nonGoals}`) : null,
        ),
      ),
    ),
  });
}

function resiliencePrepCard(sheet) {
  const deps = sheet.stewardedDependencies || [];
  if (!deps.length) return null;
  return card({
    title: 'Operational stewardship & continuity load',
    subtitle: 'Blameless vacation and focus protection — check Bus-Factor-1 capabilities so no person carries a capability alone.',
    body: h(
      'ul',
      { class: 'prep-list' },
      ...deps.map((d) =>
        h(
          'li',
          { class: 'prep-item' },
          h(
            'div',
            { class: 'prep-item-head' },
            h('span', { class: 'prep-item-text' }, `${d.name} (${d.roleLabel})`),
            badge(
              d.isSoleSteward ? 'Sole steward (BF 1)' : `BF ${d.busFactor}`,
              d.isSoleSteward ? 'warn' : 'good',
            ),
          ),
          d.isSoleSteward
            ? h('p', { class: 'muted small' }, 'Frame cross-training as protecting their focus and leave coverage — who should shadow the next run?')
            : null,
        ),
      ),
    ),
  });
}

function notesCard() {
  return card({
    title: 'Notes from this meeting',
    subtitle: 'Print this sheet and write here — it becomes part of the record when you log the 1:1.',
    body: h('div', { class: 'prep-notes' }, ...Array.from({ length: 6 }, () => h('div', { class: 'prep-line' }))),
  });
}

export function renderPrepSheet(ctx, personId) {
  const { state, now } = ctx;
  const sheet = buildPrepSheet(state, personId, now, state.settings);

  if (sheet.missing) {
    return h(
      'div',
      { class: 'page' },
      pageHeader({ title: 'Person not found', subtitle: 'That record no longer exists.' }),
      card({
        title: 'Person not found',
        body: emptyState({ title: 'No such person', action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Back to people') }),
      }),
    );
  }

  // The full record, not the sheet's display subset: editing from this screen
  // must preserve the start date and the topics, not reset them.
  const person = state.people.find((p) => p.id === sheet.person.id) || sheet.person;
  const selectedTopics = new Set(sheet.theirTopics.map((t) => t.text));
  const selectedAgenda = new Set(sheet.agenda.map((a) => a.text));

  const cad = sheet.cadence;
  const cadenceBadge =
    cad.status === 'overdue'
      ? badge(`1:1 ${cad.overdueDays}d overdue`, 'bad')
      : cad.status === 'never'
        ? badge('No 1:1 ever', 'warn')
        : cad.status === 'due'
          ? badge('1:1 due', 'caution')
          : badge(`On cadence (${cad.expectedDays}d)`, 'good');

  const header = pageHeader({
    eyebrow: '1:1 preparation',
    title: sheet.person.name,
    subtitle: [sheet.person.role, sheet.person.team].filter(Boolean).join(' · '),
    meta: metaRow([
      cadenceBadge,
      h('span', { class: 'muted small' }, `Next: ${formatDate(sheet.nextMeetingOn, { withYear: false })}`),
    ]),
    actions: [
      h('button', { class: 'btn btn-ghost no-print', type: 'button', onClick: () => window.print() }, 'Print / save PDF'),
      h(
        'button',
        { class: 'btn btn-ghost no-print', type: 'button', onClick: () => openPersonDialog(ctx, { person }) },
        'Edit person',
      ),
      h(
        'button',
        {
          class: 'btn btn-primary no-print',
          type: 'button',
          onClick: () => openOneOnOneDialog(ctx, {
            personId: sheet.person.id,
            preparedTopics: [...selectedTopics],
            preparedAgenda: [...selectedAgenda],
          }),
        },
        'Log the 1:1',
      ),
    ],
  });

  const topicsCard = card({
    title: 'Their topics',
    subtitle: 'What they have asked to raise. Checked items carry into Log a 1:1 and clear from their waiting list once held.',
    body: sheet.theirTopics.length
      ? topicList(sheet.theirTopics, selectedTopics)
      : emptyState({
          title: 'Nothing recorded yet',
          body: 'Ask what they want to talk about, then add it to their record so it appears here.',
        }),
  });

  const agendaCard = card({
    title: 'Suggested agenda',
    subtitle: `Built from this person’s open items · ${sheet.agenda.length} items, each with its reason. Uncheck anything you are skipping today.`,
    body: agendaList(sheet.agenda, selectedAgenda),
  });

  const { commitments, commitmentCount, mineCount, unownedCount } = sheet;
  const commitmentsCard = card({
    title: 'Open commitments',
    subtitle: commitmentCount
      ? [
          `${commitmentCount} still open, grouped by where they came from.`,
          mineCount ? `${mineCount} of the 1:1 promises are yours to do.` : null,
          unownedCount ? `${unownedCount} have no owner named.` : null,
          'Overdue first; promises carried forward more than once are marked.',
        ].filter(Boolean).join(' ')
      : 'Nothing promised and still open.',
    body: commitmentCount
      ? h(
          'div',
          { class: 'prep-grid' },
          commitmentGroup('Promises from past 1:1s', commitments.actions, genericItem),
          commitmentGroup('Manager-owned check-in follow-ups', commitments.managerSupport || [], genericItem),
          commitmentGroup('30-60-90 (onboarding & transitions)', commitments.onboarding || [], delegationItem),
          commitmentGroup('Feedback to close the loop', commitments.feedback, genericItem),
          commitmentGroup('Development actions', commitments.development, genericItem),
          commitmentGroup('Delegation checkpoints', commitments.delegations, delegationItem),
        )
      : emptyState({ title: 'Nothing open', body: 'No actions, follow-ups, development steps or checkpoints are outstanding.' }),
  });

  return h(
    'div',
    { class: 'page prep-page' },
    h('a', { class: 'back-link no-print', href: `#/people/${encodeURIComponent(sheet.person.id)}` }, '← Back to person'),
    header,
    banner({
      tone: 'info',
      title: 'One sheet, one meeting',
      body: `Prepared ${formatDate(sheet.generatedAt)}. Everything here comes from real records. ${sheet.excluded.join(' and ')} are deliberately excluded — a printed sheet must never carry either.`,
    }),
    h('div', { class: 'stat-row prep-stat-row' },
      stat({ label: 'Cadence', value: cad.lastHeldDate ? humanDays(cad.daysSinceHeld) : 'never', hint: `every ${cad.expectedDays} days` }),
      stat({ label: 'Open commitments', value: commitmentCount, hint: commitmentCount ? 'settle or carry each one' : 'none outstanding' }),
      stat({ label: 'Topics they raised', value: sheet.theirTopics.length, hint: sheet.theirTopics.length ? 'their agenda' : 'ask in the meeting' }),
      stat({ label: 'Outcomes at risk', value: sheet.goalsAtRisk.length, hint: sheet.goalsAtRisk.length ? 'not on track' : 'on track' }),
    ),
    h('div', { class: 'prep-stack' }, topicsCard, agendaCard, commitmentsCard, sinceLastCard(sheet), riskCard(sheet), casesPrepCard(sheet), changesPrepCard(sheet), resiliencePrepCard(sheet), notesCard()),
    h('p', { class: 'prep-footer muted tiny' }, 'Generated by LeadOS · local-first, no network. Print or save as PDF to share.'),
  );
}
