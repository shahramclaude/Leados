/**
 * app/views/conflictRecusalPanel.js — `#/recusal`, the Decision-Maker
 * Conflict-of-Interest & Recusal Register (ADR-0210, Schema v164, CSV scope #152,
 * `RULE-CIR-01`).
 *
 * ONE reader (`buildConflictRecusal`) stands behind every total, every row, the
 * brief and the CSV. Nothing is recomputed here: this file formats counts and
 * sentences the reader already computed, so what the screen prints is what the
 * engine computed.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART, because collapsing any two of them
 * is how a governance register lies:
 *   1. a DECLARED interest that reaches the record (`undisclosed`, `ineffective`,
 *      `mitigated`, `determined`);
 *   2. a reportable POSITION nobody declared anything about (`unsearched`);
 *   3. a position somebody DECLARED CLEAR, kind by kind (`clean`);
 *   4. an interest WITHDRAWN by a dated act (`withdrawn`).
 * "Nothing found" is never printed as "nothing there", and a mitigation is never
 * printed as independence.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { conflictRecusalBriefText } from '../core/domain/conflictRecusal.js';
import {
  CONFLICT_DIRECTIONS,
  CONFLICT_POSITION_BY_KEY,
  CONFLICT_RELATIONSHIPS,
  CONFLICT_RELATIONSHIP_BY_KEY,
  CONFLICT_RECUSAL_CSV_COLUMNS,
  CONFLICT_RECUSAL_FRAMEWORKS,
  CONFLICT_RECUSAL_HREF,
  CONFLICT_RECUSAL_LIMITS,
  CONFLICT_RECUSAL_METHOD,
  CONFLICT_RECUSAL_RULE_ID,
  CONFLICT_RECUSAL_SETTING_KEYS,
  CONFLICT_RECUSAL_SETTING_LABELS,
  CONFLICT_RECUSAL_BOUNDS,
  CONFLICT_STANDING_KINDS,
  CONFLICT_STANDING_KIND_BY_KEY,
  CONFLICT_SUBJECT_BY_KEY,
  CONFLICT_SUBJECTS,
  CONFLICT_VERDICT_BY_KEY,
  CONFLICT_VERDICTS,
} from '../core/domain/conflictRecusalRegistry.js';

const L = CONFLICT_RECUSAL_LIMITS;
const DIAGRAM_URL = './app/assets/conflict-recusal.jpg';

const VIEWS = Object.freeze([
  Object.freeze({ key: 'register', label: 'Register' }),
  Object.freeze({ key: 'coverage', label: 'Coverage' }),
  Object.freeze({ key: 'rules', label: 'Rules' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

const TONE = { bad: 'bad', caution: 'caution', good: 'good', info: 'info', neutral: 'neutral' };

/** The one verdict badge. Never a bare colour: the label is the state. */
const verdictBadge = (row) => badge(row.verdictLabel, TONE[row.verdictTone] || 'neutral', row.verdictReason);

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

/* ------------------------------------------------------------------ dialogs */

function openDialog(title, body) {
  openModal({
    title,
    body,
    actions: [{ label: 'Close', onClick: () => closeAllModals() }],
  });
}

