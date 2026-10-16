/* LeadOS pt-4 - js/playbooks.js
   Two layers:
   1) DOMAIN playbooks (pt-4 part 1) - installable baselines per domain.
   2) INTERACTIVE playbooks (pt-4 part 5) - one per finding cluster.

   Interactive contract:
     candidates(P)            -> [{id, label}]   eligible targets from the log
     prefill(ctx, P)          -> {ok, kind, title, facts[], suggest{}, missing[]}
     fields(pre)              -> [{name, label, type, ...}]
     submit(v, ctx, pre)      -> [{type, payload}]   event specs ONLY

   Doctrine: playbooks never write (the store is the single writer) and never
   fake certainty. Any value derived from the log is marked `recommended: true`
   with a `source` string naming where it came from; anything the log does not
   know is listed in `missing[]` and left blank for a human. prefill() is pure. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000;

  /* ================= 1. DOMAIN PLAYBOOKS ================= */
  const DOMAIN_CADENCE = {
    finance: 'revenue', sales: 'revenue', bizdev: 'revenue', customerSuccess: 'revenue', marketing: 'revenue',
    engineering: 'ops', product: 'ops', design: 'ops', rd: 'ops', people: 'ops',
    operations: 'ops', manufacturing: 'ops', supplyChain: 'ops',
    legal: 'compliance',
    executive: 'board'
  };
  const RITUAL_LABEL = { revenue: 'Revenue review', ops: 'Ops review', board: 'Board meeting', compliance: 'Compliance audit' };

  const PLAYBOOKS = [
    { domain: 'engineering', objective: 'Raise release reliability and flow', kr: { title: 'Change failure rate', target: 5, unit: '%' }, metrics: ['Lead time for changes', 'Deploy frequency', 'MTTR'], moves: ['Baseline DORA metrics for the top 3 services', 'Stand up an incident review ritual with written postmortems'], risk: { title: 'Single-point-of-knowledge on a critical service', likelihood: 3, impact: 4, mitigation: 'Pairing rotation and runbook coverage audit' } },
    { domain: 'finance', objective: 'Tighten cash visibility and planning discipline', kr: { title: 'Forecast accuracy', target: 95, unit: '%' }, metrics: ['Burn multiple', 'Gross margin', 'Cash runway (months)'], moves: ['Consolidate a 13-week rolling cash forecast', 'Close the month-end close checklist with named owners'], risk: { title: 'Forecast drift hides runway compression', likelihood: 3, impact: 5, mitigation: 'Weekly variance review against plan' } },
    { domain: 'sales', objective: 'Build a predictable, inspectable pipeline', kr: { title: 'Pipeline coverage', target: 3, unit: 'x quota' }, metrics: ['Win rate', 'Average deal cycle (days)', 'Pipeline coverage'], moves: ['Define stage-exit criteria for every pipeline stage', 'Institute a weekly deal inspection with next-step discipline'], risk: { title: 'Deals stall beyond the sales cycle without disqualification', likelihood: 4, impact: 3, mitigation: 'Auto-flag deals aging past salesCycleDays' } },
    { domain: 'product', objective: 'Focus the roadmap on measurable outcomes', kr: { title: 'Roadmap items with success metric', target: 100, unit: '%' }, metrics: ['Adoption of top feature', 'Time-to-value', 'Discovery cadence'], moves: ['Re-score the roadmap with a single prioritization model', 'Write one-page briefs for the top 5 bets'], risk: { title: 'Roadmap by loudest voice instead of evidence', likelihood: 3, impact: 4, mitigation: 'Decision reviews require stated evidence' } },
    { domain: 'operations', objective: 'Make the operating rhythm explicit and on-time', kr: { title: 'Rituals held on schedule', target: 95, unit: '%' }, metrics: ['SLO attainment', 'Cost per unit of output', 'Escalation aging'], moves: ['Publish the operating calendar with owners', 'Create a single escalation queue with aging limits'], risk: { title: 'Invisible work crowds out committed work', likelihood: 4, impact: 3, mitigation: 'Intake triage in the ops review' } },
    { domain: 'people', objective: 'Raise clarity, growth, and retention', kr: { title: 'Regrettable attrition', target: 5, unit: '%' }, metrics: ['eNPS', 'Regrettable attrition', 'Internal fill rate'], moves: ['Roll out role expectations for every level', 'Start monthly manager 1:1 quality sampling'], risk: { title: 'Key-person dependency in two or more teams', likelihood: 3, impact: 4, mitigation: 'Succession map reviewed quarterly' } },
    { domain: 'marketing', objective: 'Tie spend to pipeline and payback', kr: { title: 'Marketing-sourced pipeline', target: 30, unit: '%' }, metrics: ['CAC payback (months)', 'MQL to SQL conversion', 'Brand search volume'], moves: ['Rebuild attribution rules with sales sign-off', 'Cut the bottom 20% of spend by payback'], risk: { title: 'Attribution inflation masks channel decay', likelihood: 3, impact: 3, mitigation: 'Quarterly holdout tests' } },
    { domain: 'manufacturing', objective: 'Stabilize throughput and quality', kr: { title: 'Overall equipment effectiveness', target: 85, unit: '%' }, metrics: ['OEE', 'First-pass yield', 'Scrap rate'], moves: ['Map the constraint station and buffer policy', 'Start a daily tiered huddle with escalation tiers'], risk: { title: 'Unplanned downtime on the constraint line', likelihood: 4, impact: 5, mitigation: 'Preventive maintenance window protected weekly' } },
    { domain: 'design', objective: 'Systematize design quality and speed', kr: { title: 'Flows covered by design system', target: 80, unit: '%' }, metrics: ['System coverage', 'Design review cycle time', 'Usability issue escape rate'], moves: ['Audit the top 10 flows against system coverage', 'Institute a weekly design critique with decision log'], risk: { title: 'One-off designs fork the product experience', likelihood: 3, impact: 3, mitigation: 'Divergence review before build handoff' } },
    { domain: 'rd', objective: 'Convert research bets into testable milestones', kr: { title: 'Bets with falsifiable milestone', target: 100, unit: '%' }, metrics: ['Experiment cycle time', 'Bet kill rate', 'Transfers to product'], moves: ['Charter each bet with a falsifiable milestone', 'Start a monthly readout with explicit kill/continue calls'], risk: { title: 'Zombie projects consume the research budget', likelihood: 4, impact: 4, mitigation: 'Kill criteria enforced at every readout' } },
    { domain: 'legal', objective: 'Make compliance continuous, not annual', kr: { title: 'Controls with current evidence', target: 100, unit: '%' }, metrics: ['Contract cycle time', 'Open audit findings', 'Training completion'], moves: ['Inventory obligations and map to owners', 'Move contract review to a tracked queue with SLAs'], risk: { title: 'Audit findings age past their remediation date', likelihood: 3, impact: 5, mitigation: 'Findings tracked in the compliance audit rhythm' } },
    { domain: 'customerSuccess', objective: 'Drive retention through verified outcomes', kr: { title: 'Gross revenue retention', target: 95, unit: '%' }, metrics: ['GRR / NRR', 'Time to first value', 'Health score coverage'], moves: ['Define the health score with leading indicators', 'Launch QBRs for the top 20 accounts'], risk: { title: 'Silent churn: accounts red before anyone notices', likelihood: 3, impact: 5, mitigation: 'Health score reviewed in the revenue rhythm' } },
    { domain: 'supplyChain', objective: 'De-risk flow from supplier to customer', kr: { title: 'On-time in-full delivery', target: 97, unit: '%' }, metrics: ['OTIF', 'Supplier lead-time variance', 'Inventory days'], moves: ['Score single-source exposure on the top 20 SKUs', 'Set reorder policies by demand class'], risk: { title: 'Single-source component stops the line', likelihood: 2, impact: 5, mitigation: 'Second-source qualification plan' } },
    { domain: 'executive', objective: 'Keep the board narrative honest and forward-looking', kr: { title: 'Board asks answered with data', target: 100, unit: '%' }, metrics: ['Plan vs actual variance', 'Strategic milestone hit rate', 'Talent bench strength'], moves: ['Adopt a standing board pack template', 'Pre-wire decisions with a written pre-read'], risk: { title: 'Surprise misses erode board confidence', likelihood: 2, impact: 5, mitigation: 'No-surprises rule: flag variance before meetings' } },
    { domain: 'bizdev', objective: 'Turn partnerships into measurable revenue', kr: { title: 'Partner-sourced revenue', target: 15, unit: '%' }, metrics: ['Partner-sourced pipeline', 'Time to first joint deal', 'Active partner ratio'], moves: ['Tier the partner list by revenue potential', 'Write a joint value hypothesis per tier-1 partner'], risk: { title: 'Logo partnerships with no operating rhythm', likelihood: 4, impact: 2, mitigation: 'Quarterly partner business reviews' } }
  ];

  function get(domainId) { return PLAYBOOKS.find(function (p) { return p.domain === domainId; }) || null; }
  function uid(prefix) {
    uid.n = (uid.n || 0) + 1;
    return prefix + '-' + Date.now().toString(36) + '-' + uid.n.toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function apply(domainId, opts) {
    const pb = get(domainId);
    if (!pb) throw new Error('LeadOS: no playbook for domain ' + domainId);
    const now = (opts && opts.now) || Date.now();
    const settings = (opts && opts.settings) || LeadOS.store.ALL_SETTING_DEFAULTS;
    const kind = DOMAIN_CADENCE[domainId];
    const settingKey = { revenue: 'revenueReviewCadenceDays', ops: 'opsReviewCadenceDays', board: 'boardCadenceDays', compliance: 'complianceAuditCadenceDays' }[kind];
    const objId = uid('obj'), krId = uid('kr');
    return [
      { type: 'playbook.applied', payload: { id: uid('pb'), domain: domainId, playbookId: 'playbook:' + domainId } },
      { type: 'objective.created', payload: { id: objId, domain: domainId, title: pb.objective, owner: (opts && opts.owner) || '', horizon: 'quarter' } },
      { type: 'kr.created', payload: { id: krId, objectiveId: objId, title: pb.kr.title, target: pb.kr.target, unit: pb.kr.unit, baseline: 0 } },
      { type: 'task.created', payload: { id: uid('task'), domain: domainId, title: pb.moves[0], dueAt: now + 7 * DAY } },
      { type: 'task.created', payload: { id: uid('task'), domain: domainId, title: pb.moves[1], dueAt: now + 14 * DAY } },
      { type: 'risk.raised', payload: { id: uid('risk'), domain: domainId, title: pb.risk.title, likelihood: pb.risk.likelihood, impact: pb.risk.impact, mitigation: pb.risk.mitigation } },
      { type: 'review.scheduled', payload: { id: uid('rev'), kind: kind, domain: domainId, dueAt: now + settings[settingKey] * DAY } }
    ];
  }

  /* ================= 2. INTERACTIVE PLAYBOOKS ================= */
  const vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  const iso = function (ts) { return ts === null || ts === undefined ? '—' : new Date(ts).toISOString().slice(0, 10); };
  const money = function (n) { return Math.round(n).toLocaleString('en-US'); };
  const pct = function (x) { return (x * 100).toFixed(1) + '%'; };
  const fact = function (label, value, note) { return { label: label, value: String(value), note: note || '' }; };
  const SRC = function (s) { return 'recommended — ' + s; };
  const notFound = function (what) { return { ok: false, kind: null, title: 'Nothing to review', facts: [], suggest: {}, missing: [], reason: 'No ' + what + ' in the log. This playbook has no target — nothing is assumed.' }; };
  const note = function (domain, text, refId, context) { return { type: 'note.added', payload: { id: uid('note'), domain: domain, text: text, refId: refId || undefined, context: context || undefined } }; };

  const INTERACTIVE = [
    /* ---------- risk-review : R11 / R31 / R32 ---------- */
    { id: 'risk-review', title: 'Risk review', domain: 'finance', forRules: ['R11', 'R31', 'R32'],
      blurb: 'Close the loop on a financial risk, legal risk, or contract the log says is overdue.',
      candidates: function (P) {
        return vals(P.riskById).map(function (r) { return { id: r.id, label: 'Financial risk · ' + r.title }; })
          .concat(vals(P.contractById).map(function (c) { return { id: c.id, label: 'Contract · ' + c.counterparty + ' (' + c.type + ')' }; }))
          .concat(vals(P.legalRiskById).map(function (r) { return { id: r.id, label: 'Legal risk · ' + r.title }; }));
      },
      prefill: function (ctx, P) {
        const id = ctx.targetId;
        const fr = P.riskById[id], ct = P.contractById[id], lr = P.legalRiskById[id];
        if (fr) return { ok: true, kind: 'finRisk', title: 'Financial risk: ' + fr.title, facts: [fact('severity × likelihood', fr.severity + ' × ' + fr.likelihood + ' = ' + (fr.severity * fr.likelihood)), fact('current status', fr.status), fact('review date', iso(fr.reviewDate), fr.reviewDate && fr.reviewDate < ctx.today ? Math.floor((ctx.today - fr.reviewDate) / DAY) + 'd past' : ''), fact('mitigation plan', fr.mitigationPlan || '(none recorded)')], suggest: { status: fr.status, statusSource: SRC('current status in the log, unchanged') }, missing: fr.mitigationPlan ? [] : ['No mitigation plan was ever logged for this risk.'] };
        if (ct) return { ok: true, kind: 'contract', title: 'Contract: ' + ct.counterparty, facts: [fact('type', ct.type), fact('value', ct.value === null ? '(not logged)' : money(ct.value)), fact('expiry', iso(ct.expiryDate), ct.expiryDate && ct.expiryDate < ctx.today ? 'EXPIRED' : ''), fact('status', ct.status)], suggest: { status: ct.status, statusSource: SRC('current status in the log, unchanged') }, missing: ct.expiryDate ? [] : ['No expiryDate logged — renewal timing cannot be derived.'] };
        if (lr) return { ok: true, kind: 'legalRisk', title: 'Legal risk: ' + lr.title, facts: [fact('area', lr.area), fact('severity', lr.severity), fact('owner', lr.ownerId || '(unowned — explicit null)'), fact('due', iso(lr.dueDate))], suggest: {}, missing: ['The registry has no legal.risk.updated type, so this review records a note plus a dated follow-up task rather than a status change.'] };
        return notFound('financial risk, legal risk, or contract');
      },
      fields: function (pre) {
        const f = [];
        if (pre.kind === 'finRisk') f.push({ name: 'status', label: 'Updated status', type: 'select', options: ['open', 'mitigated', 'accepted', 'closed'], value: pre.suggest.status, recommended: true, source: pre.suggest.statusSource, required: true });
        if (pre.kind === 'contract') f.push({ name: 'status', label: 'Updated status', type: 'select', options: ['active', 'renewed', 'expired', 'terminated'], value: pre.suggest.status, recommended: true, source: pre.suggest.statusSource, required: true });
        f.push({ name: 'mitigation', label: 'Mitigation / decision taken', type: 'textarea', required: true, hint: 'What actually changes as a result of this review.' });
        f.push({ name: 'nextReview', label: 'Next review date', type: 'date', required: true, hint: 'Appends a dated task — the log cannot re-date an existing entity.' });
        return f;
      },
      submit: function (v, ctx, pre) {
        const out = [], id = ctx.targetId;
        const domain = pre.kind === 'finRisk' ? 'finance' : 'legal';
        if (pre.kind === 'finRisk') out.push({ type: 'fin.risk.updated', payload: { riskId: id, status: v.status, note: v.mitigation } });
        else if (pre.kind === 'contract') out.push({ type: 'legal.contract.updated', payload: { contractId: id, status: v.status, note: v.mitigation } });
        else out.push(note(domain, v.mitigation, id, 'risk-review'));
        out.push({ type: 'task.created', payload: { id: uid('task'), domain: domain, title: 'Review: ' + pre.title, dueAt: v.nextReview } });
        return out;
      } },

    /* ---------- deal-review : R12 ---------- */
    { id: 'deal-review', title: 'Deal review', domain: 'sales', forRules: ['R12'],
      blurb: 'Clean a deal the pipeline is still carrying past its close date.',
      candidates: function (P) { return P.openDeals.map(function (d) { return { id: d.id, label: d.title + ' · ' + money(d.value) + ' ' + d.currency }; }); },
      prefill: function (ctx, P) {
        const d = P.dealById[ctx.targetId];
        if (!d) return notFound('open deal');
        const past = d.closeDate ? Math.floor((ctx.today - d.closeDate) / DAY) : null;
        return { ok: true, kind: 'deal', title: d.title, facts: [fact('account', d.accountName || '(not logged)'), fact('value', money(d.value) + ' ' + d.currency), fact('stage', d.stage), fact('close date', iso(d.closeDate), past !== null && past > 0 ? past + 'd past' : ''), fact('updates logged', d.updates)], suggest: { stage: d.stage, stageSource: SRC('current stage in the log, unchanged') }, missing: d.closeDate ? [] : ['No closeDate logged — staleness cannot be measured for this deal.'] };
      },
      fields: function (pre) {
        return [
          { name: 'stage', label: 'Stage', type: 'text', value: pre.suggest.stage, recommended: true, source: pre.suggest.stageSource, required: true },
          { name: 'value', label: 'Revised value (blank = unchanged)', type: 'number' },
          { name: 'closeDate', label: 'Revised close date', type: 'date', required: true },
          { name: 'result', label: 'Outcome now', type: 'select', options: ['still open', 'won', 'lost'], value: 'still open', required: true },
          { name: 'actualValue', label: 'Actual value (if won)', type: 'number' },
          { name: 'lostReason', label: 'Lost reason (if lost)', type: 'text' }
        ];
      },
      submit: function (v, ctx, pre) {
        const out = [], up = { dealId: ctx.targetId, stage: v.stage, closeDate: v.closeDate };
        if (typeof v.value === 'number') up.value = v.value;
        if (v.result === 'lost' && v.lostReason) up.lostReason = v.lostReason;
        out.push({ type: 'sales.deal.updated', payload: up });
        if (v.result === 'won' || v.result === 'lost') {
          const close = { dealId: ctx.targetId, result: v.result };
          if (v.result === 'won' && typeof v.actualValue === 'number') close.actualValue = v.actualValue;
          if (v.result === 'lost' && v.lostReason) close.note = v.lostReason;
          out.push({ type: 'sales.deal.closed', payload: close });
        }
        return out;
      } },

    /* ---------- quota-review : R13 ---------- */
    { id: 'quota-review', title: 'Quota review', domain: 'sales', forRules: ['R13'],
      blurb: 'Name the root cause behind an attainment gap and record it as a measured KPI.',
      candidates: function (P) { return vals(P.quotaById).map(function (q) { return { id: q.id, label: q.personId + ' · ' + q.period }; }); },
      prefill: function (ctx, P) {
        const q = P.quotaById[ctx.targetId];
        if (!q) return notFound('quota');
        if (!q.actuals.length) return { ok: true, kind: 'quota', title: 'Quota: ' + q.personId + ' (' + q.period + ')', facts: [fact('target', money(q.target) + ' ' + q.currency), fact('attainment', 'not computable')], suggest: {}, missing: ['No actuals logged against this quota. Attainment is not computed and not guessed.'] };
        const last = q.actuals[q.actuals.length - 1];
        const rate = last.actual / q.target;
        return { ok: true, kind: 'quota', title: 'Quota: ' + q.personId + ' (' + last.period + ')', facts: [fact('target', money(q.target) + ' ' + q.currency), fact('actual', money(last.actual) + ' ' + q.currency), fact('attainment', pct(rate), 'math: ' + money(last.actual) + ' / ' + money(q.target))], suggest: { value: Math.round(rate * 1000) / 10, period: last.period, source: SRC('computed from the logged actual ÷ target') }, missing: [] };
      },
      fields: function (pre) {
        return [
          { name: 'value', label: 'Attainment to record (%)', type: 'number', value: pre.suggest.value, recommended: pre.suggest.value !== undefined, source: pre.suggest.source, required: true },
          { name: 'period', label: 'Period', type: 'text', value: pre.suggest.period, recommended: pre.suggest.period !== undefined, source: pre.suggest.source, required: true },
          { name: 'rootCause', label: 'Root cause', type: 'textarea', required: true, hint: 'One cause, stated plainly. Not a summary of the number.' },
          { name: 'plan', label: 'Next-period plan', type: 'textarea', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        return [
          { type: 'fin.kpi.logged', payload: { metric: 'quota-attainment', value: v.value, unit: '%', period: v.period, target: 100 } },
          note('sales', 'Root cause: ' + v.rootCause + '\nPlan: ' + v.plan, ctx.targetId, 'quota-review')
        ];
      } },

    /* ---------- okr-checkin : R14 / R15 ---------- */
    { id: 'okr-checkin', title: 'OKR check-in', domain: 'product', forRules: ['R14', 'R15'],
      blurb: 'Put a signal against each key result, or close the OKR with an honest score.',
      candidates: function (P) { return vals(P.okrById).map(function (o) { return { id: o.id, label: o.objective + ' · ' + o.quarter + (o.closedAt ? ' (closed)' : '') }; }); },
      prefill: function (ctx, P) {
        const o = P.okrById[ctx.targetId];
        if (!o) return notFound('OKR');
        const silent = Math.floor((ctx.today - o.setAt) / DAY);
        return { ok: true, kind: 'okr', title: o.objective, krs: o.keyResults, facts: [fact('quarter', o.quarter), fact('set', iso(o.setAt), silent + 'd ago'), fact('key results', o.keyResults.length), fact('status', o.closedAt ? 'closed, score ' + o.score : 'open')].concat(o.keyResults.map(function (kr, i) { return fact('KR' + (i + 1) + ' ' + kr.kr, (kr.current === null ? 'no progress logged' : kr.current + ' / ' + kr.target + ' ' + kr.unit)); })), suggest: {}, missing: o.keyResults.some(function (kr) { return kr.current === null; }) ? ['One or more key results have never been measured — those start blank.'] : [] };
      },
      fields: function (pre) {
        const f = pre.krs.map(function (kr, i) {
          return { name: 'kr' + i, label: 'KR' + (i + 1) + ': ' + kr.kr + ' (target ' + kr.target + ' ' + kr.unit + ')', type: 'number', value: kr.current === null ? undefined : kr.current, recommended: kr.current !== null, source: kr.current !== null ? SRC('last logged value — change it or leave as-is') : undefined, hint: kr.current === null ? 'Never measured. Blank stays blank.' : '' };
        });
        f.push({ name: 'progressNote', label: 'Check-in note', type: 'text' });
        f.push({ name: 'close', label: 'Close this OKR now', type: 'checkbox' });
        f.push({ name: 'score', label: 'Final score 0–1 (only if closing)', type: 'number' });
        f.push({ name: 'closeNote', label: 'Closing rationale', type: 'textarea' });
        return f;
      },
      submit: function (v, ctx, pre) {
        const out = [];
        pre.krs.forEach(function (kr, i) {
          const val = v['kr' + i];
          if (typeof val === 'number' && val !== kr.current) out.push({ type: 'strategy.okr.progress', payload: { okrId: ctx.targetId, krIndex: i, current: val, note: v.progressNote || undefined } });
        });
        if (v.close && typeof v.score === 'number') out.push({ type: 'strategy.okr.closed', payload: { okrId: ctx.targetId, score: v.score, note: v.closeNote || undefined } });
        if (!out.length) out.push(note('product', v.progressNote || 'Check-in held; no measured change.', ctx.targetId, 'okr-checkin'));
        return out;
      } },

    /* ---------- incident-review : R16 / R17 ---------- */
    { id: 'incident-review', title: 'Incident review', domain: 'operations', forRules: ['R16', 'R17'],
      blurb: 'Resolve an open incident with a root cause and corrective actions on the record.',
      candidates: function (P) { return P.openIncidents.map(function (i) { return { id: i.id, label: 'sev' + i.severity + ' · ' + i.title }; }); },
      prefill: function (ctx, P) {
        const i = P.incidentById[ctx.targetId];
        if (!i) return notFound('open incident');
        const openH = ((ctx.today - i.startedAt) / 3600000).toFixed(1);
        return { ok: true, kind: 'incident', title: i.title, facts: [fact('severity', i.severity), fact('systems', i.systems.join(', ')), fact('started', new Date(i.startedAt).toISOString()), fact('detected', i.detectedAt ? new Date(i.detectedAt).toISOString() : '(not logged)'), fact('open for', openH + 'h')], suggest: { resolvedAt: ctx.today, source: SRC('now — change it if resolution happened earlier') }, missing: i.detectedAt ? [] : ['No detectedAt logged — detection lag cannot be computed.'] };
      },
      fields: function (pre) {
        return [
          { name: 'resolvedAt', label: 'Resolved at', type: 'date', value: pre.suggest.resolvedAt, recommended: true, source: pre.suggest.source, required: true },
          { name: 'rootCause', label: 'Root cause', type: 'textarea', required: true, hint: 'The cause, not the symptom.' },
          { name: 'actions', label: 'Corrective actions (one per line)', type: 'lines', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        return [{ type: 'ops.incident.resolved', payload: { incidentId: ctx.targetId, resolvedAt: v.resolvedAt, rootCause: v.rootCause, actions: v.actions } }];
      } },

    /* ---------- attrition-review : R19 ---------- */
    { id: 'attrition-review', title: 'Attrition review', domain: 'people', forRules: ['R19'],
      blurb: 'Turn a departure pattern into stay-interview evidence.',
      candidates: function (P) { return P.attritionEvents.length ? [{ id: 'all', label: P.attritionEvents.length + ' attrition events on record' }] : []; },
      prefill: function (ctx, P) {
        if (!P.attritionEvents.length) return notFound('attrition event');
        const w = P.attritionEvents.filter(function (a) { return (ctx.today - a.at) / DAY <= 60; });
        const vol = w.filter(function (a) { return a.reason === 'voluntary'; }).length;
        const lastEng = P.engagementHistory.length ? P.engagementHistory[P.engagementHistory.length - 1] : null;
        return { ok: true, kind: 'attrition', title: 'Attrition pattern review', facts: [fact('departures in 60d', w.length), fact('voluntary subset', vol), fact('all departures logged', P.attritionEvents.length), fact('last engagement score', lastEng ? lastEng.score + '/10 (' + lastEng.period + ')' : '(never logged)')].concat(w.map(function (a) { return fact(a.personId, a.reason, iso(a.at)); })), suggest: { respondents: lastEng ? lastEng.respondents : undefined, source: lastEng ? SRC('respondent count from the last survey') : undefined }, missing: lastEng ? [] : ['No engagement survey has ever been logged — score and respondents start blank.'] };
      },
      fields: function (pre) {
        return [
          { name: 'findings', label: 'Stay-interview findings', type: 'textarea', required: true, hint: 'What people actually said, not the conclusion you prefer.' },
          { name: 'score', label: 'Engagement score 0–10 (blank = none recorded)', type: 'number', hint: 'Left blank, no engagement event is written.' },
          { name: 'period', label: 'Survey period', type: 'text' },
          { name: 'respondents', label: 'Respondents', type: 'number', value: pre.suggest.respondents, recommended: pre.suggest.respondents !== undefined, source: pre.suggest.source }
        ];
      },
      submit: function (v, ctx, pre) {
        const out = [note('people', 'Stay-interview findings: ' + v.findings, undefined, 'attrition-review')];
        if (typeof v.score === 'number' && v.period && typeof v.respondents === 'number') out.push({ type: 'hr.engagement.logged', payload: { score: v.score, period: v.period, respondents: v.respondents, note: 'Logged during attrition review' } });
        return out;
      } },

    /* ---------- budget-review : R22 / R23 / R24 ---------- */
    { id: 'budget-review', title: 'Budget review', domain: 'finance', forRules: ['R22', 'R23', 'R24'],
      blurb: 'Explain a variance and commit a corrective action, with the math on the record.',
      candidates: function (P) { return vals(P.budgetById).filter(function (b) { return b.actuals.length; }).map(function (b) { return { id: b.id, label: b.category + ' · ' + b.period }; }); },
      prefill: function (ctx, P) {
        const b = P.budgetById[ctx.targetId];
        if (!b) return notFound('budget with actuals');
        if (!b.actuals.length) return { ok: true, kind: 'budget', title: b.category + ' ' + b.period, facts: [fact('budget', money(b.amount) + ' ' + b.currency)], suggest: {}, missing: ['No actuals logged — variance is not computed.'] };
        const a = b.actuals[b.actuals.length - 1];
        const variance = (a.actual - b.amount) / b.amount;
        return { ok: true, kind: 'budget', title: b.category + ' ' + a.period, facts: [fact('budget', money(b.amount) + ' ' + b.currency), fact('actual', money(a.actual) + ' ' + b.currency), fact('variance', pct(variance), 'math: (' + money(a.actual) + ' − ' + money(b.amount) + ') / ' + money(b.amount)), fact('direction', a.actual > b.amount ? 'overspend' : 'underspend')], suggest: { value: Math.round(Math.abs(variance) * 1000) / 10, period: a.period, source: SRC('absolute variance computed from the logged actual') }, missing: [] };
      },
      fields: function (pre) {
        return [
          { name: 'value', label: 'Variance to record (%)', type: 'number', value: pre.suggest.value, recommended: pre.suggest.value !== undefined, source: pre.suggest.source, required: true },
          { name: 'period', label: 'Period', type: 'text', value: pre.suggest.period, recommended: pre.suggest.period !== undefined, source: pre.suggest.source, required: true },
          { name: 'explanation', label: 'Explanation', type: 'textarea', required: true },
          { name: 'corrective', label: 'Corrective action', type: 'textarea', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        return [
          { type: 'fin.kpi.logged', payload: { metric: 'budget-variance', value: v.value, unit: '%', period: v.period, target: 15 } },
          note('finance', 'Explanation: ' + v.explanation + '\nCorrective action: ' + v.corrective, ctx.targetId, 'budget-review')
        ];
      } },

    /* ---------- vendor-review : R25 / R26 ---------- */
    { id: 'vendor-review', title: 'Vendor review', domain: 'supplyChain', forRules: ['R25', 'R26'],
      blurb: 'Score a vendor and set the next review date so exposure cannot age silently.',
      candidates: function (P) { return vals(P.vendorById).map(function (v) { return { id: v.id, label: v.name + ' · tier ' + v.tier + ' · risk ' + v.risk_level }; }); },
      prefill: function (ctx, P) {
        const v = P.vendorById[ctx.targetId];
        if (!v) return notFound('vendor');
        const disruptions = P.disruptionEvents.filter(function (d) { return d.vendorId === v.id; });
        return { ok: true, kind: 'vendor', title: v.name, facts: [fact('category', v.category), fact('tier', v.tier), fact('risk level', v.risk_level), fact('review due', iso(v.reviewDate), v.reviewDate && v.reviewDate < ctx.today ? 'past' : ''), fact('reviews on record', v.reviews.length), fact('last score', v.lastScore === null ? '(never scored)' : v.lastScore), fact('disruptions logged', disruptions.length)], suggest: { score: v.lastScore === null ? undefined : v.lastScore, source: v.lastScore === null ? undefined : SRC('last score — confirm or change it') }, missing: v.lastScore === null ? ['This vendor has never been scored. The score field starts blank.'] : [] };
      },
      fields: function (pre) {
        return [
          { name: 'score', label: 'Vendor score 1–5', type: 'number', value: pre.suggest.score, recommended: pre.suggest.score !== undefined, source: pre.suggest.source, required: true },
          { name: 'note', label: 'Review note', type: 'textarea', required: true },
          { name: 'nextReviewDate', label: 'Next review date', type: 'date', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        return [{ type: 'supply.vendor.reviewed', payload: { vendorId: ctx.targetId, score: v.score, note: v.note, nextReviewDate: v.nextReviewDate } }];
      } },

    /* ---------- safety-review : R28 (mandated) ---------- */
    { id: 'safety-review', title: 'Safety review (mandated)', domain: 'manufacturing', forRules: ['R28'],
      blurb: 'Mandated after any safety incident. Corrective actions are required — the form will not submit without them.',
      candidates: function (P) { return P.safetyIncidents.map(function (i, idx) { return { id: String(idx), label: 'sev' + i.severity + ' · ' + i.type + ' · ' + iso(i.at) }; }); },
      prefill: function (ctx, P) {
        const i = P.safetyIncidents[Number(ctx.targetId)];
        if (!i) return notFound('safety incident');
        return { ok: true, kind: 'safety', title: 'Safety incident: ' + i.type, facts: [fact('severity', i.severity), fact('date', iso(i.date)), fact('description', i.description), fact('corrective actions on record', i.corrective_actions.length ? i.corrective_actions.join('; ') : 'NONE — this is why the review is mandated')], suggest: { severity: i.severity, type: i.type, description: i.description, source: SRC('carried from the original incident record') }, missing: i.corrective_actions.length ? [] : ['The original incident carries no corrective actions. They are mandatory here.'] };
      },
      fields: function (pre) {
        return [
          { name: 'severity', label: 'Severity 1–5', type: 'number', value: pre.suggest.severity, recommended: true, source: pre.suggest.source, required: true },
          { name: 'type', label: 'Type', type: 'text', value: pre.suggest.type, recommended: true, source: pre.suggest.source, required: true },
          { name: 'description', label: 'Review description', type: 'textarea', value: pre.suggest.description, recommended: true, source: pre.suggest.source, required: true },
          { name: 'corrective_actions', label: 'Corrective actions (one per line) — REQUIRED', type: 'lines', required: true, hint: 'At least one. A safety review without an action is not a review.' },
          { name: 'date', label: 'Review date', type: 'date', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        return [{ type: 'mfg.safety.incident', payload: { severity: v.severity, type: v.type, description: v.description, corrective_actions: v.corrective_actions, date: v.date } }];
      } },

    /* ---------- compliance-review : R30 ---------- */
    { id: 'compliance-review', title: 'Compliance review', domain: 'legal', forRules: ['R30'],
      blurb: 'Record a remediation plan and the resulting check outcome for a framework.',
      candidates: function (P) { return Object.keys(P.complianceByFramework).map(function (fw) { return { id: fw, label: fw + ' · ' + P.complianceByFramework[fw].length + ' checks' }; }); },
      prefill: function (ctx, P) {
        const logs = P.complianceByFramework[ctx.targetId];
        if (!logs || !logs.length) return notFound('compliance check');
        const last = logs[logs.length - 1];
        return { ok: true, kind: 'compliance', title: 'Framework: ' + ctx.targetId, facts: [fact('last result', last.result), fact('last period', last.period), fact('checked', iso(last.at), Math.floor((ctx.today - last.at) / DAY) + 'd ago'), fact('open findings', last.findings.length ? last.findings.join('; ') : '(none itemized)')], suggest: { findings: last.findings.join('\n'), source: SRC('findings carried from the last check — clear the ones actually remediated') }, missing: [] };
      },
      fields: function (pre) {
        return [
          { name: 'result', label: 'Outcome of this check', type: 'select', options: ['pass', 'finding'], required: true, hint: 'Record what the evidence supports, not what you hope.' },
          { name: 'period', label: 'Period', type: 'text', required: true },
          { name: 'findings', label: 'Remaining findings (one per line)', type: 'lines', value: pre.suggest.findings, recommended: true, source: pre.suggest.source },
          { name: 'remediation', label: 'Remediation plan', type: 'textarea', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        return [
          { type: 'legal.compliance.check', payload: { framework: ctx.targetId, period: v.period, result: v.result, findings: v.findings || [] } },
          note('legal', 'Remediation plan: ' + v.remediation, undefined, 'compliance-review')
        ];
      } },

    /* ---------- churn-review : R33 / R34 / R35 ---------- */
    { id: 'churn-review', title: 'Churn review', domain: 'customerSuccess', forRules: ['R33', 'R34', 'R35'],
      blurb: 'Pair the churn number with the NPS trend and commit retention plays.',
      candidates: function (P) { return (P.churnHistory.length || P.npsHistory.length) ? [{ id: 'latest', label: 'Latest churn + NPS position' }] : []; },
      prefill: function (ctx, P) {
        if (!P.churnHistory.length && !P.npsHistory.length) return notFound('churn or NPS record');
        const c = P.churnHistory.length ? P.churnHistory[P.churnHistory.length - 1] : null;
        const n = P.npsHistory.length ? P.npsHistory[P.npsHistory.length - 1] : null;
        const facts = [];
        if (c) facts.push(fact('churn', c.churned + ' / ' + c.total + ' = ' + pct(c.churned / c.total), c.period), fact('MRR lost', c.mrr_lost === undefined ? '(not logged)' : money(c.mrr_lost)));
        if (n) facts.push(fact('NPS', n.score, n.period), fact('promoters / detractors', n.promoters + ' / ' + n.detractors));
        facts.push(fact('open escalations', P.openEscalations.length));
        return { ok: true, kind: 'churn', title: 'Churn and retention review', facts: facts, suggest: c ? { period: c.period, churned: c.churned, total: c.total, source: SRC('last churn record — confirm against this period') } : {}, missing: [].concat(c ? [] : ['No churn record logged — churn fields start blank.']).concat(n ? [] : ['No NPS record logged — the trend cannot be shown.']) };
      },
      fields: function (pre) {
        return [
          { name: 'period', label: 'Period', type: 'text', value: pre.suggest.period, recommended: pre.suggest.period !== undefined, source: pre.suggest.source, required: true },
          { name: 'churned', label: 'Accounts churned', type: 'number', value: pre.suggest.churned, recommended: pre.suggest.churned !== undefined, source: pre.suggest.source, required: true },
          { name: 'total', label: 'Total accounts', type: 'number', value: pre.suggest.total, recommended: pre.suggest.total !== undefined, source: pre.suggest.source, required: true },
          { name: 'mrr_lost', label: 'MRR lost (blank if unknown)', type: 'number' },
          { name: 'rootCause', label: 'Root cause', type: 'textarea', required: true },
          { name: 'plays', label: 'Retention plays (one per line)', type: 'lines', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        const payload = { period: v.period, churned: v.churned, total: v.total };
        if (typeof v.mrr_lost === 'number') payload.mrr_lost = v.mrr_lost;
        if (v.rootCause) payload.reason = v.rootCause.slice(0, 120);
        return [
          { type: 'cs.churn.logged', payload: payload },
          note('customerSuccess', 'Root cause: ' + v.rootCause + '\nRetention plays:\n' + (v.plays || []).join('\n'), undefined, 'churn-review')
        ];
      } },

    /* ---------- tech-debt-sprint : R38 ---------- */
    { id: 'tech-debt-sprint', title: 'Tech debt sprint', domain: 'rd', forRules: ['R38'],
      blurb: 'Backlog sorted by severity × effort. Selecting an item appends rd.tech.debt.resolved — tick only what is actually cleared.',
      candidates: function (P) { return P.openTechDebt.length ? [{ id: 'backlog', label: P.openTechDebt.length + ' unresolved debt items' }] : []; },
      prefill: function (ctx, P) {
        const items = P.openTechDebt.slice().sort(function (a, b) { return (b.severity * b.effort) - (a.severity * a.effort); });
        if (!items.length) return notFound('unresolved tech debt');
        const sum = items.reduce(function (acc, d) { return acc + d.severity * d.effort; }, 0);
        return { ok: true, kind: 'debt', items: items, title: 'Tech debt backlog', facts: [fact('unresolved items', items.length), fact('total mass', sum, 'math: ' + items.map(function (d) { return d.severity + '×' + d.effort; }).join(' + '))].concat(items.map(function (d) { return fact(d.title, 'sev ' + d.severity + ' × effort ' + d.effort + ' = ' + (d.severity * d.effort), iso(d.loggedAt)); })), suggest: {}, missing: [] };
      },
      fields: function (pre) {
        return [
          { name: 'resolved', label: 'Items cleared this sprint', type: 'multiselect', options: pre.items.map(function (d) { return { value: d.id, label: d.title + ' (sev ' + d.severity + ' × effort ' + d.effort + ')' }; }), hint: 'Each tick appends rd.tech.debt.resolved. Nothing is marked done on your behalf.' },
          { name: 'plan', label: 'Sprint plan / sequencing note', type: 'textarea', required: true }
        ];
      },
      submit: function (v, ctx, pre) {
        const out = (v.resolved || []).map(function (id) { return { type: 'rd.tech.debt.resolved', payload: { debtId: id, note: v.plan } }; });
        out.push(note('rd', 'Tech debt sprint plan: ' + v.plan, undefined, 'tech-debt-sprint'));
        return out;
      } },

    /* ---------- board-prep : R39 / R40 ---------- */
    { id: 'board-prep', title: 'Board prep', domain: 'executive', forRules: ['R39', 'R40'],
      blurb: 'Compile the board record and the KPI review in one pass.',
      candidates: function () { return [{ id: 'next', label: 'Next board meeting' }]; },
      prefill: function (ctx, P) {
        const lastKpi = P.execKpiReviews.length ? P.execKpiReviews[P.execKpiReviews.length - 1] : null;
        const lastBoard = P.boardMeetings.length ? P.boardMeetings[P.boardMeetings.length - 1] : null;
        const facts = [
          fact('last board meeting', lastBoard ? iso(lastBoard.at) : '(never logged)', lastBoard ? Math.floor((ctx.today - lastBoard.at) / DAY) + 'd ago' : ''),
          fact('last KPI review', lastKpi ? lastKpi.period + ' (' + iso(lastKpi.at) + ')' : '(never logged)'),
          fact('open decisions', Object.keys(P.decisions).filter(function (k) { return P.decisions[k].status === 'open'; }).length),
          fact('open risks', P.openRisks.length + ' financial, ' + Object.keys(P.risks).filter(function (k) { return P.risks[k].status === 'open'; }).length + ' core')
        ];
        if (lastKpi) lastKpi.metrics.forEach(function (m) { facts.push(fact('KPI ' + m.name, m.value + (m.target !== undefined ? ' / target ' + m.target : ''), m.trend || '')); });
        return { ok: true, kind: 'board', title: 'Board preparation', facts: facts, suggest: lastKpi ? { metricName: lastKpi.metrics[0].name, metricValue: lastKpi.metrics[0].value, source: SRC('headline metric from the last KPI review — update the value') } : {}, missing: lastKpi ? [] : ['No prior KPI review logged — metric fields start blank.'] };
      },
      fields: function (pre) {
        return [
          { name: 'date', label: 'Meeting date', type: 'date', required: true },
          { name: 'quorum', label: 'Quorum met', type: 'checkbox' },
          { name: 'items', label: 'Agenda items (one per line)', type: 'lines', required: true },
          { name: 'decisions', label: 'Decisions taken (one per line)', type: 'lines', required: true },
          { name: 'period', label: 'KPI period', type: 'text', required: true },
          { name: 'metricName', label: 'Headline KPI name', type: 'text', value: pre.suggest.metricName, recommended: pre.suggest.metricName !== undefined, source: pre.suggest.source },
          { name: 'metricValue', label: 'Headline KPI value', type: 'number', value: pre.suggest.metricValue, recommended: pre.suggest.metricValue !== undefined, source: pre.suggest.source },
          { name: 'metricTarget', label: 'Headline KPI target', type: 'number' },
          { name: 'trend', label: 'Trend', type: 'select', options: ['up', 'flat', 'down'], value: 'flat' }
        ];
      },
      submit: function (v, ctx, pre) {
        const out = [{ type: 'exec.board.meeting', payload: { date: v.date, quorum: !!v.quorum, items: v.items || [], decisions: v.decisions || [] } }];
        if (v.metricName && typeof v.metricValue === 'number') {
          const m = { name: v.metricName, value: v.metricValue, trend: v.trend };
          if (typeof v.metricTarget === 'number') m.target = v.metricTarget;
          out.push({ type: 'exec.kpi.reviewed', payload: { period: v.period, metrics: [m] } });
        }
        return out;
      } },

    /* ---------- experiment-debrief : R37 ---------- */
    { id: 'experiment-debrief', title: 'Experiment debrief', domain: 'rd', forRules: ['R37'],
      blurb: 'Call the bet: validated, invalidated, or inconclusive — and say what was learned.',
      candidates: function (P) { return P.openExperiments.map(function (e) { return { id: e.id, label: e.hypothesis }; }); },
      prefill: function (ctx, P) {
        const e = P.experimentById[ctx.targetId];
        if (!e) return notFound('open experiment');
        return { ok: true, kind: 'experiment', title: e.hypothesis, facts: [fact('method', e.method), fact('started', iso(e.startDate)), fact('review due', iso(e.reviewDate), e.reviewDate && e.reviewDate < ctx.today ? Math.floor((ctx.today - e.reviewDate) / DAY) + 'd past' : ''), fact('owner', e.ownerId || '(not logged)')], suggest: {}, missing: ['No result is pre-selected. Validated, invalidated, and inconclusive are all equally available.'] };
      },
      fields: function () {
        return [
          { name: 'result', label: 'Result', type: 'select', options: ['validated', 'invalidated', 'inconclusive'], required: true },
          { name: 'learnings', label: 'Learnings (one per line)', type: 'lines', required: true },
          { name: 'next', label: 'Next step', type: 'text' }
        ];
      },
      submit: function (v, ctx, pre) {
        return [{ type: 'rd.experiment.result', payload: { experimentId: ctx.targetId, result: v.result, learnings: v.learnings, next: v.next || undefined } }];
      } },

    /* ================= pt-6: PATTERN PLAYBOOKS =================
       One per named pattern (LeadOS.patterns). Each prefill runs the REAL
       detector at ctx.today and prints its verdict — active with members and
       window limbs, or dormant with the rules still missing. A playbook never
       fabricates the pattern it responds to; a dormant run records deliberate
       intent and says so. Each submit emits a scheduled review, a dated task,
       and a note — registry-valid events, nothing else. */
    /* ---------- systemic-intervention : DEATH_SPIRAL ---------- */
    { id: 'systemic-intervention', title: 'Systemic intervention', domain: 'executive', forRules: ['R19', 'R20', 'R13', 'R4'],
      blurb: 'DEATH_SPIRAL response: one sponsored, whole-system session — not four separate pep talks. Intervenes in the compound, not the individuals.',
      candidates: function (P) { return (P.attrition.length || P.engagement.length || vals(P.quotaById).length) ? [{ id: 'whole-system', label: 'Whole-system session (people × revenue × feedback)' }] : []; },
      prefill: function (ctx, P) { const f = patternFacts('DEATH_SPIRAL', ctx, P); return { ok: true, kind: 'pattern', title: 'Systemic intervention — DEATH_SPIRAL', facts: f.facts, suggest: {}, missing: f.missing }; },
      fields: function () { return patternFields('board', 30); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'board', 'executive', 'DEATH_SPIRAL systemic intervention', 'systemic-intervention'); } },

    /* ---------- ops-triage : EXECUTION_BREAKDOWN ---------- */
    { id: 'ops-triage', title: 'Ops triage', domain: 'operations', forRules: ['R16', 'R17', 'R18'],
      blurb: 'EXECUTION_BREAKDOWN response: stop new intake, name the overload, and sequence response-time, commitment, and delivery recovery as one triage.',
      candidates: function (P) { return (vals(P.incidentById).length || P.slaLogs.length || vals(P.milestoneById).length) ? [{ id: 'ops-system', label: 'Operations triage (MTTR × SLA × milestones)' }] : []; },
      prefill: function (ctx, P) { const f = patternFacts('EXECUTION_BREAKDOWN', ctx, P); return { ok: true, kind: 'pattern', title: 'Ops triage — EXECUTION_BREAKDOWN', facts: f.facts, suggest: {}, missing: f.missing }; },
      fields: function () { return patternFields('ops', 14); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'ops', 'operations', 'EXECUTION_BREAKDOWN ops triage', 'ops-triage'); } },

    /* ---------- revenue-war-room : REVENUE_AT_RISK ---------- */
    { id: 'revenue-war-room', title: 'Revenue war room', domain: 'sales', forRules: ['R12', 'R13', 'R34'],
      blurb: 'REVENUE_AT_RISK response: pipeline hygiene, quota support, and retention saves planned in one room — new and existing revenue as one problem.',
      candidates: function (P) { return (vals(P.dealById).length || vals(P.quotaById).length || P.churnHistory.length) ? [{ id: 'revenue-chain', label: 'Revenue war room (pipeline × quota × churn)' }] : []; },
      prefill: function (ctx, P) { const f = patternFacts('REVENUE_AT_RISK', ctx, P); return { ok: true, kind: 'pattern', title: 'Revenue war room — REVENUE_AT_RISK', facts: f.facts, suggest: {}, missing: f.missing }; },
      fields: function () { return patternFields('revenue', 14); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'revenue', 'sales', 'REVENUE_AT_RISK war room', 'revenue-war-room'); } },

    /* ---------- governance-sprint : GOVERNANCE_GAP ---------- */
    { id: 'governance-sprint', title: 'Governance sprint', domain: 'legal', forRules: ['R30', 'R31', 'R32', 'R39'],
      blurb: 'GOVERNANCE_GAP response: a funded sprint across compliance, legal-risk ownership, contracts and the board rhythm — infrastructure, not heroics.',
      candidates: function (P) { return (P.complianceChecks.length || P.legalRisks.length || vals(P.contractById).length || P.boardMeetings.length) ? [{ id: 'governance-arc', label: 'Governance sprint (legal × board)' }] : []; },
      prefill: function (ctx, P) {
        const f = patternFacts('GOVERNANCE_GAP', ctx, P);
        const fw = P.complianceChecks.length ? P.complianceChecks[P.complianceChecks.length - 1].framework : undefined;
        return { ok: true, kind: 'pattern', title: 'Governance sprint — GOVERNANCE_GAP', facts: f.facts, suggest: fw ? { framework: fw, frameworkSource: SRC('latest framework in legal.compliance.check — confirm it anchors the sprint') } : {}, missing: f.missing };
      },
      fields: function (pre) { return [{ name: 'framework', label: 'Anchor framework', type: 'text', value: pre.suggest.framework, recommended: pre.suggest.framework !== undefined, source: pre.suggest.frameworkSource, required: true }].concat(patternFields('compliance', 30)); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'compliance', 'legal', 'GOVERNANCE_GAP sprint anchored on ' + v.framework, 'governance-sprint'); } },

    /* ---------- innovation-reset : INNOVATION_STALL ---------- */
    { id: 'innovation-reset', title: 'Innovation reset', domain: 'rd', forRules: ['R37', 'R38', 'R14'],
      blurb: 'INNOVATION_STALL response: call the debt, kill or staff the stalled experiments, and reopen the OKR line — one reset, not three reminders.',
      candidates: function (P) { return (vals(P.experimentById).length || vals(P.techDebtById).length || vals(P.okrById).length) ? [{ id: 'innovation-line', label: 'Innovation reset (debt × experiments × OKRs)' }] : []; },
      prefill: function (ctx, P) { const f = patternFacts('INNOVATION_STALL', ctx, P); return { ok: true, kind: 'pattern', title: 'Innovation reset — INNOVATION_STALL', facts: f.facts, suggest: {}, missing: f.missing }; },
      fields: function () { return patternFields('ops', 21); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'ops', 'rd', 'INNOVATION_STALL reset', 'innovation-reset'); } },

    /* ---------- production-stop : QUALITY_COLLAPSE ---------- */
    { id: 'production-stop', title: 'Production stop + audit', domain: 'manufacturing', forRules: ['R27', 'R28', 'R29'],
      blurb: 'QUALITY_COLLAPSE response: stop the line, audit yield, safety and equipment together, and only resume at full rate with the audit on the record.',
      candidates: function (P) { return (P.safetyIncidents.length || P.yieldHistory.length || vals(P.equipmentById).length) ? [{ id: 'line-state', label: 'Line halt-and-audit (yield × safety × equipment)' }] : []; },
      prefill: function (ctx, P) { const f = patternFacts('QUALITY_COLLAPSE', ctx, P); return { ok: true, kind: 'pattern', title: 'Production stop — QUALITY_COLLAPSE', facts: f.facts, suggest: {}, missing: f.missing }; },
      fields: function () { return patternFields('ops', 7); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'ops', 'manufacturing', 'QUALITY_COLLAPSE stop-and-audit', 'production-stop'); } },

    /* ---------- leadership-audit : LEADERSHIP_VACUUM ---------- */
    { id: 'leadership-audit', title: 'Leadership audit', domain: 'people', forRules: ['R1', 'R3', 'R8', 'R10'],
      blurb: 'LEADERSHIP_VACUUM response: audit the operating rhythm itself — reviews, goal ownership, check-ins — and name who restores it. Reads shipped rule meanings; the card prints the spec-vs-shipped labels.',
      candidates: function (P) { return (Object.keys(P.rosterById).length || Object.keys(P.objectives).length || Object.keys(P.krs).length) ? [{ id: 'operating-rhythm', label: 'Operating-rhythm audit (reviews × goals × check-ins)' }] : []; },
      prefill: function (ctx, P) { const f = patternFacts('LEADERSHIP_VACUUM', ctx, P); return { ok: true, kind: 'pattern', title: 'Leadership audit — LEADERSHIP_VACUUM', facts: f.facts, suggest: {}, missing: f.missing }; },
      fields: function () { return patternFields('ops', 14); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'ops', 'people', 'LEADERSHIP_VACUUM audit', 'leadership-audit'); } },

    /* ---------- finance-reforecast : CASHFLOW_WARNING ---------- */
    { id: 'finance-reforecast', title: 'Finance re-forecast', domain: 'finance', forRules: ['R22', 'R23', 'R24'],
      blurb: 'CASHFLOW_WARNING response: re-baseline budgets, KPIs and the forecast against actuals in one pass, so planning stops reading a model that lies.',
      candidates: function (P) { return (vals(P.budgetById).length || P.finKpis.length || P.finForecasts.length) ? [{ id: 'model-rebase', label: 'Model re-baseline (budget × KPI × forecast)' }] : []; },
      prefill: function (ctx, P) {
        const f = patternFacts('CASHFLOW_WARNING', ctx, P);
        let period;
        vals(P.budgetById).forEach(function (b) { if (b.actuals.length) period = b.actuals[b.actuals.length - 1].period; });
        return { ok: true, kind: 'pattern', title: 'Finance re-forecast — CASHFLOW_WARNING', facts: f.facts, suggest: period ? { period: period, periodSource: SRC('latest reconciled actuals period — re-forecast from the last known truth') } : {}, missing: f.missing };
      },
      fields: function (pre) { return [{ name: 'period', label: 'Re-forecast from period', type: 'text', value: pre.suggest.period, recommended: pre.suggest.period !== undefined, source: pre.suggest.periodSource, required: true }].concat(patternFields('revenue', 14)); },
      submit: function (v, ctx) { return patternSubmit(v, ctx, 'revenue', 'finance', 'CASHFLOW_WARNING re-forecast from ' + v.period, 'finance-reforecast'); } }
  ];

  /* ---- pt-6 pattern-playbook shared machinery --------------------------
     patternFacts runs the real detector at the caller-injected clock and turns
     its verdict into prefill facts. A pattern the detector does not see is
     reported DORMANT with the missing rules — a playbook run never fabricates
     the condition it claims to answer. */
  function patternFacts(patternId, ctx, P) {
    const D = (LeadOS.patterns && LeadOS.patterns.detect) ? LeadOS.patterns.detect(P, ctx.today) : { active: [], dormant: [] };
    const facts = [], missing = [];
    const hit = D.active.filter(function (p) { return p.name === patternId; })[0];
    if (hit) {
      facts.push(fact('detector verdict', 'ACTIVE — sev ' + hit.sev + ' · conf ' + hit.conf, hit.confWhy));
      facts.push(fact('pattern', hit.narrative));
      hit.members.forEach(function (m) { facts.push(fact('firing ' + m.rule, m.count + ' active finding(s)', m.keys.slice(0, 3).join(' · ') + (m.keys.length > 3 ? ' (+' + (m.keys.length - 3) + ' more)' : ''))); });
      if (hit.window) hit.window.limbs.forEach(function (l) { facts.push(fact('window ' + l.rule, l.status, l.line)); });
      (hit.scope || []).forEach(function (s) { facts.push(fact('scope check', s)); });
      (hit.notes || []).forEach(function (n) { missing.push(n); });
    } else {
      const d = D.dormant.filter(function (x) { return x.name === patternId; })[0];
      facts.push(fact('detector verdict', 'DORMANT at read time', d ? ('present: ' + (d.present.join(', ') || 'none') + ' · missing: ' + d.missing.join(', ')) : 'pattern not in library'));
      missing.push('The detector is quiet: ' + (d && d.missing.length ? d.missing.join(', ') : 'some required rules') + ' are not firing. This run records deliberate intent — it does not fabricate ' + patternId + '.');
    }
    return { facts: facts, missing: missing };
  }
  function patternFields(kind, reviewDays) {
    return [
      { name: 'session', label: 'Session date', type: 'date', required: true },
      { name: 'chair', label: 'Sponsor / chair', type: 'text', required: true, hint: 'A compound problem needs an owner above any single function.' },
      { name: 'actions', label: 'Interventions agreed (one per line)', type: 'lines', required: true },
      { name: 'reviewDays', label: 'Re-inspect in (days)', type: 'number', value: reviewDays, recommended: true, source: 'recommended — default ' + kind + '-rhythm horizon for a pattern response; change it to what you will actually hold' }
    ];
  }
  function patternSubmit(v, ctx, kind, domain, title, context) {
    const due = typeof v.session === 'number' ? v.session : ctx.today;
    const days = (typeof v.reviewDays === 'number' && v.reviewDays > 0) ? v.reviewDays : 14;
    return [
      { type: 'review.scheduled', payload: { id: uid('rev'), kind: kind, domain: domain, dueAt: due } },
      { type: 'task.created', payload: { id: uid('task'), domain: domain, title: title + ' — chair ' + v.chair, dueAt: due + days * DAY } },
      note(domain, title + '. Chair: ' + v.chair + '. Interventions agreed:\n' + (v.actions || []).join('\n') + '\nRe-inspection in ' + days + 'd.', undefined, context)
    ];
  }

  const byId = function (id) { return INTERACTIVE.find(function (p) { return p.id === id; }) || null; };
  const forRule = function (ruleId) { return INTERACTIVE.filter(function (p) { return p.forRules.indexOf(ruleId) !== -1; }); };

  LeadOS.playbooks = {
    PLAYBOOKS: PLAYBOOKS, DOMAIN_CADENCE: DOMAIN_CADENCE, RITUAL_LABEL: RITUAL_LABEL,
    get: get, apply: apply, uid: uid,
    INTERACTIVE: INTERACTIVE, byId: byId, forRule: forRule
  };
})();
