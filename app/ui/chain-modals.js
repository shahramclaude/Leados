/**
 * app/ui/chain-modals.js — the three dialogs of the Command Chain (Schema v82).
 *
 *   openDeclareAltitudeDialog    declare the one structural input the engine
 *                                cannot derive: your own altitude. The preview
 *                                re-reads every clock before you commit, because
 *                                changing your altitude moves the boundary
 *                                between "mine" and "the level above".
 *   openChainConventionsDialog   the declarations behind every number on the
 *                                page — evidence floor, drift bar, span band,
 *                                materiality bar, review horizon, layer limit
 *   openFreezeChainReadingDialog freeze one span's reading: a dated claim with
 *                                exactly one probability, gradable once, later
 *
 * All three preview the effect before writing and refuse to commit a value the
 * schema would clamp, so the number the leader reads is the number that is
 * stored.
 */

import { h, toast, openModal } from './dom.js';
import { buildChainReading, chainReport } from '../core/domain/chain.js';
import { ALTITUDES, CHAIN_LIMITS, altitudeByKey } from '../core/domain/chainRegistry.js';

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

function numberInput(id, value, [min, max], step = '1') {
  return h('input', {
    id,
    type: 'number',
    min: String(min),
    max: String(max),
    step,
    value: String(value),
  });
}

/**
 * Declare your own altitude.
 *
 * The read on this page is an *escalation* read: an item whose age passes its
 * owner's horizon demands the level above. Declaring yourself a director instead
 * of a frontline lead does not lengthen anyone's week — it changes which items
 * are above you, and therefore what the page says is unowned. So the preview
 * prints that movement before the write.
 */
export function openDeclareAltitudeDialog(ctx) {
  const settings = ctx.state.settings || {};
  const before = chainReport(ctx.state, ctx.now, settings);
  const current = before.conventions.chainLeaderAltitude;

  const select = h('select', { id: 'chain-altitude' },
    ...ALTITUDES.map((altitude) => h('option', { value: altitude.key, selected: altitude.key === current ? 'selected' : undefined },
      `${altitude.label} — ${altitude.unitLabel} (${altitude.horizonDays}d horizon)`)));

  const preview = h('div', { class: 'stack-xs' });

  const renderPreview = () => {
    preview.replaceChildren();
    const key = select.value;
    if (key === current) {
      preview.append(h('p', { class: 'muted small' },
        `That is already your declared altitude. Every item older than ${altitudeByKey(current)?.horizonDays} days is currently reported as demanding a level above you.`));
      return;
    }
    const after = chainReport(ctx.state, ctx.now, { ...settings, chainLeaderAltitude: key });
    const deltaDebt = after.totals.debt - before.totals.debt;
    const deltaAbove = after.totals.aboveTop - before.totals.aboveTop;
    const altitude = altitudeByKey(key);
    preview.append(
      h('p', { class: 'small' },
        h('strong', {}, `As a ${altitude.label}, `),
        `your advice horizon becomes ${altitude.horizonDays} days and your discretion is over ${altitude.unitLabel}. `,
        `Items past a horizon: ${before.totals.debt} → ${after.totals.debt} (${deltaDebt >= 0 ? '+' : ''}${deltaDebt}). `,
        `Items demanding a level above you: ${before.totals.aboveTop} → ${after.totals.aboveTop} (${deltaAbove >= 0 ? '+' : ''}${deltaAbove}).`),
      h('p', { class: 'muted small' },
        'This changes the clock the page reads, never the amount of work. If the movement is large, the honest question is whether your real discretion matches the altitude you are about to declare — not which number looks better.'),
    );
  };
  select.addEventListener('change', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Declare your own altitude',
    description: 'The workspace leader holds no roster record, so your altitude cannot be read from a title. It is declared here, and every escalation clock in the workspace is re-read against it.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      field('chain-altitude', 'Your altitude', select,
        'Time-span of discretion, not seniority: the longest period your own work can run before it must be reviewed.'),
      preview),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.declareChainAltitude(select.value);
          if (result && result.ok) {
            dialog.close();
            toast(`Altitude declared as ${result.altitude} — every horizon and drift share was re-read.`, 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'Could not declare the altitude.', 'bad');
        },
      }, 'Declare'),
    ],
  });
}