function declareInterestDialog(ctx, onDone) {
  const candidates = ctx.api.conflictRecusalCandidates();
  if (!candidates?.ok) {
    toast(candidates?.error || 'The candidates could not be read.', 'bad');
    return;
  }
  const people = candidates.candidates?.people || [];
  if (!people.length) {
    toast('No person in your span can be attached to an interest. An interest belongs to a person on the roster.', 'bad');
    return;
  }
  const records = candidates.candidates?.records || {};
  const subjectOptions = (key) => (records[key] || []).map((row) => ({ value: row.id, label: `${row.label}${row.day ? ` · ${row.day}` : ''}` }));
  const firstSubject = CONFLICT_SUBJECTS.find((row) => subjectOptions(row.key).length);

  const form = buildForm([
    {
      name: 'personId',
      label: 'Who holds the interest?',
      type: 'select',
      required: true,
      options: people.map((person) => ({ value: person.id, label: person.altitude ? `${person.label} (${person.altitude})` : person.label })),
      value: people[0].id,
      help: 'The person carrying the stake — not the party they are interested in.',
    },
    {
      name: 'subjectType',
      label: 'What does it touch?',
      type: 'select',
      required: true,
      options: CONFLICT_SUBJECTS.filter((row) => subjectOptions(row.key).length).map((row) => ({ value: row.key, label: row.label })),
      value: firstSubject?.key || 'decision',
      help: 'Only records this workspace actually holds can be named. An interest attached to a record nobody can open protects nobody.',
    },
    {
      name: 'subjectId',
      label: 'Which record?',
      type: 'select',
      required: true,
      options: subjectOptions(firstSubject?.key || 'decision'),
      help: 'The reader joins this person to the record ONLY through its own stored approver and owner fields.',
    },
    {
      name: 'relationship',
      label: 'What kind of relationship?',
      type: 'select',
      required: true,
      options: CONFLICT_RELATIONSHIPS.map((row) => ({ value: row.key, label: row.label })),
      value: 'financial',
      help: 'A closed list. A kind nobody declared is not guessed at, and nothing is inferred from a surname or a shared line.',
    },
    {
      name: 'direction',
      label: 'Direction of the stake',
      type: 'select',
      options: [{ value: '', label: 'Use the relationship’s own default' }, ...CONFLICT_DIRECTIONS.map((row) => ({ value: row.key, label: `${row.label} — ${row.says}` }))],
      help: 'Held, sought, or structural (the reporting-line case, where nobody did anything wrong and the hand is still not independent).',
    },
    { name: 'becameKnownOn', label: 'The day it became known', type: 'date', help: 'Defaults to today. An interest cannot become known in the future.' },
    { name: 'note', label: 'What is it? (optional)', type: 'textarea', help: `At least ${L.reasonMin} characters if you write one. This is the declarer’s account, never evidence of misconduct.` },
  ]);

  // When the subject kind changes, the record list must change with it: a
  // decision id is never offered against an investment case.
  const typeField = form.field('subjectType');
  if (typeField) {
    typeField.addEventListener('change', () => {
      const select = form.field('subjectId');
      if (!select) return;
      select.replaceChildren(...subjectOptions(typeField.value).map((row) => h('option', { value: row.value }, row.label)));
      select.value = select.options[0]?.value || '';
    });
  }

  const submit = () => {
    form.clearErrors();
    const result = ctx.api.conflictRecusalDeclareInterest(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The interest was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(`Interest recorded as ${result.route === 'self' ? 'your own first-person declaration' : 'a recorded disclosure'}.`, 'good');
    onDone?.();
  };

  openModal({
    title: 'Declare an interest',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A declared interest is a fact about a situation, not a finding about a person',
        body: 'A conflict of interest is a situation in which a decision-maker has a stake that could improperly influence a decision. Declaring one is the control, not an admission — and a declaration made late is still a declaration, printed with the days it took.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Declare it', primary: true, onClick: submit },
    ],
  });
}

