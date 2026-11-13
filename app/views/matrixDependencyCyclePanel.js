/**
 * app/views/matrixDependencyCyclePanel.js — `#/matrix?panel=cycles`, the
 * Cross-Boundary Dependency Feedback-Cycle Register, Counterfactual Tear
 * Sensitivity & Post-Commit Escalation Surface (ADR-0183 / ADR-0187,
 * Schema v148 unchanged, CSV scope #137, `RULE-CYC-01`).
 *
 * One reader (`buildDependencyCycles`) is behind the board, the block table,
 * the counterfactual tear census, the escalation status, the roll-ups, the
 * brief and the CSV. Nothing is recomputed in the view, so what the screen
 * prints is what the reader computed.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildDependencyCycles,
  dependencyCycleBriefText,
  dependencyCycleCsvRows,
} from '../core/domain/dependencyCycle.js';
import {
  DEPENDENCY_CYCLE_ADR,
  DEPENDENCY_CYCLE_BOUNDS,
  DEPENDENCY_CYCLE_CSV_COLUMNS,
  DEPENDENCY_CYCLE_CSV_SCOPE,
  DEPENDENCY_CYCLE_ESCALATION_ADR,
  DEPENDENCY_CYCLE_LIMITS,
  DEPENDENCY_CYCLE_OWNER_STATES,
  DEPENDENCY_CYCLE_RULE_ID,
  DEPENDENCY_CYCLE_SETTING_KEYS,
  DEPENDENCY_CYCLE_SETTING_LABELS,
  dependencyCycleBlockState,
  dependencyCycleEscalationState,
  dependencyCycleLineState,
  dependencyCycleOwnerState,
  dependencyCycleTearOutcome,
  dependencyCycleTearState,
} from '../core/domain/dependencyCycleRegistry.js';

const DIAGRAM_URL = './app/assets/dependency-cycle-dsm.jpg';
const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const claim = (value) => (value ? 'yes' : 'NO');
const toneForLine = (key) => dependencyCycleLineState(key).tone;
const toneForOwner = (key) => dependencyCycleOwnerState(key).tone;
const toneForBlock = (key) => dependencyCycleBlockState(key).tone;
const toneForTear = (key) => dependencyCycleTearState(key).tone;
const toneForTearOutcome = (key) => dependencyCycleTearOutcome(key).tone;

function triggerRefresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function runAction(ctx, result, successMessage) {
  if (!result?.ok) {
    toast(result?.error || 'The action was refused.', 'bad');
    return false;
  }
  toast(successMessage, 'good');
  triggerRefresh(ctx);
  return true;
}

function boardCard(report) {
  const b = report.board;
  const stats = [
    stat({ label: 'Work records in the matrix', value: num(b.nodesN), hint: 'resolved endpoints only' }),
    stat({ label: 'Declared precedence arcs', value: num(b.arcsN), hint: `${b.pairsN} distinct pair(s)` }),
    stat({ label: 'Coupled feedback blocks', value: num(b.feedbackN), tone: b.feedbackN ? 'bad' : '' }),
    stat({ label: 'Sequential blocks', value: num(b.sequentialN) }),
    stat({ label: 'Cross-line coupled blocks', value: num(b.crossLineFeedbackN), tone: b.crossLineFeedbackN ? 'bad' : '' }),
    stat({ label: 'Ambiguous joint apexes', value: num(b.ambiguousApexN), tone: b.ambiguousApexN ? 'warn' : '' }),
  ];
  return card({
    title: 'The partition and its four claims',
    subtitle: `${b.verdictLabel}. ${DEPENDENCY_CYCLE_ADR} & ${DEPENDENCY_CYCLE_ESCALATION_ADR} · ${report.engineVersion}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' }, stats),
      h('div', { class: 'stack-sm' },
        h('p', { class: 'muted small' }, `${b.internalArcsN} arc(s) fall INSIDE a coupled block and ${b.externalArcsN} run BETWEEN blocks; the two sum to ${b.arcsN}. ${b.distinctLineN} distinct active reporting line(s) are in reach, forming ${b.distinctLinePairN} cross-line pair(s).`),
        h('p', { class: 'muted small' }, `Claims, printed separately: counts reconcile — ${claim(b.countsReconcile)}; printed figures are the computed figures — ${claim(b.figuresComplete)}; every node's line reach is provable — ${claim(b.lineReachComplete)}; the cross-line claim is made — ${claim(b.crossLineClaim)}. The condensation graph is ${b.condensationAcyclic ? 'acyclic' : 'NOT acyclic'} (it must be, by construction).`),
      ),
      b.crossLineClaim
        ? null
        : banner({ tone: 'warn', title: 'The cross-line claim is refused', body: b.reason || 'The line reach is not provable for every node.' }),
      b.feedbackN
        ? banner({ tone: 'bad', title: `${b.feedbackN} coupled feedback block(s) cannot be sequenced`, body: 'Records inside a closed loop are printed as one irreducible set. The register orders the blocks, never the records inside a cycle, and never auto-tears an edge to invent an order.' })
        : null,
      b.ambiguousApexN
        ? banner({ tone: 'warn', title: `${b.ambiguousApexN} block(s) have no single joint apex`, body: 'The matrix DAG returns incomparable minimal ancestors. Every one is named on the block row; none is picked as the owner.' })
        : null,
    ),
  });
}

function renderAskCell(escalation) {
  if (!escalation) return '—';
  if (escalation.state !== 'unique') {
    const meta = dependencyCycleEscalationState(escalation.state);
    return badge(meta.label, meta.tone);
  }
  const who = escalation.seatWithheld
    ? 'seat withheld'
    : (escalation.seatName || escalation.seatId || 'one seat');
  if (escalation.askState === 'open') {
    return h('span', {}, badge(`open · due ${escalation.askDueOn || '—'}`, 'warn'), ` (${who})`);
  }
  if (escalation.askState === 'answered') {
    return h('span', {}, badge('answered', 'good'), ` (${who})`);
  }
  return h('span', {}, badge('not issued', 'neutral'), ` (${who})`);
}

function blocksCard(report) {
  const rows = report.blocks
    .filter((block) => block.state === 'feedback-cycle')
    .slice(0, DEPENDENCY_CYCLE_LIMITS.maxPrintedBlocks)
    .map((block) => ({
      key: block.key,
      records: block.members.map((member) => `${member.type}: ${member.title}`).join(' · '),
      size: block.size,
      state: h('span', {}, badge(dependencyCycleBlockState(block.state).label, toneForBlock(block.state))),
      lines: h('span', {}, badge(`${block.lineIds.length} line(s) · ${dependencyCycleLineState(block.lineState).label}`, toneForLine(block.lineState))),
      owner: h('span', {}, badge(dependencyCycleOwnerState(block.ownerState).label, toneForOwner(block.ownerState))),
      apex: block.apexIds.length ? block.apexIds.join(', ') : '—',
      tear: block.tearing
        ? h('span', {}, badge(dependencyCycleTearState(block.tearing.tearState).label, toneForTear(block.tearing.tearState)))
        : '—',
      ask: renderAskCell(block.escalation),
      internal: block.internalArcsN,
      external: `${block.externalInN} in / ${block.externalOutN} out`,
      order: block.order,
      reason: block.reason || '—',
    }));
  return card({
    title: `Coupled feedback blocks — ${report.board.feedbackN} found`,
    subtitle: 'One row per strongly connected component with a cycle. The records inside a row are NOT ordered; the block’s position in the condensation order is.',
    body: table({
      columns: [
        { key: 'key', label: 'Block' },
        { key: 'records', label: 'Records in the closed loop' },
        { key: 'size', label: 'Size' },
        { key: 'state', label: 'Block state' },
        { key: 'lines', label: 'Line reach' },
        { key: 'owner', label: 'Ownership' },
        { key: 'apex', label: 'Joint apex(es)' },
        { key: 'tear', label: '1-arc tear sensitivity' },
        { key: 'ask', label: 'Escalation / ask' },
        { key: 'internal', label: 'Arcs inside' },
        { key: 'external', label: 'Arcs between blocks' },
        { key: 'order', label: 'Order' },
        { key: 'reason', label: 'Refusal / finding' },
      ],
      rows,
      caption: 'Coupled feedback blocks of the declared dependency graph',
      emptyMessage: 'No feedback cycle was found in the declared precedence graph. The blocks are sequential and can be ordered.',
    }),
  });
}

function tearingCard(report) {
  const t = report.tearing;
  const candidateRows = [];
  for (const block of report.blocks) {
    if (block.state !== 'feedback-cycle' || !block.tearing) continue;
    if (!block.tearing.evaluated) {
      candidateRows.push({
        block: block.key,
        pair: 'Withheld (exceeds bound)',
        relations: `${block.tearing.internalPairsN} distinct pair(s)`,
        span: '—',
        outcome: h('span', {}, badge('Tear census refused', 'warn')),
        freed: '—',
        remaining: block.tearing.reason || '—',
      });
      continue;
    }
    for (const cand of block.tearing.candidates) {
      const outMeta = dependencyCycleTearOutcome(cand.outcome);
      candidateRows.push({
        block: block.key,
        pair: `${cand.fromLabel} → ${cand.toLabel}`,
        relations: `${cand.relations.join(', ')}${cand.arcsN > 1 ? ` (${cand.arcsN} links)` : ''}`,
        span: cand.arcSpanState === 'cross-holder'
          ? h('span', {}, badge('Cross-holder', 'warn'))
          : cand.arcSpanState === 'same-holder'
            ? h('span', {}, badge('Same holder', 'neutral'))
            : h('span', {}, badge('Endpoint reach unknown', 'bad')),
        outcome: h('span', {}, badge(outMeta.label, toneForTearOutcome(cand.outcome))),
        freed: `${cand.freedNodesN} / ${block.size}`,
        remaining: cand.remainingFeedbackBlocksN === 0
          ? '0 cycles (acyclic)'
          : `${cand.remainingFeedbackBlocksN} cycle(s), max size ${cand.largestRemainingBlockSize}`,
      });
    }
  }

  return card({
    title: `Counterfactual single-arc tear sensitivity — ${t.internalPairsEvaluatedN} pair(s) tested`,
    subtitle: 'Exact Steward/Kosaraju sensitivity over stored precedence pairs: what happens to each coupled block if one distinct internal pair is re-sequenced or split into a pre-registered premise. No edge is recommended or automatically broken.',
    body: h('div', { class: 'stack', 'data-testid': 'dependency-cycle-tearing-card' },
      h('div', { class: 'grid grid-4' },
        stat({ label: 'Uncouples under 1-arc tear', value: num(t.singleArcTearableN), tone: t.singleArcTearableN ? 'good' : '', hint: `${t.singleArcBreakPairsN} breaking pair(s)` }),
        stat({ label: 'Shrinks core under 1-arc tear', value: num(t.partialSingleTearN), tone: t.partialSingleTearN ? 'warn' : '' }),
        stat({ label: 'Requires multi-arc tear (≥2)', value: num(t.multiArcOnlyN), tone: t.multiArcOnlyN ? 'bad' : '' }),
        stat({ label: 'Tear census refused (bound)', value: num(t.tearRefusedN), tone: t.tearRefusedN ? 'warn' : '', hint: `cap ${DEPENDENCY_CYCLE_LIMITS.maxTearArcsPerBlock} pairs/block` }),
      ),
      h('p', { class: 'muted small' }, `Tear partition reconciles — ${claim(t.reconciles)}: ${t.singleArcTearableN} + ${t.partialSingleTearN} + ${t.multiArcOnlyN} + ${t.tearRefusedN} = ${t.feedbackBlocksN} coupled block(s).`),
      table({
        columns: [
          { key: 'block', label: 'Block' },
          { key: 'pair', label: 'Precedence pair (prerequisite → consumer)' },
          { key: 'relations', label: 'Declared relation(s)' },
          { key: 'span', label: 'Holder boundary' },
          { key: 'outcome', label: 'If removed' },
          { key: 'freed', label: 'Freed into sequence' },
          { key: 'remaining', label: 'Remaining feedback core' },
        ],
        rows: candidateRows,
        caption: 'Counterfactual single-arc tear outcomes per coupled block',
        emptyMessage: 'No coupled feedback block requires counterfactual tear evaluation.',
      }),
    ),
  });
}

function escalationCard(ctx, report, seat) {
  const a = report.asks;
  const K = DEPENDENCY_CYCLE_SETTING_KEYS;
  const [minDue, maxDue] = DEPENDENCY_CYCLE_BOUNDS.askDueDays;
  const canScan = typeof ctx?.api?.matrixDependencyCycleScan === 'function'
    && (!seat || seat.fullAccess || Number(seat.rank) >= 3);
  const canSetConventions = typeof ctx?.api?.matrixDependencyCycleSetConventions === 'function'
    && (!seat || seat.fullAccess || Number(seat.rank) >= 3);

  const dueInput = h('input', {
    class: 'input',
    type: 'number',
    min: String(minDue),
    max: String(maxDue),
    step: '1',
    value: String(a.askDueDays),
    'aria-label': DEPENDENCY_CYCLE_SETTING_LABELS.askDueDays,
    'data-testid': 'dependency-cycle-due-days-input',
    style: { width: '96px' },
  });
  const autoCheckbox = h('input', {
    type: 'checkbox',
    checked: a.autoPropagate,
    'aria-label': DEPENDENCY_CYCLE_SETTING_LABELS.autoPropagate,
    'data-testid': 'dependency-cycle-auto-checkbox',
  });

  const actions = [];
  if (canScan) {
    actions.push(h('button', {
      class: 'btn btn-small btn-primary',
      type: 'button',
      'data-testid': 'dependency-cycle-scan-btn',
      onclick: () => runAction(
        ctx,
        ctx.api.matrixDependencyCycleScan(),
        `Scanned dependency cycles (${DEPENDENCY_CYCLE_RULE_ID}).`,
      ),
    }, `Scan cycles now (${DEPENDENCY_CYCLE_RULE_ID})`));
  }

  return card({
    title: `Governed escalation on the shared spine (${DEPENDENCY_CYCLE_RULE_ID})`,
    subtitle: a.autoPropagate
      ? `Auto-propagation is ON (ask window ${a.askDueDays} day(s)): single-line loops address their sole line manager; cross-line loops address their unique matrixJointApex; leader-held, ambiguous, unattributed and off-roster loops record an identity-free observation.`
      : 'Auto-propagation is PAUSED: ordinary writes issue no cycle ask; an explicit scan still runs RULE-CYC-01.',
    actions,
    body: h('div', { class: 'stack', 'data-testid': 'dependency-cycle-escalation-card' },
      h('div', { class: 'grid grid-4' },
        stat({ label: 'One accountable roster seat', value: num(a.escalationStates.unique), hint: 'single-line holder or joint apex' }),
        stat({ label: 'Open / answered / not issued', value: `${num(a.openN)} / ${num(a.answeredN)} / ${num(a.notIssuedN)}`, tone: a.openN ? 'warn' : '' }),
        stat({ label: 'Leader / ambiguous / unattributed / off-roster', value: `${num(a.escalationStates['leader-held'])} / ${num(a.escalationStates.ambiguous)} / ${num(a.escalationStates.unattributed)} / ${num(a.escalationStates['off-roster'])}`, hint: 'observed, never substituted' }),
        stat({ label: 'Identity-free observations', value: num(a.observationsN), hint: 'matrixMarkers (dependency-cycle)' }),
      ),
      h('p', { class: 'muted small' }, `Escalation counts reconcile — ${claim(a.reconciles)}. Asks close themselves when the cycle clears or its owning seat moves, and an ask closed by a person is never re-issued while the same cycle stands.`),
      canSetConventions
        ? h('form', {
          class: 'row gap',
          'data-testid': 'dependency-cycle-conventions-form',
          onsubmit: (ev) => {
            ev.preventDefault();
            const rawDays = Number(dueInput.value);
            runAction(
              ctx,
              ctx.api.matrixDependencyCycleSetConventions({
                [K.askDueDays]: rawDays,
                [K.autoPropagate]: Boolean(autoCheckbox.checked),
              }),
              'Dependency-cycle conventions updated.',
            );
          },
        },
        h('label', { class: 'small' }, `${DEPENDENCY_CYCLE_SETTING_LABELS.askDueDays} (${minDue}–${maxDue}): `, dueInput),
        h('label', { class: 'small' }, autoCheckbox, ` ${DEPENDENCY_CYCLE_SETTING_LABELS.autoPropagate}`),
        h('button', { class: 'btn btn-small', type: 'submit', 'data-testid': 'dependency-cycle-save-conventions-btn' }, 'Save conventions'))
        : null,
    ),
  });
}

function rollUpsCard(report) {
  const rows = report.rollUps.map((row) => ({
    state: h('span', {}, badge(dependencyCycleOwnerState(row.ownerState).label, toneForOwner(row.ownerState))),
    blocks: row.blocksN,
    crossLine: row.crossLineN,
    ambiguous: row.ambiguousN,
    deepest: row.maxOrder,
  }));
  return card({
    title: 'The roll-up that never counts a block twice',
    subtitle: 'Coupled blocks grouped by the ownership the canonical matrix DAG can prove. Each block appears in exactly one group.',
    body: table({
      columns: [
        { key: 'state', label: 'Ownership state' },
        { key: 'blocks', label: 'Coupled blocks' },
        { key: 'crossLine', label: 'Cross-line blocks' },
        { key: 'ambiguous', label: 'Ambiguous apexes' },
        { key: 'deepest', label: 'Deepest order' },
      ],
      rows,
      caption: 'Feedback blocks by proven ownership',
      emptyMessage: 'No coupled feedback block to roll up.',
    }),
  });
}

function refusalsCard(report) {
  const rows = report.refusals.map((row) => ({
    key: row.key,
    label: row.label,
    n: row.n,
    detail: row.reasons.join(' | ') || '—',
  }));
  return card({
    title: `Refusals — ${report.board.refusalsN} counted`,
    subtitle: 'Nothing is dropped in silence. A record that cannot be resolved, attributed or seated is named here instead of being smoothed into a total.',
    body: table({
      columns: [
        { key: 'key', label: 'Refusal' },
        { key: 'label', label: 'What it means' },
        { key: 'n', label: 'Count' },
        { key: 'detail', label: 'Printed detail' },
      ],
      rows,
      caption: 'Named refusals of the dependency partition',
      emptyMessage: 'No refusal was raised.',
    }),
  });
}

function relationsCard(report) {
  const declared = report.relations.map((row) => ({
    relation: row.relation,
    label: row.label,
    direction: row.direction,
    why: row.why,
  }));
  const excluded = report.excluded.map((row) => ({
    relation: row.relation,
    n: row.n,
    reason: row.reason,
  }));
  return h('div', { class: 'stack' },
    card({
      title: 'The precedence lexicon (declared, not inferred)',
      subtitle: 'Five typed relations create arcs. Direction is declared because SCCs are invariant under a GLOBAL reversal, not under reversing some edges.',
      body: table({
        columns: [
          { key: 'relation', label: 'Relation' },
          { key: 'label', label: 'Meaning' },
          { key: 'direction', label: 'Direction' },
          { key: 'why', label: 'Why' },
        ],
        rows: declared,
        caption: 'Declared precedence relations',
        emptyMessage: 'No relation declared.',
      }),
    }),
    card({
      title: `Relations read but excluded — ${report.board.excludedRelationsN} edge(s)`,
      subtitle: 'A shared approver, a shared barrier or a people-attribution edge is not a sequencing claim. Counting them is the refusal to guess.',
      body: table({
        columns: [
          { key: 'relation', label: 'Relation' },
          { key: 'n', label: 'Edges' },
          { key: 'reason', label: 'Reason it creates no arc' },
        ],
        rows: excluded,
        caption: 'Excluded typed relations',
        emptyMessage: 'No other typed relation was read.',
      }),
    }),
  );
}

function methodCard(report) {
  return card({
    title: `Method and refusal contract (${DEPENDENCY_CYCLE_ADR} · ${DEPENDENCY_CYCLE_ESCALATION_ADR})`,
    subtitle: `Schema v148 unchanged · ${DEPENDENCY_CYCLE_CSV_SCOPE} is aggregate-only · a single-chain loop inside one branch prints no cross-line finding`,
    body: h('div', { class: 'stack' },
      h('figure', { style: { margin: '0' } },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Sequential blocks are ordered; a three-record coupled feedback block is one irreducible strongly connected component; a cycle spanning the home and project lines has no single owner; a record with no people edge is refused.',
          loading: 'lazy', width: '896', height: '296', 'data-testid': 'dependency-cycle-dsm-diagram',
          style: { width: '100%', 'max-width': '896px', height: 'auto' },
        }),
        h('figcaption', { class: 'small' }, 'Conceptual method diagram, not workspace data. Generated for this register; provenance recorded in the ADR. Inside a cycle no edge is auto-torn and no record is ordered.')),
      h('h4', {}, 'The seven steps'),
      h('ol', { class: 'stack small' }, ...report.method.map((line) => h('li', {}, line))),
      h('h4', {}, 'Conventions'),
      report.conventions.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.label), h('p', { class: 'muted small' }, row.detail))),
      h('h4', {}, 'Frameworks'),
      report.frameworks.map((row) => h('div', { class: 'stack-sm' },
        h('strong', {}, row.label), h('p', { class: 'muted small' }, row.detail))),
      h('p', { class: 'muted small' }, `Processing bounds: ${DEPENDENCY_CYCLE_LIMITS.maxLinks} links, ${DEPENDENCY_CYCLE_LIMITS.maxNodes} nodes, ${DEPENDENCY_CYCLE_LIMITS.maxArcs} arcs, ${DEPENDENCY_CYCLE_LIMITS.maxTearArcsPerBlock} distinct internal pairs per block for counterfactual tear sensitivity, ${DEPENDENCY_CYCLE_LIMITS.asksPerCommit} asks per commit, ${DEPENDENCY_CYCLE_LIMITS.maxPrintedBlocks} coupled blocks on screen. Exceeding a bound refuses the claim rather than printing a partial one.`),
      h('p', { class: 'muted small' }, 'NOT shipped in this slice: weighted/numerical DSMs, minimum multi-arc feedback-arc-set search (NP-hard beyond 1-arc sensitivity), clustering, simulation and LLM-assisted dependency discovery. They remain In Progress in ROADMAP.md.'),
    ),
  });
}

function briefCard(report) {
  const rows = dependencyCycleCsvRows(report);
  const downloadCsv = () => {
    const ok = downloadText({
      filename: `${DEPENDENCY_CYCLE_CSV_SCOPE}-${report.generatedOn}.csv`,
      text: serializeCsv(DEPENDENCY_CYCLE_CSV_COLUMNS.map((key) => ({ key, header: key })), rows),
      mime: 'text/csv',
    });
    return ok;
  };
  return card({
    title: 'The brief (identity-free)',
    subtitle: 'The paragraph that goes upward. It names no person, no line and no record.',
    actions: [h('button', { class: 'btn btn-small', type: 'button', onclick: downloadCsv }, 'Download CSV (aggregate-only)')],
    body: h('div', { class: 'stack-sm' },
      h('p', {}, dependencyCycleBriefText(report)),
      h('p', { class: 'muted small' }, `The export carries counts only: no person, no manager, no line id, no record id, no title, no note and no record date. Every declared column is present on every row; a refused claim prints its reason rather than a zero. ${rows.length} row(s) are exported from the same reader this panel renders.`),
    ),
  });
}

export function renderMatrixDependencyCyclePanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  let report;
  let seat = null;
  if (typeof ctx?.api?.matrixDependencyCycleReport === 'function') {
    const res = ctx.api.matrixDependencyCycleReport();
    if (!res?.ok) {
      return card({
        title: 'Cross-boundary dependency feedback cycles',
        body: banner({ tone: 'bad', title: 'Reading refused', body: res?.error || 'The dependency-cycle reader could not run.' }),
      });
    }
    report = res.report;
    seat = res.seat || null;
  } else {
    report = buildDependencyCycles(state, { now, settings: state.settings || null });
  }

  return h('div', { class: 'stack', 'data-testid': 'dependency-cycle-panel' },
    h('p', { class: 'lede' }, 'A linear plan can order one-way dependencies. It cannot order work that waits on itself. This register partitions the typed dependency graph into exact strongly connected components, evaluates counterfactual single-arc tear sensitivity without picking which commitment yields, escalates single-line and cross-line cycles on the shared spine, and names every refusal.'),
    boardCard(report),
    blocksCard(report),
    tearingCard(report),
    escalationCard(ctx, report, seat),
    rollUpsCard(report),
    refusalsCard(report),
    relationsCard(report),
    briefCard(report),
    methodCard(report),
  );
}
