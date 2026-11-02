/**
 * app/ui/sceptic-modals.js — the three dialogs of the Cross-Examination Terminal
 * (Schema v81, ADR-0074).
 *
 *   openScepticVerdictDialog     record what actually settled one claim —
 *                                refuted, held, or dismissed with a reason — and
 *                                preview what that verdict does to the family's
 *                                contradiction rate before it is written
 *   openFreezeScepticRoundDialog freeze a prospective audit over the claims this
 *                                terminal can price, with the base rate and the
 *                                refused count printed before committing
 *   openScepticConventionsDialog declare the four numbers the record cannot
 *                                answer: tolerance, scored floor, dismissal cap and
 *                                window
 *
 * Nothing here decides anything for the leader. A verdict is a human act with a
 * reason; a freeze is a promise to be graded later; the conventions are
 * declarations, and the terminal prints them as such.
 */

import { h, toast, openModal } from './dom.js';
import { scepticReport, jeffreysPosterior, betaInterval } from '../core/domain/sceptic.js';
import { CLAIM_FAMILIES, SCEPTIC_LIMITS } from '../core/domain/scepticRegistry.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

const VERDICT_OPTIONS = [
  ['refuted', 'Refuted — the claim was wrong', 'The record is right. This claim is the thing that needs correcting, and the family rate should carry it.'],
  ['held', 'Held — the claim survives', 'The record is right to flag the shape of this, but on inspection the claim stands. This is a false alarm, and it is scored as one.'],
  ['dismissed', 'Dismissed — not a real contradiction', 'The comparison itself is wrong: the records are not about the same thing, or the detector has misread them. Dismissals are counted separately and are never scored as evidence about the claim.'],
];

/**
 * Preview a verdict's effect on the family's rate. This is the honest version of
 * "what happens if I click this": the posterior moves, and the interval is shown
 * beside it so a single verdict is never mistaken for a measurement.
 */
function previewRate(family, verdict) {
  if (!family) return h('p', { class: 'muted small' }, 'No family rate.');
  const refuted = family.refuted + (verdict === 'refuted' ? 1 : 0);
  const held = family.held + (verdict === 'held' ? 1 : 0);
  if (verdict === 'dismissed') {
    return h('p', { class: 'small' },
      `A dismissal does not move the family's rate. ${family.dismissed + 1} of this terminal's verdicts would be dismissals, `,
      `against your cap of ${family.tolerancePct}% tolerance — the cap itself is ${SCEPTIC_LIMITS.dismissalCapPctDefault}% by default.`);
  }
  const scored = refuted + held;
  if (scored === 0) return h('p', { class: 'muted small' }, 'Not enough scored claims for a rate.');
  const posterior = jeffreysPosterior(refuted, held);
  const interval = betaInterval(refuted, held);
  return h('p', { class: 'small' },
    `After this verdict the family's contradiction rate reads ${pct(posterior.mean * 100)} `,
    `(90% interval ${pct(interval.lo * 100)} – ${pct(interval.hi * 100)}, n = ${scored}). `,
    scored < family.minScored
      ? `That is still below the declared floor of ${family.minScored}, so no rate is quoted and this claim stays unpriced.`
      : 'The claim is priced from the next read onward.');
}