function declareClearDialog(ctx, onDone) {
  const result = ctx.api.conflictRecusalNoInterestCandidates();
  if (!result?.ok) {
    toast(result?.error || 'Nothing could be read.', 'bad');
    return;
  }
  const candidates = result.candidates || [];
  if (!candidates.length) {
    toast('No record inside the horizon names you as its signer or owner. There is nothing to declare clear.', 'good');
    return;
  }
  const form = buildForm([
    {
      name: 'slot',
      label: 'Which record are you declaring clear?',
      type: 'select',
      required: true,
      options: candidates.map((row) => ({
        value: `${row.subjectType}|${row.subjectId}`,
        label: `${row.recordTitle || row.subjectId} · ${row.recordDay || 'no day'} · as ${row.positions.map((key) => CONFLICT_POSITION_BY_KEY[key]?.label || key).join(' and ')}`,
      })),
      help: 'Only records this register reads you against. The verdict each one prints TODAY is on the row below.',
    },
    {
      name: 'relationships',
      label: 'Which relationship kinds does this declaration cover?',
      type: 'boolean-block',
      required: true,
      options: CONFLICT_RELATIONSHIPS.map((row) => ({ value: row.key, label: row.label })),
      help: 'Every kind a live rule makes reportable at your altitude must be covered for the record to read clear. Covering fewer leaves the rest unasked — and printed as unasked.',
    },
    { name: 'note', label: 'Anything to add (optional)', type: 'textarea', help: `At least ${L.reasonMin} characters if you write one.` },
  ]);

  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const [subjectType, subjectId] = String(values.slot || '').split('|');
    const result2 = ctx.api.conflictRecusalDeclareNoInterest({
      subjectType,
      subjectId,
      relationships: values.relationships,
      note: values.note,
    });
    if (!result2?.ok) {
      if (result2?.field) form.setFieldError(result2.field, result2.error || '');
      toast(result2?.error || 'The declaration was refused.', 'bad');
      return;
    }
    closeAllModals();
    if (result2.verdict === 'clean') toast('Declared clear: the declaration covers every kind the live rules ask about.', 'good');
    else toast(`Recorded, and not yet clear: ${result2.unasked?.length || 0} reportable kind(s) remain unasked.`, 'warn');
    onDone?.();
  };

  openModal({
    title: 'Declare no reportable interest',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'This is the only act that makes independence claimable',
        body: 'Without a dated declaration nobody can say a signer was ASKED. A register that printed “nothing found” without one would be reporting an absence of searching as an absence of conflict.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Declare it', primary: true, onClick: submit },
    ],
  });
}

