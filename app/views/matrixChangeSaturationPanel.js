/**
 * app/views/matrixChangeSaturationPanel.js — `#/matrix?panel=change-saturation`,
 * the Cross-Line Change Saturation & Absorptive-Capacity Ledger (ADR-0186,
 * Schema v148, CSV #140, RULE-CSA-01).
 *
 * THE QUESTION THIS SCREEN ANSWERS, at the moment it is worth asking: "before I
 * approve my line's change onto this person — what are they already carrying, from
 * whom, and what did we say they could absorb?"
 *
 * Every figure printed here is a field of the report `changeSaturationReport`
 * returned. The screen computes nothing: no sum, no peak, no verdict, no
 * clearance, no percentage. A rendering stores nothing.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 *  - A verdict for a person with no declared ceiling. `no capacity declared` is a
 *    row of its own, and the count of those rows is printed beside the verdicts.
 *  - A zero where a figure was withheld. A withheld figure is a dash and a reason.
 *  - A sum that charges one impact twice because two lines declared it.
 *  - A number averaged over two lines that disagree about how heavy one change is;
 *    the disagreement is the finding and it is printed as one.
 *  - A clearance presented as approval, a block, a deferral or a judgement about
 *    anybody's capacity to cope.
 *  - A pool figure over fewer people than the declared disclosure floor, where a
 *    concurrency count would describe a named individual.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { changeSaturationBriefText, changeSaturationCsvRows } from '../core/domain/changeSaturation.js';
import {
  CHANGE_SATURATION_ADR,
  CHANGE_SATURATION_BANDS,
  CHANGE_SATURATION_CONVENTIONS,
  CHANGE_SATURATION_CSV_COLUMNS,
  CHANGE_SATURATION_DETAIL_REASONS,
  CHANGE_SATURATION_FRAMEWORKS,
  CHANGE_SATURATION_METHOD,
  CHANGE_SATURATION_RULE_ID,
} from '../core/domain/changeSaturationRegistry.js';

const DIAGRAM_URL = './app/assets/change-saturation.jpg';

const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const claim = (value) => (value ? 'yes' : 'NO');
const days = (value) => (value === null || value === undefined ? '—' : `${value} day${value === 1 ? '' : 's'}`);

function notify(ctx, result, message) {
  const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
  if (!result?.ok) { say(result?.error || 'The change-saturation action was refused.', 'bad'); return false; }
  say(message, 'good');
  return true;
}

function refreshView(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function headerCard(report) {
  const t = report.totals;
  return card({
    title: 'What each person is carrying, and what we said they could absorb',
    subtitle: `${CHANGE_SATURATION_ADR} · ${report.engineVersion} · read from ${report.seatLabel}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Demands charging a day', value: num(t.actsReadN), hint: `${t.actsTotalN} in the ledger · ${t.actsUnattributedN} unattributable` }),
        stat({ label: 'People carrying a verdict', value: num(t.peopleN), hint: `${t.multiLinePeopleN} of them from more than one line` }),
        stat({ label: 'Over a declared ceiling', value: num(t.stateCounts.saturated), hint: `${t.overDaysTotal} person-day(s) over · longest run ${days(t.longestRunDays)}`, tone: t.stateCounts.saturated ? 'bad' : '' }),
        stat({ label: 'No capacity declared', value: num(t.stateCounts['no-ceiling']), hint: 'a refusal, not a pass', tone: t.stateCounts['no-ceiling'] ? 'warn' : '' }),
        stat({ label: 'Heaviest day printed', value: t.peakUnits === null ? '—' : `${t.peakUnits} units`, hint: report.unit.name }),
        stat({ label: 'Clearances answered', value: `${t.clearanceCounts.clearable} absorbable · ${t.clearanceCounts.refused} refused`, hint: `${t.clearanceCounts.unavailable} cannot be answered · ${t.clearanceCounts.notOpen} not an open demand` }),
      ),
      h('p', { class: 'lede' }, t.peopleN
        ? `${t.peopleN} person(s) carry a declared change demand across ${t.changesN} change(s) in ${report.window.fromISO} → ${report.window.toISO}. ${report.crossLine.note}`
        : 'No change demand is recorded in this window, so the ledger prints no verdict for anybody. A change can be approved while the load it puts on a person is undeclared — that is the gap this register exists to close.'),
      h('p', { class: 'muted small' }, `Four claims, printed apart because they are four different facts. A demand was recorded and read — ${claim(report.claims.loadObserved)}. A ceiling is in force for at least one subject — ${claim(report.claims.ceilingsDeclared)}. A person carries demands from more than one line — ${claim(report.claims.crossLineClaim)}. A clearance could be computed — ${claim(report.claims.clearanceMade)}. And two more, apart: the figures add up — ${claim(t.countsReconcile)}; every printed figure rests on a complete cell — ${claim(t.figuresComplete)}.`),
      t.saturatedPctWithheld
        ? banner({ tone: 'warn', title: 'Share over ceiling: withheld', body: t.saturatedPctWithheldReason })
        : banner({ tone: t.stateCounts.saturated ? 'bad' : 'good', title: `${t.saturatedPct}% of the people with a verdict are over their declared ceiling`, body: `The base is ${t.peopleListedN} person(s) with a verdict in this window. People with no declared ceiling are counted apart, not counted as compliant.` }),
      report.claims.loadObserved && !report.claims.ceilingsDeclared
        ? banner({ tone: 'warn', title: 'Every row prints “no capacity declared”', body: 'Demands are recorded and no ceiling in force covers anybody. The register cannot say whether the load is too much, and will not guess a capacity from level, pay or meeting load. Declare a per-person or per-pool ceiling below, or record that this workspace bounds none.' })
        : null,
      !t.countsReconcile
        ? banner({ tone: 'bad', title: 'The demand ledger does not reconcile', body: 'The partitions of the ledger do not sum to the stored count, so no total on this screen is presented as complete. Read the refusals card; the register names what it could not charge rather than adjusting a figure to make the sum close.' })
        : null,
      t.actsUnattributedN
        ? banner({ tone: 'warn', title: `${t.actsUnattributedN} demand(s) charge nobody’s day`, body: 'Their declaring line is no longer an active Matrix line of the person, or the change they were declared against has left the workspace. They are kept as history and counted apart — never reassigned to whichever line happens to be readable.' })
        : null,
    ),
  });
}

function peopleCard(ctx, report) {
  return card({
    title: 'Person by person — the sum every line can only see a slice of',
    subtitle: `One row per person carrying a declared demand in ${report.window.fromISO} → ${report.window.toISO}. A day is charged one change once, at the heaviest band any line declared for it; different changes sum.`,
    body: report.people.length
      ? table({
        caption: 'Cross-line change saturation per person',
        emptyMessage: 'No person in this seat’s scope carries a declared change demand in the window.',
        columns: [
          {
            label: 'Person',
            render: (row) => h('span', {},
              h('strong', null, row.name || 'withheld'),
              row.role ? h('span', { class: 'muted small' }, ` · ${row.role}`) : null,
              h('br'),
              h('span', { class: 'muted small' }, `${row.lineN} active line(s)${row.multiLine ? ' · cross-line' : ' · single line'}`)),
          },
          {
            label: 'Demands / changes',
            render: (row) => `${row.demandsN} declaration(s) across ${row.changesN} change(s)`,
          },
          {
            label: 'Who put it there',
            render: (row) => h('span', {}, ...(row.demandLines.length
              ? row.demandLines.map((line) => h('div', { class: 'small' }, `${line.managerName || 'line withheld'} · ${line.kind || 'line'} · ${line.bands.map((band) => `band ${band}`).join('/')}`))
              : [h('span', { class: 'muted small' }, '—')])),
          },
          {
            label: 'Peak day',
            render: (row) => h('span', {}, num(row.peakUnits ?? row.peakWindowUnits),
              row.peakUnits === null ? h('span', { class: 'muted small' }, ' (unbounded by any ceiling)') : null,
              row.peakFromDay ? h('br') : null,
              row.peakFromDay ? h('span', { class: 'muted small' }, `from ${row.peakFromDay}`) : null),
          },
          { label: 'Declared ceiling', render: (row) => (row.ceilingUnits === null ? h('span', { class: 'muted small' }, 'not declared') : `${row.ceilingUnits} units`) },
          {
            label: 'Days over',
            render: (row) => (row.daysOverCeiling === null || row.daysOverCeiling === undefined
              ? h('span', { class: 'muted small' }, 'withheld')
              : `${row.daysOverCeiling} · longest run ${row.longestRunDays}${row.daysUnjudged ? ` · ${row.daysUnjudged} unjudged` : ''}`),
          },
          { label: 'Verdict', render: (row) => badge(row.stateLabel, row.stateTone, row.withheldReason || row.note || '') },
          {
            label: 'Why',
            render: (row) => h('span', { class: 'muted small' }, row.withheldReason || row.note || (row.state === 'within' ? `Headroom ${num(row.headroomUnits)} unit(s) under a ceiling dated ${num(row.ceilingFromOn)} → ${num(row.ceilingToOn)}.` : '—')),
          },
          {
            label: 'Actions',
            render: (row) => h('div', { class: 'row gap' },
              h('button', {
                class: 'btn btn-small', type: 'button',
                'aria-label': `Withdraw a change demand for ${row.name || 'this person'}`,
                onClick: () => openWithdrawDialog(ctx, report, row),
              }, 'Withdraw a demand'),
            ),
          },
        ],
        rows: report.people,
      })
      : emptyState({ title: 'Nothing to read yet', body: 'No change demand has been declared for any person this seat can see. The candidate list below names the open changes whose impacts are still undeclared.' }),
  });
}

function clearanceCard(ctx, report) {
  return card({
    title: 'The clearance question, per change and person',
    subtitle: 'For every open change that names an impacted person: with this demand counted, does any day breach a declared ceiling? This is a statement about the record, never an approval, a veto or a deferral.',
    body: report.clearances.length
      ? table({
        caption: 'Change × person clearances',
        columns: [
          {
            label: 'Change',
            render: (row) => h('span', {}, h('strong', null, row.changeTitle), h('br'), h('span', { class: 'muted small' }, `${row.changeKind} · ${row.changeStatus}`)),
          },
          { label: 'Person', render: (row) => `${row.personName || 'withheld'} · ${row.impactKind || 'impact'}` },
          {
            label: 'Declared demand',
            render: (row) => (row.demandsN
              ? h('span', {}, `${row.demandsN} line(s): ${row.bandLabels.join(' + ') || '—'}`, h('br'), h('span', { class: 'muted small' }, `${num(row.fromOn)} → ${num(row.toOn)}`))
              : h('span', { class: 'muted small' }, 'nothing declared')),
          },
          {
            label: 'Peak with / without',
            render: (row) => (row.peakWithUnits === null ? h('span', { class: 'muted small' }, '—') : `${num(row.peakWithUnits)} with · ${num(row.peakWithoutUnits)} without`),
          },
          { label: 'Ceiling', render: (row) => num(row.ceilingUnits) },
          {
            label: 'Clearance',
            render: (row) => h('span', {}, badge(row.verdictLabel, row.verdictTone, row.reasons.join(' · ') || ''),
              row.verdict === 'refused' && row.tipping
                ? h('div', { class: 'small' }, `this demand tips it: ${num(row.excessUnits)} unit(s) over from ${num(row.firstOverDay)}`)
                : null,
              row.verdict === 'refused' && !row.tipping
                ? h('div', { class: 'small muted' }, 'already over before this demand was counted')
                : null),
          },
          {
            label: 'Action',
            render: (row) => (row.demandsN ? null : h('button', {
              class: 'btn btn-small btn-primary', type: 'button',
              'aria-label': `Declare what ${row.changeTitle} puts on ${row.personName || 'this person'}`,
              onClick: () => openDemandDialog(ctx, report, { changeId: row.changeId, changeTitle: row.changeTitle, personId: row.personId, personName: row.personName, lines: [], candidate: null }),
            }, 'Declare the demand')),
          },
        ],
        rows: report.clearances,
      })
      : emptyState({ title: 'No open change in this seat’s scope names an impacted person.', body: 'A change with no impact rows has nothing for this register to bound: the ledger will not invent a burden a change never claimed.' }),
  });
}

function candidateCard(ctx, report) {
  return card({
    title: 'What the record still cannot see',
    subtitle: 'Open changes that name an impacted person, and the lines that have not yet declared what that puts on them. Silence here is the gap, not a judgement.',
    body: report.candidates.length
      ? table({
        caption: 'Undeclared change demands available to declare from this seat',
        columns: [
          {
            label: 'Change / person',
            render: (row) => h('span', {}, h('strong', null, row.changeTitle), h('br'), `${row.personName} · ${row.impactKind}${row.newRoleLabel ? ` · ${row.newRoleLabel}` : ''}`),
          },
          { label: 'Lines', render: (row) => `${row.lineN} active line(s)${row.multiLine ? ' · cross-line' : ''}` },
          { label: 'Declared', render: (row) => (row.demandsN ? `${row.demandsN} line(s) already declared` : 'nothing declared') },
          {
            label: 'Go live',
            render: (row) => (row.targetOn ? num(row.targetOn) : h('span', { class: 'muted small' }, 'no date on the change')),
          },
          {
            label: 'Action',
            render: (row) => (row.lines.length
              ? h('button', {
                class: 'btn btn-small', type: 'button',
                'aria-label': `Declare a change demand for ${row.personName}`,
                onClick: () => openDemandDialog(ctx, report, row),
              }, 'Declare a demand')
              : h('span', { class: 'muted small' }, 'every line has declared')),
          },
        ],
        rows: report.candidates,
      })
      : emptyState({ title: 'Every open change with an impacted person has at least one line’s declaration in this seat’s scope.' }),
  });
}

function poolsCard(report) {
  return card({
    title: 'By line — how much change this span is putting on people at once',
    subtitle: 'A pool counts the demands its own line declared, which is the pacing question the middle of a matrix is usually never asked. Below the declared disclosure floor no concurrency figure prints.',
    body: report.pools.length
      ? table({
        caption: 'Per-line change pools against declared pool ceilings',
        columns: [
          { label: 'Line held by', render: (row) => row.managerName || 'withheld at this disclosure level' },
          { label: 'People carrying this line’s demands', render: (row) => String(row.peopleN) },
          { label: 'Demands declared', render: (row) => String(row.demandsN) },
          {
            label: 'Peak concurrency',
            render: (row) => (row.peakUnits === null
              ? h('span', { class: 'muted small' }, `withheld — ${row.withheldReason || 'no ceiling in force'}`)
              : `${row.peakUnits} of ${num(row.ceilingUnits)} units`),
          },
          { label: 'Days over', render: (row) => (row.daysOverCeiling === null || row.daysOverCeiling === undefined ? h('span', { class: 'muted small' }, '—') : `${row.daysOverCeiling}${row.firstOverDay ? ` · from ${row.firstOverDay}` : ''}`) },
          { label: 'Unjudged days', render: (row) => num(row.daysUnjudged) },
          { label: 'Verdict', render: (row) => badge(row.stateLabel, row.stateTone, row.withheldReason || '') },
        ],
        rows: report.pools,
      })
      : emptyState({ title: 'No line has declared a change demand in this window.' }),
  });
}

function ceilingsCard(ctx, report) {
  const rows = report.ceilings || [];
  return card({
    title: 'Declared ceilings — in force, dated forward, expired, retired',
    subtitle: 'A ceiling is the only place a capacity enters this record. An expired one is history and governs no verdict; nothing here is inferred from a level, a pay band or a calendar.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'row gap' },
        stat({ label: 'In force', value: num(report.ceilingCensus['in-force']), hint: `${report.ceilingCensus.person} person · ${report.ceilingCensus.pool} pool`, tone: report.ceilingCensus['in-force'] ? 'good' : 'warn' }),
        stat({ label: 'Window passed', value: num(report.ceilingCensus.expired), hint: 'not compliance', tone: report.ceilingCensus.expired ? 'warn' : '' }),
        stat({ label: 'Dated forward', value: num(report.ceilingCensus['forward-only']) }),
        stat({ label: 'Retired', value: num(report.ceilingCensus.retired) }),
      ),
      table({
        caption: 'Capacity declarations',
        emptyMessage: 'No capacity ceiling has been declared in this workspace, so no verdict on anybody’s change load is possible.',
        columns: [
          { label: 'Scope', render: (row) => (row.scope === 'pool' ? 'A line’s pool' : 'A person') },
          {
            label: 'Subject',
            render: (row) => {
              if (row.scope === 'pool') return report.pools.find((pool) => pool.managerId === row.subjectId)?.managerName || 'withheld';
              return report.people.find((person) => person.personId === row.subjectId)?.name || 'withheld';
            },
          },
          { label: 'Ceiling', render: (row) => `${num(row.units)} concurrent unit(s)` },
          { label: 'Window', render: (row) => `${num(row.fromOn)} → ${num(row.toOn)}` },
          {
            label: 'Status',
            render: (row) => {
              const today = report.today;
              if (row.retired) return badge('Retired', 'neutral', `retired ${num(row.retiredOn)}`);
              if (row.fromOn > today) return badge('Dated forward', 'neutral', 'governs nothing yet');
              if (row.toOn < today) return badge('Window passed', 'warn', 'an expired limit is not a limit that was met');
              return badge('In force', 'good', '');
            },
          },
          {
            label: 'Action',
            render: (row) => (row.retired ? h('span', { class: 'muted small' }, '—') : h('button', {
              class: 'btn btn-small', type: 'button',
              'aria-label': 'Retire this capacity ceiling',
              onClick: () => openRetireDialog(ctx, row),
            }, 'Retire')),
          },
        ],
        rows,
      }),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': 'change-saturation-declare-ceiling', onClick: () => openCeilingDialog(ctx, report) }, 'Declare a ceiling'),
        h('button', { class: 'btn btn-small', type: 'button', 'data-testid': 'change-saturation-conventions', onClick: () => openConventionsDialog(ctx, report) }, 'Change conventions'),
        h('button', { class: 'btn btn-small', type: 'button', 'data-testid': 'change-saturation-scan', onClick: () => {
          const result = ctx.api?.changeSaturationScan?.();
          if (notify(ctx, result, `Scanned the register (${CHANGE_SATURATION_RULE_ID}).`)) refreshView(ctx);
        } }, `Re-scan (${CHANGE_SATURATION_RULE_ID})`),
      ),
    ),
  });
}

function reconciliationCard(report) {
  const t = report.totals;
  return card({
    title: 'Refusals, exclusions and the reconciliation',
    subtitle: 'Every act in the ledger lands in exactly one partition, and every withheld cell says which rule withheld it. Nothing is dropped to make a total close.',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Ledger total', value: num(t.actsTotalN) }),
        stat({ label: 'Charging a day', value: num(t.actsReadN), tone: t.actsReadN ? 'good' : '' }),
        stat({ label: 'Withdrawn', value: num(t.actsWithdrawnN) }),
        stat({ label: 'Absorbed (change anchored)', value: num(t.actsAbsorbedN) }),
        stat({ label: 'Halted (paused / abandoned)', value: num(t.actsHaltedN) }),
        stat({ label: 'Wholly before the window', value: num(t.actsBeforeWindowN) }),
        stat({ label: 'Unattributable', value: num(t.actsUnattributedN), tone: t.actsUnattributedN ? 'warn' : '' }),
        stat({ label: 'Rows withheld by scope or cap', value: num(t.withheldRowsN), tone: t.withheldRowsN ? 'warn' : '' }),
      ),
      h('p', { class: 'muted small' }, `${t.actsReadN} + ${t.actsWithdrawnN} + ${t.actsAbsorbedN} + ${t.actsHaltedN} + ${t.actsBeforeWindowN} + ${t.actsUnattributedN} = ${t.actsTotalN}. Reconciles: ${claim(t.countsReconcile)}. Display equals the computed record: this screen prints only fields of the read model, and the export is built from the same reader.`),
      h('p', { class: 'muted small' }, `Read scope: ${report.scope} · ${report.seatLabel} · disclosure level ${report.detailLevel} — ${CHANGE_SATURATION_DETAIL_REASONS[report.detailLevel] || CHANGE_SATURATION_DETAIL_REASONS.none}`),
      report.refusals.length
        ? table({
          caption: 'Counted read-side refusals',
          columns: [
            { key: 'reason', label: 'Reason' },
            { key: 'note', label: 'What it means for the figure' },
          ],
          rows: report.refusals.map((row) => ({ reason: row.reason, note: row.note })),
        })
        : h('p', { class: 'muted small' }, 'No stored demand was refused on read.'),
    ),
  });
}

function methodCard(report) {
  return card({
    title: 'Method, frameworks and the conventions this register will not relax',
    body: h('div', { class: 'stack' },
      h('figure', { class: 'diagram' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Conceptual method diagram: three lanes labelled Functional line, Project line and Product line, each carrying a signed change, converging on a single person-shaped block. Weight chips enter the block, and a day-by-day bar below it plots the summed weight against a dashed ceiling line — one day is marked over ceiling and one hatched day is marked no ceiling declared.',
          loading: 'lazy', width: '1100', height: '340', 'data-testid': 'change-saturation-diagram',
          style: { width: '100%', 'max-width': '1100px', height: 'auto' },
        }),
        h('figcaption', { class: 'small' }, 'Conceptual method diagram, not workspace data. Generated for this register; provenance recorded in the ADR.')),
      h('h4', {}, 'The unit'),
      h('p', { class: 'small' }, h('strong', {}, report.unit.name), ' — ', report.unit.definition),
      h('p', { class: 'muted small' }, report.unit.notSaid),
      h('h4', {}, 'The method, step by step'),
      h('ol', { class: 'stack small' }, ...CHANGE_SATURATION_METHOD.map((line) => h('li', {}, line))),
      h('h4', {}, 'The five weight bands, as their author declares them'),
      table({
        caption: 'Declared bands, never a measurement',
        columns: [
          { key: 'band', label: 'Band' },
          { key: 'meaning', label: 'What the declaring manager is saying' },
        ],
        rows: CHANGE_SATURATION_BANDS.map((band) => ({ band: `${band.value} · ${band.label}`, meaning: band.meaning })),
      }),
      h('h4', {}, 'Frameworks'),
      CHANGE_SATURATION_FRAMEWORKS.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.name), h('p', { class: 'muted small' }, row.why))),
      h('h4', {}, 'Conventions the reader will not relax'),
      CHANGE_SATURATION_CONVENTIONS.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.label), h('p', { class: 'muted small' }, row.text))),
      h('h4', {}, 'Conventions in force'),
      h('ul', { class: 'small' },
        h('li', {}, `Read window: ${report.conventions.changeSaturationWindowDays} days back from ${report.today} (inclusive)`),
        h('li', {}, `Pool disclosure floor: ${report.conventions.changeSaturationMinPoolN} person(s)`),
        h('li', {}, `Ask window: ${report.conventions.changeSaturationAskDueDays} day(s)`),
        h('li', {}, `Automatic asks: ${report.conventions.changeSaturationAutoPropagate ? 'on' : 'off — the register stays silent until a scan runs'}`)),
    ),
  });
}

/* --------------------------------------------------------------- dialogs */

