/**
 * app/views/stakeholders.js — Stakeholder Influence Register
 * (`#/stakeholders` and `#/stakeholders/:id`).
 *
 * Renders the pure engine in core/domain/stakeholders.js: Mendelow power ×
 * interest matrix, Mitchell-Agle-Wood salience classes, Tsebelis veto
 * analysis and coalition-network blocs. All writes go through ctx.api; this
 * view only reads state and opens dialogs.
 */

import { h, confirmDialog, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, timeline } from '../ui/components.js';
import { formatDate } from '../core/time.js';
import {
  ADVERSE_STANCES,
  ALLIANCE_KIND_LABELS,
  ESTIMATE_CONFIDENCE_LABELS,
  STAKEHOLDER_CATEGORY_LABELS,
  buildCoalitionNetwork,
  initiativeVetoRisk,
  reconciliationReport,
  stakeholdersRollup,
  summarizeStakeholder,
} from '../core/domain/stakeholders.js';
import {
  MENDELOW_QUADRANTS,
  STAKEHOLDER_CADENCE_LABELS,
  STAKEHOLDER_STANCE_LABELS,
  classifyMendelowStakeholder,
} from '../core/domain/cases.js';
import {
  openStakeholderDialog,
  openStanceDialog,
  openContactDialog,
} from '../ui/stakeholder-modals.js';

const STANCE_TONE = {
  champion: 'good',
  supportive: 'good',
  neutral: 'neutral',
  skeptical: 'caution',
  blocker: 'bad',
};

const SALIENCE_TONE = {
  definitive: 'bad',
  dominant: 'caution',
  dangerous: 'caution',
  dependent: 'info',
  dormant: 'neutral',
  discretionary: 'neutral',
  demanding: 'info',
  minimal: 'neutral',
};

function button(label, onClick, primary = false, disabled = false) {
  return h('button', { type: 'button', class: `btn ${primary ? 'btn-primary' : 'btn-ghost'}`, onClick, disabled }, label);
}

function frameworkCard() {
  return card({
    title: 'How the political analysis works',
    body: h(
      'div',
      { class: 'prose small' },
      h('p', null,
        h('strong', null, 'Mendelow (1981): '),
        'power × interest sets the engagement quadrant and communication cadence.'),
      h('p', null,
        h('strong', null, 'Mitchell, Agle & Wood (1997): '),
        'salience combines power, legitimacy and urgency into seven classes — from dormant to definitive — and changes as urgency moves.'),
      h('p', null,
        h('strong', null, 'Tsebelis (1995, 2002): '),
        'veto players shrink the win-set. A stance-distance × power heuristic produces a change-difficulty band with a confidence label; it is not a formal spatial model.'),
      h('p', { class: 'muted' },
        'These are private leadership assessments. Stances, veto flags and notes are contextual-integrity governed: export scrubbing neutralizes them before a copy leaves the device.'),
    ),
  });
}

/* --------------------------------------------------------------- list view */

