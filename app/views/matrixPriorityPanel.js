/**
 * app/views/matrixPriorityPanel.js — `#/matrix?panel=priority`, the Cross-Line
 * Priority Ballot & Social-Choice Aggregation register (Condorcet 1785;
 * Arrow 1951; Schulze 2011; Kemeny 1959; Schwartz; Galbraith 1973)
 * (ADR-0191, Schema v151, CSV scope #144, `RULE-SOC-01`).
 *
 * One reader (`buildPriorityRanking`) is behind the board, the per-round
 * aggregate, the roll-ups, the brief and the CSV. Nothing is recomputed here, so
 * what the screen prints is what the reader computed. A withheld figure prints a
 * dash and its reason, never a zero.
 */
import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { buildPriorityRanking, priorityBallotBriefText } from '../core/domain/priorityRanking.js';
import {
  PRIORITY_BALLOT_ADR,
  PRIORITY_BALLOT_BOUNDS,
  PRIORITY_BALLOT_CSV_COLUMNS,
  PRIORITY_BALLOT_CSV_SCOPE,
  PRIORITY_BALLOT_ENGINE_VERSION,
  PRIORITY_BALLOT_LIMITS,
  PRIORITY_BALLOT_RULE_ID,
  PRIORITY_BALLOT_SETTING_KEYS,
  PRIORITY_BALLOT_SETTING_LABELS,
} from '../core/domain/priorityRankingRegistry.js';

const DIAGRAM_URL = './app/assets/cross-line-priority-ballot.jpg';

const PANELS = Object.freeze([
  Object.freeze({ key: 'board', label: 'Board' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : String(value));
const num = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : '—');
const claim = (value) => (value ? 'yes' : 'NO');
const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((row) => row.key === key) ? key : 'board';
};

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function notify(result, message) {
  if (!result?.ok) {
    toast(result?.error || 'The priority-ballot action was refused.', 'bad');
    return false;
  }
  toast(result.warning || message, result.warning ? 'bad' : 'good');
  return true;
}

function submit(ctx, form, result, message) {
  if (!result?.ok) {
    if (result?.field && form?.field?.(result.field)) form.setErrors({ [result.field]: result.error });
    toast(result?.error || 'The priority-ballot action was refused.', 'bad');
    return;
  }
  notify(result, message);
  closeAllModals();
  refresh(ctx);
}

/* ----------------------------------------------------------------- dialogs */

function ballotDialog(ctx, row, line) {
  const ranks = row.items.map((item, index) => ({ item, index }));
  const form = buildForm([
    { type: 'static', label: 'The frozen set', value: h('ol', { class: 'plain-list' }, ...row.items.map((item) => h('li', null, item.title))), help: 'Every item is frozen. You rank all of them, first to last; you cannot add or drop one.' },
    ...ranks.map(({ item, index }) => ({
      name: `rank-${item.key}`,
      label: item.title,
      type: 'select',
      value: String(index + 1),
      options: row.items.map((_, position) => ({ value: String(position + 1), label: `Rank ${position + 1}` })),
      help: item.live ? null : 'This item has since closed; it was live when the round opened and stays in the frozen set.',
    })),
  ]);
  openModal({
    title: `Cast your line’s ballot — ${line.kind} line`,
    description: `“${row.title}” · about ${row.personName} · opened ${row.openedOn}, due ${row.dueOn}. Your ballot is one act, not an edit.`,
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'priority-cast-ballot',
        onClick: () => {
          const values = form.getValues();
          const picks = row.items.map((item) => ({ key: item.key, rank: Number(values[`rank-${item.key}`]) }));
          const sorted = [...picks].sort((a, b) => a.rank - b.rank);
          const duplicates = picks.length !== new Set(picks.map((pick) => pick.rank)).size;
          if (duplicates) {
            form.setErrors({ [`rank-${row.items[0].key}`]: 'Two items hold the same rank. Give every item its own place.' });
            toast('Two items hold the same rank — the ballot was not cast.', 'bad');
            return;
          }
          submit(ctx, form, ctx.api.matrixPriorityCastBallot({ roundId: row.roundId, lineKey: line.lineKey, ranking: sorted.map((pick) => pick.key) }), 'Ballot cast. The aggregate re-derived from the record.');
        },
      }, 'Cast ballot'),
    ],
  });
}