function openDemandDialog(ctx, report, row) {
  const lineOptions = (row.lines || []).map((line) => ({ value: line.lineKey, label: `${line.managerName || 'line holder'} · ${line.kind || line.role}` }));
  const form = buildForm([
    {
      name: 'lineKey',
      label: 'Which line is putting this on them? (required)',
      type: lineOptions.length > 1 ? 'select' : 'text',
      options: lineOptions,
      value: lineOptions.length === 1 ? lineOptions[0].value : '',
      required: true,
      help: 'A demand is declared only down a line you hold. Your counterpart declares their own — the sum, not the split, is what this register prints.',
    },
    {
      name: 'band',
      label: 'Weight band (1–5, required)',
      type: 'number',
      value: '',
      required: true,
      help: CHANGE_SATURATION_BANDS.map((band) => `${band.value} ${band.label}: ${band.meaning}`).join(' '),
    },
    { name: 'fromOn', label: 'Window opens (required)', type: 'date', value: '', required: true, help: 'The first day this change is altering how this person works. No date is inferred from the change’s go-live date.' },
    { name: 'toOn', label: 'Window closes (required)', type: 'date', value: '', required: true, help: 'The last day it still does. A window with no end is not recorded: an open-ended demand would sit over every future read forever.' },
    { name: 'note', label: 'Context (optional)', type: 'textarea', rows: 3, value: '', help: 'Kept on the act. Never printed in the export.' },
  ]);
  openModal({
    title: `Declare a change demand — ${row.personName || 'person'} · ${row.changeTitle || 'change'}`,
    description: 'This is the act every figure in the register rests on. It records what your line is putting on this person, at what weight, over which days. It changes no change record and no schedule.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.changeSaturationDeclareDemand?.({
            changeId: row.changeId,
            personId: row.personId,
            lineKey: fields.lineKey || '',
            band: Number(fields.band),
            fromOn: fields.fromOn || '',
            toOn: fields.toOn || '',
            note: fields.note || '',
          });
          if (!notify(ctx, result, 'Dated change demand recorded.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record the demand'),
    ],
  });
}