function renderMatrix(register, ctx) {
  // 5×5 grid, row 5 at the top. Quadrant background follows Mendelow's
  // threshold (≥3 on both axes = manage closely).
  const cells = [];
  for (let power = 5; power >= 1; power -= 1) {
    for (let interest = 1; interest <= 5; interest += 1) {
      const here = register.filter((s) => Number(s.record.power) === power && Number(s.record.interest) === interest);
      const quadrant = classifyMendelowStakeholder({ power, interest, stance: 'neutral' }).quadrant;
      cells.push(
        h(
          'div',
          { class: `stk-matrix-cell stk-q-${quadrant}`, 'data-power': power, 'data-interest': interest },
          h('span', { class: 'stk-matrix-coord tiny muted', 'aria-hidden': 'true' }, `${power}/${interest}`),
          ...here.map((profile) =>
            h(
              'a',
              {
                class: 'stk-matrix-chip',
                href: `#/stakeholders/${encodeURIComponent(profile.record.id)}`,
                title: `${profile.record.name} — ${profile.mendelow.quadrantLabel}`,
                onClick: (e) => {
                  e.preventDefault();
                  ctx.navigate(`#/stakeholders/${encodeURIComponent(profile.record.id)}`);
                },
              },
              profile.record.name.split(' ')[0],
            ),
          ),
        ),
      );
    }
  }
  return h(
    'div',
    { class: 'stack-md' },
    card({
      title: 'Mendelow power × interest matrix',
      subtitle: 'High power at the top, high interest to the right. Open a chip for the full dossier.',
      // No role="img": the grid contains interactive anchor chips, and an
      // img role would make those nested controls invalid to assistive tech.
      // The card's visible heading and per-chip titles carry the semantics.
      body: h('div', { class: 'stk-matrix', 'aria-describedby': 'stk-matrix-note' },
        h('span', { id: 'stk-matrix-note', class: 'sr-only' }, 'Five by five Mendelow matrix: rows are power from five at the top to one at the bottom, columns are interest one to five.'),
        ...cells),
    }),
    h(
      'div',
      { class: 'row-gap wrap' },
      ...Object.values(MENDELOW_QUADRANTS).map((q) =>
        h('span', { class: `pill stk-q-pill stk-q-${q.id}` }, `${q.label} — ${q.subtitle}`)),
    ),
  );
}

function renderNetwork(rollup, ctx) {
  const net = rollup.network;
  const byId = new Map(rollup.register.map((p) => [p.record.id, p]));
  return h(
    'div',
    { class: 'stack-md' },
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Alliance blocs', value: net.blocs.length, hint: 'union-find over alliance edges' }),
      stat({ label: 'Supportive power', value: net.supportivePower, tone: 'good', hint: 'summed ratings of champion/supportive actors' }),
      stat({ label: 'Opposing power', value: net.opposingPower, tone: net.opposingPower ? 'bad' : '', hint: 'summed ratings of skeptical/blocker actors' }),
      stat({ label: 'Hidden influencers', value: net.hiddenInfluencers.length, tone: net.hiddenInfluencers.length ? 'warn' : '', hint: 'informal out-influence without formal power' }),
    ),
    net.blocs.length
      ? card({
          title: 'Coalition blocs',
          body: h(
            'div',
            { class: 'stack-sm' },
            ...net.blocs.map((bloc) =>
              h(
                'div',
                { class: 'card stk-bloc' },
                h('div', { class: 'row-between' },
                  h('strong', null, `Bloc · ${bloc.leaning}`),
                  h('span', { class: 'muted small' }, `power ${bloc.power} · stance centroid ${bloc.centroid}`)),
                h('div', { class: 'row-gap wrap' },
                  ...bloc.memberIds.map((id) => {
                    const p = byId.get(id);
                    return h('a', {
                      class: 'case-link-pill',
                      href: `#/stakeholders/${encodeURIComponent(id)}`,
                      onClick: (e) => { e.preventDefault(); ctx.navigate(`#/stakeholders/${encodeURIComponent(id)}`); },
                    }, p ? p.record.name : id);
                  }),
                ),
              )),
          ),
        })
      : emptyState({ title: 'No alliance blocs yet', body: 'Add alliance relationships in a stakeholder dossier to group actors into blocs.' }),
    net.hiddenInfluencers.length
      ? card({
          title: 'Hidden influencers',
          subtitle: 'Low formal power, high informal out-influence — the people who shape decisions without owning them.',
          body: h('ul', { class: 'small' }, ...net.hiddenInfluencers.map((hi) =>
            h('li', null, h('strong', null, hi.name), ` — influence strength ${hi.influenceStrength}/10`))),
        })
      : null,
    card({
      title: 'Relationship edges',
      body: net.allianceEdges.length + net.oppositionPairs.length + net.influenceEdges.length
        ? h('ul', { class: 'small stack-xs' }, [
            ...net.allianceEdges.map((e) => h('li', null, `${byId.get(e.sourceId)?.record.name || e.sourceId} ⇄ ${byId.get(e.targetId)?.record.name || e.targetId} — allied (${e.strength}/5)`)),
            ...net.oppositionPairs.map((e) => h('li', { class: 'text-warn' }, `${byId.get(e.sourceId)?.record.name || e.sourceId} ⊖ ${byId.get(e.targetId)?.record.name || e.targetId} — opposed (${e.strength}/5)`)),
            ...net.influenceEdges.map((e) => h('li', null, `${byId.get(e.sourceId)?.record.name || e.sourceId} → ${byId.get(e.targetId)?.record.name || e.targetId} — influences (${e.strength}/5)`)),
          ])
        : h('p', { class: 'muted small' }, 'No relationships recorded yet.'),
    }),
  );
}