function respondDialog(ctx, row, onDone) {
  const form = buildForm([
    {
      name: 'kind',
      label: 'What is the response?',
      type: 'select',
      required: true,
      options: CONFLICT_STANDING_KINDS.map((entry) => ({ value: entry.key, label: entry.label })),
      value: 'recuse',
      help: CONFLICT_STANDING_KINDS.map((entry) => `${entry.label}: ${entry.says}`).join('  ·  '),
    },
    {
      name: 'control',
      label: 'The control that stands in (required for a mitigation)',
      type: 'textarea',
      help: 'For a mitigation: name the second signature, the monitoring review or the disclosure printed on the face of the record. For a recusal: leave blank — its control is the absence of the hand.',
    },
    { name: 'reason', label: 'What are you deciding, and why?', type: 'textarea', required: true, help: `${L.reasonMin} characters or more. This is the sentence a reviewer will read.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.conflictRecusalRecordStanding({ interestId: row.interestId, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The response was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(`Recorded. The register now prints: ${result.verdictLabel || CONFLICT_VERDICT_BY_KEY[result.verdict]?.label || result.verdict}.`, result.verdict === 'ineffective' ? 'warn' : 'good');
    onDone?.();
  };
  openModal({
    title: `Respond to: ${row.relationshipLabel}`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'small' }, h('strong', null, 'The situation: '), row.verdictReason),
      banner({
        tone: 'info',
        title: 'You are the seat above this person, not the person',
        body: 'A hand does not clear its own conflict. This response is recorded in your name with your reason, and a recusal is checked against the record: if the record still names the person as its approver, the register prints it as ineffective rather than as handled.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record the response', primary: true, onClick: submit },
    ],
  });
}

function ruleDialog(ctx, onDone) {
  const bounds = CONFLICT_RECUSAL_BOUNDS;
  const form = buildForm([
    {
      name: 'relationships',
      label: 'Which relationship kinds are reportable?',
      type: 'boolean-block',
      required: true,
      options: CONFLICT_RELATIONSHIPS.map((row) => ({ value: row.key, label: row.label })),
      help: 'A rule covering nothing asks nobody anything. Every position it does not cover reads unsearched.',
    },
    {
      name: 'minRank',
      label: 'Reaches down to which altitude?',
      type: 'select',
      required: true,
      options: [
        { value: '1', label: 'Every leadership seat (frontline and above)' },
        { value: '2', label: 'Manager and above' },
        { value: '3', label: 'Director and above' },
        { value: '4', label: 'VP and above' },
        { value: '5', label: 'Chief and above' },
      ],
      value: '1',
      help: 'A rank floor, not a list of names: a rule cannot be quietly narrowed to exclude one person.',
    },
    { name: 'effectiveFrom', label: 'Effective from', type: 'date', help: 'Defaults to today. Coverage starts on this day and never applies backwards.' },
    { name: 'sourceNote', label: 'Its written source', type: 'textarea', required: true, help: `The policy, code or board minute — ${L.sourceMin} characters or more. A rule nobody can trace is a preference.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.conflictRecusalDeclareRule({ ...values, minRank: Number(values.minRank) });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The rule was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Rule declared. Every position it covers now has something to be asked.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a reportable-conflict rule',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'Without a rule, every reading is “unsearched”',
        body: 'The register will not pretend a kind is reportable because it looks important. Somebody accountable declares the kinds, with a source, and the register then asks for them — and prints exactly which ones are still unasked.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Declare the rule', primary: true, onClick: submit },
    ],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const form = buildForm([
    { name: 'conflictRecusalBackDays', label: CONFLICT_RECUSAL_SETTING_LABELS.backDays, type: 'number', value: String(report.backDays), help: `Days of declared history. ${CONFLICT_RECUSAL_BOUNDS.backDays[0]}–${CONFLICT_RECUSAL_BOUNDS.backDays[1]}; clamped on load, refused here.` },
    { name: 'conflictRecusalLateDays', label: CONFLICT_RECUSAL_SETTING_LABELS.lateDays, type: 'number', value: String(report.lateDays), help: `A declaration later than this reads LATE and is printed with the days it took. ${CONFLICT_RECUSAL_BOUNDS.lateDays[0]}–${CONFLICT_RECUSAL_BOUNDS.lateDays[1]}.` },
    { name: 'conflictRecusalAutoPropagate', label: CONFLICT_RECUSAL_SETTING_LABELS.autoPropagate, type: 'checkbox', checked: true, help: 'A pause silences the rule on EVERY path, including a scan, and is a bypassed protective function: it reads the reporting graph. It is registered in the pause-permit register.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.conflictRecusalSetConventions({
      [CONFLICT_RECUSAL_SETTING_KEYS.backDays]: Number(values.conflictRecusalBackDays),
      [CONFLICT_RECUSAL_SETTING_KEYS.lateDays]: Number(values.conflictRecusalLateDays),
      [CONFLICT_RECUSAL_SETTING_KEYS.autoPropagate]: Boolean(values.conflictRecusalAutoPropagate),
    });
    if (!result?.ok) {
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions saved.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Reading conventions',
    body: form.node,
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Save', primary: true, onClick: submit },
    ],
  });
}

/* ------------------------------------------------------------------- cards */

function verdictCard(report) {
  return card({
    title: 'The seven readings',
    subtitle: 'Worst first. They are printed apart because collapsing any two of them is how a governance register lies.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-row' },
        ...CONFLICT_VERDICTS.slice(0, 4).map((verdict) => stat({
          label: verdict.label,
          value: report.allCounts[verdict.key] || 0,
          hint: verdict.key === 'undisclosed' ? 'declared, reaches the record, no response'
            : verdict.key === 'ineffective' ? 'a recusal that left the hand on'
              : verdict.key === 'mitigated' ? 'a control, claimed not proven'
                : 'a written determination',
          tone: (report.allCounts[verdict.key] || 0) && (verdict.key === 'undisclosed' || verdict.key === 'ineffective') ? 'bad' : '',
        })),
      ),
      h('div', { class: 'stat-row' },
        ...CONFLICT_VERDICTS.slice(4).map((verdict) => stat({
          label: verdict.label,
          value: report.allCounts[verdict.key] || 0,
          hint: verdict.key === 'unsearched' ? 'nobody was asked — NOT clear'
            : verdict.key === 'clean' ? 'declared clear, kind by kind'
              : 'withdrawn by a dated act',
          tone: verdict.key === 'unsearched' && report.allCounts.unsearched ? 'warn' : '',
        })),
      ),
      h('p', { class: 'muted tiny' },
        `${report.rowsN} interest(s) declared · ${report.coverageRowsN} position(s) read for coverage · ${report.allRows.length} printed in total. `,
        report.balances ? 'The verdicts add up to the rows printed.' : 'The verdicts do NOT add up — no total on this page may be used.'),
    ),
  });
}

