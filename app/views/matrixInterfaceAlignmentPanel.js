/**
 * app/views/matrixInterfaceAlignmentPanel.js — `#/matrix?panel=alignment`, the
 * Product–Organisation Interface Alignment Matrix (Sosa, Eppinger & Rowles,
 * 2004; Galbraith, 1974) (ADR-0189, Schema v149 unchanged, CSV scope #142,
 * `RULE-OIA-01`).
 *
 * One reader (`buildInterfaceAlignment`) is behind the board, the pair table,
 * the channel table, the apex roll-ups, the brief and the CSV. Nothing is
 * recomputed in the view, so what the screen prints is what the reader
 * computed.
 */

import { h, toast } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  buildInterfaceAlignment,
  interfaceAlignmentBriefText,
  interfaceAlignmentCsvRows,
} from '../core/domain/interfaceAlignment.js';
import {
  INTERFACE_ALIGNMENT_ADR,
  INTERFACE_ALIGNMENT_ARC_STATES,
  INTERFACE_ALIGNMENT_BOUNDS,
  INTERFACE_ALIGNMENT_CHANNEL_STATES,
  INTERFACE_ALIGNMENT_CSV_COLUMNS,
  INTERFACE_ALIGNMENT_CSV_SCOPE,
  INTERFACE_ALIGNMENT_LIMITS,
  INTERFACE_ALIGNMENT_PAIR_VERDICTS,
  INTERFACE_ALIGNMENT_RULE_ID,
  INTERFACE_ALIGNMENT_SETTING_KEYS,
  INTERFACE_ALIGNMENT_SETTING_LABELS,
  interfaceAlignmentArcState,
  interfaceAlignmentChannelState,
  interfaceAlignmentEscalationState,
  interfaceAlignmentPairVerdict,
  interfaceAlignmentWorkspaceVerdict,
} from '../core/domain/interfaceAlignmentRegistry.js';