/**
 * The chain's conventions. Every one of these is a declaration with a stated
 * range; the ranges are the ones the schema enforces, so the input cannot offer
 * a value that would be silently clamped.
 */
export function openChainConventionsDialog(ctx) {
  const conventions = chainReport(ctx.state, ctx.now, ctx.state.settings || {}).conventions;
  const floor = numberInput('chain-floor', conventions.chainFloorN, CHAIN_LIMITS.floorN);
  const drift = numberInput('chain-drift', conventions.chainDriftPct, CHAIN_LIMITS.driftPct);
  const spanMin = numberInput('chain-span-min', conventions.chainSpanMin, CHAIN_LIMITS.spanMin);
  const spanMax = numberInput('chain-span-max', conventions.chainSpanMax, CHAIN_LIMITS.spanMax);
  const materiality = numberInput('chain-materiality', conventions.chainMaterialityPp, CHAIN_LIMITS.materialityPp, '0.5');
  const windowDays = numberInput('chain-window', conventions.chainWindowDays, CHAIN_LIMITS.windowDays);
  const reviewDays = numberInput('chain-review', conventions.chainReviewHorizonDays, CHAIN_LIMITS.reviewHorizonDays);
  const maxDepth = numberInput('chain-depth', conventions.chainMaxDepth, CHAIN_LIMITS.maxDepth);
  const auto = h('input', {
    id: 'chain-auto',
    type: 'checkbox',
    checked: conventions.chainAutoPropagate === true,
  });

  const dialog = openModal({
    title: 'Command chain conventions',
    description: 'These are declarations, not findings. Each one decides when the page reports a problem — so a bar set to flatter yourself silences the report, and the page cannot tell you that.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid-cards' },
        field('chain-floor', 'Evidence floor (observations)', floor,
          'Below this a rate is withheld. A floor of 1 would make every cell “measurable”, which is why the schema refuses it.'),
        field('chain-drift', 'Drift bar (%)', drift,
          'Share of a span’s own work sitting below its altitude before it is reported.'),
        field('chain-materiality', 'Materiality bar (pp)', materiality,
          'How far a pooled rate may differ from the mean of unit rates before the reading is called composition-sensitive.')),
      h('div', { class: 'grid-cards' },
        field('chain-span-min', 'Span band — minimum', spanMin, 'Direct reports below which a span is reported as thin.'),
        field('chain-span-max', 'Span band — maximum', spanMax, 'Direct reports above which a span is reported as wide.'),
        field('chain-depth', 'Layer limit', maxDepth, 'Layers below you before the chain itself is reported as too deep.')),
      h('div', { class: 'grid-cards' },
        field('chain-window', 'Look-back window (days)', windowDays, 'How far back rates and survival are measured.'),
        field('chain-review', 'Reading review horizon (days)', reviewDays,
          'When a frozen reading becomes gradable. Set it wider than the shortest horizon you want to test.')),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'chain-auto' }, auto, ' Run a scan after every mutation'),
        h('span', { class: 'muted small' },
          'With this off, only an explicit scan runs. The page still recomputes on read either way — a scan is what opens tasks and writes typed links.'))),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          if (Number(spanMin.value) >= Number(spanMax.value)) {
            toast('The span band’s minimum must be below its maximum.', 'bad');
            return;
          }
          const result = ctx.api.setChainConventions({
            chainFloorN: Number(floor.value),
            chainDriftPct: Number(drift.value),
            chainSpanMin: Number(spanMin.value),
            chainSpanMax: Number(spanMax.value),
            chainMaterialityPp: Number(materiality.value),
            chainWindowDays: Number(windowDays.value),
            chainReviewHorizonDays: Number(reviewDays.value),
            chainMaxDepth: Number(maxDepth.value),
            chainAutoPropagate: Boolean(auto.checked),
          });
          if (result && result.ok) {
            dialog.close();
            toast('Chain conventions updated — every rate, drift share and finding was recomputed.', 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'Could not save the conventions.', 'bad');
        },
      }, 'Save conventions'),
    ],
  });
}