/** One row, whatever kind it is: a declared interest or an unasked position. */
function rowCard(ctx, row, { canDecide, canDeclare, onDone }) {
  const isCoverage = Boolean(row.isCoverage);
  return h('article', { class: `decision-card ${row.verdict === 'undisclosed' || row.verdict === 'ineffective' ? 'is-irreversible' : ''}`, 'data-testid': `recusal-row-${row.interestId || row.coverageKey}` },
    h('header', { class: 'decision-head' },
      h('div', null,
        h('h3', null,
          isCoverage
            ? `${row.personName || 'A person outside your span'} — ${row.positions.map((key) => CONFLICT_POSITION_BY_KEY[key]?.label || key).join(' and ')}`
            : `${row.personName || 'A person outside your span'} — ${row.relationshipLabel}`),
        h('p', { class: 'muted tiny' },
          `${row.subjectLabel}: ${row.recordTitle || row.subjectId}${row.recordDay ? ` · ${row.recordDay}` : ''}`
          + (isCoverage ? '' : ` · declared ${row.declaredOn}${row.sourceLabel ? ` (${row.sourceLabel.toLowerCase()})` : ''}`))),
      h('div', { class: 'row-gap' },
        verdictBadge(row),
        row.late ? badge(`declared ${row.lateDays}d late`, 'caution', 'A late disclosure is still a disclosure — it is counted and printed with the days it took.') : null,
        row.withheld ? badge('detail withheld', 'neutral') : null)),
    h('p', { class: 'small' }, row.withheld ? row.withheldReason : row.verdictReason),
    !isCoverage && row.note ? h('p', { class: 'muted small' }, h('strong', null, 'The declarer’s own note: '), row.note) : null,
    !isCoverage && row.standing ? h('p', { class: 'muted small' },
      h('strong', null, `On file — ${row.standing.kindLabel}, ${row.standing.recordedOn}: `),
      row.standing.control ? `${row.standing.control} ` : '',
      h('em', null, row.standing.reason),
      row.standing.authorityName ? h('span', { class: 'muted tiny' }, ` — recorded by ${row.standing.authorityName}`) : null) : null,
    !isCoverage && row.standingChain.length > 1
      ? h('details', { class: 'muted small' },
          h('summary', null, `${row.standingChain.length} response(s) on the chain — nothing erased`),
          h('ul', null, ...row.standingChain.map((entry) => h('li', { class: entry.superseded ? 'muted' : '' },
            `${entry.recordedOn} · ${entry.kindLabel}${entry.superseded ? ' (superseded)' : ''}${entry.authorityName ? ` · ${entry.authorityName}` : ''} — ${entry.reason}`))))
      : null,
    h('p', { class: 'muted tiny' },
      row.owner.state === 'seat'
        ? `Owed to the seat above (${row.owner.basis === 'joint-apex' ? 'lowest seat above every line this person holds' : 'the line’s holder'})${row.dueOn ? ` · asked by ${row.dueOn}` : ''}.`
        : row.owner.state === 'leader-held' ? 'The only seat above this person is the workspace leader; it is printed on the leader’s own board and nobody else is asked.'
          : row.owner.state === 'self' ? 'This person is the only seat above themselves. The register prints the situation and cannot ask the hand it names to judge itself.'
            : row.owner.state === 'off-roster' ? 'The person or the seat above them has left the roster. Nobody is substituted.'
              : 'The lines involved share no single seat above them. The register names the ambiguity and invents no owner.'),
    (canDecide && (row.verdict === 'undisclosed' || row.verdict === 'ineffective') && !isCoverage)
      ? h('div', { class: 'row-gap' }, button('Record a response', () => respondDialog(ctx, row, onDone), { primary: true, testid: 'recusal-respond' }))
      : null,
    (canDeclare && isCoverage && row.verdict === 'unsearched' && row.owner.state !== 'seat' ? null
      : canDeclare && isCoverage && row.verdict === 'unsearched'
        ? h('div', { class: 'row-gap' }, button('Declare yourself clear', () => declareClearDialog(ctx, onDone), { testid: 'recusal-clear' }))
        : null),
  );
}

