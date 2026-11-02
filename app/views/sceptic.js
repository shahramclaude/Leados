/**
 * app/views/sceptic.js — the Cross-Examination Terminal (`#/sceptic`, Schema v81).
 *
 * Five panels over one argument:
 *
 *   Findings    every claim the record contradicts, ranked by what settling it is
 *               worth, each carrying the single observation that would end the
 *               argument and a verdict button
 *   Families    the six kinds of claim, each with the contradiction rate measured
 *               from the leader's own verdicts, its credible interval, and — below
 *               the floor — a refusal
 *   Coverage    the sampling arithmetic: what a population of N and k examinations
 *               can actually support, and how many more would support a bound
 *   Auditor     this terminal's own hit rate, false-alarm rate and dismissal rate,
 *               because a screen that argues against you should be gradeable too
 *   Rounds      frozen audits and their Brier receipts
 *   Method      the estimators, the refusals and the conventions
 *
 * The page refuses what it cannot support: an unpriced claim prints no probability,
 * a family below its floor prints no rate, a round with nothing priceable cannot be
 * frozen, and a population nobody has examined prints the bound that is true — 100%.
 */

import { h, toast } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table,
} from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { dayKey, formatDate } from '../core/time.js';
import { scepticReport } from '../core/domain/sceptic.js';
import { CLAIM_FAMILIES } from '../core/domain/scepticRegistry.js';
import {
  openFreezeScepticRoundDialog,
  openScepticConventionsDialog,
  openScepticVerdictDialog,
} from '../ui/sceptic-modals.js';

const PANELS = [
  { key: 'findings', label: 'Findings' },
  { key: 'families', label: 'Families' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'auditor', label: 'The auditor' },
  { key: 'rounds', label: 'Frozen rounds' },
  { key: 'method', label: 'Method' },
];

const FAMILY_TONE = { sound: 'good', watch: 'warn', doubted: 'bad', unmeasured: 'neutral' };
const STATE_TONE = { open: 'warn', refuted: 'bad', held: 'good', dismissed: 'neutral', lapsed: 'neutral' };

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

function navigate(ctx, panel, params = {}) {
  const query = new URLSearchParams({ panel });
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  ctx.navigate(`#/sceptic?${query.toString()}`);
}

/* --------------------------------------------------------------- findings */