function itemsDialog(ctx, candidate) {
  const form = buildForm([
    { name: 'title', label: 'What are the lines being asked to order?', type: 'text', value: '', required: true, help: `At least ${PRIORITY_BALLOT_LIMITS.titleMin} characters, e.g. “What Sam works on first this week”.` },
    { name: 'itemKeys', label: 'Freeze the work items', type: 'boolean-block', value: [], options: candidate.items.map((item) => ({ value: item.key, label: item.title })), help: `Choose ${PRIORITY_BALLOT_LIMITS.itemsMin}–${PRIORITY_BALLOT_LIMITS.itemsMax}. A delivered item cannot be frozen.` },
    { name: 'dueOn', label: 'Ballot deadline (optional)', type: 'date', value: '', help: 'Blank uses the declared default deadline. It must be after today.' },
  ]);
  openModal({
    title: `Open a priority round — ${candidate.personName}`,
    description: `${candidate.lines.length} active line(s) will be frozen and asked: ${candidate.lines.map((line) => `${line.kind} (${line.managerName})`).join(' · ')}. Reorganising later cannot add a voter.`,
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'priority-declare-round',
        onClick: () => {
          const values = form.getValues();
          const patch = { personId: candidate.personId, title: values.title, itemKeys: values.itemKeys };
          if (values.dueOn) patch.dueOn = values.dueOn;
          submit(ctx, form, ctx.api.matrixPriorityDeclareRound(patch), 'Round opened: the item set and the lines are frozen.');
        },
      }, 'Open round'),
    ],
  });
}

function declareDialog(ctx) {
  const result = ctx.api.matrixPriorityCandidates();
  if (!result?.ok) { toast(result?.error || 'No candidate could be read.', 'bad'); return; }
  if (!result.candidates.length) {
    toast('Nobody on this seat’s roster owns a live open portfolio item, so there is nothing to freeze into a round.', 'bad');
    return;
  }
  const form = buildForm([
    { name: 'personId', label: 'Who is the round about?', type: 'select', value: result.candidates[0].personId, options: result.candidates.map((candidate) => ({ value: candidate.personId, label: `${candidate.personName} — ${candidate.items.length} live item(s), ${candidate.lines.length} line(s)` })) },
  ]);
  openModal({
    title: 'Open a cross-line priority round',
    description: 'The person, their live work items and their reporting lines are frozen on the day you open it.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const chosen = result.candidates.find((candidate) => candidate.personId === form.getValues().personId);
          closeAllModals();
          if (chosen) itemsDialog(ctx, chosen);
        },
      }, 'Choose items'),
    ],
  });
}

function withdrawDialog(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is this round being withdrawn?', type: 'textarea', rows: 3, value: '', help: 'Required. Ballots already cast stay on the record as history.' }]);
  openModal({
    title: `Withdraw — “${row.title}”`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-danger', type: 'button', onClick: () => submit(ctx, form, ctx.api.matrixPriorityWithdrawRound({ roundId: row.roundId, reason: form.getValues().reason }), 'Round withdrawn; its ballots are kept as history.') }, 'Withdraw round'),
    ],
  });
}

function conventionsDialog(ctx, report) {
  const numeric = ['ballotDueDays', 'askDueDays', 'minBallots'];
  const form = buildForm([
    ...numeric.map((name) => ({
      name: PRIORITY_BALLOT_SETTING_KEYS[name],
      type: 'number',
      value: String(report.settings[PRIORITY_BALLOT_SETTING_KEYS[name]]),
      label: `${PRIORITY_BALLOT_SETTING_LABELS[name]} (${PRIORITY_BALLOT_BOUNDS[name][0]}–${PRIORITY_BALLOT_BOUNDS[name][1]})`,
    })),
    { name: PRIORITY_BALLOT_SETTING_KEYS.autoPropagate, type: 'checkbox', value: report.settings[PRIORITY_BALLOT_SETTING_KEYS.autoPropagate], label: PRIORITY_BALLOT_SETTING_LABELS.autoPropagate },
  ]);
  openModal({
    title: 'Re-declare priority-ballot conventions',
    description: 'A value outside its bounds is refused, never clamped.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const patch = Object.fromEntries(numeric.map((name) => [PRIORITY_BALLOT_SETTING_KEYS[name], Number(values[PRIORITY_BALLOT_SETTING_KEYS[name]])]));
          patch[PRIORITY_BALLOT_SETTING_KEYS.autoPropagate] = Boolean(values[PRIORITY_BALLOT_SETTING_KEYS.autoPropagate]);
          submit(ctx, form, ctx.api.matrixPrioritySetConventions(patch), 'Conventions re-declared.');
        },
      }, 'Save conventions'),
    ],
  });
}

