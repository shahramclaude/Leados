/**
 * app/views/concordance.js — The Concordance Terminal (Schema v89, ADR-0083).
 *
 * Five panels, five genuinely different questions:
 *   Rounds      "Where are our two gauges reading the same word?" (frontline work)
 *   Roll-up     "Which spans and which words diverge, at every altitude?" (structure)
 *   Signals     "What is waiting on a human right now?" (triage)
 *   Conventions "What is the instrument, and what did we declare?" (definition)
 *   Brief       "What can I hand upward without exposing one person?" (export)
 *
 * A declared operating seat sees only its own subtree; at director rank and
 * above the pair identity and the two gauges are withheld and only span rates
 * survive. A sealed round renders no values at all — not to the other side, and
 * not as a recap to the side that already answered.
 */
import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { dayKey, formatDate } from '../core/time.js';
import { LEADER_ID } from '../core/domain/chain.js';
import { conversationScript } from '../core/domain/concordance.js';
import {
  CONCORDANCE_DIMENSIONS,
  CONCORDANCE_LIMITS,
  CONCORDANCE_PANELS,
  CONCORDANCE_RULES,
  CONCORDANCE_SCALE,
} from '../core/domain/concordanceRegistry.js';

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return CONCORDANCE_PANELS.includes(p) ? p : 'rounds';
};
const go = (ctx, panel, extra = '') => ctx.navigate(`#/concordance?panel=${panel}${extra}`);
const show = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'refused' : String(v));
const showPct = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'refused' : `${v}%`);

/** A bar the reader can count: five boxes, the answered one filled. */
function gauge(value, tone) {
  return h('div', { class: `ec-gauge ec-gauge-${tone}`, role: 'img', 'aria-label': value === null ? 'not answered' : `bar ${value} of ${CONCORDANCE_SCALE}` },
    ...Array.from({ length: CONCORDANCE_SCALE }, (_, i) => h('span', {
      class: `ec-pip${value !== null && i < value ? ' ec-pip-on' : ''}`,
      'aria-hidden': 'true',
    }, String(i + 1))));
}

function refusalList(stats) {
  if (!stats?.refusalReasons?.length) return null;
  return h('div', { class: 'stack' },
    ...stats.refusalReasons.map((reason) => h('p', { class: 'muted' }, `— ${reason}`)));
}

function statsGrid(stats, conv) {
  if (!stats) return null;
  return h('div', { class: 'stat-grid' },
    stat({
      label: 'Weighted κ (quadratic)',
      value: showPct(stats.kappaPct),
      hint: stats.band === 'refused' ? 'refused — see the reasons' : `${stats.band} band (Landis–Koch, a declared convention) · floor ${conv.agreementFloorPct}%`,
      tone: stats.kappaPct === null ? 'warn' : stats.clearsFloor ? 'good' : 'bad',
    }),
    stat({ label: 'AC1 (Gwet)', value: showPct(stats.ac1Pct), hint: 'prevalence-robust: the answer when κ collapses on one end of the scale' }),
    stat({ label: 'PABAK', value: showPct(stats.pabakPct), hint: '2·Po − 1 — no chance correction, printed so it cannot be cherry-picked' }),
    stat({ label: 'Exact agreement', value: showPct(stats.exactPct), hint: `${stats.exactN} of ${stats.n} item(s) landed on the same point` }),
    stat({ label: 'Within one step', value: showPct(stats.within1Pct), hint: 'the “same ballpark, different anchor” band' }),
    stat({
      label: 'Bias (leader − report)',
      value: stats.bias === null ? 'refused' : `${stats.bias > 0 ? '+' : ''}${stats.bias}`,
      hint: stats.biasDirection === 'level' ? 'neither side is systematically asking for more' : `${stats.biasDirection.replace('-', ' ')}: 95% limits ${show(stats.loaLower)} to ${show(stats.loaUpper)}`,
    }),
    stat({ label: 'Mean gap per dimension', value: show(stats.meanAbsDiff), hint: 'average absolute steps apart across answered dimensions' }),
    stat({ label: 'Dimensions two steps apart', value: String(stats.divergedDimensions.length), hint: `${stats.answeredItemCount} of ${stats.itemFloor} dimensions answered` }),
  );
}

