/**
 * app/views/cases.js — Cross-Domain Operational Cases, Risk, Economics &
 * Coalition Workspace (`#/cases` and `#/cases/:id`).
 */

import { h, confirmDialog, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, kv, tabs } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import {
  CASE_KIND_LABELS,
  CASE_STATUS_LABELS,
  MENDELOW_QUADRANTS,
  casesRollup,
  isFmeaRated,
  summarizeCase,
} from '../core/domain/cases.js';
import { AUTOMATION_RULES } from '../core/domain/automation.js';
import { caseCostCalibration } from '../core/domain/calibration.js';
import { caseRatioChart } from '../ui/charts.js';
import {
  openCaseDialog,
  openCaseStakeholderCommsDialog,
  openRecordCaseActualsDialog,
  openResolveCaseDialog,
  openLinkCaseEntityDialog,
} from '../ui/case-modals.js';

const PRIORITY_TONE = { high: 'bad', medium: 'caution', low: 'good' };
const STANCE_TONE = {
  champion: 'good',
  supportive: 'good',
  neutral: 'neutral',
  skeptical: 'caution',
  blocker: 'bad',
};
const FILTERS = ['open', 'high', 'coalition', 'review', 'resolved', 'all'];

function fmtMoney(currency, amount) {
  return `${currency} ${Number(amount || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function renderLinksStrip(links, ctx) {
  if (!links.length) {
    return h('p', { class: 'muted tiny' }, 'No cross-module links yet.');
  }
  return h(
    'div',
    { class: 'case-links-strip' },
    ...links.map((item) =>
      h(
        'a',
        {
          class: 'case-link-pill',
          href: item.peer.route,
          onClick: (e) => {
            e.preventDefault();
            ctx.navigate(item.peer.route);
          },
        },
        h('span', { class: 'case-link-rel' }, item.relationLabel),
        h('strong', null, item.peer.title),
        h('span', { class: 'muted tiny' }, `(${item.peer.status})`),
      ),
    ),
  );
}

/**
 * Schema v22 — settled actuals vs the opening forecast for one resolved case.
 * Unknown legs render as "Not recorded", never as zero: the ledger only
 * scores what was actually written down.
 */
function renderSettledActualsBody(ctx, caseRecord) {
  const cal = caseCostCalibration(ctx.state);
  const pair = cal.pairs.find((p) => p.caseId === caseRecord.id) || null;
  const ratioText = (ratio) => (ratio === null || ratio === undefined ? '' : ` (${ratio}× forecast)`);
  const days = (v) => (v === null || v === undefined ? 'Not recorded' : `${v}d`);

  if (!pair) {
    return h(
      'div',
      { class: 'stack-md' },
      h(
        'p',
        { class: 'small' },
        'No settled actuals recorded for this case yet, so the forecast made when it was opened is unscored. Recording what it actually cost — whether it materialised, the realised exposure, the mitigation spend and the diverted days — is what teaches the next case assessment.',
      ),
      h(
        'div',
        null,
        h(
          'button',
          { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openRecordCaseActualsDialog(ctx, caseRecord) },
          'Record settled actuals',
        ),
      ),
    );
  }

  return h(
    'div',
    { class: 'stack-md' },
    h(
      'div',
      { class: 'row-between' },
      h(
        'div',
        { class: 'row-gap' },
        pair.materialised === true
          ? badge('Materialised', 'bad')
          : pair.materialised === false
            ? badge('Did not materialise', 'good')
            : badge('Materialisation unrecorded', 'neutral'),
        badge(
          pair.source === 'opening-forecast' ? 'Scored vs frozen opening forecast' : 'Scored vs resolution-time estimate',
          pair.source === 'opening-forecast' ? 'good' : 'caution',
        ),
      ),
      h('span', { class: 'muted tiny' }, 'FAIR frequency × magnitude · RULE-FCT-03/04'),
    ),
    h(
      'div',
      { class: 'kv-grid' },
      kv(
        'Assessed occurrence (FMEA probability)',
        pair.assessedProbability === null
          ? 'Not rated in the forecast'
          : `${pair.fmeaProbability}/10 → ${Math.round(pair.assessedProbability * 100)}%${pair.occurrenceBrier !== null ? ` · Brier ${pair.occurrenceBrier}` : ''}`,
      ),
      kv(
        'Realised exposure vs expected',
        pair.realisedExposure === null
          ? 'Not recorded'
          : `${fmtMoney(pair.currency, pair.realisedExposure)} vs ${fmtMoney(pair.currency, pair.costExpected)}${ratioText(pair.exposureRatio)}${pair.withinRange !== null ? (pair.withinRange ? ' · inside assessed range' : ' · outside assessed range') : ''}`,
      ),
      kv(
        'Mitigation spend vs planned',
        pair.mitigationSpend === null
          ? 'Not recorded'
          : `${fmtMoney(pair.currency, pair.mitigationSpend)}${pair.plannedMitigationCost > 0 ? ` vs ${fmtMoney(pair.currency, pair.plannedMitigationCost)} planned${ratioText(pair.spendRatio)}` : ' (no planned spend recorded)'}`,
      ),
      kv(
        'Diverted capacity vs reserved',
        pair.divertedDays === null
          ? 'Not recorded'
          : `${days(pair.divertedDays)}${pair.capacityExpected > 0 ? ` vs ${pair.capacityExpected}d expected${ratioText(pair.daysRatio)}` : ''}`,
      ),
      kv('Settled on', pair.settledOn ? formatDate(pair.settledOn) : '—'),
      pair.totalRealised !== null
        ? kv(
            'Total realised vs expected unmitigated loss',
            `${fmtMoney(pair.currency, pair.totalRealised)} vs ${pair.expectedUnmitigatedLoss === null ? 'unknown (occurrence not rated)' : fmtMoney(pair.currency, pair.expectedUnmitigatedLoss)}`,
          )
        : null,
      pair.note ? kv('Settlement note', pair.note) : null,
    ),
    h(
      'div',
      null,
      h(
        'button',
        { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => openRecordCaseActualsDialog(ctx, caseRecord) },
        'Edit settled actuals',
      ),
    ),
  );
}

/**
 * Schema v22 — the case-cost calibration ledger on the cases list: both FAIR
 * legs, reserve adequacy, the settlement chart, and the missing-actuals
 * backfill queue. Renders only once a case has settled or is waiting to be
 * scored; verdicts refuse below n=5 like every other ledger.
 */
function renderCaseCalibrationCard(ctx) {
  const cal = caseCostCalibration(ctx.state);
  if (!cal.settledCount && !cal.missingActuals) return null;
  const exp = cal.exposure;
  const occ = cal.occurrence;
  const agg = cal.aggregate;

  return card({
    title: 'Case-Cost Calibration — Settled Actuals vs Opening Forecasts',
    subtitle: 'FAIR frequency × magnitude legs scored against the forecast frozen when each case was opened (RULE-FCT-03); deficient reserves open a governance decision (RULE-FCT-04).',
    body: h(
      'div',
      { class: 'stack-md' },
      h(
        'div',
        { class: 'stat-grid' },
        stat({
          label: 'Scored settlements',
          value: String(cal.settledCount),
          hint: `${occ.materialisedCount}/${occ.n} materialised · ${cal.missingActuals} awaiting actuals`,
        }),
        stat({
          label: 'Median exposure development',
          value: exp.medianRatio !== null ? `${exp.medianRatio}×` : '—',
          hint: exp.n ? `Realised ÷ assessed over ${exp.n} materialised case(s) · P80 ${exp.ratioP80}×` : 'No materialised settlements yet',
          tone: exp.sufficient && exp.medianRatio >= 1.25 ? 'bad' : exp.sufficient ? 'good' : '',
        }),
        stat({
          label: 'Occurrence: assessed vs observed',
          value: occ.n ? `${Math.round(occ.meanAssessedProbability * 100)}% → ${Math.round(occ.observedRate * 100)}%` : '—',
          hint: occ.n ? `Gap ${occ.gapPp > 0 ? '+' : ''}${occ.gapPp}pp · Brier ${occ.brier} (n=${occ.n})` : 'Record materialisation at settlement',
          tone: occ.sufficient && Math.abs(occ.gapPp) >= 20 ? 'caution' : '',
        }),
        stat({
          label: 'Aggregate loss development',
          value: agg.developmentFactor !== null ? `${agg.developmentFactor}×` : '—',
          hint: agg.developmentFactor !== null
            ? `${fmtMoney(agg.currency, agg.totalRealised)} realised vs ${fmtMoney(agg.currency, agg.totalExpectedUnmitigated)} expected unmitigated (${agg.n} complete)`
            : 'Needs settlements with both money legs recorded',
        }),
      ),
      h('p', { class: exp.verdict.id === 'under-reserved' ? 'note note-warn' : 'note' }, h('strong', null, `${exp.verdict.label}. `), exp.verdict.detail),
      exp.intervalVerdict
        ? h('p', { class: 'small muted' }, h('strong', null, `${exp.intervalVerdict.label}. `), exp.intervalVerdict.detail)
        : null,
      cal.spend.n >= 3 || cal.days.n >= 3
        ? h(
            'p',
            { class: 'small muted' },
            [
              cal.spend.n >= 3 ? `Mitigation spend runs a median ${cal.spend.medianRatio}× plan (n=${cal.spend.n}).` : null,
              cal.days.n >= 3 ? `Diverted capacity runs a median ${cal.days.medianRatio}× the reserved days (n=${cal.days.n}) — this is also the accuracy read on RULE-CAP-01 capacity reserves.` : null,
            ].filter(Boolean).join(' '),
          )
        : null,
      exp.pairs.length ? caseRatioChart(exp) : null,
      cal.missingItems.length
        ? h(
            'div',
            { class: 'stack-xs' },
            h('h3', { class: 'section-subhead' }, `Resolved without settled actuals (${cal.missingItems.length})`),
            h(
              'ul',
              { class: 'evidence-list' },
              ...cal.missingItems.slice(0, 5).map((m) => {
                const target = (ctx.state.cases || []).find((c) => c.id === m.caseId);
                return h(
                  'li',
                  { class: 'row-between' },
                  h('span', null, `“${m.title}” — resolved ${m.resolvedOn ? formatDate(m.resolvedOn) : 'recently'}${m.costExpected !== null ? ` · expected exposure ${fmtMoney(m.currency, m.costExpected)}` : ''}`),
                  target
                    ? h(
                        'button',
                        { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => openRecordCaseActualsDialog(ctx, target) },
                        'Record actuals',
                      )
                    : null,
                );
              }),
            ),
          )
        : null,
      h(
        'p',
        { class: 'muted tiny' },
        'Decision-forecast (Brier) and delivery-estimate calibration live on ',
        h(
          'a',
          {
            href: '#/decisions',
            onClick: (e) => {
              e.preventDefault();
              ctx.navigate('#/decisions');
            },
          },
          'Decisions',
        ),
        ' — three ledgers, one learning loop.',
      ),
    ),
  });
}

function renderCaseDetail(ctx, caseRecord) {
  const s = summarizeCase(caseRecord, ctx.state, ctx.now);
  const { fmea, pert, coalition, rca, links } = s;

  const actions = [
    h(
      'button',
      { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate('#/cases') },
      '← All cases',
    ),
    h(
      'button',
      { class: 'btn btn-secondary', type: 'button', onClick: () => openCaseDialog(ctx, { caseRecord }) },
      'Edit case',
    ),
    h(
      'button',
      { class: 'btn btn-secondary', type: 'button', onClick: () => openLinkCaseEntityDialog(ctx, caseRecord) },
      'Link record',
    ),
  ];

  if (s.open) {
    actions.push(
      h(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.syncCaseAutomations(caseRecord.id);
            if (!res.ok) toast(res.error, 'bad');
            else {
              const n = res.propagations.length;
              toast(n ? `Applied ${n} cross-module rule update(s).` : 'All cross-module links and rules are already in sync.', 'good');
            }
          },
        },
        'Sync rules',
      ),
      h(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.promoteCaseToChange(caseRecord.id);
            if (!res.ok) {
              if (res.existingChangeId) {
                toast(res.error, 'caution');
                ctx.navigate(`#/changes/${res.existingChangeId}`);
              } else {
                toast(res.error, 'bad');
              }
              return;
            }
            toast('Spawned linked Organizational Change design', 'good');
            ctx.navigate(`#/changes/${res.id}`);
          },
        },
        'Promote to Org Change',
      ),
      h(
        'button',
        { class: 'btn btn-primary', type: 'button', onClick: () => openResolveCaseDialog(ctx, caseRecord) },
        'Resolve case',
      ),
    );
  } else {
    actions.push(
      h(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => openRecordCaseActualsDialog(ctx, caseRecord),
        },
        caseRecord.actuals ? 'Edit settled actuals' : 'Record settled actuals',
      ),
      h(
        'button',
        {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.reopenCase(caseRecord.id);
            if (!res.ok) toast(res.error, 'bad');
            else toast('Operational case reopened.', 'good');
          },
        },
        'Reopen case',
      ),
    );
  }

  actions.push(
    h(
      'button',
      {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Delete this operational case?',
            message: `Delete "${caseRecord.title}" and remove its cross-module graph links? Linked decisions, delegations, and goals will remain intact.`,
            confirmLabel: 'Delete case',
            danger: true,
          });
          if (!ok) return;
          const res = ctx.api.deleteCase(caseRecord.id);
          if (res.ok) {
            toast('Operational case deleted.', 'good');
            ctx.navigate('#/cases');
          } else {
            toast(res.error, 'bad');
          }
        },
      },
      'Delete',
    ),
  );
  if (s.open) {
    actions.splice(
      1,
      0,
      h(
        'a',
        { class: 'btn btn-ghost', href: `#/scenarios?mitigateCase=${encodeURIComponent(caseRecord.id)}` },
        'Simulate mitigation',
      ),
    );
  }

  // Panel 1: FMEA & 5-Whys / Swiss-Cheese RCA
  const fmeaRcaBody = h(
    'div',
    { class: 'stack-md' },
    h(
      'div',
      { class: 'row-between' },
      h(
        'div',
        { class: 'row-gap' },
        // Schema v33: an unrated case shows the gap, never a default RPN.
        isFmeaRated(caseRecord.fmea)
          ? badge(`RPN ${fmea.rpn}`, PRIORITY_TONE[fmea.actionPriority])
          : badge('Rating needed', 'caution'),
        isFmeaRated(caseRecord.fmea)
          ? badge(`Action Priority: ${fmea.actionPriority.toUpperCase()}`, PRIORITY_TONE[fmea.actionPriority])
          : null,
        fmea.hasResidual
          ? badge(`Residual RPN ${fmea.residualRpn}${fmea.rpnReductionPct === null ? '' : ` (−${fmea.rpnReductionPct}%)`}`, PRIORITY_TONE[fmea.residualActionPriority])
          : null,
      ),
      h('span', { class: 'muted tiny' }, 'AIAG-VDA FMEA & Reason (1990) Swiss-Cheese'),
    ),
    h(
      'div',
      { class: 'kv-grid' },
      kv('Severity', caseRecord.fmea?.severity != null ? `${fmea.severity} / 10` : 'Not rated yet'),
      kv('Probability', caseRecord.fmea?.probability != null ? `${fmea.probability} / 10` : 'Not rated yet'),
      kv('Detection gap', caseRecord.fmea?.detectability != null ? `${fmea.detectability} / 10` : 'Not rated yet'),
      fmea.failureMode ? kv('Failure mode', fmea.failureMode) : null,
      fmea.effect ? kv('Downstream effect', fmea.effect) : null,
      fmea.controls ? kv('Current controls', fmea.controls) : null,
    ),
    isFmeaRated(caseRecord.fmea)
      ? h(
        'ul',
        { class: 'evidence-list' },
        ...fmea.drivers.map((d) => h('li', null, d)),
      )
      : h('p', { class: 'muted small' }, 'This case has not been FMEA-rated yet, so no RPN or action priority is claimed for it. Edit the case to record severity, probability and detection gap when someone can judge them.'),
    h('hr', { class: 'divider' }),
    h('h3', { class: 'section-subhead' }, `5-Whys & Systemic Barrier (${rca.completenessPct}% complete)`),
    rca.blameWarning ? h('p', { class: 'note note-warn' }, rca.blameWarning) : null,
    rca.problemStatement ? kv('Problem statement', rca.problemStatement) : null,
    rca.whys.length
      ? h(
          'ol',
          { class: 'case-whys-list' },
          ...rca.whys.map((why, idx) => h('li', null, h('strong', null, `Why ${idx + 1}: `), why)),
        )
      : h('p', { class: 'muted small' }, 'No 5-Whys causal steps recorded yet.'),
    h(
      'div',
      { class: 'kv-grid' },
      kv('Systemic root cause', rca.rootCause || 'Not yet recorded'),
      kv('Swiss-Cheese guardrail', rca.systemicBarrier || 'Not yet recorded'),
      kv('Preventive action', rca.preventiveAction || 'Not yet recorded'),
    ),
    !s.open && caseRecord.resolutionNotes
      ? kv('Verified resolution summary', caseRecord.resolutionNotes)
      : null,
  );

  // Panel 2: 3-Point PERT Economics & Mitigation ROI
  const pertBody = h(
    'div',
    { class: 'stack-md' },
    pert.hasFinancialEstimate
      ? h(
          'div',
          { class: 'kv-grid' },
          kv('Optimistic / Most likely / Pessimistic', `${fmtMoney(pert.currency, pert.cost.optimistic)} · ${fmtMoney(pert.currency, pert.cost.mostLikely)} · ${fmtMoney(pert.currency, pert.cost.pessimistic)}`),
          kv('PERT Expected Exposure (E)', `${fmtMoney(pert.currency, pert.cost.expected)} (σ = ${fmtMoney(pert.currency, pert.cost.stdDev)})`),
          kv('80% Confidence Interval (P10–P90)', `${fmtMoney(pert.currency, pert.cost.p10)} – ${fmtMoney(pert.currency, pert.cost.p90)}`),
          pert.preProbability !== null
            ? kv('Expected Unmitigated Loss', `${fmtMoney(pert.currency, pert.expectedUnmitigatedLoss)} (modelled p = ${(pert.preProbability * 100).toFixed(0)}%)`)
            : kv('Expected Unmitigated Loss', 'Unknown — record a complete FMEA rating'),
          pert.postProbability !== null
            ? kv(`Expected Residual Loss (${pert.measuredResidual ? 'rated' : 'projected'})`,
              `${fmtMoney(pert.currency, pert.expectedResidualLoss)} (modelled p = ${(pert.postProbability * 100).toFixed(0)}%)`)
            : kv('Expected Residual Loss', 'Unknown — occurrence not rated'),
          kv('Mitigation Investment', fmtMoney(pert.currency, pert.mitigationCost)),
          kv('Net Risk-Adjusted Value', pert.netRiskAdjustedValue === null ? 'Unknown — occurrence not rated' : fmtMoney(pert.currency, pert.netRiskAdjustedValue), pert.netRiskAdjustedValue === null ? '' : pert.netRiskAdjustedValue >= 0 ? 'good' : 'bad'),
          kv(
            'Mitigation ROI',
            pert.preProbability === null ? 'Unknown — occurrence not rated' : pert.mitigationRoi !== null ? `${(pert.mitigationRoi * 100).toFixed(0)}%` : 'Set mitigation cost > 0 to compute',
          ),
        )
      : h('p', { class: 'muted small' }, 'No financial PERT distribution entered for this case yet.'),
    pert.hasFinancialEstimate && pert.preProbability !== null
      ? h('p', { class: 'muted small' }, 'Occurrence ÷ 10 and any projected residual are model conventions, not measured frequencies; validate them before relying on risk-adjusted values.')
      : null,
    pert.hasCapacityEstimate
      ? h(
          'div',
          { class: 'kv-grid' },
          kv(
            'Diverted Team Capacity (PERT)',
            `${pert.capacity.expected} person-days expected (O ${pert.capacity.optimistic}d · M ${pert.capacity.mostLikely}d · P ${pert.capacity.pessimistic}d · P90 ${pert.capacity.p90}d)`,
          ),
        )
      : null,
    pert.opportunityCost
      ? kv('Explicit Opportunity Cost (Trade-off)', pert.opportunityCost)
      : h('p', { class: 'muted small' }, 'No roadmap opportunity cost recorded yet — name what pauses so unplanned work is not absorbed invisibly.'),
  );

  // Panel 3: Mendelow 2x2 Power × Interest Stakeholder Matrix
  const quadrantOrder = ['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor'];
  const coalitionBody = h(
    'div',
    { class: 'stack-md' },
    h(
      'div',
      { class: 'row-between' },
      h(
        'div',
        { class: 'row-gap' },
        badge(`Supportive power: ${coalition.supportivePower}`, 'good'),
        badge(`Opposing power: ${coalition.opposingPower}`, coalition.opposingPower > coalition.supportivePower ? 'bad' : 'caution'),
        badge(`Net balance: ${coalition.netPowerBalance >= 0 ? `+${coalition.netPowerBalance}` : coalition.netPowerBalance}`, coalition.netPowerBalance >= 0 ? 'good' : 'bad'),
      ),
      h('span', { class: 'muted tiny' }, 'Mendelow (1981) Power × Interest Matrix'),
    ),
    coalition.total === 0
      ? h('p', { class: 'muted small' }, 'No stakeholders mapped yet. Edit this case to map decision-makers, gatekeepers, and affected allies.')
      : h(
          'div',
          { class: 'mendelow-grid' },
          ...quadrantOrder.map((qKey) => {
            const qMeta = MENDELOW_QUADRANTS[qKey];
            const items = coalition.byQuadrant[qKey] || [];
            return h(
              'div',
              { class: `mendelow-cell mendelow-${qKey}` },
              h(
                'div',
                { class: 'mendelow-cell-head' },
                h('h3', { class: 'section-subhead' }, qMeta.label),
                h('span', { class: 'muted tiny' }, qMeta.subtitle),
              ),
              h('p', { class: 'muted tiny' }, qMeta.guidance),
              items.length
                ? h(
                    'ul',
                    { class: 'mendelow-stakeholder-list' },
                    ...items.map((stk) => {
                      const rawStk = (caseRecord.stakeholders || []).find((x) => x.id === stk.id) || stk;
                      return h(
                        'li',
                        { class: 'mendelow-stakeholder-item' },
                        h(
                          'div',
                          { class: 'row-between' },
                          h(
                            'div',
                            null,
                            h('strong', null, stk.name),
                            stk.role ? h('span', { class: 'muted tiny' }, ` · ${stk.role}`) : null,
                          ),
                          badge(`${stk.stanceLabel} (P${stk.power}/I${stk.interest})`, STANCE_TONE[stk.stance]),
                        ),
                        stk.keyMessage ? h('p', { class: 'small' }, stk.keyMessage) : null,
                        h(
                          'div',
                          { class: 'row-between' },
                          h(
                            'span',
                            { class: `tiny ${stk.commsOverdue && s.open ? 'text-bad' : 'muted'}` },
                            stk.nextCommsOn
                              ? `Next brief: ${formatDate(stk.nextCommsOn)}${stk.commsOverdue && s.open ? ' (overdue)' : ''}${stk.lastCommsOn ? ` · Last: ${formatDate(stk.lastCommsOn)}` : ''}`
                              : 'No checkpoint scheduled',
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              class: 'btn btn-secondary btn-small',
                              onClick: () => openCaseStakeholderCommsDialog(ctx, caseRecord, rawStk),
                            },
                            'Log brief',
                          ),
                        ),
                      );
                    }),
                  )
                : h('p', { class: 'muted tiny' }, 'None in this quadrant'),
            );
          }),
        ),
  );

  // Panel 4: Connected System Graph & Parallel Automation Audit
  const relatedEntityIds = new Set([caseRecord.id, ...links.map((l) => l.peer.id)]);
  const caseAuditEvents = (ctx.state.events || [])
    .filter(
      (ev) =>
        ev.entityId === caseRecord.id ||
        (ev.type === 'automation.propagated' && relatedEntityIds.has(ev.entityId)) ||
        String(ev.summary || '').includes(caseRecord.title.slice(0, 28)),
    )
    .slice()
    .reverse()
    .slice(0, 12);

  const graphBody = h(
    'div',
    { class: 'stack-md' },
    renderLinksStrip(links, ctx),
    caseAuditEvents.length
      ? h(
          'div',
          { class: 'stack-xs' },
          h('h3', { class: 'section-subhead' }, 'Cross-module propagation & case audit ledger'),
          h(
            'ul',
            { class: 'evidence-list' },
            ...caseAuditEvents.map((ev) =>
              h(
                'li',
                null,
                h('span', { class: 'muted tiny' }, `${formatDate((ev.ts || '').slice(0, 10))} · ${ev.type} — `),
                ev.summary,
              ),
            ),
          ),
        )
      : null,
  );

  return h(
    'div',
    { class: 'page stack-lg' },
    pageHeader({
      eyebrow: `${CASE_KIND_LABELS[caseRecord.kind] || caseRecord.kind} · ${CASE_STATUS_LABELS[caseRecord.status] || caseRecord.status}`,
      title: caseRecord.title,
      subtitle: caseRecord.summary || 'Cross-domain operational case record.',
      meta: h(
        'div',
        { class: 'row-gap muted small' },
        h('span', null, `Opened ${formatDate(caseRecord.openedOn)}`),
        caseRecord.reviewOn ? h('span', null, `· Review ${formatDate(caseRecord.reviewOn)}`) : null,
        s.owner
          ? h(
              'a',
              {
                href: `#/people/${s.owner.id}`,
                onClick: (e) => {
                  e.preventDefault();
                  ctx.navigate(`#/people/${s.owner.id}`);
                },
              },
              `· Owner: ${s.owner.name}`,
            )
          : h('span', null, '· Owner: Leader-held'),
        s.linkedGoal ? h('span', null, `· Goal: ${s.linkedGoal.title}`) : null,
      ),
      actions,
    }),
    h(
      'div',
      { class: 'grid-2' },
      card({
        title: 'Engineering & Quality — FMEA & 5-Whys RCA',
        subtitle: 'Component risk drivers and blameless systemic guardrails.',
        body: fmeaRcaBody,
      }),
      card({
        title: 'Finance & Economics — 3-Point PERT & Mitigation ROI',
        subtitle: 'Probabilistic exposure, expected loss avoided, and capacity trade-offs.',
        body: pertBody,
      }),
    ),
    card({
      title: 'Political Science & Strategy — Mendelow Stakeholder Coalition Matrix',
      subtitle: 'Power × Interest positioning, coalition balance, and scheduled communication briefs.',
      body: coalitionBody,
    }),
    !s.open
      ? card({
          title: 'Settled Actuals vs Opening Forecast — Case-Cost Calibration',
          subtitle: 'What this case actually cost, scored against the forecast frozen when it was opened.',
          body: renderSettledActualsBody(ctx, caseRecord),
        })
      : null,
    card({
      title: 'Connected System Graph & Parallel Automation Audit',
      subtitle: 'Live cross-module links to DACI decisions, delegations, OKRs, and blameless 1:1 prep.',
      body: graphBody,
    }),
  );
}