/**
 * Freeze one span's reading.
 *
 * The preview is built with the same function the commit uses, so the numbers in
 * the dialog are the numbers in the record. A span that cannot be quoted says so
 * before the button is pressed — and the commit refuses rather than storing a
 * probability the record cannot support.
 */
export function openFreezeChainReadingDialog(ctx) {
  const settings = ctx.state.settings || {};
  const report = chainReport(ctx.state, ctx.now, settings);
  const spans = report.spans;
  if (!spans.length) {
    toast('There is no span to read yet — add people to the roster first.', 'warn');
    return;
  }

  const select = h('select', { id: 'chain-reading-span' },
    ...spans.map((span) => h('option', { value: span.nodeId },
      `${span.dossier.name} — ${span.dossier.altitudeLabel} · ${span.dossier.openN} open`)));
  const reviewDays = numberInput('chain-reading-review', report.conventions.chainReviewHorizonDays, CHAIN_LIMITS.reviewHorizonDays);
  const preview = h('div', { class: 'stack-xs' });

  const renderPreview = () => {
    preview.replaceChildren();
    const built = buildChainReading(report, select.value, {
      now: ctx.now,
      reviewDays: Number(reviewDays.value),
    });
    if (!built.ok) {
      preview.append(h('p', { class: 'small' },
        h('strong', {}, 'This span cannot be frozen. '), built.error));
      preview.append(h('p', { class: 'muted small' },
        'A reading without a probability would be decoration: it could never be scored, so it would never tell you whether your escalation judgement is any good.'));
      return;
    }
    const record = built.record;
    preview.append(
      h('p', { class: 'small' },
        h('strong', {}, `${record.counts.openN} open item(s), ${record.counts.ownOpenN} held by the span itself, ${record.counts.debtN} past a horizon. `),
        `Review date ${record.reviewOn}.`),
      h('div', { class: 'kv' },
        h('span', {}, 'Any breach by then'),
        h('span', { class: 'muted' },
          `${pct(record.predictedAnyBreachPct)} (assumption-free floor) · ${pct(record.predictedAnyBreachIndependencePct)} under independence`)),
      record.quoteRefused
        ? h('p', { class: 'muted small' }, `Quote refused: ${record.quoteRefused}`)
        : h('p', { class: 'muted small' },
          `${record.members.length} member(s) quoted, next threshold ${record.nextThresholdDays} days (the horizon of the level above).`),
    );
  };
  select.addEventListener('change', renderPreview);
  reviewDays.addEventListener('input', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Freeze a chain reading',
    description: 'A frozen reading is a dated claim about one span: its counts, the rates it could defend, and exactly one probability. It can be graded once, after the review date, and it is never rewritten afterwards.',
    size: 'lg',
    body: h('div', { class: 'stack' },
      field('chain-reading-span', 'Which span?', select,
        'One reading per span per day — a repeated freeze is not a second independent claim.'),
      field('chain-reading-review', 'Review in (days)', reviewDays,
        `${CHAIN_LIMITS.reviewHorizonDays[0]}–${CHAIN_LIMITS.reviewHorizonDays[1]} days. The reading cannot be graded before this window closes.`),
      preview),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeChainReading({
            nodeId: select.value,
            reviewDays: Number(reviewDays.value),
          });
          if (result && result.ok) {
            dialog.close();
            toast(`Reading frozen for ${result.reviewOn}: ${result.record.counts.openN} open item(s), ${pct(result.record.predictedAnyBreachPct)} any breach.`, 'good');
            ctx.refresh();
            return;
          }
          toast((result && result.error) || 'Could not freeze the reading.', 'bad');
        },
      }, 'Freeze reading'),
    ],
  });
}