function registerView(ctx, report, caps, onDone) {
  if (!report.allRows.length) {
    return card({
      body: emptyState({
        title: 'Nothing to read yet',
        body: report.rulesN
          ? 'No decision, investment case, requisition or budget sits inside the horizon. The register reads the signers and owners of records — with no records there is nobody to ask.'
          : 'No rule makes any relationship kind reportable, so nobody can be asked anything. Declare a rule first: until then every reading is honestly unsearched, not clean.',
        action: caps.canGovern ? button('Declare a reportable-conflict rule', () => ruleDialog(ctx, onDone), { primary: true }) : null,
      }),
    });
  }
  const declared = report.rows;
  const coverage = report.coverageRows;
  return h('div', { class: 'stack' },
    declared.length
      ? card({
        title: `Declared interests (${declared.length})`,
        subtitle: 'A stake somebody put on the record. Measured against the record it names — never inferred from a surname, a shared line, a purchase or a pattern.',
        body: h('div', { class: 'stack-sm' }, ...declared.map((row) => rowCard(ctx, row, { ...caps, onDone }))),
      })
      : null,
    coverage.length
      ? card({
        title: `Positions nobody has declared anything about (${coverage.length})`,
        subtitle: 'Every hand that signs or owns a record inside the horizon. A position reads clean ONLY where a dated declaration covers every reportable kind — otherwise it reads unsearched, and says which kinds were never asked.',
        body: h('div', { class: 'stack-sm' }, ...coverage.map((row) => rowCard(ctx, row, { ...caps, onDone }))),
      })
      : null,
  );
}

function coverageView(report) {
  const kinds = report.reportableKinds;
  return h('div', { class: 'stack' },
    card({
      title: 'Coverage by reportable kind',
      subtitle: 'How many positions were asked about each kind a live rule declares reportable, and how many were never asked.',
      body: kinds.length
        ? table({
          caption: 'Coverage per relationship kind',
          columns: [
            { key: 'label', header: 'Relationship kind' },
            { key: 'reportable', header: 'Positions' },
            { key: 'asked', header: 'Asked' },
            { key: 'unasked', header: 'Never asked' },
            { key: 'says', header: 'What it covers' },
          ],
          rows: kinds.map((kind) => {
            const positions = report.allRows.filter((row) => row.interestId || true);
            const withKind = report.coverageRows.filter((row) => (row.coverage?.reportableKinds || []).includes(kind));
            const asked = withKind.filter((row) => row.verdict === 'clean').length;
            return {
              label: CONFLICT_RELATIONSHIP_BY_KEY[kind]?.label || kind,
              reportable: withKind.length,
              asked,
              unasked: withKind.length - asked,
              says: CONFLICT_RELATIONSHIP_BY_KEY[kind]?.says || '',
              _positions: positions.length,
            };
          }),
        })
        : banner({ tone: 'warn', title: 'No kind is reportable', body: 'No live rule declares a relationship kind reportable, so nobody was asked and nothing is concluded. Every position reads unsearched — which is not the same fact as clean.' }),
    }),
    card({
      title: 'People whose position is not covered',
      subtitle: 'A person counted once however many lines lead to them. The cross-line figure says how many hold more than one reporting line.',
      body: h('p', { class: 'small' },
        `${report.coverageRowsN} position(s) read · ${report.allCounts.clean} declared clear · ${report.allCounts.unsearched} never asked · ${report.crossLineN} involving a person with more than one line.`),
    }),
  );
}