const DIAGRAM_URL = './app/assets/interface-alignment-matrix.jpg';
const num = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const claim = (value) => (value ? 'yes' : 'NO');
const toneForVerdict = (key) => interfaceAlignmentPairVerdict(key).tone;
const toneForChannel = (key) => interfaceAlignmentChannelState(key).tone;
const toneForArc = (key) => interfaceAlignmentArcState(key).tone;

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
  const verdict = interfaceAlignmentWorkspaceVerdict(b.verdict);
  const stats = [
    stat({ label: 'Cross-holder interfaces', value: num(b.crossHolderArcsN), hint: `${b.crossHolderInWindowN} in window · ${b.crossHolderOutOfWindowN} older`, tone: b.crossHolderArcsN ? 'warn' : '' }),
    stat({ label: 'Unattended technical interfaces', value: num(b.failureModeInterfacesN), hint: `${b.unattendedPairsN} no channel · ${b.darkChannelPairsN} dark channel`, tone: b.failureModeInterfacesN ? 'bad' : 'good' }),
    stat({ label: 'Idle coordination channels', value: num(b.failureModeIdleN), hint: 'active agreements with nothing behind them', tone: b.failureModeIdleN ? 'bad' : 'good' }),
    stat({ label: 'Attended pairs', value: num(b.attendedPairsN), hint: `${b.standingPairsN} standing (shared contributors)` }),
    stat({ label: 'Same-holder arcs', value: num(b.sameHolderArcsN), hint: 'inside one accountable manager' }),
    stat({ label: 'Refused (unattributable) arcs', value: num(b.unattributedArcsN), hint: 'never charged to a home line', tone: b.unattributedArcsN ? 'bad' : '' }),
  ];
  return card({
    title: 'The alignment matrix and its three claims',
    subtitle: `${verdict.label}. ${INTERFACE_ALIGNMENT_ADR} · ${report.engineVersion}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' }, stats),
      h('div', { class: 'stack-sm' },
        h('p', { class: 'muted small' }, `${b.precedenceArcsN} declared precedence arc(s) over ${b.nodesN} work record(s); ${b.pairRowsN} organisational interface row(s) between holders. Window: ${report.settings.interfaceAlignmentWindowDays} day(s) (${b.crossHolderInWindowN} of ${b.crossHolderArcsN} cross-holder dependenc(ies) fall inside it).`),
        h('p', { class: 'muted small' }, `Claims, printed separately: counts reconcile — ${claim(b.countsReconcile)}; printed figures are the computed figures — ${claim(b.figuresComplete)}; the census is complete — ${claim(b.interfacesClaim)}.`),
      ),
      b.interfacesClaim
        ? null
        : banner({ tone: 'warn', title: 'The census claim is refused', body: b.claimReason || 'At least one endpoint did not resolve to exactly one accountable manager.' }),
      b.failureModeInterfacesN
        ? banner({ tone: 'bad', title: `${b.failureModeInterfacesN} unattended technical interface(s)`, body: 'Declared work depends across two spans whose holders have no live coordination channel. The two states — nothing declared, and declared-but-dark — are printed apart on the pair table and are never collapsed.' })
        : null,
      b.failureModeIdleN
        ? banner({ tone: 'warn', title: `${b.failureModeIdleN} idle coordination channel(s)`, body: 'An ACTIVE interface agreement sits between two spans with zero live shared people and zero in-window cross-span dependency. Retire it, or record what it stands ready for.' })
        : null,
    ),
  });
}

function renderAskCell(pair) {
  if (!pair.isFinding) return '—';
  const meta = interfaceAlignmentEscalationState(pair.escalationState);
  if (pair.escalationState !== 'unique') return badge(meta.label, meta.tone);
  const who = pair.escalationSeatId || 'one seat';
  if (pair.askState === 'open') {
    return h('span', {}, badge(`open · due ${pair.askDueOn || '—'}`, 'warn'), ` (${who})`);
  }
  if (pair.askState === 'answered') {
    return h('span', {}, badge('answered', 'good'), ` (${who})`);
  }
  return h('span', {}, badge('not issued', 'neutral'), ` (${who})`);
}

function pairsCard(report) {
  const rows = report.pairs.slice(0, INTERFACE_ALIGNMENT_LIMITS.maxPrintedPairs).map((pair) => ({
    holders: h('div', {},
      h('div', {}, `${pair.managerAId === pair.managerAName ? pair.managerAId : pair.managerAName || pair.managerAId} ↔ ${pair.managerBName || pair.managerBId}`),
      h('div', { class: 'muted small' }, `${pair.sharedPeopleN} shared live contributor(s)`)),
    deps: h('div', {},
      h('div', {}, `${pair.depsN} dependenc(ies) · ${pair.flowsAB} → , ${pair.flowsBA} ←`),
      h('div', { class: 'muted small' }, `${pair.depsInWindowN} in window · ${pair.depsOutOfWindowN} older`)),
    channel: badge(pair.channelStateLabel, toneForChannel(pair.channelState)),
    verdict: h('div', {},
      h('div', {}, badge(pair.verdictLabel, toneForVerdict(pair.verdict))),
      pair.failureMode ? h('div', { class: 'muted small' }, pair.failureMode === 'agreement-idle' ? 'failure mode: idle channel' : 'failure mode: unattended interface') : null),
    ask: renderAskCell(pair),
  }));
  return card({
    title: 'Every organisational interface, and what stands behind it',
    subtitle: `${report.pairsTotalN} row(s)${report.pairsTruncatedN ? ` (${report.pairsTruncatedN} more than the print bound)` : ''}. A row is a structural fact about a pair of holders — never a rating of either one.`,
    body: rows.length
      ? table({
        columns: [
          { key: 'holders', label: 'Holders' },
          { key: 'deps', label: 'Cross-span dependencies' },
          { key: 'channel', label: 'Coordination channel' },
          { key: 'verdict', label: 'Verdict' },
          { key: 'ask', label: 'Governed ask' },
        ],
        rows,
      })
      : banner({ tone: 'neutral', title: 'No organisational interface to report', body: 'No cross-holder dependency, no interface agreement and no shared cadence forum connects any two holders in this workspace.' }),
  });
}

function interfacesCard(report) {
  const members = [];
  for (const pair of report.pairs) {
    for (const member of pair.members) {
      members.push({
        pair: `${pair.managerAName || pair.managerAId} ↔ ${pair.managerBName || pair.managerBId}`,
        record: h('div', {}, h('div', {}, `${member.fromLabel} → ${member.toLabel}`), h('div', { class: 'muted small' }, member.relations.join(', '))),
        arcs: `${member.arcsN} (${member.inWindowN} in window)`,
        verdict: badge(pair.verdictLabel, toneForVerdict(pair.verdict)),
      });
    }
    if (pair.membersTruncatedN) {
      members.push({
        pair: `${pair.managerAName || pair.managerAId} ↔ ${pair.managerBName || pair.managerBId}`,
        record: h('em', { class: 'muted small' }, `+${pair.membersTruncatedN} further dependenc(ies) beyond the print bound`),
        arcs: '—',
        verdict: '—',
      });
    }
  }
  return card({
    title: 'Which work crosses which span',
    subtitle: 'The technical side of the matrix: declared precedence pairs whose endpoints sit under different holders.',
    body: members.length
      ? table({
        columns: [
          { key: 'pair', label: 'Holder pair' },
          { key: 'record', label: 'Declared dependency' },
          { key: 'arcs', label: 'Arcs' },
          { key: 'verdict', label: 'Pair verdict' },
        ],
        rows: members.slice(0, INTERFACE_ALIGNMENT_LIMITS.maxPrintedInterfaces * 2),
      })
      : banner({ tone: 'neutral', title: 'No cross-holder dependency is declared', body: 'Every declared precedence arc resolves inside one accountable manager, or is refused as unattributable.' }),
  });
}

function channelsCard(report) {
  const rows = INTERFACE_ALIGNMENT_CHANNEL_STATES.map((meta) => ({
    state: badge(meta.label, meta.tone),
    count: num(report.channelStateCounts?.[meta.key] ?? 0),
    detail: h('span', { class: 'muted small' }, meta.detail),
  }));
  return card({
    title: 'Coordination channels, in their own states',
    subtitle: 'Derived from the append-only bilateral acts (ADR-0162) and live cadence forums. Silence is never a channel; a dark channel is never read as a live one.',
    body: table({
      columns: [
        { key: 'state', label: 'Channel state' },
        { key: 'count', label: 'Pairs' },
        { key: 'detail', label: 'What it means' },
      ],
      rows,
    }),
  });
}

function rollUpsCard(report) {
  const rows = report.rollUps.map((roll) => ({
    apex: roll.apexId ? `${roll.apexName || roll.apexId}` : 'No single joint apex (incomparable minimal ancestors)',
    pairs: num(roll.pairsN),
    findings: num(roll.findingsN),
    split: `${roll.unattendedN} unattended · ${roll.darkChannelN} dark · ${roll.idleN} idle`,
    attended: num(roll.attendedN + roll.standingN),
  }));
  return card({
    title: 'The same reading, rolled up to the seat above both spans',
    subtitle: 'Each pair resolves to its matrixJointApex. A diamond tie is named, never broken.',
    body: rows.length
      ? table({
        columns: [
          { key: 'apex', label: 'Joint apex' },
          { key: 'pairs', label: 'Pairs' },
          { key: 'findings', label: 'Findings' },
          { key: 'split', label: 'Failure-mode split' },
          { key: 'attended', label: 'Attended / standing' },
        ],
        rows,
      })
      : banner({ tone: 'neutral', title: 'No roll-up to print', body: 'No pair row exists, so no apex carries interface exposure.' }),
  });
}

function refusalsCard(report) {
  const rows = [];
  for (const arcState of INTERFACE_ALIGNMENT_ARC_STATES) {
    const count = arcState.key === 'cross-holder' ? report.board.crossHolderArcsN
      : arcState.key === 'same-holder' ? report.board.sameHolderArcsN
        : report.board.unattributedArcsN;
    rows.push({
      kind: badge(arcState.label, toneForArc(arcState.key)),
      count: num(count),
      why: h('span', { class: 'muted small' }, arcState.key === 'unattributed-endpoint'
        ? 'An endpoint does not resolve to exactly one accountable manager; refused, never charged to a home line.'
        : 'The declared arc census class.'),
    });
  }
  for (const refusal of report.refusals) {
    rows.push({
      kind: badge(refusal.label, 'warn'),
      count: num(refusal.count),
      why: h('span', { class: 'muted small' }, refusal.details.join(' · ') || refusal.label),
    });
  }
  for (const excluded of report.excluded) {
    rows.push({
      kind: badge(`Excluded relation: ${excluded.relation}`, 'neutral'),
      count: num(excluded.count),
      why: h('span', { class: 'muted small' }, excluded.reason),
    });
  }
  return card({
    title: 'What was refused, and why',
    subtitle: `${report.board.refusalsN} refusal(s), ${report.board.excludedRelationsN} excluded non-precedence claim(s). Nothing here was dropped silently.`,
    body: table({
      columns: [
        { key: 'kind', label: 'Class' },
        { key: 'count', label: 'Count' },
        { key: 'why', label: 'Reason' },
      ],
      rows,
    }),
  });
}

function controlsCard(ctx, report) {
  const canGovern = typeof ctx?.api?.matrixInterfaceAlignmentSetConventions === 'function';
  const windowInput = h('input', { class: 'input', type: 'number', min: String(INTERFACE_ALIGNMENT_BOUNDS.windowDays[0]), max: String(INTERFACE_ALIGNMENT_BOUNDS.windowDays[1]), value: String(report.settings.interfaceAlignmentWindowDays), id: 'align-window-days' });
  const askInput = h('input', { class: 'input', type: 'number', min: String(INTERFACE_ALIGNMENT_BOUNDS.askDueDays[0]), max: String(INTERFACE_ALIGNMENT_BOUNDS.askDueDays[1]), value: String(report.settings.interfaceAlignmentAskDueDays), id: 'align-ask-days' });
  const autoInput = h('input', { type: 'checkbox', id: 'align-auto', ...(report.settings.interfaceAlignmentAutoPropagate ? { checked: true } : {}) });
  return card({
    title: 'Scan and conventions',
    subtitle: `The pause switch governs EVERY path, including explicit scans — a pause is a pause. ${INTERFACE_ALIGNMENT_RULE_ID}.`,
    actions: [h('button', {
      class: 'btn btn-small', type: 'button',
      onClick: () => {
        if (typeof ctx?.api?.matrixInterfaceAlignmentScan !== 'function') return;
        runAction(ctx, ctx.api.matrixInterfaceAlignmentScan(), 'Alignment scan complete — the register re-derived from the record.');
      },
    }, 'Run alignment scan now')],
    body: h('div', { class: 'stack-sm' },
      h('p', { class: 'muted small' }, `Findings with one accountable roster seat keep at most ${INTERFACE_ALIGNMENT_LIMITS.asksPerCommit} open ask(s) per commit; everyone else is observed once, identity-free, and nobody is substituted.`),
      canGovern ? h('div', { class: 'grid grid-3' },
        h('label', { class: 'stack-sm' }, h('span', { class: 'muted small' }, INTERFACE_ALIGNMENT_SETTING_LABELS.windowDays), windowInput),
        h('label', { class: 'stack-sm' }, h('span', { class: 'muted small' }, INTERFACE_ALIGNMENT_SETTING_LABELS.askDueDays), askInput),
        h('label', { class: 'row-actions' }, autoInput, h('span', { class: 'muted small' }, INTERFACE_ALIGNMENT_SETTING_LABELS.autoPropagate)),
      ) : null,
      canGovern ? h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => {
          const patch = {};
          patch[INTERFACE_ALIGNMENT_SETTING_KEYS.windowDays] = Number(windowInput.value);
          patch[INTERFACE_ALIGNMENT_SETTING_KEYS.askDueDays] = Number(askInput.value);
          patch[INTERFACE_ALIGNMENT_SETTING_KEYS.autoPropagate] = Boolean(autoInput.checked);
          runAction(ctx, ctx.api.matrixInterfaceAlignmentSetConventions(patch), 'Alignment conventions saved.');
        },
      }, 'Save conventions') : null,
    ),
  });
}

function briefCard(report) {
  const rows = interfaceAlignmentCsvRows(report);
  const downloadCsv = () => {
    downloadText({
      filename: `leados-matrix-interface-alignment-${report.generatedOn}.csv`,
      text: serializeCsv(INTERFACE_ALIGNMENT_CSV_COLUMNS.map((key) => ({ key, header: key })), rows),
    });
  };
  return card({
    title: 'The brief (identity-free)',
    subtitle: 'The paragraph that goes upward. It names no person, no pair and no record.',
    actions: [h('button', { class: 'btn btn-small', type: 'button', onclick: downloadCsv }, 'Download CSV (aggregate-only)')],
    body: h('div', { class: 'stack-sm' },
      h('p', {}, interfaceAlignmentBriefText(report)),
      h('p', { class: 'muted small' }, `The export carries counts only: no person, no manager, no pair key, no line id, no record id, no title, no note and no record date. Every declared column is present on every row; a refused claim prints its reason rather than a zero. ${rows.length} row(s) are exported from the same reader this panel renders (scope ${INTERFACE_ALIGNMENT_CSV_SCOPE}).`),
    ),
  });
}

function methodCard(report) {
  return card({
    title: 'Method, conventions and frameworks',
    subtitle: 'What this register does, what it refuses, and the bodies of work it stands on.',
    body: h('div', { class: 'stack' },
      h('figure', {},
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Conceptual method diagram: declared work dependencies crossing two spans are read against recorded coordination channels — an active agreement or a shared cadence forum — and classified as attended, channel-not-live or unattended, while an active agreement with no shared person and no in-window dependency is classified as an idle coordination channel.',
          style: 'max-width:100%;height:auto;border-radius:8px;',
        }),
        h('figcaption', { class: 'muted small' }, 'Conceptual method diagram (generated asset) — not workspace data.'),
      ),
      h('div', {},
        h('h4', {}, 'Method'),
        h('ol', { class: 'muted small' }, ...report.method.map((step) => h('li', {}, step))),
      ),
      h('div', {},
        h('h4', {}, 'Conventions'),
        h('ul', { class: 'muted small' }, ...report.conventions.map((row) => h('li', {}, h('strong', {}, `${row.label}. `), row.detail))),
      ),
      h('div', {},
        h('h4', {}, 'Frameworks'),
        h('ul', { class: 'muted small' }, ...report.frameworks.map((row) => h('li', {}, h('strong', {}, `${row.label}. `), row.detail))),
      ),
    ),
  });
}

export function renderMatrixInterfaceAlignmentPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  let report;
  if (typeof ctx?.api?.matrixInterfaceAlignmentReport === 'function') {
    const res = ctx.api.matrixInterfaceAlignmentReport();
    if (!res?.ok) {
      return card({
        title: 'Product–organisation interface alignment',
        body: banner({ tone: 'bad', title: 'Reading refused', body: res?.error || 'The alignment reader could not run.' }),
      });
    }
    report = res.report;
  } else {
    report = buildInterfaceAlignment(state, { now, settings: state.settings || null });
  }

  return h('div', { class: 'stack', 'data-testid': 'interface-alignment-panel' },
    h('p', { class: 'lede' }, 'An org chart shows who reports to whom. It does not show whether the work that actually depends across two spans is carried by any coordination channel between their holders — and whether every channel that was agreed still has work behind it. This matrix joins the declared typed dependency graph to the recorded coordination channels and prints the two classic misalignments apart: unattended technical interfaces and idle coordination channels.'),
    boardCard(report),
    pairsCard(report),
    interfacesCard(report),
    channelsCard(report),
    rollUpsCard(report),
    refusalsCard(report),
    controlsCard(ctx, report),
    briefCard(report),
    methodCard(report),
  );
}

export default renderMatrixInterfaceAlignmentPanel;