function ladder(stats, round) {
  if (!stats) return emptyState({ title: 'Nothing measured yet', body: 'Open a round and answer all six dimensions on both sides.' });
  const sealed = round && round.status !== 'closed';
  return h('div', { class: 'stack' },
    ...stats.perDimension.map((dimension) => h('div', { class: 'ec-ladder-row' },
      h('div', { class: 'ec-ladder-q' },
        h('strong', null, dimension.label),
        h('span', { class: 'muted' }, ` ${dimension.question}`)),
      h('div', { class: 'ec-ladder-gauges' },
        h('div', { class: 'ec-side' },
          h('span', { class: 'ec-side-label' }, 'Leader'),
          sealed ? badge('sealed', 'neutral', 'Revealed only when both sides are in') : gauge(dimension.leader, 'leader'),
          h('span', { class: 'muted' }, sealed || dimension.leader === null ? '' : dimension.anchors[dimension.leader - 1])),
        h('div', { class: 'ec-side' },
          h('span', { class: 'ec-side-label' }, 'Report'),
          sealed ? badge('sealed', 'neutral', 'Revealed only when both sides are in') : gauge(dimension.member, 'member'),
          h('span', { class: 'muted' }, sealed || dimension.member === null ? '' : dimension.anchors[dimension.member - 1]))),
      h('div', { class: 'ec-ladder-gap' },
        dimension.answered && !sealed
          ? badge(dimension.absDiff === 0 ? 'same' : `${dimension.absDiff} apart`, dimension.absDiff === 0 ? 'good' : dimension.absDiff >= 2 ? 'bad' : 'warn')
          : badge('—', 'neutral')),
      !sealed && dimension.reading ? h('p', { class: 'ec-reading' }, dimension.reading) : null,
    )),
  );
}