function rulesView(ctx, report, caps, onDone) {
  return h('div', { class: 'stack' },
    card({
      title: 'Reportable-conflict rules',
      subtitle: 'Somebody accountable declares the kinds, with a source and an altitude floor. A rule is a statement about the organisation, so it cannot be narrowed to exclude one person.',
      actions: caps.canGovern ? [button('Declare a rule', () => ruleDialog(ctx, onDone), { primary: true, testid: 'recusal-rule-open' })] : [],
      body: report.rules.length
        ? h('div', { class: 'stack-sm' }, ...report.rules.map((rule) => h('article', { class: 'decision-card' },
          h('header', { class: 'decision-head' },
            h('div', null,
              h('h3', null, `${rule.relationships.map((kind) => CONFLICT_RELATIONSHIP_BY_KEY[kind]?.label || kind).join(', ')}`),
              h('p', { class: 'muted tiny' }, `Effective ${rule.effectiveFrom}${rule.retiredOn ? ` · retired ${rule.retiredOn}` : ''} · reaches down to rank ${rule.minRank}`)),
            h('div', { class: 'row-gap' }, badge(rule.retiredOn ? 'retired' : 'in force', rule.retiredOn ? 'neutral' : 'good'))),
          h('p', { class: 'small' }, h('strong', null, 'Source: '), rule.sourceNote),
          caps.canGovern && !rule.retiredOn
            ? h('div', { class: 'row-gap' }, button('Retire from today', () => {
              const result = ctx.api.conflictRecusalRetireRule({ ruleId: rule.id, retiredOn: report.asOf });
              if (result?.ok) { toast('Rule retired. Everything it covered before today stays as it was read.', 'good'); onDone?.(); } else toast(result?.error || 'The retirement was refused.', 'bad');
            }, { testid: 'recusal-rule-retire' }))
            : null)))
        : emptyState({ title: 'No rule declared', body: 'Until a rule names the reportable kinds, every position reads unsearched. That is deliberate: the register will not decide on somebody’s behalf that a kind ought to be reportable.' }),
    }),
    card({
      title: 'Reading conventions',
      subtitle: 'Clamped on load, refused by the setter, printed here. The automation pause silences a rule that reads the reporting graph — it is registered in the pause-permit register as exactly that.',
      actions: caps.canGovern ? [button('Change conventions', () => conventionsDialog(ctx, report, onDone), { testid: 'recusal-conventions' })] : [],
      body: h('dl', { class: 'kv-list' },
        h('div', null, h('dt', null, CONFLICT_RECUSAL_SETTING_LABELS.backDays), h('dd', null, `${report.backDays} days`)),
        h('div', null, h('dt', null, CONFLICT_RECUSAL_SETTING_LABELS.lateDays), h('dd', null, `${report.lateDays} days`)),
        h('div', null, h('dt', null, 'Declarations of no interest read'), h('dd', null, String(report.declarationsN))),
      ),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack' },
    card({
      title: 'The frameworks this register is built on',
      body: h('div', { class: 'prose small' },
        ...CONFLICT_RECUSAL_FRAMEWORKS.map((row) => h('p', null, h('strong', null, `${row.label}. `), row.says))),
    }),
    card({
      title: 'How each figure is read',
      body: h('dl', { class: 'kv-list' },
        ...Object.entries(CONFLICT_RECUSAL_METHOD).map(([key, value]) => h('div', null,
          h('dt', null, key.charAt(0).toUpperCase() + key.slice(1)),
          h('dd', null, value)))),
    }),
    card({
      title: 'What this register refuses to do',
      body: h('div', { class: 'prose small' },
        h('p', null, 'It does not block a decision, edit an approver, revoke a right or take a signature away. It does not infer an interest from a surname, a shared line, a purchase, a calendar or a pattern. It does not convert a mitigation into independence, and it never prints “nothing found” when nobody was asked.'),
        h('p', { class: 'muted' }, 'A remedy, a consequence and a rating are separate questions, in separate modules. This one records a stake, a response to it, and whether the response moved the hand — and it says when it cannot tell.')),
    }),
    h('figure', { class: 'stack-sm' },
      h('img', { src: DIAGRAM_URL, alt: 'A method diagram: a record with two hands on it, one hand withdrawing and the signature following it away, beside a second record where the hand withdrew and the signature stayed.', loading: 'lazy', width: "1672", height: "941" }),
      h('figcaption', { class: 'muted tiny' }, 'Generated method illustration — provenance recorded in the ADR. It carries no lettering and names nobody.')),
  );
}

/* ---------------------------------------------------------------- top level */

export function renderConflictRecusal(ctx) {
  const result = ctx.api.conflictRecusalReport();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Governance', title: 'Conflicts of interest', subtitle: 'Who had a stake, and did they stand back?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat refused the read.' }));
  }
  const report = result.report;
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'register';
  const caps = {
    canDecide: Boolean(ctx.api.conflictRecusalRecordStanding),
    canDeclare: Boolean(ctx.api.conflictRecusalDeclareInterest),
    canGovern: Boolean(ctx.api.conflictRecusalDeclareRule),
  };
  const onDone = () => ctx.refresh?.();

  const openBrief = () => openDialog('Conflict-of-interest brief (identity-free)', h('pre', { class: 'pre-wrap small', 'data-testid': 'recusal-brief' }, conflictRecusalBriefText(report)));
  const downloadCsv = () => {
    const csvRows = ctx.api.conflictRecusalCsvRows();
    if (!csvRows?.ok) { toast(csvRows?.error || 'The export was refused.', 'bad'); return; }
    const text = serializeCsv(CONFLICT_RECUSAL_CSV_COLUMNS.map((key) => ({ key, header: key })), csvRows.rows);
    downloadText(`leados-conflict-recusal-${report.asOf}.csv`, text);
  };

  return h('div', { class: 'page', 'data-testid': 'conflict-recusal-panel' },
    pageHeader({
      eyebrow: 'Governance',
      title: 'Who had a stake — and did they stand back?',
      subtitle: 'A decision is void as governance when the hand that approves it also holds the interest. This register records the stake, the dated response to it, and whether the response actually moved the hand — and it keeps “nobody searched” apart from “nothing found”.',
      actions: [
        button('Brief', openBrief, { testid: 'recusal-brief-open' }),
        button('Download CSV', downloadCsv, { testid: 'recusal-csv' }),
        caps.canDeclare ? button('Declare an interest', () => declareInterestDialog(ctx, onDone), { testid: 'recusal-declare-open' }) : null,
        caps.canDeclare ? button('Declare myself clear', () => declareClearDialog(ctx, onDone), { testid: 'recusal-clear-open' }) : null,
      ].filter(Boolean),
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    verdictCard(report),
    banner({
      tone: report.balances && report.auditClean ? 'info' : 'bad',
      title: report.balances && report.auditClean ? 'The printed figures are the computed figures' : 'A claim on this page does not reconcile',
      body: report.claimReason || `${report.allRows.length} row(s) printed across ${report.recordsN} record(s); the verdict counts are the sum of the rows above. ${CONFLICT_RECUSAL_RULE_ID} is ${report.rulesN ? 'reading the record' : 'inert until a rule declares a reportable kind'}.`,
    }),
    tabs({
      items: VIEWS.map((row) => ({ key: row.key, label: row.label, count: row.key === 'register' ? report.allRows.length : row.key === 'rules' ? report.rulesN : undefined })),
      active: view,
      ariaLabel: 'Conflict-of-interest register views',
      onSelect: (key) => ctx.navigate(`${CONFLICT_RECUSAL_HREF}?view=${key}`),
    }),
    view === 'register' ? registerView(ctx, report, caps, onDone) : null,
    view === 'coverage' ? coverageView(report) : null,
    view === 'rules' ? rulesView(ctx, report, caps, onDone) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderConflictRecusal;