function renderRegisterTable(rollup, ctx) {
  if (!rollup.register.length) {
    return emptyState({
      icon: '♜',
      title: 'No stakeholders registered yet',
      body: 'Cases, changes and negotiations already carry embedded stakeholder stubs — register the real actors here to get salience classes, veto analysis and coalition blocs across the whole portfolio.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openStakeholderDialog(ctx) }, 'Register stakeholder'),
    });
  }
  return h(
    'div',
    { class: 'stack-md' },
    ...rollup.register.map((profile) => {
      const r = profile.record;
      const attention = rollup.attention.filter((a) => a.record.id === r.id);
      return card({
        title: r.name,
        subtitle: [r.org, r.role, STAKEHOLDER_CATEGORY_LABELS[r.category]].filter(Boolean).join(' · '),
        actions: [
          r.vetoPlayer ? badge('Veto player', 'bad', r.vetoBasis || 'Tsebelis gate') : null,
          badge(STAKEHOLDER_STANCE_LABELS[r.stance], STANCE_TONE[r.stance] || 'neutral'),
        ],
        body: h(
          'div',
          { class: 'stack-sm' },
          h('div', { class: 'row-gap wrap' },
            badge(`${profile.salience.classLabel} salience`, SALIENCE_TONE[profile.salience.salienceClass] || 'neutral'),
            badge(profile.mendelow.quadrantLabel, 'info'),
            badge(`confidence: ${ESTIMATE_CONFIDENCE_LABELS[r.estimateConfidence].split(' —')[0]}`, 'neutral'),
            r.personId ? badge('Roster-linked', 'good') : null,
            ...attention.map((a) => badge(a.title.slice(0, 48), a.severity >= 4 ? 'bad' : 'caution')),
          ),
          h('p', { class: 'muted small' },
            r.nextContactOn
              ? `Next contact ${formatDate(r.nextContactOn)}${profile.contactOverdue ? ' (overdue)' : ''} · cadence ${STAKEHOLDER_CADENCE_LABELS[r.commsCadence]}`
              : `No next contact planned · cadence ${STAKEHOLDER_CADENCE_LABELS[r.commsCadence]}`),
          h('div', { class: 'row-gap' },
            h('a', {
              class: 'btn btn-ghost',
              href: `#/stakeholders/${encodeURIComponent(r.id)}`,
              onClick: (e) => { e.preventDefault(); ctx.navigate(`#/stakeholders/${encodeURIComponent(r.id)}`); },
            }, 'Open dossier'),
            button('Log contact', () => openContactDialog(ctx, r)),
            button('Log stance', () => openStanceDialog(ctx, r)),
          ),
        ),
      });
    }),
  );
}