export function openScepticVerdictDialog(ctx, finding) {
  if (!finding) return;
  const report = scepticReport(ctx.state, ctx.now, ctx.state.settings || {});
  const family = report.families.find((row) => row.key === finding.family);
  const radios = VERDICT_OPTIONS.map(([value, label, hint]) => {
    const input = h('input', { type: 'radio', name: 'scp-verdict', value, id: `scp-verdict-${value}` });
    if (value === 'refuted') input.checked = true;
    return h('div', { class: 'stack-xs' },
      h('label', { for: `scp-verdict-${value}`, class: 'row' }, input, h('strong', {}, label)),
      h('span', { class: 'muted small' }, hint));
  });
  const reason = h('textarea', {
    id: 'scp-reason',
    rows: '4',
    placeholder: 'What did you actually observe, and where is it recorded? A verdict with no account of itself is the kind of claim this screen exists to cross-examine.',
  });
  const preview = h('div', { class: 'panel' });

  const currentVerdict = () => {
    const checked = radios.map((node) => node.querySelector('input')).find((input) => input.checked);
    return checked ? checked.value : 'refuted';
  };
  const renderPreview = () => {
    preview.replaceChildren(
      h('p', { class: 'muted small' }, 'What this verdict does to the family it belongs to'),
      previewRate(family, currentVerdict()),
    );
  };
  for (const node of radios) node.querySelector('input').addEventListener('change', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Cross-examine one claim',
    description: `${finding.detectorLabel} · ${finding.familyLabel}`,
    size: 'lg',
    body: h('div', { class: 'stack' },
      h('p', {}, h('strong', {}, 'The claim: '), finding.detail),
      h('div', { class: 'kv' },
        h('span', {}, 'What the claim asserts'),
        h('span', { class: 'muted' }, finding.assertedOn ? `as recorded ${finding.assertedOn}` : 'as recorded')),
      h('p', {}, h('strong', {}, 'The one observation that settles it: '), finding.refuter),
      finding.probabilityPct === null
        ? h('p', { class: 'muted small' },
          'This claim has no probability: its family has fewer than the declared floor of scored claims. The verdict you record here is what will let the next claim of this kind be priced.')
        : h('p', { class: 'small' },
          `The terminal prices this claim at ${pct(finding.probabilityPct)} likely to be wrong, from ${family ? family.scored : 0} scored ${family ? family.unit : 'claim'}(s) in its family.`),
      h('div', { class: 'stack-xs' }, ...radios),
      field('scp-reason', 'The reason (required, at least eight characters)', reason,
        'This is the verdict that will be read back when the family rate is recomputed. Say what you saw, not how you feel about it.'),
      preview),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.disposeScepticClaim({
            claimKey: finding.key,
            verdict: currentVerdict(),
            reason: reason.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast('Verdict recorded. The family rate and every claim it prices were recomputed.', 'good');
            ctx.rerender();
            return;
          }
          toast((result && result.error) || 'Could not record the verdict.', 'bad');
        },
      }, 'Record verdict'),
    ],
  });
}

export function openFreezeScepticRoundDialog(ctx) {
  const report = scepticReport(ctx.state, ctx.now, ctx.state.settings || {});
  const priced = report.findings.filter((row) => row.probabilityPct !== null);
  const horizon = h('input', {
    id: 'scp-horizon',
    type: 'number',
    min: String(SCEPTIC_LIMITS.reviewHorizonDays[0]),
    max: String(SCEPTIC_LIMITS.reviewHorizonDays[1]),
    step: '1',
    value: String(report.conventions.scepticReviewHorizonDays),
  });

  const body = priced.length
    ? h('div', { class: 'stack' },
      h('p', { class: 'small' },
        h('strong', {}, `${priced.length} claim(s) can be priced now. `),
        `The round freezes, for each one, the probability that it is wrong — measured from ${report.auditor.scored} scored verdict(s) across ${report.families.filter((row) => row.verdict !== 'unmeasured').length} family(ies). `,
        `Expected contradictions: ${priced.reduce((sum, row) => sum + row.probabilityPct / 100, 0).toFixed(2)}.`),
      report.counts.unmeasured > 0
        ? h('p', { class: 'muted small' },
          `${report.counts.unmeasured} contradiction(s) will be left out of the freeze because their family has no measured rate. A claim that cannot be priced is not silently given a 50%.`)
        : null,
      field('scp-horizon', 'Review in (days)', horizon,
        'The round can only be graded after this window closes, and only against verdicts recorded after it was frozen.'))
    : h('div', { class: 'stack' },
      h('p', {},
        'Nothing can be priced yet. A family needs at least '
        + `${report.conventions.scepticMinScored} scored verdicts before its contradiction rate may be quoted, `
        + 'and no family has reached that floor. Freezing a probability with no basis would be exactly the kind of claim this screen exists to catch.'),
      h('p', { class: 'muted small' },
        `Record verdicts on the ${report.findings.length} contradiction(s) the record already shows — that is the whole first job here.`));

  const dialog = openModal({
    title: 'Freeze a cross-examination round',
    description: 'A frozen round is a prospective audit: these claims, at these probabilities, answerable on a date.',
    size: 'lg',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      priced.length
        ? h('button', {
          class: 'btn',
          type: 'button',
          onClick: () => {
            const result = ctx.api.freezeScepticRound({ reviewHorizonDays: Number(horizon.value) });
            if (result && result.ok) {
              dialog.close();
              toast(`Round frozen for ${result.reviewOn}: ${result.record.claims.length} claim(s) priced.`, 'good');
              ctx.rerender();
              return;
            }
            toast((result && result.error) || 'Could not freeze the round.', 'bad');
          },
        }, 'Freeze round')
        : null,
    ].filter(Boolean),
  });
}