function findingsPanel(ctx, report) {
  const focus = ctx.query?.get?.('finding');
  const blocks = [];

  if (!report.findings.length) {
    blocks.push(banner({
      tone: 'good',
      title: 'No record currently contradicts another',
      body: `${report.population.total} claim(s) were examined across six families and every one of them is consistent with the rest of the record. That is a result, not an empty screen — and it is worth exactly what the population is worth, which is why the coverage panel is still the next thing to read.`,
      actions: [h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => navigate(ctx, 'coverage'),
      }, 'Read the sampling bound')],
    }));
    return h('div', { class: 'view-stack' }, ...blocks);
  }

  const open = report.findings.filter((row) => row.state === 'open');
  const measured = report.findings.filter((row) => row.probabilityPct !== null);

  blocks.push(h('div', { class: 'grid-cards' },
    stat({
      label: 'Contradictions on file',
      value: String(report.findings.length),
      hint: `from ${report.population.total} auditable claims`,
    }),
    stat({
      label: 'Priced',
      value: `${measured.length}/${report.findings.length}`,
      hint: measured.length === report.findings.length
        ? 'every claim has a family rate behind it'
        : `${report.counts.unmeasured} refused: their family has no measured rate yet`,
    }),
    stat({
      label: 'Expected wrong claims',
      value: report.exposure.expectedWrong === null ? '—' : String(report.exposure.expectedWrong),
      hint: 'stake-weighted units, not money',
    }),
    stat({
      label: 'Unexamined',
      value: String(report.counts.open),
      hint: 'no verdict recorded — the record is the only argument so far',
    })));

  if (report.counts.examined === 0) {
    blocks.push(banner({
      tone: 'info',
      title: 'Nothing here is a measurement yet',
      body: `The record contradicts ${report.findings.length} of ${report.population.total} claims. None has a verdict, so no family has a rate and no claim can be priced. `
        + `That is not a defect of the screen — it is the honest starting state. It takes ${report.conventions.scepticMinScored} scored verdicts in a family before the family may quote a rate, `
        + `and ${report.coverage.neededFor10} examinations with none standing before this terminal may say anything about how often it is right.`,
      actions: [h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => navigate(ctx, 'coverage'),
      }, 'See what that buys')],
    }));
  }

  const top = (focus ? report.ranked.find((row) => row.key === focus) : null) || report.ranked[0];
  if (top) {
    blocks.push(card({
      title: 'The first claim to examine',
      subtitle: 'Ranked by what settling it is worth, not by how easy it is to look at.',
      actions: [h('button', {
        class: 'btn btn-small',
        type: 'button',
        onClick: () => openScepticVerdictDialog(ctx, top),
      }, 'Cross-examine')],
      body: h('div', { class: 'stack-sm' },
        h('div', { class: 'row row-between' },
          h('div', { class: 'stack-xs' },
            h('h3', {}, top.label || top.nodeId),
            h('span', { class: 'muted small' }, `${top.detectorLabel} · ${top.familyLabel}`)),
          badge(top.state === 'open' ? 'Unexamined' : top.stateLabel, STATE_TONE[top.state] || 'neutral')),
        h('p', {}, top.detail),
        h('div', { class: 'kv' }, h('span', {}, 'The claim'), h('span', { class: 'muted' }, `${top.label ? '“' + String(top.label).slice(0, 90) + '” ' : ''}${top.assertedOn ? `recorded ${top.assertedOn}` : ''}`)),
        h('div', { class: 'kv' }, h('span', {}, 'The refuter'), h('span', { class: 'muted' }, top.refuter)),
        h('div', { class: 'kv' }, h('span', {}, 'Probability it is wrong'),
          h('span', { class: 'muted' }, top.probabilityPct === null
            ? `— refused: ${top.familyLabel} has fewer than ${report.conventions.scepticMinScored} scored claims`
            : `${pct(top.probabilityPct)} · stake ${top.stake}/5 · expected loss ${top.expectedWrong} unit(s)`)),
        top.disposition
          ? h('div', { class: 'kv' }, h('span', {}, 'Verdict'), h('span', { class: 'muted' }, `${top.disposition.verdict}: ${top.disposition.reason}`))
          : null,
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-small btn-ghost', href: top.route }, 'Open the record'),
          report.queue.length > 1
            ? h('button', {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => navigate(ctx, 'findings', { finding: report.queue.find((row) => row.key !== top.key)?.key }),
            }, 'Next claim')
            : null)),
    }));
  }

  blocks.push(card({
    title: 'The cross-examination queue',
    subtitle: `Every contradiction the record currently performs, capped at ${report.findings.length > 60 ? 60 : report.findings.length} for reading. A family with no measured rate contributes claims but no probability — they are counted, never assumed sound.`,
    body: table({
      columns: [
        { label: 'Claim', render: (row) => h('div', { class: 'stack-xs' },
          h('span', {}, String(row.label || row.nodeId).slice(0, 90)),
          h('span', { class: 'muted small' }, row.detectorLabel)) },
        { label: 'Family', render: (row) => h('span', { class: 'muted small' }, row.familyLabel) },
        { label: 'P(wrong)', render: (row) => (row.probabilityPct === null
          ? h('span', { class: 'muted' }, 'refused')
          : pct(row.probabilityPct)) },
        { label: 'Stake', render: (row) => `${row.stake}/5` },
        { label: 'Verdict', render: (row) => (row.disposition
          ? badge(row.disposition.verdict, STATE_TONE[row.disposition.verdict] || 'neutral')
          : h('span', { class: 'muted' }, 'unexamined')) },
        { label: 'Action', render: (row) => h('button', {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => openScepticVerdictDialog(ctx, row),
        }, row.disposition ? 'Re-examine' : 'Examine') },
      ],
      rows: report.ranked,
      emptyMessage: 'No contradiction on file.',
      caption: 'Ranked by expected loss in declared units. No person is named in any row.',
    }),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* --------------------------------------------------------------- families */

function familiesPanel(ctx, report) {
  const blocks = [];
  blocks.push(card({
    title: 'The six kinds of claim',
    subtitle: 'Each family is estimated from its own scored verdicts with a Jeffreys Beta(½, ½) prior. Below the floor the family prints no rate at all — and its claims are still counted in the population, never assumed sound.',
    body: table({
      columns: [
        { label: 'Family', render: (row) => h('div', { class: 'stack-xs' },
          h('span', {}, row.label),
          h('span', { class: 'muted small' }, row.question)) },
        { label: 'Scored', render: (row) => `${row.scored}${row.scored < row.minScored ? ` / ${row.minScored}` : ''}` },
        { label: 'Refuted', render: (row) => String(row.refuted) },
        { label: 'Held', render: (row) => String(row.held) },
        { label: 'Contradiction rate', render: (row) => (row.verdict === 'unmeasured'
          ? h('span', { class: 'muted' }, `refused — needs ${row.needs} more`)
          : `${pct(row.errorMeanPct)} (${pct(row.errorLoPct)}–${pct(row.errorHiPct)})`) },
        { label: 'Verdict', render: (row) => badge(row.verdictLabel, FAMILY_TONE[row.verdict] || 'neutral', row.verdictText) },
      ],
      rows: report.families,
      emptyMessage: 'No families.',
      caption: 'Claim families, scored verdicts and measured contradiction rates',
    }),
  }));

  const found = report.families.filter((row) => row.verdict === 'doubted');
  if (found.length) {
    blocks.push(banner({
      tone: 'bad',
      title: `${found.length} family(ies) are failing their own record`,
      body: `${found.map((row) => `${row.label} at ${pct(row.errorMeanPct)} refuted`).join('; ')}. The whole credible interval sits above the ${report.conventions.scepticTolerancePct}% tolerance you declared. `
        + 'A governed decision about the process behind these claims is opened once a month, because the fix is a gate or a cadence, not a reminder.',
    }));
  }

  blocks.push(card({
    title: 'The population behind the rates',
    subtitle: 'Records are counted as examined only when a detector actually read the claim they make. A detector that throws is counted as having examined nothing — an error is not coverage.',
    body: table({
      columns: [
        { label: 'Detector', render: (row) => row.id },
        { label: 'Records examined', render: (row) => String(row.checked) },
        { label: 'Contradictions found', render: (row) => String(row.findings) },
        { label: 'State', render: (row) => (row.error
          ? badge('detector error — examined nothing', 'bad', row.error)
          : badge('ran', 'good')) },
      ],
      rows: report.population.byDetector,
      caption: 'Detectors, the records they examined and the contradictions they found',
      emptyMessage: 'No detectors ran.',
      caption: 'Twelve structural detectors over six claim families. No prose is read, no sentiment is inferred.',
    }),
  }));

  blocks.push(card({
    title: 'Exposure',
    subtitle: 'What the contradictions on file are worth in declared stake units. This terminal does not convert credibility into money, because no record in this workspace prices a wrong claim.',
    body: h('div', { class: 'stack-sm' },
      h('p', {}, report.exposure.note),
      report.exposure.expectedWrong === null
        ? h('p', { class: 'muted' }, 'No expected-loss figure is quoted.')
        : h('div', { class: 'grid-cards' },
          stat({ label: 'Expected wrong claims', value: String(report.exposure.expectedWrong), hint: 'stake-weighted units' }),
          stat({ label: 'Priced claims', value: String(report.exposure.measuredClaims), hint: 'have a measured family rate' }),
          stat({ label: 'Refused', value: String(report.exposure.unmeasuredClaims), hint: 'family below its scored floor' }))),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* --------------------------------------------------------------- coverage */

function coveragePanel(ctx, report) {
  const coverage = report.coverage;
  const blocks = [];
  blocks.push(h('div', { class: 'grid-cards' },
    stat({ label: 'Examinations', value: String(coverage.examined), hint: `of ${coverage.findings} contradiction(s) on file` }),
    stat({
      label: 'Share examined',
      value: pct(coverage.shareExaminedPct),
      hint: coverage.findings === 0 ? 'nothing to examine' : 'a population nobody has examined says nothing',
    }),
    stat({
      label: 'False-alarm bound',
      value: pct(coverage.falseAlarmUpperPct),
      hint: `95% upper bound on how often a finding here is wrong, from ${coverage.examined - coverage.held} correct and ${coverage.held} held`,
    }),
    stat({ label: 'Examinations for 10%', value: String(coverage.neededFor10 ?? '—'), hint: 'with none standing' })));

  blocks.push(card({
    title: 'Discovery sampling, exactly',
    subtitle: 'This is arithmetic, not a score. The bound is the Clopper–Pearson upper limit for h false alarms in k examinations — Beta(1−α; h+1, k−h) — of which the familiar rule of three (1 − 0.05^(1/k), for h = 0) is the special case.',
    body: h('div', { class: 'stack-sm' },
      coverage.examined === 0
        ? h('p', {}, h('strong', {}, 'k = 0 gives a bound of 100%. '),
          'That is the honest reading of a workspace that has never cross-examined a claim: the screen above lists real contradictions, but nothing is yet known about how often this terminal is right about them.')
        : h('p', {}, `With ${coverage.examined} examination(s) and ${coverage.held} recorded false alarm(s), the 95% upper bound on this terminal's false-alarm rate is ${pct(coverage.falseAlarmUpperPct)}.`),
      h('p', { class: 'muted small' },
        `Examining ${coverage.neededFor10} claims with none standing would let you say, at 95%, that fewer than 10% of the findings on this screen are false alarms. `
        + `${coverage.neededFor25} would buy the 25% bound. That is the entire cost of being able to say something about your own record, and it is paid in observations rather than in software.`),
      h('p', { class: 'muted small' },
        'The population is the number of records whose claim a detector actually read — not the number of records on file. Two different denominators, and conflating them is how "we audited everything" gets said.')),
  }));

  blocks.push(card({
    title: 'Claims examined per family',
    subtitle: 'Where the population actually comes from. A family with a large population and no contradictions is not a good family — it is an unexamined one.',
    body: table({
      columns: [
        { label: 'Family', render: (row) => row.label },
        { label: 'Claims examined', render: (row) => String(row.checked) },
        { label: 'Contradicted', render: (row) => String(row.findings) },
        { label: 'Share contradicted', render: (row) => (row.checked ? pct((row.findings / row.checked) * 100) : '—') },
      ],
      rows: report.population.byFamily,
      emptyMessage: 'No claims examined.',
      caption: 'Claims examined and contradicted, by family',
    }),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ---------------------------------------------------------------- auditor */

function auditorPanel(ctx, report) {
  const auditor = report.auditor;
  const blocks = [];
  blocks.push(card({
    title: 'This terminal, on the record',
    subtitle: 'An audit that cannot lose is not an audit. Every verdict you record is scored as evidence about this screen as well as about the claim — and the dismissal rate is reported beside the hit rate, because a mostly-dismissed auditor is either broken or being closed.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'grid-cards' },
        stat({
          label: 'Precision',
          value: auditor.precision ? pct(auditor.precision.pct) : '— refused',
          hint: auditor.precision
            ? `95% Wilson interval ${pct(auditor.precision.loPct)}–${pct(auditor.precision.hiPct)} over ${auditor.scored} scored`
            : `${auditor.scored} scored of ${report.conventions.scepticMinScored} needed`,
        }),
        stat({
          label: 'Refuted',
          value: String(auditor.refuted),
          hint: 'claims the record was right about',
        }),
        stat({
          label: 'Held',
          value: String(auditor.held),
          hint: 'false alarms — scored against the terminal',
        }),
        stat({
          label: 'Dismissal rate',
          value: pct(auditor.dismissalPct),
          hint: `cap ${auditor.dismissalCapPct}% · never scored as evidence about the claim`,
        })),
      auditor.dismissalBreached
        ? banner({
          tone: 'warn',
          title: 'The auditor is being dismissed past its own cap',
          body: `RULE-SCP-05 opens one blameless question a month while this holds. Read the reasons in order: if they say the comparison is wrong, the detector is the defect; if they read like verdicts, the cap is the problem.`,
        })
        : null,
      h('p', { class: 'muted small' },
        auditor.scored < report.conventions.scepticMinScored
          ? `Below ${report.conventions.scepticMinScored} scored verdicts this terminal refuses to quote a precision. It does not have 0% precision and it does not have 100% precision — it has ${auditor.scored} observations.`
          : `Precision is refuted ÷ (refuted + held). Dismissals are excluded from that denominator on purpose: they are a judgement about the comparison, not evidence about the claim.`)),
  }));

  const verdicts = (ctx.state.scepticDispositions || []).slice().reverse();
  blocks.push(card({
    title: 'The verdict ledger',
    subtitle: 'Append-only. A claim can be re-examined after a fix and get a second verdict; both rows stay, because the family rate is measured from the whole history rather than from the claims that survived it.',
    body: verdicts.length
      ? table({
        columns: [
          { label: 'When', render: (row) => String(row.at).slice(0, 10) },
          { label: 'Family', render: (row) => row.family },
          { label: 'Detector', render: (row) => row.detectorId },
          { label: 'Verdict', render: (row) => badge(row.verdict, STATE_TONE[row.verdict] || 'neutral') },
          { label: 'Reason', render: (row) => h('span', { class: 'muted small' }, String(row.reason).slice(0, 160)) },
        ],
        rows: verdicts.slice(0, 60),
        emptyMessage: 'No verdict recorded yet.',
        caption: 'Reasons are personal notes and are never included in any export.',
      })
      : emptyState({
        title: 'No verdict on file',
        body: 'The ledger is empty, so the whole terminal has no hit rate. That is a true statement about the record, and it is the one worth reading first.',
        action: h('button', {
          class: 'btn btn-small',
          type: 'button',
          onClick: () => navigate(ctx, 'findings'),
        }, 'Go to the findings'),
      }),
  }));

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------------- rounds */

function roundsPanel(ctx, report) {
  const blocks = [];
  if (!report.rounds.length) {
    blocks.push(card({
      title: 'No frozen round',
      subtitle: 'A frozen round is a prospective audit: these claims, at these probabilities, answerable on a date. Until one is frozen this screen argues but never predicts.',
      body: emptyState({
        title: 'Nothing frozen yet',
        body: 'Freezing requires at least one family with a measured rate. Record verdicts on the contradictions on file and the terminal can price its next audit.',
        action: report.findings.length
          ? h('button', {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => openFreezeScepticRoundDialog(ctx),
          }, 'Freeze a round')
          : h('button', {
            class: 'btn btn-small',
            type: 'button',
            onClick: () => navigate(ctx, 'findings'),
          }, 'See the findings'),
      }),
    }));
    return h('div', { class: 'view-stack' }, ...blocks);
  }

  blocks.push(card({
    title: 'Frozen rounds',
    subtitle: 'Each round quotes probabilities from the family rates as they stood when it was frozen, and is graded once, later, against verdicts recorded after it. A verdict recorded before the freeze was already inside the rate the round quoted.',
    body: table({
      columns: [
        { label: 'Frozen', render: (row) => String(row.frozenAt).slice(0, 10) },
        { label: 'Review on', render: (row) => row.reviewOn },
        { label: 'Claims priced', render: (row) => String(row.claimCount) },
        { label: 'Expected contradictions', render: (row) => String(row.predictedContradictions) },
        { label: 'Live status', render: (row) => (row.graded
          ? badge('graded', 'good')
          : row.gradeable
            ? badge('due — ungraded', 'warn')
            : badge('window open', 'neutral')) },
        { label: 'Receipt', render: (row) => (row.graded
          ? `Brier ${row.graded.brier} vs ${row.graded.brierRef}${row.graded.skill === null ? '' : ` · skill ${row.graded.skill}`}`
          : row.gradeable
            ? h('button', {
              class: 'btn btn-small',
              type: 'button',
              onClick: () => {
                const result = ctx.api.gradeScepticRoundNow(row.id);
                if (result && result.ok) {
                  const message = result.result.lapsed
                    ? 'No verdict was recorded after the freeze, so the round lapsed rather than being excused.'
                    : `Graded: ${result.grade.refuted} of ${result.grade.scored} priced claim(s) refuted; Brier ${result.grade.brier} vs ${result.grade.brierRef}.`;
                  toast(message, result.result.lapsed ? 'neutral' : 'good');
                  ctx.rerender();
                  return;
                }
                toast((result && result.error) || 'Could not grade the round.', 'bad');
              },
            }, 'Grade now')
            : h('span', { class: 'muted' }, `after ${row.reviewOn}`)) },
      ],
      rows: report.rounds.slice().reverse(),
      emptyMessage: 'No rounds.',
      caption: 'Frozen cross-examination rounds, their windows and their Brier receipts',
    }),
  }));

  const graded = report.rounds.filter((row) => row.graded && Number.isFinite(row.graded.brier));
  if (graded.length) {
    blocks.push(card({
      title: 'What the receipts say',
      subtitle: 'Brier loss against this terminal’s own base rate. Positive skill means the family rates carried information; negative means they did not, and that is printed rather than buried.',
      body: h('div', { class: 'stack-sm' },
        ...graded.map((row) => h('div', { class: 'kv' },
          h('span', {}, `${String(row.frozenAt).slice(0, 10)} · ${row.claimCount} claim(s)`),
          h('span', { class: 'muted' },
            `${row.graded.refuted}/${row.graded.scored} refuted · Brier ${row.graded.brier} vs ${row.graded.brierRef} · `
            + `log loss ${row.graded.logLoss ?? '—'} vs ${row.graded.logLossRef ?? '—'} · skill ${row.graded.skill ?? '—'}`))),
        h('p', { class: 'muted small' },
          `A round whose review date passed with no verdicts recorded lapses. It is not excused, and it never counts as a win.`)),
    }));
  }

  return h('div', { class: 'view-stack' }, ...blocks);
}

/* ----------------------------------------------------------------- method */

function methodPanel(ctx, report) {
  return h('div', { class: 'view-stack' },
    card({
      title: 'What this terminal is',
      subtitle: 'Every other surface reports on the record. This one argues against it.',
      body: h('div', { class: 'stack-sm' },
        h('p', {}, 'Twelve structural detectors read records the workspace already holds and compare two of them. None reads prose for tone, none infers intent, none scores a person. '
          + 'A detector fires only when the two records cannot both be true, and each finding carries the single observation — its refuter — that would end the argument.'),
        h('p', {}, 'The contradiction rate of a family is a Beta–binomial estimate with a Jeffreys Beta(½, ½) prior over the verdicts you have recorded, with a 90% equal-tailed interval computed by bisection. '
          + 'Below the declared floor, no rate is printed: the mean of a two-observation Beta is a rumour with a decimal point.'),
        h('p', {}, 'Precision is reported with a Wilson score interval, and the dismissal rate beside it. Dismissals are never counted as evidence about a claim.'),
        h('p', {}, 'Coverage is discovery sampling: with k examinations and zero contradictions the 95% upper bound on the population rate is 1 − 0.05^(1/k), which is 100% when k is zero. '
          + 'The examinations needed to bound the rate at 10% or 25% are printed so the cost of knowing is legible.')),
    }), 
    card({
      title: 'What it refuses',
      subtitle: 'Each refusal is a decision, and each is printed on the screen that would otherwise have shown a number.',
      body: h('div', { class: 'stack-sm' },
        kv('A probability with no basis', 'A claim whose family is below its scored floor has no probability. Its contribution is counted as “refused”, never as 50% and never as 0%.'),
        kv('A round that cannot be priced', 'Freezing requires at least one measured family. A round of pure guesses cannot be frozen, because grading it later would teach nothing.'),
        kv('An unexamined claim as sound', 'An unexamined claim is not evidence of consistency. The coverage panel prints the sampling bound that this makes true.'),
        kv('A dismissal as a verdict', 'A dismissal says the comparison is wrong, not that the claim is right. It is reported separately and excluded from precision.'),
        kv('A lapsed round as a win', 'A frozen round whose window closed with no verdicts lapses. It is never scored, and it never flatters the terminal.'),
        kv('A person as an endpoint', 'A review is an instrument whose claim is audited. No detector rates, ranks or names a human being, and no export carries one.'),
        kv('A rate over survivors', 'The family rate is computed over every verdict ever recorded, not only the claims still on file — otherwise a family would “improve” as its bad claims were repaired.')),
    }),
    card({
      title: 'Conventions',
      subtitle: 'Declared, not derived. Change them and every rate is recomputed against the new bar.',
      body: h('div', { class: 'stack-sm' },
        kv('Window', `${report.conventions.scepticWindowDays} days — the window the capacity claim's settlement rate is measured over`),
        kv('Tolerance', `${report.conventions.scepticTolerancePct}% — above this share of refuted claims a family is watch; above it with the whole interval above it, doubted`),
        kv('Scored floor', `${report.conventions.scepticMinScored} verdicts before a family may quote a rate`),
        kv('Dismissal cap', `${report.conventions.scepticDismissalCapPct}% — above this, RULE-SCP-05 puts the auditor on the record`),
        kv('Tasks per round', `${report.conventions.scepticMaxTasks} cross-examination tasks, at most, from one freeze`),
        kv('Review horizon', `${report.conventions.scepticReviewHorizonDays} days before a frozen round may be graded`),
        kv('Families', CLAIM_FAMILIES.map((row) => row.label).join(' · '))),
      actions: [h('button', {
        class: 'btn btn-small btn-ghost',
        type: 'button',
        onClick: () => openScepticConventionsDialog(ctx),
      }, 'Change the conventions')],
    }));
}

/* ------------------------------------------------------------------ shell */

export function renderSceptic(ctx) {
  const now = ctx.now || new Date();
  const report = scepticReport(ctx.state, now, ctx.state.settings || {});
  const requested = ctx.query?.get?.('panel');
  const panel = PANELS.some((row) => row.key === requested) ? requested : 'findings';

  const header = pageHeader({
    eyebrow: 'Cross-examination',
    title: 'The record, arguing against itself',
    subtitle: 'Every claim this workspace makes about itself — done, on track, aligned, rated, fixed — compared against the records that contain it. Claims the record contradicts, ranked by what settling them is worth; the terminal’s own hit rate beside them.',
    meta: `${report.population.total} claim(s) examined · ${report.findings.length} contradicted · ${report.counts.examined} cross-examined`,
    actions: [
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => openScepticVerdictDialog(ctx, report.queue[0] || report.ranked[0]),
      }, 'Cross-examine a claim'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openFreezeScepticRoundDialog(ctx),
      }, 'Freeze a round'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const result = ctx.api.scanSceptic();
          if (result && result.ok) {
            toast('Scan complete — family decisions, grading work and stale edges reconciled.', 'good');
            ctx.rerender();
          } else {
            toast((result && result.error) || 'Could not scan.', 'bad');
          }
        },
      }, 'Scan now'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => openScepticConventionsDialog(ctx),
      }, 'Conventions'),
      h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = ctx.api.scepticBriefText();
          if (!downloadText({ filename: `leados-cross-examination-${dayKey(now)}.md`, text, mime: 'text/markdown' })) {
            toast('Could not start the download. Use Settings & data instead.', 'bad');
          }
        },
      }, 'Export brief'),
    ],
  });

  const tabBar = tabs({
    items: PANELS.map((row) => ({
      key: row.key,
      label: row.label,
      count: row.key === 'findings' ? report.findings.length : row.key === 'rounds' ? report.rounds.length : undefined,
    })),
    active: panel,
    ariaLabel: 'Cross-examination panels',
    onSelect: (key) => navigate(ctx, key),
  });

  const content = panel === 'families'
    ? familiesPanel(ctx, report)
    : panel === 'coverage'
      ? coveragePanel(ctx, report)
      : panel === 'auditor'
        ? auditorPanel(ctx, report)
        : panel === 'rounds'
          ? roundsPanel(ctx, report)
          : panel === 'method'
            ? methodPanel(ctx, report)
            : findingsPanel(ctx, report);

  return h('div', { class: 'view-stack' }, header, tabBar, content);
}

export { formatDate };