function exportCsv(ctx, report) {
  const result = ctx.api.matrixPriorityCsvRows?.();
  if (!result?.ok) { toast(result?.error || 'The priority-ballot export was refused.', 'bad'); return; }
  downloadText({
    filename: `leados-matrix-priority-ballots-${report.today}.csv`,
    text: serializeCsv(PRIORITY_BALLOT_CSV_COLUMNS.map((key) => ({ key, header: key })), result.rows),
    mime: 'text/csv;charset=utf-8',
  });
  toast('Aggregate CSV downloaded — the same figures this screen printed.', 'good');
}

/* ------------------------------------------------------------------ pieces */

function statGrid(report) {
  const b = report.board;
  const coverage = b.coverageWithheld
    ? '—'
    : `${b.coveragePct}%`;
  return h('div', { class: 'grid grid-3', 'data-testid': 'priority-stats' },
    stat({ label: 'Rounds', value: num(b.roundsN), hint: `${b.liveN} live · ${b.withdrawnN} withdrawn` }),
    stat({ label: 'Ballots cast', value: `${b.ballotsCastN} / ${b.linesAskedN}`, hint: `${b.pendingN} not yet due · ${b.overdueN} overdue · ${b.unresolvableN} unreachable` }),
    stat({ label: 'Ballot coverage', value: coverage, hint: b.coverageWithheld ? b.coverageWithheldReason : `95% Wilson ${dash(b.coverageLowPct)}–${dash(b.coverageHighPct)}%`, tone: b.coverageWithheld ? 'warn' : 'good' }),
    stat({ label: 'Condorcet winners', value: num(b.condorcetN), hint: 'one item beats every other head-to-head', tone: b.condorcetN ? 'good' : '' }),
    stat({ label: 'Majority cycles', value: num(b.cycleN), hint: 'genuine disagreement routed to the joint apex', tone: b.cycleN ? 'bad' : '' }),
    stat({ label: 'Too few ballots', value: num(b.insufficientN), hint: `floor ${report.settings[PRIORITY_BALLOT_SETTING_KEYS.minBallots]} ballot(s)`, tone: b.insufficientN ? 'warn' : '' }),
  );
}

function pairwiseTable(row) {
  if (!row.pairwise.length) return h('p', { class: 'muted small' }, 'No pairwise matrix is claimed for this round.');
  const columns = row.items.map((item) => ({ key: item.key, label: item.title }));
  const rows = row.items.map((left) => {
    const cells = { item: left.title };
    for (const right of row.items) {
      if (left.key === right.key) { cells[right.key] = '·'; continue; }
      const found = row.pairwise.find((pair) => (pair.aKey === left.key && pair.bKey === right.key) || (pair.aKey === right.key && pair.bKey === left.key));
      const wins = found ? (found.aKey === left.key ? found.ab : found.ba) : 0;
      const loses = found ? (found.aKey === left.key ? found.ba : found.ab) : 0;
      cells[right.key] = `${wins}–${loses}`;
    }
    return cells;
  });
  return table({ columns: [{ key: 'item', label: 'Item (row) vs item (column)' }, ...columns], rows });
}