export function renderCaseDetailView(ctx, caseId) {
  const target = (ctx.state.cases || []).find((c) => c.id === caseId);
  if (!target) {
    return h(
      'div',
      { class: 'page stack-lg' },
      pageHeader({ title: 'Operational case not found', subtitle: 'That case may have been deleted or came from another workspace.' }),
      emptyState({
        title: 'Case not found',
        body: 'Return to the operational cases list to view active incidents, risks, and initiatives.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/cases') }, 'Back to operational cases'),
      }),
    );
  }
  return renderCaseDetail(ctx, target);
}

export function renderCases(ctx) {
  if (ctx.param) {
    return renderCaseDetailView(ctx, ctx.param);
  }

  const rollup = casesRollup(ctx.state, ctx.now);
  const rawFilter = ctx.query.get('filter') || 'open';
  const filter = FILTERS.includes(rawFilter) ? rawFilter : 'open';

  let list = rollup.all;
  if (filter === 'open') list = rollup.open;
  else if (filter === 'high') list = rollup.highPriority;
  else if (filter === 'coalition') {
    list = rollup.open.filter((s) => s.coalition.overdueComms.length > 0 || s.coalition.unalignedKeyPlayers.length > 0);
  } else if (filter === 'review') list = rollup.reviewDue;
  else if (filter === 'resolved') list = rollup.resolved;

  list = list.slice().sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    if (a.open !== b.open) return a.open ? -1 : 1;
    // Schema v33: rated cases sort by priority; unrated cases sort after
    // them — an arithmetic default must never outrank a recorded judgement.
    const ar = isFmeaRated(a.caseRecord?.fmea) ? 1 : 0;
    const br = isFmeaRated(b.caseRecord?.fmea) ? 1 : 0;
    if (ar !== br) return br - ar;
    return (rank[b.fmea.actionPriority] - rank[a.fmea.actionPriority]) || (b.fmea.rpn - a.fmea.rpn);
  });

  const renderCaseCard = (s) => {
    const c = s.caseRecord;
    return h(
      'article',
      { class: 'card case-summary-card', 'data-case-id': c.id },
      h(
        'div',
        { class: 'card-body stack-sm' },
        h(
          'div',
          { class: 'row-between' },
          h(
            'div',
            null,
            h(
              'h2',
              { class: 'card-title' },
              h(
                'a',
                {
                  href: `#/cases/${c.id}`,
                  onClick: (e) => {
                    e.preventDefault();
                    ctx.navigate(`#/cases/${c.id}`);
                  },
                },
                c.title,
              ),
            ),
            h(
              'p',
              { class: 'muted tiny' },
              `${CASE_KIND_LABELS[c.kind] || c.kind} · ${CASE_STATUS_LABELS[c.status] || c.status} · Opened ${formatDate(c.openedOn)}${s.owner ? ` · Owner: ${s.owner.name}` : ''}`,
            ),
          ),
          h(
            'div',
            { class: 'row-gap' },
            isFmeaRated(c.fmea)
              ? badge(`FMEA ${s.fmea.actionPriority.toUpperCase()} · RPN ${s.fmea.rpn}`, PRIORITY_TONE[s.fmea.actionPriority])
              : badge('Rating needed', 'caution'),
            s.reviewOverdue ? badge('Review overdue', 'bad') : null,
            s.coalition.overdueComms.length > 0 ? badge(`${s.coalition.overdueComms.length} brief(s) overdue`, 'caution') : null,
          ),
        ),
        c.summary ? h('p', { class: 'small' }, c.summary) : null,
        h(
          'div',
          { class: 'kv-grid' },
          kv(
            'PERT Expected Exposure',
            s.pert.hasFinancialEstimate
              ? `${fmtMoney(s.pert.currency, s.pert.cost.expected)} (P90 ${fmtMoney(s.pert.currency, s.pert.cost.p90)})`
              : 'Not estimated',
          ),
          kv(
            'Mitigation ROI / Net Value',
            s.pert.mitigationRoi !== null
              ? `${(s.pert.mitigationRoi * 100).toFixed(0)}% (${fmtMoney(s.pert.currency, s.pert.netRiskAdjustedValue)})`
              : s.pert.hasFinancialEstimate && s.pert.expectedUnmitigatedLoss !== null
                ? `Unmitigated EV ${fmtMoney(s.pert.currency, s.pert.expectedUnmitigatedLoss)}`
                : s.pert.hasFinancialEstimate ? 'Unknown — occurrence not rated' : '—',
          ),
          kv(
            'Diverted Capacity',
            s.pert.hasCapacityEstimate ? `${s.pert.capacity.expected}d (P90 ${s.pert.capacity.p90}d)` : '—',
          ),
          kv(
            'Systemic Barrier & Coalition',
            `${s.rca.systemicBarrier ? 'Guardrail defined' : 'Barrier pending'} · ${s.coalition.total} stakeholder(s)`,
          ),
          !s.open
            ? kv(
                'Settled actuals',
                c.actuals
                  ? `${c.actuals.materialised === true ? 'Materialised' : c.actuals.materialised === false ? 'Did not materialise' : 'Outcome recorded'}${c.actuals.realisedExposure !== null && c.actuals.realisedExposure !== undefined ? ` · ${fmtMoney(s.pert.currency, c.actuals.realisedExposure)} realised` : ''}${c.actuals.divertedDays !== null && c.actuals.divertedDays !== undefined ? ` · ${c.actuals.divertedDays}d diverted` : ''}`
                  : 'Not recorded — opening forecast unscored',
              )
            : null,
        ),
        renderLinksStrip(s.links, ctx),
        h(
          'div',
          { class: 'row-between' },
          h(
            'span',
            { class: 'muted tiny' },
            s.pert.opportunityCost ? `Trade-off: ${s.pert.opportunityCost}` : 'No explicit trade-off recorded yet',
          ),
          h(
            'div',
            { class: 'row-gap' },
            h(
              'button',
              { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => ctx.navigate(`#/cases/${c.id}`) },
              'Open case',
            ),
            h(
              'button',
              { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => openCaseDialog(ctx, { caseRecord: c }) },
              'Edit',
            ),
            s.open
              ? h(
                  'button',
                  { class: 'btn btn-primary btn-small', type: 'button', onClick: () => openResolveCaseDialog(ctx, c) },
                  'Resolve',
                )
              : h(
                  'button',
                  { class: 'btn btn-secondary btn-small', type: 'button', onClick: () => openRecordCaseActualsDialog(ctx, c) },
                  c.actuals ? 'Edit actuals' : 'Record actuals',
                ),
          ),
        ),
      ),
    );
  };

  return h(
    'div',
    { class: 'page stack-lg' },
    pageHeader({
      eyebrow: 'Risk, RCA, Economics & Stakeholder Coalition',
      title: 'Operational cases',
      subtitle:
        'Register an incident, delivery risk, escalation, or strategic initiative once — LeadOS computes FMEA priority, 3-point PERT expected value, 5-Whys systemic barriers, and Mendelow coalition strategy while updating connected modules in parallel.',
      actions: [
        h(
          'button',
          {
            class: 'btn btn-primary',
            type: 'button',
            onClick: () =>
              openCaseDialog(ctx, {
                onSaved: (res) => {
                  if (res?.id) ctx.navigate(`#/cases/${res.id}`);
                },
              }),
          },
          '+ Register case',
        ),
      ],
    }),
    h(
      'div',
      { class: 'stat-grid' },
      stat({
        label: 'Open cases',
        value: String(rollup.open.length),
        hint: `${rollup.highPriority.length} High Action Priority (FMEA)`,
        tone: rollup.highPriority.length > 0 ? 'bad' : 'good',
      }),
      stat({
        label: 'PERT expected exposure',
        value: rollup.expectedExposure > 0 ? fmtMoney(rollup.primaryCurrency, rollup.expectedExposure) : '—',
        hint: rollup.p90Exposure > 0 ? `P90 tail: ${fmtMoney(rollup.primaryCurrency, rollup.p90Exposure)}` : 'No active cost estimates',
      }),
      stat({
        label: 'Net risk-adjusted value',
        value: rollup.valuedCases > 0 ? fmtMoney(rollup.primaryCurrency, rollup.netRiskAdjustedValue) : '—',
        hint: rollup.unvaluedCases > 0
          ? `${rollup.unvaluedCases} estimated case(s) omitted: FMEA not rated`
          : rollup.totalMitigationCost > 0 ? `Mitigation cost: ${fmtMoney(rollup.primaryCurrency, rollup.totalMitigationCost)}` : 'Expected loss avoided minus cost',
        tone: rollup.netRiskAdjustedValue > 0 ? 'good' : '',
      }),
      stat({
        label: 'Diverted capacity (PERT)',
        value: rollup.expectedDivertedDays > 0 ? `${rollup.expectedDivertedDays}d` : '0d',
        hint: rollup.p90DivertedDays > 0 ? `P90 tail: ${rollup.p90DivertedDays} person-days` : 'No diverted capacity logged',
        tone: rollup.expectedDivertedDays >= 10 ? 'caution' : '',
      }),
      stat({
        label: 'Coalition checkpoints',
        value: String(rollup.commsOverdueCount + rollup.unalignedKeyCount),
        hint: `${rollup.commsOverdueCount} brief(s) overdue · ${rollup.unalignedKeyCount} skeptical/blocker key player(s)`,
        tone: rollup.commsOverdueCount > 0 ? 'caution' : '',
      }),
    ),
    renderCaseCalibrationCard(ctx),
    tabs({
      ariaLabel: 'Filter operational cases',
      active: filter,
      onSelect: (key) => ctx.navigate(`#/cases?filter=${key}`),
      items: [
        { key: 'open', label: 'Open', count: rollup.open.length },
        { key: 'high', label: 'High priority (FMEA)', count: rollup.highPriority.length },
        {
          key: 'coalition',
          label: 'Coalition attention',
          count: rollup.open.filter((s) => s.coalition.overdueComms.length > 0 || s.coalition.unalignedKeyPlayers.length > 0).length,
        },
        { key: 'review', label: 'Review overdue', count: rollup.reviewDue.length },
        { key: 'resolved', label: 'Resolved', count: rollup.resolved.length },
        { key: 'all', label: 'All', count: rollup.all.length },
      ],
    }),
    list.length
      ? h('div', { class: 'stack-md' }, ...list.map(renderCaseCard))
      : emptyState({
          title: rollup.all.length === 0 ? 'No operational cases registered yet' : 'No cases match this filter',
          body:
            rollup.all.length === 0
              ? 'When an incident, vendor risk, cross-team escalation, or strategic initiative lands, register it here to model FMEA risk, PERT financial/capacity trade-offs, 5-Whys barriers, and stakeholder alignment in one connected record.'
              : 'Switch filters above or register a new operational case.',
          action: h(
            'button',
            { class: 'btn btn-primary', type: 'button', onClick: () => openCaseDialog(ctx) },
            'Register first operational case',
          ),
        }),
    card({
      title: 'Active Cross-Module Automation Rules',
      subtitle: 'Deterministic rules evaluated in parallel whenever an Operational Case or linked mitigation changes.',
      body: h(
        'div',
        { class: 'case-rules-grid' },
        ...AUTOMATION_RULES.map((rule) =>
          h(
            'div',
            { class: 'case-rule-card' },
            h(
              'div',
              { class: 'row-between' },
              h('strong', { class: 'small' }, rule.name),
              badge(rule.id, 'neutral'),
            ),
            h('p', { class: 'muted tiny' }, `${rule.framework} · Target: ${rule.targetModule}`),
            h('p', { class: 'small' }, rule.description),
          ),
        ),
      ),
    }),
  );
}