function openWithdrawDialog(ctx, report, personRow) {
  const candidates = (report.clearances || []).filter((row) => row.personId === personRow.personId && row.demandsN > 0);
  const form = buildForm([
    {
      name: 'demandId',
      label: 'Which demand? (required)',
      type: 'text',
      value: '',
      required: true,
      help: candidates.length
        ? `This person has ${candidates.length} declared pair(s) with a demand: ${candidates.map((row) => row.changeTitle).join('; ')}. Ask the line that declared it, or withdraw your own.`
        : 'Type the demand id from the ledger row. A withdrawal is a dated act of your own; it marks the row and never deletes it.',
    },
    { name: 'reason', label: 'Why is it being withdrawn? (required, ≥8 characters)', type: 'textarea', rows: 3, value: '', required: true, help: 'A withdrawal with no reason cannot be told apart from a deletion nobody can audit.' },
  ]);
  openModal({
    title: `Withdraw a change demand — ${personRow.name || 'person'}`,
    description: 'The row is marked, not deleted: a demand that silently disappeared would move this person’s total and every verdict under it.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.changeSaturationWithdrawDemand?.(fields.demandId || '', fields.reason || '');
          if (!notify(ctx, result, 'Demand withdrawn and dated.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Withdraw'),
    ],
  });
}