function roundCard(ctx, row) {
  const tone = row.verdictTone;
  const coverageLine = `${row.coverage.answeredN} cast · ${row.coverage.pendingN} pending · ${row.coverage.overdueN} overdue · ${row.coverage.lineEndedN} line ended · ${row.coverage.holderMovedN} holder changed · ${row.coverage.offRosterN} owner off roster`;
  const cycleTitles = row.schwartz.map((key) => row.items.find((item) => item.key === key)?.title || key);
  const beatpath = row.schulze.order.map((key) => row.items.find((item) => item.key === key)?.title || key);
  const kemeny = row.kemeny.ranking
    ? row.kemeny.ranking.map((key) => row.items.find((item) => item.key === key)?.title || key).join(' › ')
    : row.kemeny.state === 'tied'
      ? `no single ranking — ${row.kemeny.optimalN} orderings tie at the top score`
      : 'not claimed above the exactness cap';
  const myLine = row.lines.find((line) => line.state === 'pending' || line.state === 'overdue');
  const body = h('div', { class: 'stack-sm' },
    h('p', { class: 'muted small' }, `About ${row.personName} · opened ${row.openedOn} · ballots due ${row.dueOn} · ${row.itemsN} frozen item(s). ${row.verdictSays}`),
    h('p', { class: 'muted small', 'data-testid': 'priority-coverage' }, coverageLine),
    badge(row.verdictLabel, tone),
    row.verdict === 'condorcet'
      ? h('p', {}, h('strong', {}, 'Condorcet winner: '), row.items.find((item) => item.key === row.condorcet.winnerKey)?.title || row.condorcet.winnerKey)
      : null,
    row.verdict === 'cycle'
      ? h('div', { class: 'stack-sm' },
        h('p', {}, h('strong', {}, 'Schwartz top cycle: '), cycleTitles.join(' · ')),
        h('p', { class: 'muted small' }, row.cycleEdges.map((edge) => `${row.items.find((item) => item.key === edge.fromKey)?.title || edge.fromKey} beats ${row.items.find((item) => item.key === edge.toKey)?.title || edge.toKey} by ${edge.margin}`).join(' · ')))
      : null,
    row.schulze.order.length ? h('p', { class: 'muted small' }, h('strong', {}, 'Beatpath order: '), beatpath.join(' › ')) : null,
    row.votesN >= 2 ? h('p', { class: 'muted small' }, h('strong', {}, 'Kemeny–Young: '), kemeny) : null,
    row.itemsClosedN ? banner({ tone: 'warn', title: 'A frozen item has since closed', body: 'It stays in the frozen set because the ballots were cast over it; the closure is printed, never repaired away.' }) : null,
    row.ballots.length
      ? h('div', { class: 'stack-sm' }, ...row.ballots.map((ballot) => h('p', { class: 'muted small' }, `${ballot.holderName} (${ballot.lineKey === 'home' ? 'home' : 'declared'} line), ${ballot.castOn}: ${ballot.ranking.map((entry) => `${entry.rank}. ${entry.title}`).join(' · ')}`)))
      : h('p', { class: 'muted small' }, 'No ballot has been cast yet. Silence is never a ranking.'),
    pairwiseTable(row),
    h('div', { class: 'row-actions' },
      myLine && typeof ctx?.api?.matrixPriorityCastBallot === 'function'
        ? h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': `priority-ballot-${row.roundId}`, onClick: () => ballotDialog(ctx, row, myLine) }, 'Cast my line’s ballot')
        : null,
      !row.withdrawnOn && typeof ctx?.api?.matrixPriorityWithdrawRound === 'function'
        ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => withdrawDialog(ctx, row) }, 'Withdraw round')
        : null,
    ),
  );
  return card({
    title: row.title,
    subtitle: `${PRIORITY_BALLOT_ADR} · ${row.roundId}`,
    body,
  });
}

function boardPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({ title: 'The board and its separate claims', body: h('div', { class: 'stack' }, statGrid(report),
      h('p', { class: 'muted small' }, `Claims, printed separately: counts reconcile — ${claim(report.board.countsReconcile)}; printed figures are the computed figures — ${claim(report.board.figuresComplete)}.`),
      report.board.figuresComplete ? null : banner({ tone: 'warn', title: 'The figures are not complete', body: report.board.claimReason || 'A read was refused.' }),
      report.board.cycleN ? banner({ tone: 'bad', title: `${report.board.cycleN} majority cycle(s)`, body: `The lines genuinely disagree, and no item beats every other head-to-head. The top cycle and the beatpath order are printed, and ONE dated ask goes to the lines’ lowest joint apex — never broken silently, never resolved by scoring ${'the person'}.` }) : null,
      report.board.overdueN ? banner({ tone: 'warn', title: `${report.board.overdueN} overdue ballot(s)`, body: 'A frozen line holder has not cast by the round deadline. The ask goes to that holder only; a later holder of the same line is never asked on their behalf.' }) : null,
    ) }),
    typeof ctx?.api?.matrixPriorityDeclareRound === 'function'
      ? card({
        title: 'Open a round',
        subtitle: `Freeze ${PRIORITY_BALLOT_LIMITS.itemsMin}–${PRIORITY_BALLOT_LIMITS.itemsMax} live work items and every active line that shares the person.`,
        body: h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': 'priority-open-round', onClick: () => declareDialog(ctx) }, 'Open a priority round'),
      })
      : null,
    report.rounds.length
      ? h('div', { class: 'stack' }, ...report.rounds.map((row) => roundCard(ctx, row)))
      : emptyState({ title: 'No priority round yet', body: 'A round freezes one person’s live work items and asks every line that shares them to rank the set, first to last. Nothing is aggregated until enough ballots are on the record.' }),
    rollupsCard(report),
    refusalsCard(report),
  );
}

function rollupsCard(report) {
  const holders = report.rollups.holders.map((row) => ({
    who: row.holderName,
    owed: String(row.owedN),
    answered: String(row.answeredN),
    cycles: String(row.cycleN),
  }));
  const apexes = report.rollups.apexes.map((row) => ({
    apex: row.unique ? row.apexName : (row.disconnected ? 'no joint apex (disconnected)' : 'ambiguous — several joint apexes'),
    rounds: String(row.roundsN),
    cycles: String(row.cycleN),
    coverage: `${row.answeredN} / ${row.linesN}`,
  }));
  return card({
    title: 'Who was asked, and where a disagreement belongs',
    subtitle: 'A round is counted ONCE per apex, however many lines lead to it.',
    body: h('div', { class: 'stack' },
      holders.length ? table({ columns: [{ key: 'who', label: 'Line holder' }, { key: 'owed', label: 'Ballots owed' }, { key: 'answered', label: 'Cast' }, { key: 'cycles', label: 'Rounds with a cycle' }], rows: holders }) : h('p', { class: 'muted small' }, 'Nobody has been asked yet.'),
      apexes.length ? table({ columns: [{ key: 'apex', label: 'Joint apex of the lines asked' }, { key: 'rounds', label: 'Rounds' }, { key: 'cycles', label: 'Cycles' }, { key: 'coverage', label: 'Ballots / lines' }], rows: apexes }) : null,
    ),
  });
}

function refusalsCard(report) {
  if (!report.refusals.length) return card({ title: 'What was refused, and why', body: h('p', { class: 'muted small' }, 'This read raised no refusal.') });
  return card({
    title: 'What was refused, and why',
    subtitle: `${report.board.refusalsN} refusal(s). Nothing here was dropped silently.`,
    body: table({
      columns: [{ key: 'key', label: 'Class' }, { key: 'count', label: 'Count' }, { key: 'reason', label: 'Reason' }],
      rows: report.refusals.map((row) => ({ key: row.key, count: String(row.count), reason: row.reason })),
    }),
  });
}