export function renderConcordance(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const panel = panelFor(ctx.query);
  const report = ctx.api.concordanceRead();
  const conv = report.conventions;
  const selectedRoundId = ctx.query?.get?.('round') || null;
  const selectedPairRef = ctx.query?.get?.('pair') || null;
  const people = (ctx.state.people || []).filter((p) => p && p.status !== 'archived');
  const nameOf = (id) => (id === LEADER_ID ? (ctx.state.settings?.leaderName || 'Workspace leader') : (people.find((p) => p.id === id)?.name || 'Unknown'));
  const reportsOf = (leaderId) => people.filter((p) => (p.managerId || LEADER_ID) === leaderId && p.id !== leaderId);
  const leaders = [LEADER_ID, ...people.filter((p) => people.some((q) => q.managerId === p.id))];
  const selectedRound = selectedRoundId ? report.rounds.find((r) => r.id === selectedRoundId) : null;
  const selectedPair = selectedPairRef ? report.pairs.find((p) => p.ref === selectedPairRef) : null;

  const refreshTo = (panelName, extra = '') => {
    ctx.refresh();
    go(ctx, panelName, extra);
  };

  /* ------------------------------------------------------------- actions */
  const openRoundModal = () => {
    const leaderSelect = h('select', { id: 'ec-leader', class: 'input' },
      ...leaders.map((id) => h('option', { value: id }, nameOf(id))));
    const memberSelect = h('select', { id: 'ec-member', class: 'input' });
    const cycleInput = h('input', { id: 'ec-cycle', class: 'input', type: 'text', maxlength: String(CONCORDANCE_LIMITS.cycleChars), value: dayKey(now).slice(0, 7), 'aria-describedby': 'ec-cycle-hint' });
    const fillMembers = () => {
      const options = reportsOf(leaderSelect.value);
      memberSelect.replaceChildren(...(options.length
        ? options.map((p) => h('option', { value: p.id }, p.name))
        : [h('option', { value: '' }, 'No direct reports in this span')]));
    };
    leaderSelect.addEventListener('change', fillMembers);
    fillMembers();
    const body = h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One round, two sealed sides', body: 'Both people answer the same six dimensions independently. Nothing is revealed until both sides are in — that is what stops the second person anchoring on the first.' }),
      h('label', { class: 'field' }, h('span', null, 'Leader (the person who owns the expectation)'), leaderSelect),
      h('label', { class: 'field' }, h('span', null, 'Report (the person holding the expectation)'), memberSelect),
      h('label', { class: 'field' }, h('span', null, 'Cycle label'), cycleInput),
      h('p', { class: 'muted', id: 'ec-cycle-hint' }, 'Free label used to group rounds over time — a month, a quarter or a review cycle. Two rounds make a trend; one makes a mood.'),
      h('p', { class: 'muted' }, report.disclosure.instrument),
    );
    openModal({
      title: 'Open an expectation round',
      description: 'Two sides, six dimensions, sealed until both are in.',
      body,
      footer: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.concordanceOpenRound({ leaderId: leaderSelect.value, memberId: memberSelect.value, cycle: cycleInput.value });
            toast(res.ok ? 'Round opened. Both sides are sealed.' : (res.error || 'Round not opened.'), res.ok ? 'good' : 'bad');
            if (res.ok) { closeAllModals(); refreshTo('rounds', `&round=${encodeURIComponent(res.round.id)}`); }
          },
        }, 'Open round'),
      ],
    });
  };

  const submitForm = (round, side) => {
    const formId = `ec-form-${side}-${round.id}`;
    const groups = CONCORDANCE_DIMENSIONS.map((dimension) => h('fieldset', { class: 'ec-fieldset' },
      h('legend', null, dimension.label),
      h('p', { class: 'muted' }, dimension.question),
      h('div', { class: 'ec-scale', role: 'radiogroup', 'aria-label': dimension.label },
        ...dimension.anchors.map((anchor, index) => {
          const value = String(index + 1);
          const inputId = `${formId}-${dimension.key}-${value}`;
          return h('label', { class: 'ec-scale-option', for: inputId },
            h('input', { id: inputId, type: 'radio', name: `${formId}-${dimension.key}`, value, required: true }),
            h('span', { class: 'ec-scale-num' }, value),
            h('span', { class: 'ec-scale-text' }, anchor));
        })),
    ));
    const note = h('textarea', { class: 'input', rows: '2', maxlength: String(CONCORDANCE_LIMITS.noteChars), 'aria-label': `Optional note from the ${side}` });
    const submit = h('button', { class: 'btn btn-primary', type: 'button' }, `Seal the ${side === 'leader' ? 'leader’s' : 'report’s'} side`);
    submit.addEventListener('click', () => {
      const ratings = {};
      for (const dimension of CONCORDANCE_DIMENSIONS) {
        const checked = document.querySelector(`input[name="${formId}-${dimension.key}"]:checked`);
        if (checked) ratings[dimension.key] = Number(checked.value);
      }
      const res = ctx.api.concordanceSubmit(round.id, side, ratings, note.value);
      toast(res.ok
        ? (res.sealed ? 'Side sealed. The other side is not visible until it lands.' : 'Both sides are in. The two gauges are now visible to both.')
        : (res.error || 'Not submitted.'), res.ok ? 'good' : 'bad');
      if (res.ok) refreshTo('rounds', `&round=${encodeURIComponent(round.id)}`);
    });
    return h('div', { class: 'stack ec-submit-block' },
      h('p', { class: 'muted' }, `${side === 'leader' ? 'Leader’s' : 'Report’s'} side · answered independently, sealed on submit.`),
      ...groups,
      h('label', { class: 'field' }, h('span', null, 'Note (optional, revealed with the answers)'), note),
      submit);
  };

  const withdraw = (round) => {
    const confirm = h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
      const res = ctx.api.concordanceWithdraw(round.id, 'Withdrawn from the rounds panel');
      toast(res.ok ? 'Round withdrawn. Nothing was measured.' : (res.error || 'Could not withdraw.'), res.ok ? 'warn' : 'bad');
      if (res.ok) { closeAllModals(); refreshTo('rounds'); }
    } }, 'Withdraw round');
    openModal({
      title: 'Withdraw this round?',
      description: 'A withdrawn round produces no agreement figure and no decision.',
      body: h('p', null, 'Withdraw if the pair is no longer a pair, the cycle changed, or the instrument was misunderstood. A closed round cannot be withdrawn — it is evidence.'),
      footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Keep it'), confirm],
    });
  };

  const runScan = () => {
    const res = ctx.api.concordanceScan();
    toast(res.ok ? `Reconciled the roll-up ladder. ${res.propagations?.length || 0} propagation(s).` : (res.error || 'Scan failed.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const downloadBrief = () => {
    const res = ctx.api.concordanceBriefText();
    if (!res.ok) { toast(res.error || 'Brief unavailable', 'bad'); return; }
    const ok = downloadText({ filename: `leados-concordance-brief-${dayKey(now)}.md`, text: res.text, mime: 'text/markdown;charset=utf-8' });
    toast(ok ? 'Identity-free brief downloaded' : 'Download not available — open the Brief panel and copy the text', ok ? 'good' : 'warn');
  };

  const exportCsv = () => {
    const res = ctx.api.exportCSV('expectation-concordance');
    if (res.ok && res.csv) {
      const ok = downloadText({ filename: res.filename, text: res.csv, mime: 'text/csv;charset=utf-8' });
      toast(ok ? 'Aggregate-only CSV downloaded' : 'Download not available', ok ? 'good' : 'bad');
    } else toast(res.error || 'Export failed', 'bad');
  };

  const saveConventions = (values) => {
    const res = ctx.api.concordanceSetConventions(values);
    toast(res.ok ? 'Conventions saved.' : (res.error || 'Not saved.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  /* -------------------------------------------------------------- panels */
  function roundsPanel() {
    const opener = h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: openRoundModal, ...(report.detailWithheld ? { disabled: true, title: 'A director-rank seat reads span rates, not pair detail.' } : {}) }, 'Open a round'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Reconcile roll-up'));

    const openRows = report.open.length
      ? report.open.map((round) => {
        const leaderIn = Boolean(round.leaderSubmittedAt);
        const memberIn = Boolean(round.memberSubmittedAt);
        const bothIn = leaderIn && memberIn;
        const pairVisible = round.detailVisible !== false;
        const canSubmitLeader = !leaderIn && pairVisible;
        const canSubmitMember = !memberIn && pairVisible;
        return card({
          title: pairVisible ? `${nameOf(round.leaderId)} → ${nameOf(round.memberId)}` : 'Span pair · detail withheld at this altitude',
          subtitle: `Cycle ${round.cycle} · opened ${round.openedOn || 'recently'} · ${bothIn ? 'both sides in' : 'sealed'}`,
          actions: [round.stale ? badge('reporting line moved', 'warn') : null, badge(round.status, 'neutral')].filter(Boolean),
          body: h('div', { class: 'stack' },
            round.stale ? banner({ tone: 'warn', title: 'The reporting line changed under this round', body: 'It was opened against a different path. Withdraw it and open a new round rather than re-homing it — the pair may not be a pair any more.' }) : null,
            h('div', { class: 'row-actions' },
              badge(leaderIn ? 'Leader: sealed ✓' : 'Leader: not in', leaderIn ? 'good' : 'neutral'),
              badge(memberIn ? 'Report: sealed ✓' : 'Report: not in', memberIn ? 'good' : 'neutral')),
            pairVisible ? (bothIn ? null : banner({ tone: 'info', title: 'Nothing is revealed yet', body: 'The side that is in cannot see the side that is not, and cannot revise after sealing. This is what stops the second answer anchoring on the first.' })) : banner({ tone: 'warn', title: 'Detail withheld', body: 'This round belongs to a span you do not lead. It contributes to the rates; it does not open its two gauges here.' }),
            canSubmitLeader ? submitForm(round, 'leader') : null,
            canSubmitMember ? submitForm(round, 'member') : null,
            h('div', { class: 'row-actions' },
              h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => withdraw(round) }, 'Withdraw')),
          ),
        });
      })
      : [emptyState({ title: 'No open rounds', body: 'Open a round for a leader and one of their reports. Six dimensions, two sides, sealed until both are in.' })];

    const pairCards = report.pairs.length
      ? report.pairs.slice(0, 24).map((pair) => card({
        title: `${pair.leaderName} → ${pair.memberName}`,
        subtitle: `${pair.altitudeLabel} · ${pair.history.length} round(s) on record`,
        actions: [
          pair.retestDue ? badge('re-contract', 'bad') : null,
          pair.decided ? badge('decision open', 'warn') : null,
          pair.latestStats?.clearsFloor === false ? badge('below floor', 'bad') : null,
        ].filter(Boolean),
        body: h('div', { class: 'stack' },
          pair.latest && pair.latest.status === 'closed'
            ? h('p', null, `Latest (${pair.latest.cycle}, closed ${pair.latest.closedOn || ''}): weighted κ ${showPct(pair.latestStats?.kappaPct)} · exact ${showPct(pair.latestStats?.exactPct)} · ${pair.latestStats?.divergedDimensions.length || 0} dimension(s) two steps apart.`)
            : h('p', { class: 'muted' }, 'No closed round yet.'),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => go(ctx, 'rounds', `&round=${encodeURIComponent(pair.latest.id)}`) }, 'Open the gauges'),
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate(`#/person/${encodeURIComponent(pair.memberId)}`) }, 'Person')),
        ),
      }))
      : [];

    const scriptBody = selectedRound && selectedRound.status === 'closed'
      ? h('div', { class: 'stack' },
        ...conversationScript(selectedRound, selectedRound.stats).lines.map((line) => h('p', null, line)),
        h('div', { class: 'row-actions' },
          h('button', {
            class: 'btn btn-ghost',
            type: 'button',
            onClick: () => {
              const text = conversationScript(selectedRound, selectedRound.stats).text;
              const ok = downloadText({ filename: `concordance-script-${dayKey(now)}.md`, text, mime: 'text/markdown;charset=utf-8' });
              toast(ok ? 'Script downloaded' : 'Copy the lines above — download blocked', ok ? 'good' : 'warn');
            },
          }, 'Download the script'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.navigate('#/decisions') }, 'See the decision ledger'),
        ),
      )
      : null;

    const notesBody = selectedRound && (selectedRound.leaderNote || selectedRound.memberNote)
      ? h('div', { class: 'stack' },
        selectedRound.leaderNote ? h('p', null, h('strong', null, 'Leader: '), selectedRound.leaderNote) : null,
        selectedRound.memberNote ? h('p', null, h('strong', null, 'Report: '), selectedRound.memberNote) : null,
      )
      : null;

    const detailBody = selectedRound
      ? h('div', { class: 'stack' },
        selectedRound.status === 'closed'
          ? h('div', { class: 'stack' }, statsGrid(selectedRound.stats, conv), refusalList(selectedRound.stats), ladder(selectedRound.stats, selectedRound))
          : banner({ tone: 'info', title: 'Sealed round', body: 'The gauges appear at the moment both sides are in. No side is shown early, and a submitted side cannot be revised.' }),
        scriptBody ? card({ title: 'The conversation this round asks for', subtitle: 'Deterministic script — no model, no inference', body: scriptBody }) : null,
        notesBody ? card({ title: 'What each side wrote', body: notesBody }) : null,
      )
      : null;

    const detail = selectedRound
      ? card({
        title: `Round detail · ${nameOf(selectedRound.leaderId)} → ${nameOf(selectedRound.memberId)}`,
        subtitle: `Cycle ${selectedRound.cycle} · opened ${selectedRound.openedOn || '—'} · ${selectedRound.status}`,
        body: detailBody,
      })
      : null;

    return h('div', { class: 'stack' },
      report.detailWithheld
        ? banner({ tone: 'warn', title: 'Aggregate view at this altitude', body: 'A director-rank seat and above reads span rates and the dimension profile, not a pair’s two gauges. That is the disclosure ladder, not a permission bug.' })
        : null,
      h('div', { class: 'stat-grid' },
        stat({ label: 'Open rounds', value: String(report.enterprise.openN), hint: `${report.enterprise.awaitingN} sealed, waiting on one side` }),
        stat({ label: 'Closed rounds', value: String(report.enterprise.closedN), hint: `${report.enterprise.assessedN} assessed · ${report.enterprise.refusedN} refused` }),
        stat({ label: 'Pairs at or above the floor', value: showPct(report.enterprise.ratePct), hint: report.enterprise.suppressed ? report.enterprise.suppressedReason : `Wilson 95% ${report.enterprise.wilsonLo}–${report.enterprise.wilsonHi}%`, tone: report.enterprise.ratePct === null ? 'warn' : '' }),
        stat({ label: 'Pairs two steps apart', value: String(report.enterprise.divergenceN), hint: `floor ${conv.agreementFloorPct}% · cell floor ${conv.cellFloor}` }),
      ),
      h('div', { class: 'row-actions' }, opener),
      detail,
      card({ title: 'Open rounds', subtitle: 'Sealed until both sides are in', body: h('div', { class: 'stack' }, ...openRows) }),
      pairCards.length ? card({ title: 'Pairs on record', subtitle: 'Every figure is about the pair; no person is rated', body: h('div', { class: 'stack' }, ...pairCards) }) : null,
    );
  }

  function rollupPanel() {
    const rows = report.rollup;
    const suppressed = rows.filter((r) => r.suppressed).length;
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'What rolls up, and what may not', body: `A pair is counted once, at its leader's span, and inherited by every ancestor by exact addition — the enterprise figure cannot be inflated by zooming out. A span with fewer than ${conv.cellFloor} assessed pairs prints its count and withholds its rate. ${report.disclosure.unit}` }),
      card({
        title: 'By span altitude',
        subtitle: `${rows.length} span(s); ${suppressed} rate(s) withheld below the cell floor`,
        body: table({
          caption: 'Expectation concordance by span',
          columns: [
            { label: 'Span', render: (r) => (report.detailWithheld ? `${r.altitudeLabel || 'span'} · ${r.nodeId === report.seat?.id ? 'your seat' : 'sub-span'}` : r.label) },
            { label: 'Altitude', render: (r) => r.altitudeLabel },
            { label: 'Closed', render: (r) => String(r.closedN) },
            { label: 'Assessed', render: (r) => String(r.assessedN) },
            { label: 'Clear', render: (r) => String(r.clearN) },
            { label: 'Rate', render: (r) => (r.suppressed ? 'withheld' : showPct(r.ratePct)) },
            { label: 'Wilson 95%', render: (r) => (r.wilsonLo === null ? '—' : `${r.wilsonLo}–${r.wilsonHi}%`) },
            { label: 'Mean κ', render: (r) => (r.meanKappaPct === null ? 'withheld' : `${r.meanKappaPct}%`) },
            { label: 'Refused', render: (r) => String(r.refusedN) },
          ],
          rows,
          emptyMessage: 'No closed rounds yet — the roll-up fills as pairs close.',
        }),
      }),
      card({
        title: 'Which words we use differently',
        subtitle: 'The org-wide dimension profile — this is the sentence worth taking to a leadership meeting',
        body: table({
          caption: 'Dimension divergence profile',
          columns: [
            { label: 'Dimension', render: (r) => r.label },
            { label: 'Answered', render: (r) => String(r.answeredN) },
            { label: 'Diverged', render: (r) => String(r.divergedN) },
            { label: 'Diverged %', render: (r) => (r.divergedPct === null ? '—' : `${r.divergedPct}%`) },
            { label: 'Mean gap', render: (r) => (r.meanAbsDiff === null ? '—' : String(r.meanAbsDiff)) },
            { label: 'Direction', render: (r) => r.direction.replace('-', ' ') },
          ],
          rows: report.profile,
          emptyMessage: 'No answered dimension yet.',
        }),
      }),
      card({
        title: 'Closed loop: does re-contracting help?',
        subtitle: 'Before/after inside each pair; re-contracted vs not',
        body: h('div', { class: 'stack' },
          h('p', null, `Re-contracted pairs with a second round: ${report.lift.recontracted.n} — ${report.lift.recontracted.refused ? report.lift.recontracted.reason : `mean κ change ${report.lift.recontracted.meanDeltaPct} points`}.`),
          h('p', null, `Breached pairs with a second round and no decision: ${report.lift.compared.n} — ${report.lift.compared.refused ? report.lift.compared.reason : `mean κ change ${report.lift.compared.meanDeltaPct} points`}.`),
          h('p', { class: 'muted' }, report.lift.limitation)),
      }),
    );
  }

  function signalsPanel() {
    return h('div', { class: 'stack' },
      card({
        title: 'What is waiting on a human',
        subtitle: `${report.signals.length} signal(s)`,
        body: report.signals.length
          ? h('div', { class: 'stack' }, ...report.signals.map((signal) => h('div', { class: 'ec-signal' },
            h('div', { class: 'row-actions' }, badge(signal.tone === 'bad' ? 'act' : signal.tone === 'warn' ? 'watch' : 'info', signal.tone), h('strong', null, signal.title)),
            h('p', { class: 'muted' }, signal.body),
            signal.roundId ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => go(ctx, 'rounds', `&round=${encodeURIComponent(signal.roundId)}`) }, 'Open the round') : null,
            signal.pairRef && !report.detailWithheld ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
              const pair = report.pairs.find((p) => p.ref === signal.pairRef);
              if (pair?.latest) go(ctx, 'rounds', `&round=${encodeURIComponent(pair.latest.id)}`);
            } }, 'Open the gauges') : null)))
          : emptyState({ title: 'Nothing waiting', body: 'No sealed round is stalled and no pair is currently outside the agreed floor.' }),
      }),
      card({
        title: 'Rules on this spine',
        subtitle: 'Marker-idempotent · pausable · an explicit scan always runs',
        body: h('div', { class: 'stack' },
          h('p', null, `${CONCORDANCE_RULES.ROLLUP} — every closed round writes one typed roll-up edge to each leadership ancestor above the pair's leader, in the same transaction.`),
          h('p', null, `${CONCORDANCE_RULES.RECONTRACT} — a breach opens one governed re-contracting decision per pair per ISO week and places one agenda line on the pair's most recent 1:1. Nothing is decided for anyone.`),
          h('p', null, `${CONCORDANCE_RULES.MATURITY} — one advisory audit marker when the workspace reaches its evidence floor.`),
          h('p', { class: 'muted' }, report.disclosure.causality)),
      }),
    );
  }

  function conventionsPanel() {
    const floor = h('input', { class: 'input', type: 'number', min: '20', max: '95', value: String(conv.agreementFloorPct), id: 'ec-floor' });
    const cellFloor = h('input', { class: 'input', type: 'number', min: '1', max: '50', value: String(conv.cellFloor), id: 'ec-cell' });
    const retest = h('input', { class: 'input', type: 'number', min: '3', max: '180', value: String(conv.retestDays), id: 'ec-retest' });
    const auto = h('input', { type: 'checkbox', id: 'ec-auto', ...(conv.autoPropagate ? { checked: true } : {}) });
    return h('div', { class: 'stack' },
      card({
        title: 'The instrument',
        subtitle: `${CONCORDANCE_DIMENSIONS.length} dimensions · ${CONCORDANCE_SCALE}-point bar · answered independently by both sides`,
        body: h('div', { class: 'stack' },
          ...CONCORDANCE_DIMENSIONS.map((dimension) => h('div', { class: 'ec-instrument' },
            h('strong', null, dimension.label),
            h('p', { class: 'muted' }, dimension.question),
            h('ol', { class: 'ec-anchors' }, ...dimension.anchors.map((anchor) => h('li', null, anchor))))),
          h('p', { class: 'muted' }, report.disclosure.instrument),
          h('p', { class: 'muted' }, report.disclosure.statistics)),
      }),
      card({
        title: 'Declared conventions',
        subtitle: 'Every number here is a management convention, not a measured fact',
        body: h('div', { class: 'stack' },
          h('label', { class: 'field' }, h('span', null, 'Agreement floor (%)'), floor, h('span', { class: 'muted' }, 'Weighted κ below this opens a governed re-contracting decision. 20–95.')),
          h('label', { class: 'field' }, h('span', null, 'Cell floor (pairs)'), cellFloor, h('span', { class: 'muted' }, 'Assessed pairs required before a span rate is printed. 1–50.')),
          h('label', { class: 'field' }, h('span', null, 'Re-test window (days)'), retest, h('span', { class: 'muted' }, 'A re-contracted standard is expected to be re-tested inside this window. 3–180.')),
          h('label', { class: 'field ec-inline' }, h('span', null, 'Automatic propagation'), auto, h('span', { class: 'muted' }, 'When off, only an explicit reconcile runs the rules.')),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-primary', type: 'button', onClick: () => saveConventions({
              concordanceAgreementFloorPct: Number(floor.value),
              concordanceCellFloor: Number(cellFloor.value),
              concordanceRetestDays: Number(retest.value),
              concordanceAutoPropagate: auto.checked,
            }) }, 'Save conventions')),
        ),
      }),
      card({ title: 'What this is not', body: h('div', { class: 'stack' },
        h('p', null, report.disclosure.truth),
        h('p', null, report.disclosure.local),
        h('p', null, report.disclosure.sealed)) }),
    );
  }

  function briefPanel() {
    const res = ctx.api.concordanceBriefText();
    return h('div', { class: 'stack' },
      card({
        title: 'Identity-free brief',
        subtitle: 'Counts, rates, intervals and the dimension profile — no person, pair, span name or note',
        actions: [
          h('button', { class: 'btn btn-primary', type: 'button', onClick: downloadBrief }, 'Download brief'),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportCsv }, 'Aggregate CSV'),
        ],
        body: h('pre', { class: 'ec-brief', tabindex: '0', 'aria-label': 'Identity-free concordance brief' }, res.ok ? res.text : (res.error || 'Brief unavailable')),
      }),
    );
  }

  const panels = {
    rounds: roundsPanel,
    rollup: rollupPanel,
    signals: signalsPanel,
    conventions: conventionsPanel,
    brief: briefPanel,
  };

  return h('div', { class: 'view view-concordance' },
    pageHeader({
      eyebrow: 'Expectation concordance',
      title: 'Two gauges, one word',
      subtitle: `“Meets expectations” is a measurement instrument. This screen measures the instrument — between two people and up the chain — and rates nobody.${report.seat ? ` Operating as ${report.seat.label}.` : ''}`,
      actions: [
        badge(`v${report.conventions.scale}-point × ${CONCORDANCE_DIMENSIONS.length}`, 'neutral'),
        badge(`floor ${report.conventions.agreementFloorPct}%`, 'neutral'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Reconcile'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: openRoundModal, ...(report.detailWithheld ? { disabled: true } : {}) }, 'Open a round'),
      ],
      meta: h('span', { class: 'muted' }, `Updated ${formatDate(report.updatedOn)} · ${report.rollup.length} span(s) · ${report.pairs.length} pair(s)`),
    }),
    tabs({
      items: CONCORDANCE_PANELS.map((key) => ({ key, label: { rounds: 'Rounds', rollup: 'Roll-up', signals: 'Signals', conventions: 'Conventions', brief: 'Brief' }[key] })),
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Concordance sections',
    }),
    panels[panel](),
  );
}