export function renderStakeholders(ctx) {
  const rollup = stakeholdersRollup(ctx.state, ctx.now);
  const requested = ctx.query.get('tab');
  const tab = ['register', 'matrix', 'network'].includes(requested) ? requested : 'register';
  const reconciliation = reconciliationReport(ctx.state);

  const tabs = [
    { id: 'register', label: 'Register', count: rollup.register.length },
    { id: 'matrix', label: 'Power × interest matrix', count: null },
    { id: 'network', label: 'Coalition network', count: netCount(rollup) },
  ];

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Political science for leaders',
      title: 'Stakeholder influence register',
      subtitle:
        'One persistent political map across cases, changes and negotiations: Mendelow quadrants, Mitchell-Agle-Wood salience, Tsebelis veto players and coalition blocs, reconciled automatically from the records you already keep.',
      actions: [button('Register stakeholder', () => openStakeholderDialog(ctx), true)],
    }),
    ctx.persistError
      ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) })
      : null,
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Active stakeholders', value: rollup.stats.total }),
      stat({ label: 'Veto players', value: rollup.stats.vetoPlayers, tone: rollup.stats.vetoPlayers ? 'warn' : '', hint: 'gates whose agreement is required' }),
      stat({ label: 'Definitive salience', value: rollup.stats.definitive, tone: rollup.stats.definitive ? 'bad' : '', hint: 'power + legitimacy + urgency' }),
      stat({
        label: 'Register coverage',
        value: reconciliation.coveragePct === null ? '—' : `${reconciliation.coveragePct}%`,
        tone: reconciliation.unmappedCount ? 'warn' : 'good',
        hint: reconciliation.unmappedCount ? `${reconciliation.unmappedCount} embedded stub(s) unmapped` : 'all initiative stubs mapped',
      }),
    ),
    h(
      'div',
      { class: 'tabs', role: 'group', 'aria-label': 'Register views' },
      ...tabs.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: `tab ${tab === t.id ? 'is-active' : ''}`,
            'aria-pressed': String(tab === t.id),
            onClick: () => ctx.navigate(`#/stakeholders?tab=${t.id}`),
          },
          t.label,
          t.count === null ? null : h('span', { class: 'tab-count' }, String(t.count)),
        )),
    ),
    tab === 'register' ? renderRegisterTable(rollup, ctx) : null,
    tab === 'matrix' ? renderMatrix(rollup.register, ctx) : null,
    tab === 'network' ? renderNetwork(rollup, ctx) : null,
    frameworkCard(),
  );
}

function netCount(rollup) {
  const n = rollup.network;
  return n.allianceEdges.length + n.oppositionPairs.length + n.influenceEdges.length;
}

/* --------------------------------------------------------------- detail view */

function involvementCard(profile, ctx) {
  if (!profile.involvements.length) {
    return card({
      title: 'Involvement across initiatives',
      body: h('p', { class: 'muted small' }, 'No typed involvement links yet. These are created automatically when a case, change or negotiation names this stakeholder.'),
    });
  }
  return card({
    title: `Involvement across initiatives (${profile.involvements.length})`,
    body: h(
      'div',
      { class: 'stack-sm' },
      ...profile.involvements.map((inv) =>
        h(
          'a',
          {
            class: 'case-link-pill',
            href: inv.peer.route,
            onClick: (e) => { e.preventDefault(); ctx.navigate(inv.peer.route); },
          },
          h('span', { class: 'case-link-rel' }, inv.peer.type),
          h('strong', null, inv.peer.title),
          h('span', { class: 'muted tiny' }, `(${inv.peer.status})`),
          inv.initiativeStance
            ? h('span', { class: `pill pill-${STANCE_TONE[inv.initiativeStance] || 'neutral'}` }, `on this record: ${STAKEHOLDER_STANCE_LABELS[inv.initiativeStance]}`)
            : null,
          inv.vetoOnInitiative ? h('span', { class: 'pill pill-bad' }, 'veto') : null,
        )),
    ),
  });
}

