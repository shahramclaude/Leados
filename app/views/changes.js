/**
 * app/views/changes.js — Organizational Design, Team Topologies & Change
 * Execution Workspace (`#/changes` and `#/changes/:id`).
 */

import { h, confirmDialog, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, kv, tabs, banner } from '../ui/components.js';
import { xmrChart } from '../ui/charts.js';
import { formatDate } from '../core/time.js';
import {
  MENDELOW_QUADRANTS,
  STAKEHOLDER_STANCE_LABELS,
} from '../core/domain/cases.js';
import {
  CHANGE_KIND_LABELS,
  CHANGE_STATUS_LABELS,
  FORCE_CATEGORY_LABELS,
  changesRollup,
  summarizeChange,
} from '../core/domain/changes.js';
import { AUTOMATION_RULES } from '../core/domain/automation.js';
import {
  openAddChangeMetricDialog,
  openAddChangeWinDialog,
  openChangeDialog,
  openCoalitionBriefDialog,
  openRecordMetricPointDialog,
  openSetChangeStatusDialog,
} from '../ui/change-modals.js';

const STATUS_TONE = {
  proposed: 'neutral',
  active: 'accent',
  stabilising: 'caution',
  anchored: 'good',
  paused: 'caution',
  abandoned: 'bad',
};

const STANCE_TONE = {
  champion: 'good',
  supportive: 'good',
  neutral: 'neutral',
  skeptical: 'caution',
  blocker: 'bad',
};

const FILTERS = ['open', 'blocked', 'overload', 'anchored', 'all'];

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