function openCeilingDialog(ctx, report) {
  const form = buildForm([
    {
      name: 'scope',
      label: 'Declared for (required)',
      type: 'select',
      required: true,
      value: 'person',
      options: [
        { value: 'person', label: 'One person — the most concurrent change weight they may carry, across every line' },
        { value: 'pool', label: 'One line’s pool — the most this manager’s span may put on its people at once' },
      ],
      help: 'There is no team, unit or altitude scope: that would be a ceiling nobody named.',
    },
    { name: 'subjectId', label: 'Subject id (required)', type: 'text', value: '', required: true, help: report.people.length ? `People with a demand in this window: ${report.people.slice(0, 6).map((row) => row.personId).join(', ')}${report.people.length > 6 ? ', …' : ''}. A pool ceiling is declared by the manager who runs that pool.` : 'A person on this workspace’s roster; for a pool, the manager who runs it.' },
    { name: 'units', label: 'Concurrent units (required, whole number 1–100)', type: 'number', value: '', required: true, help: 'Counted against the sum of bands landing on one day. Nothing here converts units into hours or share-days.' },
    { name: 'fromOn', label: 'In force from (required)', type: 'date', value: '', required: true },
    { name: 'toOn', label: 'In force until (required)', type: 'date', value: '', required: true, help: 'When it ends, the verdict becomes “no capacity declared”, not “within capacity”. Re-affirm it deliberately.' },
    { name: 'note', label: 'Basis (optional)', type: 'textarea', rows: 3, value: '', help: 'Why this number. Never printed in the export.' },
  ]);
  openModal({
    title: 'Declare an absorptive-capacity ceiling',
    description: 'This is the only place a capacity enters the record. No ceiling is inferred from level, pay, seniority, meeting minutes or share-days, and an undeclared subject gets no verdict rather than a generous one.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.changeSaturationDeclareCeiling?.({
            scope: fields.scope || '',
            subjectId: fields.subjectId || '',
            units: Number(fields.units),
            fromOn: fields.fromOn || '',
            toOn: fields.toOn || '',
            note: fields.note || '',
          });
          if (!notify(ctx, result, 'Capacity ceiling recorded.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Record the ceiling'),
    ],
  });
}