function methodPanel(ctx, report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Method and what it refuses',
      subtitle: `${PRIORITY_BALLOT_ADR} · ${PRIORITY_BALLOT_ENGINE_VERSION} · ${PRIORITY_BALLOT_RULE_ID}`,
      body: h('div', { class: 'stack' },
        h('figure', {},
          h('img', { src: DIAGRAM_URL, alt: 'Conceptual method diagram: one person’s frozen work set is ranked by each reporting line that shares them; the ballots are counted pairwise, a Condorcet winner is reported where one exists, and a majority cycle is printed as a top cycle with the beatpath completion and routed to the lines’ lowest joint apex.', style: 'max-width:100%;height:auto;border-radius:8px;' }),
          h('figcaption', { class: 'muted small' }, 'Conceptual method diagram (generated asset) — not workspace data.')),
        h('ol', { class: 'muted small' }, ...report.method.map((step) => h('li', null, step))),
      ),
    }),
    card({
      title: 'Conventions in force',
      subtitle: 'Declared, printed and re-declarable — a value outside its bounds is refused, never clamped.',
      actions: typeof ctx?.api?.matrixPrioritySetConventions === 'function'
        ? [h('button', { class: 'btn btn-small', type: 'button', onClick: () => conventionsDialog(ctx, report) }, 'Re-declare conventions')]
        : [],
      body: h('div', { class: 'stack-sm' },
        table({ columns: [{ key: 'label', label: 'Convention' }, { key: 'value', label: 'Value' }, { key: 'detail', label: 'What it does' }], rows: report.conventions.map((row) => ({ label: row.label, value: String(row.value), detail: row.detail })) }),
        h('p', { class: 'muted small' }, `Automation switch ${report.settings[PRIORITY_BALLOT_SETTING_KEYS.autoPropagate] ? 'ON' : 'PAUSED'} — a pause governs every path, including an explicit scan.`),
      ),
    }),
    card({
      title: 'Bodies of work',
      body: h('ul', { class: 'muted small' }, ...report.frameworks.map((row) => h('li', null, h('strong', {}, `${row.label}. `), row.detail))),
    }),
  );
}

/* -------------------------------------------------------------------- page */

export function renderMatrixPriorityPanel(ctx, opts = {}) {
  const state = ctx?.state || {};
  const now = opts.now || new Date();
  let report;
  if (typeof ctx?.api?.matrixPriorityReport === 'function') {
    const result = ctx.api.matrixPriorityReport();
    if (!result?.ok) {
      return card({ title: 'Cross-line priority ballots', body: banner({ tone: 'bad', title: 'Reading refused', body: result?.error || 'The priority-ballot reader could not run.' }) });
    }
    report = result.report;
  } else {
    report = buildPriorityRanking(state, { now, settings: state.settings || null });
  }
  const query = ctx?.query instanceof URLSearchParams ? ctx.query : (opts.query || null);
  const panel = panelFor(query);
  return h('div', { class: 'stack', 'data-testid': 'priority-panel' },
    pageHeader({
      eyebrow: 'Matrix management · ADR-0191',
      title: 'Cross-line priority ballots',
      subtitle: `Several lines share one person and each orders that person’s work differently. This register freezes the set, takes one first-person ballot per line, and reports the exact Condorcet winner — or the majority cycle — instead of a score. ${PRIORITY_BALLOT_ADR} · CSV #144.`,
      actions: [
        typeof ctx?.api?.matrixPriorityBriefText === 'function'
          ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => {
            const result = ctx.api.matrixPriorityBriefText();
            if (!result?.ok) { toast(result?.error || 'The brief was refused.', 'bad'); return; }
            openModal({ title: 'Priority-ballot brief', description: 'Generated from the same report as this screen — identity-free.', size: 'lg', body: h('pre', { class: 'brief-text', 'data-testid': 'priority-brief' }, result.text), footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Close')] });
          } }, 'Brief')
          : null,
        typeof ctx?.api?.matrixPriorityCsvRows === 'function'
          ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => exportCsv(ctx, report) }, 'Download CSV (aggregate-only)')
          : null,
        typeof ctx?.api?.matrixPriorityScan === 'function'
          ? h('button', { class: 'btn btn-small', type: 'button', onClick: () => notify(ctx.api.matrixPriorityScan(), 'Priority-ballot scan complete — the register re-derived from the record.') }, 'Run scan now')
          : null,
      ].filter(Boolean),
    }),
    tabs({ items: PANELS.map((row) => ({ key: row.key, label: row.label })), active: panel, ariaLabel: 'Priority ballot panels',
      onSelect: (key) => ctx.navigate(`#/matrix?panel=${encodeURIComponent(key)}`) }),
    panel === 'method' ? methodPanel(ctx, report) : boardPanel(ctx, report),
    h('p', { class: 'muted small' }, `CSV scope ${PRIORITY_BALLOT_CSV_SCOPE}: aggregate rows only. The brief and the export are built from the same reader this screen renders. ${priorityBallotBriefText(report).split('.')[0]}.`),
  );
}

export default renderMatrixPriorityPanel;