function renderChangeDetail(ctx, change) {
  const s = summarizeChange(change, ctx.state, ctx.now);
  const owner = s.owner;
  const linkedGoal = s.linkedGoal;

  const backBtn = h(
    'button',
    { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate('#/changes') },
    '← All changes',
  );
  const editBtn = h(
    'button',
    { class: 'btn btn-ghost', type: 'button', onClick: () => openChangeDialog(ctx, change) },
    'Edit design',
  );
  const statusBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onClick: () => openSetChangeStatusDialog(ctx, change, change.status === 'proposed' ? 'active' : 'anchored'),
    },
    change.status === 'proposed' ? 'Activate change' : change.status === 'anchored' ? 'Update status' : 'Anchor / update status',
  );
  const deleteBtn = h(
    'button',
    {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Delete organizational change?',
          message: `Remove “${change.title}” and release its linked capacity reserve? Linked DACI decisions, OKRs, and 30-60-90 plans remain intact.`,
          confirmLabel: 'Delete change',
          danger: true,
        });
        if (!ok) return;
        const res = ctx.api.deleteChange(change.id);
        if (!res.ok) {
          toast(res.error, 'bad');
          return;
        }
        toast('Organizational change deleted', 'good');
        ctx.navigate('#/changes');
      },
    },
    'Delete',
  );

  const warnings = [];
  if (s.committed && s.kotter.hasSkippedFoundations) {
    warnings.push(
      banner({
        tone: 'caution',
        title: `Kotter foundational skip: ${s.kotter.skippedSteps.length} earlier step(s) incomplete or unbacked`,
        body: `Skipped: ${s.kotter.skippedSteps.map((st) => st.label).join(', ')}. Advancing execution before securing urgency, coalition, or vision creates false momentum.`,
      }),
    );
  }
  if (s.committed && (s.forceField.equilibrium === 'blocked' || s.forceField.highTensionStalemate)) {
    warnings.push(
      banner({
        tone: 'bad',
        title: s.forceField.highTensionStalemate
          ? 'Lewin Force-Field high-tension stalemate'
          : 'Restraining barriers outweigh driving forces',
        body: `Driving sum +${s.forceField.drivingSum} vs effective restraining −${s.forceField.effectiveRestrainingSum}. Weaken or mitigate restraining forces directly rather than piling on top-down pressure.`,
      }),
    );
  }
  if (s.star.incentiveMismatchWarning) {
    warnings.push(
      banner({
        tone: 'caution',
        title: 'Galbraith Star / Holmström–Milgrom incentive mismatch',
        body: s.star.incentiveMismatchWarning,
      }),
    );
  }

  const alignedVeto = s.coalition.vetoPlayers.length - s.coalition.unalignedVetoPlayers.length;

  return h(
    'div',
    { class: 'page stack' },
    pageHeader({
      eyebrow: `${CHANGE_KIND_LABELS[change.kind] || change.kind} · Opened ${formatDate(change.openedOn)}`,
      title: change.title,
      subtitle: change.summary || 'Organizational boundary, charter, and change execution record.',
      meta: h(
        'div',
        { class: 'row-wrap' },
        badge(CHANGE_STATUS_LABELS[change.status] || change.status, STATUS_TONE[change.status] || 'neutral'),
        badge(`Kotter ${s.kotter.currentMeta.label}`, 'accent'),
        badge(change.reversibility === 'reversible' ? 'Reversible experiment' : 'Irreversible / Type-1', change.reversibility === 'reversible' ? 'good' : 'caution'),
        owner
          ? h('a', { class: 'badge badge-neutral', href: `#/people/${owner.id}` }, `Owner: ${owner.name}`)
          : badge('Owner: Leader', 'neutral'),
        linkedGoal
          ? h('a', { class: 'badge badge-neutral', href: '#/goals' }, `Goal: ${linkedGoal.title}`)
          : null,
      ),
      actions: [backBtn, editBtn, statusBtn, deleteBtn],
    }),

    ...warnings,

    h(
      'div',
      { class: 'stats-grid' },
      stat({
        label: 'Kotter progression',
        value: `${s.kotter.completedCount} / 8`,
        hint: `Focus: ${s.kotter.currentMeta.label}`,
        tone: s.kotter.hasSkippedFoundations ? 'warn' : 'good',
      }),
      stat({
        label: 'Force-field balance',
        value: `${s.forceField.netBalance >= 0 ? '+' : ''}${s.forceField.netBalance}`,
        hint: `+${s.forceField.drivingSum} driving · −${s.forceField.effectiveRestrainingSum} restraining`,
        tone: s.forceField.equilibrium === 'favorable' ? 'good' : s.forceField.equilibrium === 'blocked' ? 'bad' : 'warn',
      }),
      stat({
        label: 'Cognitive load shift',
        value: s.topology.loadMeasured ? `${s.topology.cognitiveLoadBefore} → ${s.topology.cognitiveLoadTarget}/5` : 'Unrated',
        hint: s.topology.handoffsDelta !== null ? `Blocking handoffs Δ ${s.topology.handoffsDelta}` : s.topology.targetTypeLabel,
        tone: (s.topology.cognitiveLoadTarget ?? 0) >= 4 ? 'bad' : 'good',
      }),
      stat({
        label: 'Veto coalition & PERT',
        value: s.coalition.vetoPlayers.length
          ? `${alignedVeto}/${s.coalition.vetoPlayers.length} veto`
          : `${s.coalition.total} mapped`,
        hint: s.economics.effort.measured ? `${s.economics.effort.expected}d PERT effort reserved` : 'No effort estimate',
        tone: s.coalition.unalignedVetoPlayers.length === 0 ? 'good' : 'warn',
      }),
    ),

    card({
      title: 'Connected across LeadOS',
      subtitle: 'Live cross-module graph linking capacity reserves, DACI charter decisions, OKRs, role transitions, and operational cases.',
      body: renderLinksStrip(s.links, ctx),
    }),

    card({
      title: 'Kotter 8-Step Execution Track',
      subtitle: 'Tick steps as real evidence lands, or set the active step focus. Skipping early steps surfaces an immediate structural warning.',
      body: h(
        'div',
        { class: 'kotter-grid' },
        ...s.kotter.stepChecks.map((st) =>
          h(
            'div',
            {
              class: `subcard kotter-step${st.current ? ' kotter-current' : ''}${st.skipped ? ' kotter-skipped' : ''}`,
            },
            h(
              'div',
              { class: 'row-between' },
              h('strong', { class: 'small' }, st.label),
              st.completed
                ? badge('Done', 'good')
                : st.skipped
                  ? badge('Skipped', 'caution')
                  : st.current
                    ? badge('Focus', 'accent')
                    : badge('Pending', 'neutral'),
            ),
            h('p', { class: 'muted tiny' }, st.note),
            h(
              'div',
              { class: 'row-wrap' },
              h(
                'button',
                {
                  class: 'btn btn-ghost btn-sm',
                  type: 'button',
                  onClick: () => ctx.api.toggleKotterStep(change.id, st.key),
                },
                st.completed ? `Reopen ${st.label}` : `Complete ${st.label}`,
              ),
              !st.current
                ? h(
                    'button',
                    {
                      class: 'btn btn-ghost btn-sm',
                      type: 'button',
                      onClick: () => ctx.api.toggleKotterStep(change.id, st.key, { setAsCurrent: true }),
                    },
                    `Focus ${st.label}`,
                  )
                : null,
            ),
          ),
        ),
      ),
    }),

    h(
      'div',
      { class: 'grid-2' },
      card({
        title: 'Team Topologies & Sweller Cognitive Load',
        subtitle: 'Conway’s Law inverse maneuver: shape team boundaries and APIs so cognitive load fits human working memory.',
        body: h(
          'div',
          { class: 'stack-sm' },
          kv('Target team / pod', s.topology.teamName || '—'),
          kv('Current → Target topology', `${s.topology.currentTypeLabel.split(' ')[0]} → ${s.topology.targetTypeLabel}`),
          kv('Interaction mode', s.topology.interactionModeLabel),
          kv(
            'Inter-team Brooks channels',
            `${s.topology.collaboratingTeamsCount} collaborating team(s) · ${s.topology.coordinationChannels} bilateral coordination path(s)`,
          ),
          s.topology.handoffsMeasured
            ? kv(
                'Cross-team blocking handoffs',
                `${s.topology.blockingHandoffsBefore} → ${s.topology.blockingHandoffsTarget} (${s.topology.handoffsDelta > 0 ? `+${s.topology.handoffsDelta}` : s.topology.handoffsDelta})`,
              )
            : null,
          s.topology.loadMeasured
            ? kv('Cognitive load (1–5)', `${s.topology.cognitiveLoadBefore}/5 → ${s.topology.cognitiveLoadTarget}/5`)
            : h('p', { class: 'muted small' }, 'Cognitive load not yet rated.'),
          ...s.topology.antiPatterns.map((ap) =>
            h('p', { class: 'note note-warn small' }, `${ap.title}: ${ap.detail}`),
          ),
        ),
      }),

      card({
        title: 'Vision, Non-Goals & Galbraith 5-Point Star',
        subtitle: `Aligned Star pillars: ${s.star.alignedCount}/5 · Porter explicit trade-offs`,
        body: h(
          'div',
          { class: 'stack-sm' },
          kv('Target vision', change.vision || 'Not yet written'),
          kv('Explicit non-goals (stop doing)', change.nonGoals || 'None recorded — risk of scope accumulation'),
          ...s.star.pillars.map((pt) => kv(`Star · ${pt.label}`, pt.text || '—')),
        ),
      }),
    ),

    card({
      title: 'Lewin Force-Field Analysis',
      subtitle: 'Equilibrium shifts sustainably when restraining barriers are mitigated or removed, not merely overpowered.',
      body: h(
        'div',
        { class: 'grid-2' },
        h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'eyebrow' }, `Driving Forces (+${s.forceField.drivingSum})`),
          s.forceField.driving.length
            ? h(
                'div',
                { class: 'stack-sm' },
                ...s.forceField.driving.map((f) =>
                  h(
                    'div',
                    { class: 'subcard row-between' },
                    h(
                      'div',
                      null,
                      h('strong', { class: 'small' }, f.label),
                      h('p', { class: 'muted tiny' }, FORCE_CATEGORY_LABELS[f.category] || f.category),
                    ),
                    badge(`+${f.weight}/5`, 'good'),
                  ),
                ),
              )
            : h('p', { class: 'muted small' }, 'No driving forces recorded.'),
        ),
        h(
          'div',
          { class: 'stack-sm' },
          h('h3', { class: 'eyebrow' }, `Restraining Barriers (−${s.forceField.effectiveRestrainingSum} effective)`),
          s.forceField.restraining.length
            ? h(
                'div',
                { class: 'stack-sm' },
                ...s.forceField.restraining.map((f) =>
                  h(
                    'div',
                    { class: 'subcard stack-xs' },
                    h(
                      'div',
                      { class: 'row-between' },
                      h('strong', { class: 'small' }, f.label),
                      h(
                        'div',
                        { class: 'row-wrap' },
                        badge(f.mitigated ? `Mitigated (−${f.effectiveWeight})` : `−${f.weight}/5`, f.mitigated ? 'good' : 'bad'),
                        badge(FORCE_CATEGORY_LABELS[f.category] || f.category, 'neutral'),
                      ),
                    ),
                    f.mitigation ? h('p', { class: 'muted small' }, `Mitigation: ${f.mitigation}`) : null,
                    h(
                      'div',
                      { class: 'row-wrap' },
                      h(
                        'button',
                        {
                          class: 'btn btn-ghost btn-sm',
                          type: 'button',
                          onClick: () => ctx.api.toggleChangeForceMitigated(change.id, f.id),
                        },
                        f.mitigated ? 'Reopen barrier' : 'Mark mitigated',
                      ),
                      !f.mitigated
                        ? h(
                            'button',
                            {
                              class: 'btn btn-ghost btn-sm',
                              type: 'button',
                              onClick: () => {
                                const res = ctx.api.escalateForceToCase(change.id, f.id);
                                if (!res.ok) {
                                  toast(res.error, 'bad');
                                  return;
                                }
                                toast('Escalated barrier to Operational Case', 'good');
                                ctx.navigate(`#/cases/${res.id}`);
                              },
                            },
                            'Escalate to Case',
                          )
                        : null,
                    ),
                  ),
                ),
              )
            : h('p', { class: 'muted small' }, 'No restraining barriers recorded.'),
        ),
      ),
    }),

    h(
      'div',
      { class: 'grid-2' },
      card({
        title: 'Guiding Coalition & Tsebelis Veto Players',
        subtitle: 'Mendelow Power × Interest mapping with explicit gatekeeper alignment tracking.',
        body: s.coalition.members.length
          ? h(
              'div',
              { class: 'stack-sm' },
              ...s.coalition.members.map((m) => {
                const isAligned = m.stance === 'champion' || m.stance === 'supportive';
                return h(
                  'div',
                  { class: 'subcard stack-xs' },
                  h(
                    'div',
                    { class: 'row-between' },
                    h(
                      'div',
                      null,
                      h('strong', null, m.name),
                      m.role ? h('span', { class: 'muted small' }, ` · ${m.role}`) : null,
                    ),
                    h(
                      'div',
                      { class: 'row-wrap' },
                      m.vetoPlayer ? badge('Veto player', isAligned ? 'good' : 'bad') : null,
                      badge(STAKEHOLDER_STANCE_LABELS[m.stance] || m.stance, STANCE_TONE[m.stance] || 'neutral'),
                      badge(MENDELOW_QUADRANTS[m.quadrant]?.label || m.quadrant, 'neutral'),
                    ),
                  ),
                  m.keyMessage ? h('p', { class: 'small' }, m.keyMessage) : null,
                  h(
                    'div',
                    { class: 'row-between' },
                    h(
                      'span',
                      { class: 'muted tiny' },
                      `Last briefed: ${m.lastBriefedOn ? formatDate(m.lastBriefedOn) : 'Never'}${m.nextBriefOn ? ` · Next: ${formatDate(m.nextBriefOn)}${m.briefOverdue ? ' (Overdue)' : ''}` : ''}`,
                    ),
                    h(
                      'button',
                      {
                        class: 'btn btn-ghost btn-sm',
                        type: 'button',
                        onClick: () => openCoalitionBriefDialog(ctx, change, m),
                      },
                      `Log briefing (${m.name})`,
                    ),
                  ),
                );
              }),
            )
          : h('p', { class: 'muted small' }, 'No coalition stakeholders mapped yet.'),
      }),

      card({
        title: 'Impacted People, Transitions & Economics',
        subtitle: 'Watkins 30-60-90 role transitions, PERT effort reserves, and J-Curve payback.',
        body: h(
          'div',
          { class: 'stack-sm' },
          s.economics.effort.measured
            ? kv(
                'PERT transition effort',
                `${s.economics.effort.expected} person-days (P10 ${s.economics.effort.p10}d – P90 ${s.economics.effort.p90}d)`,
              )
            : kv('PERT transition effort', 'Not estimated'),
          s.economics.financialMeasured
            ? kv(
                'Transition cost & payback',
                `${fmtMoney(s.economics.currency, s.economics.transitionCost)} cost${s.economics.expectedPaybackMonths !== null ? ` · Payback ~${s.economics.expectedPaybackMonths} mo` : ''}${s.economics.riskAdjustedNetBenefit !== null ? ` · Feasibility-adj net ${fmtMoney(s.economics.currency, s.economics.riskAdjustedNetBenefit)}` : ''}`,
              )
            : null,
          h('h3', { class: 'eyebrow' }, `Impacted Team Members (${s.impacts.length})`),
          s.impacts.length
            ? h(
                'div',
                { class: 'stack-xs' },
                ...s.impacts.map((imp) => {
                  const p = imp.person;
                  return h(
                    'div',
                    { class: 'subcard row-between' },
                    h(
                      'div',
                      null,
                      p
                        ? h('a', { href: `#/people/${p.id}` }, h('strong', null, p.name))
                        : h('strong', null, 'Former member'),
                      h(
                        'p',
                        { class: 'muted tiny' },
                        `${imp.impactLabel}${imp.newRoleLabel ? ` → ${imp.newRoleLabel}` : ''}`,
                      ),
                    ),
                    h(
                      'div',
                      { class: 'row-wrap' },
                      p ? h('a', { class: 'btn btn-ghost btn-sm', href: `#/prep/${p.id}` }, `1:1 Prep (${p.name})`) : null,
                      imp.activeTransition || imp.createTransitionPlan
                        ? h('a', { class: 'btn btn-ghost btn-sm', href: '#/onboarding' }, '30-60-90')
                        : null,
                    ),
                  );
                }),
              )
            : h('p', { class: 'muted small' }, 'No impacted team members listed.'),
        ),
      }),
    ),

    card({
      title: 'Shewhart XmR Process Behaviour Telemetry & Short-Term Wins',
      subtitle: 'Verify with Statistical Process Control (X̄ ± 2.66 mR̄) that operational metrics genuinely shifted beyond routine noise before anchoring.',
      actions: [
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openAddChangeWinDialog(ctx, change) }, '+ Record win'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => openAddChangeMetricDialog(ctx, change) }, '+ Add XmR metric'),
      ],
      body: h(
        'div',
        { class: 'stack' },
        (change.shortTermWins || []).length
          ? h(
              'div',
              { class: 'stack-xs' },
              h('h3', { class: 'eyebrow' }, `Kotter Step 6 Short-Term Wins (${change.shortTermWins.length})`),
              ...change.shortTermWins.map((w) =>
                h(
                  'div',
                  { class: 'subcard row-between' },
                  h(
                    'div',
                    null,
                    h('strong', { class: 'small' }, w.text),
                    h('p', { class: 'muted tiny' }, formatDate(w.achievedOn)),
                  ),
                  h(
                    'button',
                    {
                      class: 'btn btn-ghost btn-sm',
                      type: 'button',
                      onClick: () => ctx.api.deleteChangeWin(change.id, w.id),
                    },
                    'Remove win',
                  ),
                ),
              ),
            )
          : null,

        s.metrics.rows.length
          ? h(
              'div',
              { class: 'stack' },
              ...s.metrics.rows.map((row) =>
                h(
                  'div',
                  { class: 'subcard stack-sm' },
                  h(
                    'div',
                    { class: 'row-between' },
                    h(
                      'div',
                      null,
                      h('strong', null, row.name),
                      h(
                        'span',
                        { class: 'muted small' },
                        ` · ${row.desirableDirection === 'lower' ? 'Lower is better' : 'Higher is better'}`,
                      ),
                    ),
                    h(
                      'div',
                      { class: 'row-wrap' },
                      row.shift.statisticallyVerified
                        ? badge('Verified XmR shift', 'good')
                        : row.shift.verdict === 'adverse-shift'
                          ? badge('Adverse shift', 'bad')
                          : row.spc.available
                            ? badge('XmR active', 'neutral')
                            : badge(`${row.spc.measuredCount}/4 pts for XmR`, 'caution'),
                      h(
                        'button',
                        {
                          class: 'btn btn-primary btn-sm',
                          type: 'button',
                          onClick: () => openRecordMetricPointDialog(ctx, change, row),
                        },
                        `+ Log observation (${row.name})`,
                      ),
                      h(
                        'button',
                        {
                          class: 'btn btn-ghost btn-sm',
                          type: 'button',
                          onClick: () => ctx.api.deleteChangeMetric(change.id, row.id),
                        },
                        `Delete metric (${row.name})`,
                      ),
                    ),
                  ),
                  h('p', { class: 'small muted' }, row.shift.summary),
                  xmrChart(row.spc, {
                    title: row.name,
                    unit: row.unit || '',
                  }),
                ),
              ),
            )
          : h('p', { class: 'muted small' }, 'No process metrics attached yet. Add a metric (e.g. deploy wait, handoff time, interrupt load) to track whether the redesign shifts real operating behaviour.'),
      ),
    }),
  );
}