function vetoCard(profile, state) {
  if (!profile.isVetoPlayer) {
    return card({
      title: 'Tsebelis veto analysis',
      body: h('p', { class: 'muted small' }, 'Not recorded as a veto player. Mark the gate and its basis if agreement from this actor is structurally required.'),
    });
  }
  const risks = profile.involvements
    .map((inv) => ({ inv, risk: initiativeVetoRisk(state, inv.peer.type, inv.peer.raw.id) }))
    .filter((x) => x.risk.vetoCount > 0);
  return card({
    title: 'Tsebelis veto analysis',
    subtitle: profile.record.vetoBasis || 'No gate basis recorded — add one before relying on this assessment.',
    actions: [badge(`Evidence: ${ESTIMATE_CONFIDENCE_LABELS[profile.record.estimateConfidence].split(' —')[0]}`, profile.record.estimateConfidence === 'low' ? 'bad' : 'neutral')],
    body: h(
      'div',
      { class: 'stack-sm' },
      risks.length
        ? h('ul', { class: 'small stack-xs' }, ...risks.map(({ inv, risk }) =>
            h('li', null,
              h('strong', null, inv.peer.title),
              ` — difficulty ${risk.difficulty}/100, band “${risk.band.label}”, confidence ${risk.confidence}. ${risk.rationale}`)))
        : h('p', { class: 'muted small' }, 'Veto flag recorded but no open initiative involvement is currently linked.'),
      h('p', { class: 'tiny muted' }, 'Stance-distance × power heuristic with cohesion penalties — an operational proxy, not a spatial win-set model.'),
    ),
  });
}

function historyCard(profile) {
  const stanceItems = profile.stanceHistory.map((entry) => ({
    date: entry.on,
    title: `Stance: ${STAKEHOLDER_STANCE_LABELS[entry.stance] || entry.stance}`,
    detail: [entry.context, entry.sourceType ? `linked to ${entry.sourceType}` : null].filter(Boolean).join(' · '),
  }));
  const contactItems = (profile.record.contactLog || []).map((entry) => ({
    date: entry.on,
    title: 'Contact logged',
    detail: entry.note || '',
  }));
  const items = [...stanceItems, ...contactItems]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return card({
    title: 'Stance & contact history',
    body: items.length
      ? timeline(items, { empty: 'No history yet.' })
      : h('p', { class: 'muted small' }, 'Log a stance shift or contact to start the append-only history.'),
  });
}

function networkCard(profile, state, ctx) {
  const net = buildCoalitionNetwork(state.stakeholders || []);
  const r = profile.record;
  const edges = (r.alliances || []).map((edge) => {
    const target = (state.stakeholders || []).find((s) => s.id === edge.targetId);
    return target ? { edge, target } : null;
  }).filter(Boolean);
  return card({
    title: 'Coalition position',
    body: h(
      'div',
      { class: 'stack-sm' },
      h('p', { class: 'small' },
        profile.bloc ? `Member of a ${profile.bloc.leaning} bloc (power ${profile.bloc.power}).` : 'Independent actor — no alliance bloc.'),
      h('p', { class: 'small muted' },
        `Weighted degree centrality ${profile.centrality} · out-influence ${profile.outInfluence}`),
      edges.length
        ? h('ul', { class: 'small stack-xs' }, ...edges.map(({ edge, target }) =>
            h('li', null, `${ALLIANCE_KIND_LABELS[edge.kind]}: `,
              h('a', {
                href: `#/stakeholders/${encodeURIComponent(target.id)}`,
                onClick: (e) => {
                  e.preventDefault();
                  ctx.navigate(`#/stakeholders/${encodeURIComponent(target.id)}`);
                },
              }, target.name),
              ` (${edge.strength}/5)`)))
        : h('p', { class: 'muted small' }, 'No relationships recorded.'),
    ),
  });
}