function openRetireDialog(ctx, ceiling) {
  const form = buildForm([
    { name: 'reason', label: 'Why is this ceiling being retired? (required)', type: 'textarea', rows: 3, value: '', required: true, help: 'The row survives as the dated statement it was. Retiring a ceiling is not the same act as letting its window pass.' },
  ]);
  openModal({
    title: 'Retire this capacity ceiling',
    description: `${ceiling.scope === 'pool' ? 'A pool' : 'A person'} ceiling of ${num(ceiling.units)} concurrent unit(s), ${num(ceiling.fromOn)} → ${num(ceiling.toOn)}.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const result = ctx.api?.changeSaturationRetireCeiling?.(ceiling.id, fields.reason || '');
          if (!notify(ctx, result, 'Ceiling retired and dated.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Retire'),
    ],
  });
}

function openConventionsDialog(ctx, report) {
  const form = buildForm([
    { name: 'windowDays', label: 'Read window (days back from today, 14–365)', type: 'number', value: String(report.conventions.changeSaturationWindowDays) },
    { name: 'minPoolN', label: 'Pool disclosure floor (2–25 people)', type: 'number', value: String(report.conventions.changeSaturationMinPoolN) },
    { name: 'askDueDays', label: 'Ask window (days, 1–30)', type: 'number', value: String(report.conventions.changeSaturationAskDueDays) },
    { name: 'autoPropagate', label: 'Issue saturation asks automatically (true / false)', type: 'text', value: String(report.conventions.changeSaturationAutoPropagate) },
  ]);
  openModal({
    title: 'Change the saturation conventions',
    description: 'A value outside its bounds is refused with the bound printed. Nothing is clamped into something nobody chose, and no convention here sets a capacity.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const fields = form.getValues();
          const patch = {
            changeSaturationWindowDays: Number(fields.windowDays),
            changeSaturationMinPoolN: Number(fields.minPoolN),
            changeSaturationAskDueDays: Number(fields.askDueDays),
            changeSaturationAutoPropagate: String(fields.autoPropagate).trim() === 'true',
          };
          const result = ctx.api?.changeSaturationSetConventions?.(patch);
          if (!notify(ctx, result, 'Conventions changed.')) return;
          closeAllModals();
          refreshView(ctx);
        },
      }, 'Save conventions'),
    ],
  });
}

/* ------------------------------------------------------------------ render */

export function renderMatrixChangeSaturationPanel(ctx) {
  const result = ctx?.api?.changeSaturationReport?.();
  if (!result?.ok || !result.report) {
    return card({
      title: 'Change saturation',
      body: banner({ tone: 'bad', title: 'The change-saturation register could not be read', body: result?.error || 'This seat cannot read the scoped saturation surface.' }),
    });
  }
  const report = result.report;

  return h('div', { class: 'stack' },
    banner({
      tone: 'info',
      title: 'A clearance is not an approval, and a verdict is not a judgement about a person',
      body: 'Each demand is one line’s dated statement of what its change puts on someone. The register sums those statements per person, never charges one impact twice because two lines declared it, and compares the total only with a capacity a human declared. It blocks nothing, defers nothing and rates nobody.',
    }),
    h('div', { class: 'row-actions' },
      h('button', {
        class: 'btn btn-small', type: 'button', 'data-testid': 'change-saturation-csv',
        onClick: async () => {
          const rows = changeSaturationCsvRows(report);
          const text = serializeCsv(CHANGE_SATURATION_CSV_COLUMNS.map((key) => ({ key, header: key })), rows);
          const savedFile = downloadText({
            filename: `leados-matrix-change-saturation-${report.today}.csv`,
            text,
            mime: 'text/csv;charset=utf-8',
          });
          const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
          if (savedFile) { say('Aggregate CSV downloaded — the same figures this screen printed.', 'good'); return; }
          try {
            if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
            await globalThis.navigator.clipboard.writeText(text);
            say('The browser refused the download; the aggregate CSV was copied to the clipboard.', 'good');
          } catch {
            say('The browser refused both download and clipboard access. Use the workspace CSV export controls instead.', 'warn');
          }
        },
      }, 'Download aggregate CSV'),
      h('button', {
        class: 'btn btn-small', type: 'button', 'data-testid': 'change-saturation-brief',
        onClick: async () => {
          const text = changeSaturationBriefText(report);
          const say = typeof ctx?.toast === 'function' ? ctx.toast : toast;
          try {
            if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard is unavailable');
            await globalThis.navigator.clipboard.writeText(text);
            say('Register brief copied to the clipboard.', 'good');
          } catch {
            say('Clipboard refused; the brief is printed in the register itself.', 'warn');
          }
        },
      }, 'Copy register brief')),
    headerCard(report),
    clearanceCard(ctx, report),
    peopleCard(ctx, report),
    candidateCard(ctx, report),
    poolsCard(report),
    ceilingsCard(ctx, report),
    reconciliationCard(report),
    methodCard(report),
  );
}

export default renderMatrixChangeSaturationPanel;