export function renderChangeDetailView(ctx, changeId) {
  const found = (ctx.state.changes || []).find((c) => c.id === changeId);
  if (!found) {
    return h(
      'div',
      { class: 'page stack' },
      pageHeader({ title: 'Organizational change not found' }),
      emptyState({
        title: 'That change record does not exist',
        body: 'It may have been deleted or belong to a different workspace.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ctx.navigate('#/changes') }, 'Back to Org Design & Change'),
      }),
    );
  }
  return renderChangeDetail(ctx, found);
}

export function renderChanges(ctx) {
  const detailId = ctx.params?.id || null;
  if (detailId) return renderChangeDetailView(ctx, detailId);

  const activeFilter = FILTERS.includes(ctx.query?.get('filter')) ? ctx.query.get('filter') : 'open';
  const rollup = changesRollup(ctx.state, ctx.now);
  const chgRules = AUTOMATION_RULES.filter((r) => r.id.startsWith('RULE-CHG-'));

  const filtered = rollup.all.filter((s) => {
    if (activeFilter === 'open') return s.open;
    if (activeFilter === 'blocked') {
      return s.open && (s.forceField.equilibrium === 'blocked' || s.forceField.highTensionStalemate || s.coalition.unalignedVetoPlayers.length > 0);
    }
    if (activeFilter === 'overload') {
      return s.open && s.topology.antiPatterns.length > 0;
    }
    if (activeFilter === 'anchored') return s.change.status === 'anchored';
    return true;
  });

  const syncBtn = h(
    'button',
    {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: () => {
        const res = ctx.api.syncChanges();
        if (!res.ok) {
          toast(res.error, 'bad');
          return;
        }
        toast(
          res.propagations.length
            ? `Synced ${res.propagations.length} cross-module link(s) & reserve(s)`
            : 'All change reserves, decisions, and transitions are already in sync',
          'good',
        );
      },
    },
    'Sync cross-module plan',
  );

  const createBtn = h(
    'button',
    { class: 'btn btn-primary', type: 'button', onClick: () => openChangeDialog(ctx) },
    '+ Design change',
  );

  const verifiedTotal = rollup.all.filter((s) => s.metrics.verifiedShiftCount > 0).length;

  return h(
    'div',
    { class: 'page stack' },
    pageHeader({
      eyebrow: 'Systems · Structure · Coalition · Telemetry',
      title: 'Org design, topologies & change',
      subtitle: 'Shape stream-aligned team boundaries, manage cognitive load, clear force-field barriers, and verify real improvements with Shewhart XmR charts before anchoring.',
      actions: [syncBtn, createBtn],
    }),

    h(
      'div',
      { class: 'stats-grid' },
      stat({
        label: 'Open changes',
        value: String(rollup.open.length),
        hint: `${rollup.committed.length} committed · ${rollup.anchored.length} anchored`,
      }),
      stat({
        label: 'Blockers & veto gaps',
        value: String(rollup.unmitigatedBlockerCount + rollup.unalignedVetoCount),
        hint: `${rollup.unmitigatedBlockerCount} severe barrier(s) · ${rollup.unalignedVetoCount} veto gap(s)`,
        tone: rollup.unmitigatedBlockerCount + rollup.unalignedVetoCount > 0 ? 'bad' : 'good',
      }),
      stat({
        label: 'Needing attention',
        value: String(rollup.attention.length),
        hint: `${rollup.overdueBriefsCount} coalition brief(s) overdue`,
        tone: rollup.attention.length > 0 ? 'warn' : 'good',
      }),
      stat({
        label: 'Transition effort reserved',
        value: `${rollup.committedEffortDays}d`,
        hint: `${verifiedTotal} change(s) with verified XmR shift`,
        tone: 'accent',
      }),
    ),

    tabs({
      items: [
        { key: 'open', label: `Open (${rollup.open.length})` },
        { key: 'blocked', label: 'Blocked / Veto gap' },
        { key: 'overload', label: 'Topology & load' },
        { key: 'anchored', label: `Anchored (${rollup.anchored.length})` },
        { key: 'all', label: `All (${rollup.total})` },
      ],
      active: activeFilter,
      onSelect: (k) => ctx.navigate(`#/changes?filter=${k}`),
    }),

    filtered.length === 0
      ? emptyState({
          title: rollup.total === 0 ? 'No organizational changes designed yet' : 'No changes match this filter',
          body: 'Use this workspace before splitting pods, changing reporting lines, or rewriting cross-team handoff contracts — so capacity reserves, DACI charters, 30-60-90 role transitions, and XmR telemetry stay connected.',
          action: createBtn,
        })
      : h(
          'div',
          { class: 'stack' },
          ...filtered.map((s) =>
            card({
              title: s.change.title,
              subtitle: `${CHANGE_KIND_LABELS[s.change.kind] || s.change.kind} · ${s.topology.teamName || 'Team boundary'}${s.owner ? ` · Owner: ${s.owner.name}` : ''}`,
              actions: [
                badge(CHANGE_STATUS_LABELS[s.change.status] || s.change.status, STATUS_TONE[s.change.status] || 'neutral'),
                h(
                  'a',
                  {
                    class: 'btn btn-ghost btn-sm',
                    href: `#/changes/${s.change.id}`,
                  },
                  `Open ${s.change.title} →`,
                ),
              ],
              body: h(
                'div',
                { class: 'stack-sm' },
                s.change.summary ? h('p', { class: 'small' }, s.change.summary) : null,
                h(
                  'div',
                  { class: 'row-wrap' },
                  badge(`Kotter ${s.kotter.completedCount}/8 · ${s.kotter.currentMeta.label}`, s.kotter.hasSkippedFoundations ? 'caution' : 'accent'),
                  badge(
                    `Force-field: ${s.forceField.netBalance >= 0 ? '+' : ''}${s.forceField.netBalance} (${s.forceField.equilibrium})`,
                    s.forceField.equilibrium === 'favorable' ? 'good' : s.forceField.equilibrium === 'blocked' ? 'bad' : 'caution',
                  ),
                  s.topology.loadMeasured
                    ? badge(`Load ${s.topology.cognitiveLoadBefore} → ${s.topology.cognitiveLoadTarget}/5`, (s.topology.cognitiveLoadTarget ?? 0) >= 4 ? 'bad' : 'good')
                    : null,
                  s.economics.effort.measured
                    ? badge(`${s.economics.effort.expected}d PERT effort`, 'neutral')
                    : null,
                  s.metrics.verifiedShiftCount > 0
                    ? badge(`${s.metrics.verifiedShiftCount} verified XmR shift`, 'good')
                    : null,
                ),
                renderLinksStrip(s.links, ctx),
              ),
            }),
          ),
        ),

    card({
      title: 'Event-Driven Organizational Change Rules',
      subtitle: 'Parallel + vertical cross-module propagations executed inside atomic store transactions.',
      body: h(
        'div',
        { class: 'stack-xs' },
        ...chgRules.map((r) =>
          h(
            'div',
            { class: 'subcard' },
            h(
              'div',
              { class: 'row-between' },
              h('strong', { class: 'small' }, `${r.id} — ${r.name}`),
              badge(r.targetModule, 'neutral'),
            ),
            h('p', { class: 'muted tiny' }, `${r.framework} · ${r.description}`),
          ),
        ),
      ),
    }),
  );
}