export function openScepticConventionsDialog(ctx) {
  const report = scepticReport(ctx.state, ctx.now, ctx.state.settings || {});
  const conventions = report.conventions;
  const number = (id, value, min, max, step = '1') => h('input', {
    id, type: 'number', min: String(min), max: String(max), step, value: String(value),
  });
  const tolerance = number('scp-tolerance', conventions.scepticTolerancePct, SCEPTIC_LIMITS.tolerancePct[0], SCEPTIC_LIMITS.tolerancePct[1]);
  const floor = number('scp-floor', conventions.scepticMinScored, SCEPTIC_LIMITS.minScored[0], SCEPTIC_LIMITS.minScored[1]);
  const cap = number('scp-dismissal', conventions.scepticDismissalCapPct, SCEPTIC_LIMITS.dismissalCapPct[0], SCEPTIC_LIMITS.dismissalCapPct[1]);
  const windowDays = number('scp-window', conventions.scepticWindowDays, SCEPTIC_LIMITS.windowDays[0], SCEPTIC_LIMITS.windowDays[1]);
  const tasks = number('scp-tasks', conventions.scepticMaxTasks, SCEPTIC_LIMITS.maxTasks[0], SCEPTIC_LIMITS.maxTasks[1]);
  const review = number('scp-review', conventions.scepticReviewHorizonDays, SCEPTIC_LIMITS.reviewHorizonDays[0], SCEPTIC_LIMITS.reviewHorizonDays[1]);

  const dialog = openModal({
    title: 'Cross-examination conventions',
    description: 'Four declarations and two bounds. The contradiction rates themselves are measured from your verdicts, not set here.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid-cards' },
        field('scp-tolerance', 'Tolerance (%)', tolerance,
          'The share of a family’s scored claims that may be refuted before the family counts as failing. Clamped to 5–60%.'),
        field('scp-floor', 'Scored floor', floor,
          'Scored verdicts a family needs before any rate is quoted. Clamped to 3–40; a rate from two observations is a rumour with a decimal point.'),
        field('scp-dismissal', 'Dismissal cap (%)', cap,
          'Above this share of dismissals, RULE-SCP-05 puts the terminal itself on the record.'),
        field('scp-window', 'Window (days)', windowDays,
          'The window the capacity claim’s settlement rate is measured over.')),
      h('div', { class: 'grid-cards' },
        field('scp-tasks', 'Tasks per round', tasks,
          'How many cross-examinations a frozen round may open. A round is not a work-creation engine.'),
        field('scp-review', 'Review horizon (days)', review,
          'How long a frozen round waits for the record to answer before it can be graded.')),
      h('h4', {}, 'Families and their declared stakes'),
      ...CLAIM_FAMILIES.map((family) => h('div', { class: 'kv' },
        h('span', {}, family.label),
        h('span', { class: 'muted' }, `${family.question} · stake ${family.stakes}/5`)))),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.setScepticConventions({
            scepticTolerancePct: Number(tolerance.value),
            scepticMinScored: Number(floor.value),
            scepticDismissalCapPct: Number(cap.value),
            scepticWindowDays: Number(windowDays.value),
            scepticMaxTasks: Number(tasks.value),
            scepticReviewHorizonDays: Number(review.value),
          });
          if (result && result.ok) {
            dialog.close();
            toast('Conventions updated — every verdict and every rate was recomputed.', 'good');
            ctx.rerender();
            return;
          }
          toast((result && result.error) || 'Could not save the conventions.', 'bad');
        },
      }, 'Save conventions'),
    ],
  });
}
