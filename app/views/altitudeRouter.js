/**
 * app/views/altitudeRouter.js — The Altitude Router (Schema v88, ADR-0081).
 *
 * Five panels, five genuinely different questions:
 *   Plan        "What did you write, and where should it go?" (intake + explain)
 *   Ladder      "What will each altitude above actually see?" (disclosure)
 *   Ledger      "What did we route, and what did it turn out to be?" (audit)
 *   Calibration "How often is the router right, out of sample?" (grade)
 *   Brief       "What can I hand to a board without leaking a note?" (export)
 *
 * A declared operating seat sees only its own subtree and, at director rank
 * and above, has item detail withheld (§0.3). The situation note is never
 * rendered above the manager altitude.
 */
import { h, toast, openModal, closeAllModals } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, kv, table } from '../ui/components.js';
import { dayKey, formatDate } from '../core/time.js';
import { routingBriefText } from '../core/domain/altitudeRouter.js';
import { ROUTER_PANELS, ROUTER_LIMITS } from '../core/domain/altitudeRouterRegistry.js';

const panelFor = (q) => {
  const p = q?.get?.('panel');
  return ROUTER_PANELS.includes(p) ? p : 'plan';
};
const go = (ctx, panel) => ctx.navigate(`#/routing?panel=${panel}`);
const pct = (v) => (v === null || v === undefined ? 'refused' : `${v}%`);
const altLabel = (key) => ({
  frontline: 'Frontline', manager: 'Manager', director: 'Director', exec: 'Executive', chief: 'Chief',
}[key] || key || 'refused');
export function renderAltitudeRouter(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const panel = panelFor(ctx.query);
  const report = ctx.api.routingRead();
  const calibration = report.calibration;
  const conv = report.conventions;
  const plans = report.plans;
  const pending = report.pending;
  const scoped = report.scoped;
  const detailWithheld = report.detailWithheld;

  function withheldPanel() {
    return banner({ tone: 'info', title: 'Routing roll-up withheld', body: 'Individual plans and aggregate calibration are withheld at this altitude until release-history disclosure checks are integrated. Plan and grade from the owning frontline or manager seat; existing case propagation and hierarchy links remain intact. Seats are local workflow declarations, not authentication.' });
  }

  /* -------------------------------------------------------------- actions */
  const savePlan = (text, previewNode) => {
    const res = ctx.api.routingSaveDraft(text);
    toast(res.ok ? 'Routing plan saved. Review the ladder before confirming.' : (res.error || 'Plan not saved.'), res.ok ? 'good' : 'bad');
    if (res.ok) {
      go(ctx, 'ledger');
      ctx.refresh();
    } else if (previewNode) previewNode.focus();
  };

  const confirmModal = (plan) => {
    const altitudeSelect = h('select', { id: 'ar-confirm-alt', class: 'input', 'aria-label': 'Confirm the organizational altitude' },
      ...report.altitudes.map((a) => h('option', { value: a.key, ...(a.key === (plan.detectedAltitudeKey || 'frontline') ? { selected: true } : {}) }, `${a.label} · ${a.horizonDays}-day horizon`)));
    const titleInput = h('input', { id: 'ar-confirm-title', class: 'input', type: 'text', maxlength: '180', value: '', placeholder: 'Optional case title (defaults to the classified title)', 'aria-label': 'Optional case title' });
    const body = h('div', { class: 'stack' },
      h('p', null, 'One confirmation writes the operational case, fans it out through every relevant module, and rolls the disclosure-safe signal up each leadership altitude in a single transaction. Nothing is decided on your behalf.'),
      h('label', { class: 'field' }, h('span', null, 'Requested altitude (stakes and reporting-span floors still apply)'), altitudeSelect),
      h('label', { class: 'field' }, h('span', null, 'Case title'), titleInput),
      h('p', { class: 'muted' }, `Detected: ${altLabel(plan.detectedAltitudeKey)} · ${pct(Math.round(plan.altitudeConfidence * 100))} heuristic confidence · ${plan.seatPath.length} leadership altitude(s) in the ladder.`),
      plan.needsReview ? banner({ tone: 'warn', title: 'Human review required', body: plan.refusalReasons.join(' ') }) : null,
    );
    const submit = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const input = { confirmedAltitudeKey: altitudeSelect.value };
      if (titleInput.value.trim()) input.title = titleInput.value.trim();
      const res = ctx.api.routingConfirm(plan.id, input);
      toast(res.ok ? 'Case and roll-up committed. The ledger shows the actual owning seat and effective rank.' : (res.error || 'Routing not confirmed.'), res.ok ? 'good' : 'bad');
      if (res.ok) { closeAllModals(); go(ctx, 'ledger'); ctx.refresh(); }
    } }, 'Confirm route & create case');
    openModal({ title: 'Confirm the altitude route', description: 'Reviewed by a human before any record is written.', body, footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'), submit] });
  };

  const gradeModal = (plan) => {
    const select = h('select', { id: 'ar-grade-alt', class: 'input', 'aria-label': 'The altitude the work actually belonged to' },
      ...report.altitudes.map((a) => h('option', { value: a.key, ...(a.key === (plan.confirmedAltitudeKey || plan.detectedAltitudeKey) ? { selected: true } : {}) }, `${a.label} · ${a.horizonDays}-day horizon`)));
    const note = h('textarea', { id: 'ar-grade-note', class: 'input', rows: '3', maxlength: '400', 'aria-label': 'Optional note explaining the grade', placeholder: 'What made this altitude the right one? (optional)' });
    const body = h('div', { class: 'stack' },
      h('p', null, 'A grade is written once and is never used to rate a person. It is one out-of-sample trial of the router: did the inferred altitude match where the work actually belonged?'),
      h('p', { class: 'muted' }, `Detected: ${altLabel(plan.detectedAltitudeKey)} · Confirmed by a human: ${altLabel(plan.confirmedAltitudeKey)}.`),
      h('label', { class: 'field' }, h('span', null, 'Correct altitude, in hindsight'), select),
      h('label', { class: 'field' }, h('span', null, 'Note'), note),
    );
    const submit = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => {
      const res = ctx.api.routingGrade(plan.id, select.value, note.value);
      toast(res.ok ? (res.correct ? 'Grade recorded: the inference held.' : 'Grade recorded: the inference did not hold. This is one trial, not a verdict.') : (res.error || 'Grade not saved.'), res.ok ? 'good' : 'bad');
      if (res.ok) { closeAllModals(); go(ctx, 'calibration'); ctx.refresh(); }
    } }, 'Record the grade');
    openModal({ title: 'Grade this routing decision', description: 'Retrospective; written once; no person is rated.', body, footer: [h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'), submit] });
  };

  const runScan = () => {
    const res = ctx.api.routingScan();
    toast(res.ok ? `Reconciled the ladder. ${res.propagations?.length || 0} propagation(s).` : (res.error || 'Scan failed.'), res.ok ? 'good' : 'bad');
    if (res.ok) ctx.refresh();
  };

  const downloadBrief = () => {
    const ok = downloadText({ filename: `leados-altitude-router-brief-${dayKey(now)}.md`, text: routingBriefText(ctx.state, { now }), mime: 'text/markdown;charset=utf-8' });
    toast(ok ? 'Identity-free brief downloaded' : 'Download not available — copy the text below instead', ok ? 'good' : 'warn');
  };
  const exportCsv = () => {
    let res;
    try {
      res = ctx.exportCSV('altitude-router');
    } catch (err) {
      toast(err?.message || 'Export is not available from a declared seat.', 'warn');
      return;
    }
    if (res.ok && res.csv) {
      const ok = downloadText({ filename: res.filename, text: res.csv, mime: 'text/csv;charset=utf-8' });
      toast(ok ? 'Aggregate-only CSV downloaded' : 'Download not available', ok ? 'good' : 'bad');
    } else toast(res.error || 'Export failed', 'bad');
  };

  /* ---------------------------------------------------------------- plan */
  function planPanel() {
    if (detailWithheld) return withheldPanel();
    const note = h('textarea', { id: 'ar-note', class: 'input', rows: '7', maxlength: String(ROUTER_LIMITS.noteChars),
      'aria-label': 'Paste a situation note in plain language', placeholder: 'e.g. "The night shift handover was missed twice this week; Ari and Bo are covering the station without a checklist."' });
    const region = h('div', { id: 'ar-preview', class: 'stack', role: 'region', 'aria-label': 'Live routing preview', 'aria-live': 'polite' });
    const renderPreview = () => {
      const res = ctx.api.routingAnalyze(note.value);
      region.replaceChildren();
      if (!res.ok) { region.appendChild(h('p', { class: 'muted' }, res.error || 'Nothing to analyze yet.')); return; }
      const a = res.altitude;
      region.append(
        h('div', { class: 'stat-grid' },
          stat({ label: 'Inferred altitude', value: res.altitude.detectedAltitudeKey ? altLabel(res.altitude.detectedAltitudeKey) : 'Refused', hint: `${res.altitude.altitudeBand} confidence · ${pct(Math.round(a.altitudeConfidence * 100))}`, tone: a.insufficient ? 'warn' : '' }),
          stat({ label: 'Module (primary)', value: res.primaryModule || '—', hint: `${res.moduleRoutes.length} module route(s)` }),
          stat({ label: 'Leadership ladder', value: String(res.resolved.seatPath.length), hint: `owner rank ${res.resolved.effectiveRank}` }),
          stat({ label: 'Evidence weight', value: String(Math.round(a.evidenceWeight * 10) / 10), hint: `floor ${conv.evidenceFloor}` }),
        ),
        card({ title: 'Why this altitude', subtitle: 'Weighted time-span cues with NegEx-style negation windowing', body: h('div', { class: 'stack' },
          a.insufficient ? banner({ tone: 'warn', title: 'The engine refused to infer an altitude', body: 'Too little time-span language. Choose the altitude yourself — a guess printed as a probability is worse than a blank.' }) : null,
          table({ columns: [
            { label: 'Altitude', render: (d) => d.label },
            { label: 'Horizon', render: (d) => `${d.horizonDays} d` },
            { label: 'Score', render: (d) => `${Math.round(d.probability * 100)}%` },
            { label: 'Cue hits', render: (d) => String(d.hits) },
          ], rows: a.distribution, caption: 'Probability-like score per organizational altitude' }),
          a.primaryEvidence.length ? h('p', null, `Evidence: ${a.primaryEvidence.slice(0, 6).map((e) => `“${e.term}”`).join(', ')}`) : h('p', { class: 'muted' }, 'No time-span cue matched.'),
          a.negatedEvidence.length ? h('p', { class: 'muted' }, `Negated and excluded: ${a.negatedEvidence.map((e) => `“${e.term}”`).join(', ')}`) : null,
        ) }),
        card({ title: 'Module routes', subtitle: 'Reused from the deterministic intake classifier', body: res.moduleRoutes.length
          ? table({ columns: [
            { label: 'Module', render: (r) => r.module },
            { label: 'Route', render: (r) => r.route },
            { label: 'Score', render: (r) => pct(Math.round(r.probability * 100)) },
          ], rows: res.moduleRoutes, caption: 'Suggested module routes' })
          : emptyState({ title: 'No module routes', body: 'The note did not match a module lexicon above the evidence floor.' }) }),
        res.resolved.stakesReasons.length ? banner({ tone: 'caution', title: 'Jaques horizon floor applied', body: res.resolved.stakesReasons.join(' ') }) : null,
        res.privacyBlocked ? banner({ tone: 'bad', title: 'Confidential conflict wall', body: 'LeadOS never auto-creates a conflict record. Open the confidential conflict workspace yourself.' }) : null,
        res.refusalReasons.length ? banner({ tone: 'info', title: 'Human review required', body: res.refusalReasons.join(' ') }) : null,
      );
    };
    note.addEventListener('input', renderPreview);
    renderPreview();
    const save = h('button', { class: 'btn btn-primary', type: 'button', onClick: () => savePlan(note.value, note) }, 'Save routing plan');
    return h('div', { class: 'stack' },
      scoped ? banner({ tone: 'info', title: `Operating as ${report.seat.label}`, body: 'Only plans in your reporting subtree are visible. Item detail is withheld above the manager altitude.' }) : null,
      card({ title: 'Describe the situation', subtitle: 'Plain language. On-device, deterministic, fully explained — no generative model and no network call.', body: h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, 'Situation note'), note),
        h('div', { class: 'row' }, save, h('span', { class: 'muted' }, 'A saved plan changes nothing until a human confirms it.')),
      ) }),
      region,
    );
  }

  /* -------------------------------------------------------------- ladder */
  function ladderPanel() {
    if (detailWithheld) return withheldPanel();
    const plan = pending[0] || plans.find((p) => p.status === 'confirmed') || null;
    const path = plan ? plan.seatPath : [];
    const rows = path.map((p, i) => ({
      rank: p.rank, label: p.label, disclosure: p.disclosure, horizonDays: p.horizonDays,
      seatId: detailWithheld ? '' : p.seatId, position: i === 0 ? 'Owner' : `+${i} up`,
    }));
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One note, five different views', body: 'The same routing decision is disclosed differently at each altitude. Names never climb above the manager rank; the enterprise sees an aggregate, not the shift-coaching note.' }),
      card({ title: 'The disclosure ladder', subtitle: 'Jaques time-span of discretion (7 / 30 / 90 / 180 / 365 days) applied to routing, not to a dashboard badge', body:
        table({ columns: [
          { label: 'Rank', render: (r) => String(r.rank) },
          { label: 'Horizon', render: (r) => `${r.horizonDays} d` },
          { label: 'Disclosure', render: (r) => r.disclosure === 'names' ? 'Names + item detail' : r.disclosure === 'unit' ? 'Unit leaders + exact counts' : 'Span aggregate only' },
          { label: 'Asks', render: (r) => r.rank === 1 ? 'Who does what this week?' : r.rank === 2 ? 'Where does capacity go this cycle?' : r.rank === 3 ? 'Which recurring constraint needs a structural answer?' : r.rank === 4 ? 'Which commitment deserves scarce capital?' : 'What must the enterprise decide now?' },
        ], rows: report.altitudes.map((a) => ({ rank: a.rank, horizonDays: a.horizonDays, disclosure: a.rank <= 2 ? 'names' : a.rank === 3 ? 'unit' : 'aggregate' })), caption: 'Disclosure form by organizational altitude' }) }),
      card({ title: plan ? `Resolved chain for ${altLabel(plan.detectedAltitudeKey)} · ${plan.moduleRoutes.length} module route(s)` : 'No resolved chain yet',
        subtitle: plan ? `Owner seat rank ${plan.effectiveRank}. RULE-AR-01 writes one typed edge per row in the same transaction as the case.` : 'Save a routing plan to see the concrete path through your reporting tree.',
        body: rows.length ? table({ columns: [
          { label: 'Position', render: (r) => r.position },
          { label: 'Rank', render: (r) => String(r.rank) },
          { label: 'Seat', render: (r) => r.seatId ? r.label : 'span (aggregate)' },
          { label: 'Seat id', render: (r) => r.seatId || 'withheld' },
          { label: 'Disclosure', render: (r) => r.disclosure },
        ], rows, caption: 'Leadership ancestor chain for the current routing plan' })
          : emptyState({ title: 'No chain to show', body: 'Save a plan on the Plan panel; the ladder is computed from your real reporting lines.' }) }),
      card({ title: 'What the propagation engine writes', body: h('ul', { class: 'stack-tight' },
        h('li', null, 'routes-through: the adopted case points at the reviewed routing plan.'),
        h('li', null, 'discloses-to: one edge to the owning seat, carrying the disclosure FORM (never the note).'),
        h('li', null, 'rolls-up-to: one edge per leadership ancestor — manager, director, executive — in the same atomic transaction.'),
        h('li', null, 'The enterprise root is a synthetic node: it is printed in the ladder and carried in the identity-free brief, never a dangling graph edge.'),
      ) }),
    );
  }

  /* -------------------------------------------------------------- ledger */
  function ledgerPanel() {
    if (detailWithheld) return withheldPanel();
    const rows = plans.map((p) => ({ ...p,
      detected: altLabel(p.detectedAltitudeKey), confirmed: altLabel(p.confirmedAltitudeKey),
      graded: altLabel(p.gradedAltitudeKey), statusLabel: p.status }));
    return h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Plans', value: String(plans.length), hint: `cap ${ROUTER_LIMITS.plans}` }),
        stat({ label: 'Awaiting a human', value: String(pending.length), tone: pending.length ? 'caution' : '' }),
        stat({ label: 'Confirmed', value: String(report.confirmed.length) }),
        stat({ label: 'Graded', value: String(report.graded.length), hint: 'out-of-sample trials' }),
      ),
      card({ title: 'Routing ledger', subtitle: 'One row is both the plan and its later grade — no second ledger can drift.', body:
        rows.length ? table({ columns: [
          { label: 'Saved', render: (r) => r.createdAt ? formatDate(r.createdAt.slice(0, 10)) : '—' },
          { label: 'Detected', render: (r) => r.detected },
          { label: 'Confirmed', render: (r) => r.confirmed },
          { label: 'Graded', render: (r) => r.graded },
          { label: 'Confidence', render: (r) => `${Math.round(r.altitudeConfidence * 100)}% · ${r.altitudeBand}` },
          { label: 'Status', render: (r) => badge(r.statusLabel, r.status === 'confirmed' ? 'good' : r.status === 'dismissed' ? 'neutral' : 'caution') },
          { label: 'Actions', render: (r) => h('div', { class: 'row' },
            r.status === 'analyzed' && !detailWithheld ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => confirmModal(r) }, 'Confirm') : null,
            r.status === 'analyzed' && !detailWithheld ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => { const res = ctx.api.routingDismiss(r.id); toast(res.ok ? 'Plan dismissed; no case created.' : (res.error || 'Not dismissed.'), res.ok ? 'good' : 'bad'); if (res.ok) ctx.refresh(); } }, 'Dismiss') : null,
            r.status === 'confirmed' && !r.gradedOn && !detailWithheld ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => gradeModal(r) }, 'Grade') : null,
            r.status === 'confirmed' && r.confirmedCaseId ? h('a', { class: 'btn btn-small btn-ghost', href: `#/cases?case=${encodeURIComponent(r.confirmedCaseId)}` }, 'Case') : null,
          ) },
        ], rows, caption: 'Altitude routing plans and grades' })
          : emptyState({ title: 'No routing plans yet', body: 'Paste a situation note on the Plan panel. Nothing is written until you save and confirm.' }) }),
      detailWithheld ? banner({ tone: 'info', title: 'Detail withheld at this altitude', body: 'At director rank and above the ledger is a count and a rate, not a list of individual notes. Confirm and grade actions stay at the owning altitude.' }) : null,
    );
  }

  /* --------------------------------------------------------- calibration */
  function calibrationPanel() {
    if (detailWithheld) return withheldPanel();
    const floorNInput = h('input', { id: 'ar-floor-n', class: 'input', type: 'number', min: '3', max: '20', value: String(conv.calibrationFloorN), 'aria-label': 'Evidence floor (graded plans)' });
    const floorPctInput = h('input', { id: 'ar-floor-pct', class: 'input', type: 'number', min: '50', max: '95', value: String(conv.reliabilityFloorPct), 'aria-label': 'Reliability floor percent' });
    const evidenceInput = h('input', { id: 'ar-evidence', class: 'input', type: 'number', min: '1', max: '10', step: '0.5', value: String(conv.evidenceFloor), 'aria-label': 'Altitude cue evidence floor' });
    const autoToggle = h('input', { id: 'ar-auto', class: 'input', type: 'checkbox', 'aria-label': 'Automatic routing propagation', ...(conv.autoPropagate ? { checked: true } : {}) });
    const apply = () => {
      const res = ctx.api.routingSetConventions({
        routingCalibrationFloorN: Number(floorNInput.value), routingReliabilityFloorPct: Number(floorPctInput.value),
        routingEvidenceFloor: Number(evidenceInput.value), routingAutoPropagate: autoToggle.checked,
      });
      toast(res.ok ? 'Routing conventions saved.' : (res.error || 'Settings not saved.'), res.ok ? 'good' : 'bad');
      if (res.ok) ctx.refresh();
    };
    const signals = calibration.signals;
    return h('div', { class: 'stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Graded trials', value: String(calibration.gradedN), hint: `${calibration.confirmedN} confirmed` }),
        stat({ label: 'Overall agreement', value: pct(calibration.overallRatePct), hint: calibration.overallRatePct === null ? `below ${conv.calibrationFloorN} graded` : 'engine vs retrospective human grade' }),
        stat({ label: 'Brier skill (out of sample)', value: pct(calibration.brierSkillPct), hint: `${calibration.forecastN} strictly-prior forecasts vs strictly-prior pooled base rate` }),
        stat({ label: 'Mean altitude error', value: calibration.meanRankError === null ? 'refused' : `${calibration.meanRankError} ranks`, hint: `under ${calibration.underRouted} · over ${calibration.overRouted}` }),
        stat({ label: 'Human overrides', value: String(calibration.overrides), hint: `${calibration.overrideHelped} corrected a wrong inference` }),
        stat({ label: 'Override lift', value: pct(calibration.overrideLiftPct), hint: 'share of overrides that helped' }),
      ),
      card({ title: 'Agreement by detected altitude', subtitle: 'Wilson 95% interval; refused below the evidence floor. The router grades itself, never a person.', body:
        table({ columns: [
          { label: 'Altitude', render: (c) => c.label },
          { label: 'Horizon', render: (c) => `${c.horizonDays} d` },
          { label: 'Graded', render: (c) => String(c.n) },
          { label: 'Correct', render: (c) => String(c.correctN) },
          { label: 'Rate', render: (c) => c.refused ? badge('refused', 'neutral', `Below ${c.floorN} graded plans`) : badge(`${c.ratePct}%`, c.belowFloor ? 'bad' : 'good', `Floor ${c.reliabilityFloorPct}%`) },
          { label: 'Wilson 95%', render: (c) => c.refused ? '—' : `${c.wilsonLo}–${c.wilsonHi}%` },
          { label: 'Mean confidence', render: (c) => pct(c.meanConfidencePct) },
        ], rows: calibration.cells, caption: 'Routing agreement by altitude' }) }),
      card({ title: 'Signals', subtitle: 'RULE-AR-02 opens one governed re-routing decision per breaching cell per ISO week.', body: signals.length
        ? h('div', { class: 'stack' }, ...signals.map((s) => h('article', { class: `finding finding-${s.level === 'high' ? 'warn' : 'neutral'}` },
          h('div', { class: 'finding-head' }, h('div', { class: 'finding-head-main' }, h('span', { class: 'finding-rule' }, s.ruleId), h('h3', { class: 'finding-title' }, s.title))),
          h('p', { class: 'finding-detail' }, s.body),
        )))
        : emptyState({ title: 'No calibration signals', body: 'Every cell is at or above its floor, or the record cannot yet say.' }) }),
      card({ title: 'Conventions', subtitle: 'Declared, editable numbers — not fitted coefficients.', body: h('div', { class: 'stack' },
        h('div', { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', null, 'Evidence floor (graded plans)'), floorNInput),
          h('label', { class: 'field' }, h('span', null, 'Reliability floor (%)'), floorPctInput),
          h('label', { class: 'field' }, h('span', null, 'Cue evidence floor'), evidenceInput),
          h('label', { class: 'field field-check' }, autoToggle, h('span', null, 'Automatic routing propagation')),
        ),
        kv('Heuristic confidence', 'Bands are heuristic until five graded plans exist in a cell.'),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', type: 'button', onClick: apply }, 'Save conventions'), h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Run routing scan')),
      ) }),
    );
  }

  /* --------------------------------------------------------------- brief */
  function briefPanel() {
    if (detailWithheld) return withheldPanel();
    const brief = routingBriefText(ctx.state, { now });
    return h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Identity-free by construction', body: 'The brief contains counts and rates only. No situation note, name, case title, id, evidence term or module route label is included.' }),
      h('div', { class: 'stat-grid' },
        stat({ label: 'Plans', value: String(plans.length) }),
        stat({ label: 'Graded', value: String(report.graded.length) }),
        stat({ label: 'Brier skill', value: pct(calibration.brierSkillPct) }),
        stat({ label: 'Breaching cells', value: String(calibration.signals.filter((s) => s.level === 'high').length) }),
      ),
      card({ title: 'Board-ready routing integrity brief', subtitle: `Frozen reading for ${dayKey(now)}`, actions: [
        h('button', { class: 'btn btn-primary', type: 'button', onClick: downloadBrief }, 'Download brief'),
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: exportCsv }, 'Download aggregate CSV'),
      ], body: h('pre', { class: 'brief-text', tabindex: '0' }, brief) }),
      card({ title: 'Honest limits', body: h('ul', { class: 'stack-tight' },
        h('li', null, 'Confidence bands are heuristic until a cell has five graded plans; a probability-like score is not an empirically calibrated probability.'),
        h('li', null, 'A graded "correct altitude" is a human retrospective judgement, not a measured business outcome.'),
        h('li', null, 'A routing plan is a deterministic, fully explained classification — not a generative model, not a causal forecast, not an autonomous decision.'),
        h('li', null, 'Seats are local workflow declarations, not authenticated multi-user security. Anyone controlling this browser or a full backup can access the workspace.'),
        h('li', null, 'The enterprise root is a synthetic node; it receives the aggregate brief rather than a dangling graph edge.'),
      ) }),
    );
  }

  const header = pageHeader({
    eyebrow: 'Schema v88 · ADR-0081 · RULE-AR-01..03',
    title: 'The Altitude Router',
    subtitle: 'Say what happened once. LeadOS decides which modules own it, which altitude must act, and writes typed roll-up links to leadership ancestors — then grades whether it routed correctly.',
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: runScan }, 'Run scan'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => go(ctx, 'plan'), ...(detailWithheld ? { disabled: true, title: 'Routing plans are withheld at this altitude.' } : {}) }, 'New situation note'),
    ],
  });

  const content = panel === 'plan' ? planPanel()
    : panel === 'ladder' ? ladderPanel()
      : panel === 'ledger' ? ledgerPanel()
        : panel === 'calibration' ? calibrationPanel() : briefPanel();

  return h('div', { class: 'page' },
    header,
    tabs({ items: [
      { key: 'plan', label: 'Plan & explain' },
      { key: 'ladder', label: 'Altitude ladder' },
      { key: 'ledger', label: 'Routing ledger', count: detailWithheld ? undefined : plans.length },
      { key: 'calibration', label: 'Calibration', count: detailWithheld ? undefined : (calibration.signals.filter((s) => s.level === 'high').length || undefined) },
      { key: 'brief', label: 'Brief' },
    ], active: panel, onSelect: (key) => go(ctx, key), ariaLabel: 'Altitude Router sections' }),
    h('div', { class: 'stack' }, content),
  );
}