export function renderStakeholderDetail(ctx, id) {
  const record = (ctx.state.stakeholders || []).find((s) => s.id === id);
  if (!record) {
    return h(
      'div',
      { class: 'page' },
      emptyState({
        title: 'That stakeholder is not in the register',
        body: 'It may have been deleted, or the link may be out of date.',
        action: h('a', { class: 'btn btn-primary', href: '#/stakeholders' }, 'Back to register'),
      }),
    );
  }
  const profile = summarizeStakeholder(record, ctx.state, ctx.now);
  const salience = profile.salience;

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: STAKEHOLDER_CATEGORY_LABELS[record.category] || 'Stakeholder',
      title: record.name,
      subtitle: [record.org, record.role].filter(Boolean).join(' · ') || 'No organisation or role recorded',
      actions: [
        button('Log contact', () => openContactDialog(ctx, record)),
        button('Log stance', () => openStanceDialog(ctx, record)),
        button('Edit', () => openStakeholderDialog(ctx, record)),
      ],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Salience', value: salience.classLabel, tone: SALIENCE_TONE[salience.salienceClass] || '', hint: salience.subtitle }),
      stat({ label: 'Mendelow quadrant', value: profile.mendelow.quadrantLabel, hint: profile.mendelow.quadrantSubtitle }),
      stat({ label: 'Stance', value: STAKEHOLDER_STANCE_LABELS[record.stance], tone: STANCE_TONE[record.stance] || '' }),
      stat({ label: 'Veto gate', value: record.vetoPlayer ? 'Yes' : 'No', tone: record.vetoPlayer ? 'bad' : '' }),
    ),
    profile.contactOverdue
      ? card({ body: h('p', { class: 'text-warn small' }, `Contact is overdue (was due ${formatDate(record.nextContactOn)}). Log a contact to reschedule from the cadence.`) })
      : null,
    h('div', { class: 'grid grid-2' },
      card({
        title: 'Salience rationale (Mitchell, Agle & Wood, 1997)',
        body: h('div', { class: 'stack-sm' },
          h('p', { class: 'small' }, salience.guidance),
          h('ul', { class: 'small muted' },
            h('li', null, `Power ${salience.power}/5 · possessed: ${salience.hasPower ? 'yes' : 'no'}`),
            h('li', null, `Legitimacy ${salience.legitimacy}/5 · possessed: ${salience.hasLegitimacy ? 'yes' : 'no'}`),
            h('li', null, `Urgency ${salience.urgency}/5 · possessed: ${salience.hasUrgency ? 'yes' : 'no'}`),
            h('li', null, `Raw salience ${salience.salienceScore}/15 · evidence-adjusted ${salience.expectedSalienceScore}`)),
        ),
      }),
      card({
        title: 'Engagement guidance (Mendelow, 1981)',
        body: h('div', { class: 'stack-sm' },
          h('p', { class: 'small' }, profile.mendelow.guidance),
          h('p', { class: 'small muted' }, `Cadence ${STAKEHOLDER_CADENCE_LABELS[record.commsCadence]} · preferred channel: ${record.preferredComms || 'not recorded'}`),
          record.keyMessage ? h('p', { class: 'small' }, h('strong', null, 'Key message: '), record.keyMessage) : null),
      }),
    ),
    vetoCard(profile, ctx.state),
    involvementCard(profile, ctx),
    networkCard(profile, ctx.state, ctx),
    record.influenceNotes
      ? card({ title: 'Private influence notes', body: h('p', { class: 'small' }, record.influenceNotes) })
      : null,
    historyCard(profile),
    h(
      'div',
      { class: 'row-gap' },
      record.status === 'active'
        ? button('Archive stakeholder', () => {
            confirmDialog({
              title: `Archive ${record.name}?`,
              message: 'The record and its history stay in the workspace but leave the active register and stop generating signals.',
              confirmLabel: 'Archive',
              onConfirm: () => {
                const res = ctx.api.archiveStakeholder(record.id);
                if (res.ok) { toast('Stakeholder archived.', 'neutral'); ctx.navigate('#/stakeholders'); }
                else toast(res.error, 'bad');
              },
            });
          })
        : null,
      button('Delete permanently', () => {
        confirmDialog({
          title: `Delete ${record.name}?`,
          message: 'This removes the register record, its alliances and every graph edge touching it. Other records are preserved.',
          danger: true,
          confirmLabel: 'Delete',
          onConfirm: () => {
            const res = ctx.api.deleteStakeholder(record.id);
            if (res.ok) { toast('Stakeholder deleted.', 'neutral'); ctx.navigate('#/stakeholders'); }
            else toast(res.error, 'bad');
          },
        });
      }, false),
    ),
  );
}
