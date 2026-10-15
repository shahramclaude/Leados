/* LeadOS pt-4 - js/events.js
   Event registry: the contract every append must satisfy before it may enter
   the append-only store. Nothing enters localStorage that is not listed here.
   pt-4 part 2: 72 full-domain event families joined the original 15 types. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});

  const DOMAINS = [
    { id: 'engineering',     label: 'Engineering',           hue: 214 },
    { id: 'finance',         label: 'Finance',               hue: 152 },
    { id: 'sales',           label: 'Sales',                 hue: 28  },
    { id: 'product',         label: 'Product Strategy',      hue: 262 },
    { id: 'operations',      label: 'Operations',            hue: 190 },
    { id: 'people',          label: 'People & HR',           hue: 326 },
    { id: 'marketing',       label: 'Marketing',             hue: 296 },
    { id: 'manufacturing',   label: 'Manufacturing',         hue: 42  },
    { id: 'design',          label: 'Design',                hue: 348 },
    { id: 'rd',              label: 'R&D',                   hue: 232 },
    { id: 'legal',           label: 'Legal & Compliance',    hue: 4   },
    { id: 'customerSuccess', label: 'Customer Success',      hue: 162 },
    { id: 'supplyChain',     label: 'Supply Chain',          hue: 62  },
    { id: 'executive',       label: 'Executive & Board',     hue: 222 },
    { id: 'bizdev',          label: 'Business Development',  hue: 102 }
  ];
  const DOMAIN_IDS = DOMAINS.map(function (d) { return d.id; });
  const REVIEW_KINDS = ['revenue', 'ops', 'board', 'compliance'];
  const R15 = [1, 5], R13 = [1, 3], R01 = [0, 1], RNPS = [-100, 100];

  /* Spec keys: require[], optional[], enums{}, numbers[], bools[], arrays[],
     nonemptyArrays[], ranges{field:[min,max]}, custom(payload)->error|null,
     refs{field:family}, refArrays{field:family}.
     `refs`/`refArrays` do not block appends - G8 inspects resolution. */
  const REGISTRY = {
    // ---------- pt-1..pt-4 core ----------
    'store.initialized':      { require: ['schemaVersion', 'lineageTag'], optional: [], numbers: ['schemaVersion'] },
    'settings.changed':       { require: ['key', 'value'], optional: [] },
    'objective.created':      { require: ['id', 'domain', 'title'], optional: ['owner', 'horizon'], enums: { domain: DOMAIN_IDS } },
    'objective.statusChanged':{ require: ['id', 'status'], optional: [], enums: { status: ['active', 'paused', 'done', 'archived'] } },
    'kr.created':             { require: ['id', 'objectiveId', 'title', 'target', 'unit'], optional: ['baseline'], numbers: ['target', 'baseline'], refs: { objectiveId: 'objectives' } },
    'kr.progressLogged':      { require: ['id', 'value'], optional: ['note'], numbers: ['value'], refs: { id: 'krs' } },
    'task.created':           { require: ['id', 'domain', 'title'], optional: ['dueAt', 'owner'], enums: { domain: DOMAIN_IDS }, numbers: ['dueAt'] },
    'task.completed':         { require: ['id'], optional: ['note'], refs: { id: 'tasks' } },
    'decision.proposed':      { require: ['id', 'domain', 'question', 'options', 'owner', 'reversibility'], optional: ['dueAt'], enums: { domain: DOMAIN_IDS, reversibility: ['reversible', 'irreversible'] }, numbers: ['dueAt'], custom: function (p) { return (!Array.isArray(p.options) || p.options.length < 2) ? 'options must be an array of at least 2 choices' : null; } },
    'decision.decided':       { require: ['id', 'choice', 'rationale'], optional: [], refs: { id: 'decisions' }, custom: function (p) { return typeof p.choice !== 'string' ? 'choice must be a string' : null; } },
    'risk.raised':            { require: ['id', 'domain', 'title', 'likelihood', 'impact'], optional: ['mitigation'], enums: { domain: DOMAIN_IDS }, ranges: { likelihood: R15, impact: R15 } },
    'risk.statusChanged':     { require: ['id', 'status'], optional: [], enums: { status: ['open', 'mitigating', 'mitigated', 'accepted', 'closed'] }, refs: { id: 'risks' } },
    'review.scheduled':       { require: ['id', 'kind', 'dueAt'], optional: ['domain'], enums: { kind: REVIEW_KINDS, domain: DOMAIN_IDS }, numbers: ['dueAt'] },
    'review.completed':       { require: ['id', 'outcome'], optional: ['notes'], refs: { id: 'reviews' } },
    'playbook.applied':       { require: ['id', 'domain', 'playbookId'], optional: [], enums: { domain: DOMAIN_IDS } },
    // pt-4 part 5: narrative record attached to an entity the log already holds.
    'note.added':             { require: ['id', 'domain', 'text'], optional: ['refId', 'context'], enums: { domain: DOMAIN_IDS } },

    // ---------- FINANCE & REVENUE ----------
    'fin.budget.set':      { require: ['id', 'period', 'amount', 'currency', 'category'], optional: ['ownerId'], numbers: ['amount'] },
    'fin.budget.actuals':  { require: ['budgetId', 'actual', 'period'], optional: ['note'], numbers: ['actual'], refs: { budgetId: 'finBudgets' } },
    'fin.forecast.logged': { require: ['period', 'revenue', 'cost', 'margin', 'confidence'], optional: ['note'], numbers: ['revenue', 'cost', 'margin', 'confidence'], ranges: { confidence: R01 } },
    'fin.kpi.logged':      { require: ['metric', 'value', 'unit', 'period'], optional: ['target', 'ownerId'], numbers: ['value', 'target'] },
    'fin.risk.logged':     { require: ['id', 'title', 'severity', 'likelihood'], optional: ['mitigationPlan', 'ownerId', 'reviewDate'], numbers: ['reviewDate'], ranges: { severity: R15, likelihood: R15 } },
    'fin.risk.updated':    { require: ['riskId', 'status'], optional: ['note'], enums: { status: ['open', 'mitigated', 'accepted', 'closed'] }, refs: { riskId: 'finRisks' } },

    // ---------- SALES & REVENUE ----------
    'sales.deal.logged':       { require: ['id', 'title', 'value', 'currency', 'stage'], optional: ['ownerId', 'closeDate', 'accountName'], numbers: ['value', 'closeDate'] },
    'sales.deal.updated':      { require: ['dealId'], optional: ['stage', 'value', 'closeDate', 'lostReason'], numbers: ['value', 'closeDate'], refs: { dealId: 'deals' } },
    'sales.deal.closed':       { require: ['dealId', 'result'], optional: ['actualValue', 'note'], enums: { result: ['won', 'lost'] }, numbers: ['actualValue'], refs: { dealId: 'deals' } },
    'sales.pipeline.reviewed': { require: ['note', 'totalValue', 'dealCount'], optional: ['avgCycleActual'], numbers: ['totalValue', 'dealCount', 'avgCycleActual'] },
    'sales.quota.set':         { require: ['id', 'personId', 'period', 'target', 'currency'], optional: [], numbers: ['target'] },
    'sales.quota.actuals':     { require: ['quotaId', 'actual', 'period'], optional: [], numbers: ['actual'], refs: { quotaId: 'quotas' } },

    // ---------- PRODUCT & STRATEGY ----------
    'product.roadmap.item':    { require: ['id', 'title', 'quarter', 'effort', 'impact', 'status'], optional: ['ownerId', 'pillar'], enums: { status: ['planned', 'in-flight', 'shipped', 'cut'] }, ranges: { effort: R15, impact: R15 } },
    'product.roadmap.updated': { require: ['itemId'], optional: ['status', 'quarter', 'ownerId'], enums: { status: ['planned', 'in-flight', 'shipped', 'cut'] }, refs: { itemId: 'roadmap' } },
    'product.metric.logged':   { require: ['name', 'value', 'unit', 'period'], optional: ['target', 'source'], numbers: ['value', 'target'] },
    'product.retro.logged':    { require: ['went_well', 'improve', 'actions'], optional: ['sprintId', 'ownerId'], arrays: ['went_well', 'improve', 'actions'] },
    'strategy.okr.set':        { require: ['id', 'objective', 'keyResults', 'quarter'], optional: ['ownerId'], nonemptyArrays: ['keyResults'], custom: function (p) {
                                   if (!Array.isArray(p.keyResults)) return null;
                                   for (let i = 0; i < p.keyResults.length; i++) { const k = p.keyResults[i]; if (!k || typeof k.kr !== 'string' || typeof k.target !== 'number' || typeof k.unit !== 'string') return 'keyResults[' + i + '] must be {kr:string, target:number, unit:string}'; }
                                   return null; } },
    'strategy.okr.progress':   { require: ['okrId', 'krIndex', 'current'], optional: ['note'], numbers: ['krIndex', 'current'], refs: { okrId: 'okrs' }, custom: function (p) { return (typeof p.krIndex === 'number' && (p.krIndex < 0 || Math.floor(p.krIndex) !== p.krIndex)) ? 'krIndex must be a non-negative integer' : null; } },
    'strategy.okr.closed':     { require: ['okrId', 'score'], optional: ['note'], numbers: ['score'], ranges: { score: R01 }, refs: { okrId: 'okrs' } },
    'strategy.decision':       { require: ['title', 'severity', 'alternatives', 'chosen', 'rationale'], optional: ['reviewDate', 'ownerId'], numbers: ['reviewDate'], ranges: { severity: R15 }, nonemptyArrays: ['alternatives'], custom: function (p) { return (Array.isArray(p.alternatives) && p.alternatives.length && p.alternatives.indexOf(p.chosen) === -1) ? 'chosen must be one of alternatives' : null; } },

    // ---------- OPERATIONS & DELIVERY ----------
    'ops.incident.logged':   { require: ['id', 'title', 'severity', 'systems', 'startedAt'], optional: ['detectedAt', 'ownerId'], numbers: ['startedAt', 'detectedAt'], ranges: { severity: R15 }, nonemptyArrays: ['systems'] },
    'ops.incident.resolved': { require: ['incidentId', 'resolvedAt', 'actions'], optional: ['rootCause'], numbers: ['resolvedAt'], arrays: ['actions'], refs: { incidentId: 'incidents' } },
    'ops.sla.logged':        { require: ['metric', 'target', 'actual', 'period', 'met'], optional: [], numbers: ['target', 'actual'], bools: ['met'] },
    'ops.capacity.logged':   { require: ['headcount', 'openRoles', 'period'], optional: ['teamId', 'note'], numbers: ['headcount', 'openRoles'] },
    'ops.process.logged':    { require: ['name', 'period'], optional: ['cycle_time_days', 'defect_rate', 'throughput', 'note'], numbers: ['cycle_time_days', 'defect_rate', 'throughput'] },
    'ops.milestone.set':     { require: ['id', 'title', 'dueDate', 'dependsOn'], optional: ['ownerId', 'projectId'], numbers: ['dueDate'], arrays: ['dependsOn'], refArrays: { dependsOn: 'milestones' } },
    'ops.milestone.updated': { require: ['milestoneId', 'status'], optional: ['note'], enums: { status: ['on-track', 'at-risk', 'blocked', 'done'] }, refs: { milestoneId: 'milestones' } },

    // ---------- PEOPLE & HR ----------
    'hr.headcount.planned':     { require: ['role', 'level', 'targetDate'], optional: ['teamId', 'hiringManagerId'], numbers: ['targetDate'] },
    'hr.offer.logged':          { require: ['candidateName', 'role', 'level', 'result'], optional: [], enums: { result: ['extended', 'accepted', 'declined', 'rescinded'] } },
    'hr.attrition.logged':      { require: ['personId', 'reason'], optional: ['note'], enums: { reason: ['voluntary', 'involuntary', 'restructure'] } },
    'hr.performance.logged':    { require: ['personId', 'rating', 'period'], optional: ['note'], enums: { rating: ['exceeds', 'meets', 'below'] } },
    'hr.pip.started':           { require: ['id', 'personId', 'duration_days', 'goals'], optional: ['ownerId'], numbers: ['duration_days'], nonemptyArrays: ['goals'] },
    'hr.pip.closed':            { require: ['pipId', 'result'], optional: ['note'], enums: { result: ['improved', 'exited'] }, refs: { pipId: 'pips' } },
    'hr.engagement.logged':     { require: ['score', 'period', 'respondents'], optional: ['note'], numbers: ['score', 'respondents'], ranges: { score: [0, 10] } },
    'hr.compensation.reviewed': { require: ['personId', 'changeType'], optional: ['note', 'effectiveDate'], enums: { changeType: ['raise', 'promo', 'none'] }, numbers: ['effectiveDate'] },

    // ---------- MARKETING ----------
    'mktg.campaign.logged':    { require: ['id', 'name', 'channel', 'budget', 'period'], optional: ['ownerId'], numbers: ['budget'] },
    'mktg.campaign.result':    { require: ['campaignId'], optional: ['impressions', 'leads', 'conversions', 'spend_actual', 'note'], numbers: ['impressions', 'leads', 'conversions', 'spend_actual'], refs: { campaignId: 'campaigns' } },
    'mktg.brand.audit':        { require: ['period'], optional: ['nps', 'sentiment', 'note'], numbers: ['nps'], enums: { sentiment: ['positive', 'neutral', 'negative'] }, ranges: { nps: RNPS } },
    'mktg.content.published':  { require: ['title', 'channel'], optional: ['ownerId', 'reach', 'note'], numbers: ['reach'] },

    // ---------- MANUFACTURING & PRODUCTION ----------
    'mfg.production.logged': { require: ['units_planned', 'units_actual', 'period'], optional: ['line', 'defects', 'downtime_min'], numbers: ['units_planned', 'units_actual', 'defects', 'downtime_min'] },
    'mfg.quality.logged':    { require: ['metric', 'value', 'unit', 'target', 'period'], optional: ['line'], numbers: ['value', 'target'] },
    'mfg.safety.incident':   { require: ['severity', 'type', 'description', 'corrective_actions', 'date'], optional: [], numbers: ['date'], ranges: { severity: R15 }, arrays: ['corrective_actions'] },
    'mfg.equipment.logged':  { require: ['assetId', 'status'], optional: ['note', 'next_maintenance'], enums: { status: ['operational', 'degraded', 'down'] }, numbers: ['next_maintenance'] },
    'mfg.yield.logged':      { require: ['period', 'yield_pct'], optional: ['line', 'note'], numbers: ['yield_pct'], ranges: { yield_pct: [0, 100] } },

    // ---------- SUPPLY CHAIN & PROCUREMENT ----------
    'supply.vendor.logged':     { require: ['id', 'name', 'category', 'tier', 'risk_level'], optional: ['reviewDate'], numbers: ['reviewDate'], ranges: { tier: R13, risk_level: R15 } },
    'supply.vendor.reviewed':   { require: ['vendorId', 'score'], optional: ['note', 'nextReviewDate'], numbers: ['nextReviewDate'], ranges: { score: R15 }, refs: { vendorId: 'vendors' } },
    'supply.inventory.logged':  { require: ['quantity', 'unit', 'period'], optional: ['sku', 'reorder_point', 'location'], numbers: ['quantity', 'reorder_point'] },
    'supply.disruption.logged': { require: ['description', 'severity'], optional: ['vendorId', 'mitigation'], ranges: { severity: R15 }, refs: { vendorId: 'vendors' } },

    // ---------- DESIGN & CREATIVE ----------
    'design.review.logged':  { require: ['title', 'personIds', 'verdict'], optional: ['note'], enums: { verdict: ['approved', 'iterate', 'blocked'] }, arrays: ['personIds'] },
    'design.system.updated': { require: ['breaking'], optional: ['component', 'version', 'note'], bools: ['breaking'] },
    'design.research.logged':{ require: ['method', 'participants', 'insights'], optional: ['ownerId'], numbers: ['participants'], arrays: ['insights'] },
    'design.ux.metric':      { require: ['metric', 'value', 'unit', 'period'], optional: ['target'], numbers: ['value', 'target'] },

    // ---------- R&D & INNOVATION ----------
    'rd.experiment.logged':  { require: ['id', 'hypothesis', 'method', 'startDate'], optional: ['ownerId', 'reviewDate'], numbers: ['startDate', 'reviewDate'] },
    'rd.experiment.result':  { require: ['experimentId', 'result', 'learnings'], optional: ['next'], enums: { result: ['validated', 'invalidated', 'inconclusive'] }, arrays: ['learnings'], refs: { experimentId: 'experiments' } },
    'rd.patent.logged':      { require: ['title', 'filedDate'], optional: ['ownerId', 'status'], numbers: ['filedDate'] },
    'rd.tech.debt.logged':   { require: ['id', 'title', 'severity', 'effort'], optional: ['ownerId', 'note'], ranges: { severity: R15, effort: R15 } },
    'rd.tech.debt.resolved': { require: ['debtId'], optional: ['note'], refs: { debtId: 'techDebt' } },

    // ---------- LEGAL & COMPLIANCE ----------
    'legal.compliance.check': { require: ['framework', 'period', 'result', 'findings'], optional: ['ownerId'], enums: { result: ['pass', 'finding', 'fail'] }, arrays: ['findings'] },
    'legal.risk.logged':      { require: ['title', 'severity', 'area'], optional: ['ownerId', 'dueDate'], numbers: ['dueDate'], ranges: { severity: R15 } },
    'legal.contract.logged':  { require: ['id', 'counterparty', 'type'], optional: ['value', 'expiryDate', 'ownerId'], numbers: ['value', 'expiryDate'] },
    'legal.contract.updated': { require: ['contractId', 'status'], optional: ['note'], enums: { status: ['active', 'renewed', 'expired', 'terminated'] }, refs: { contractId: 'contracts' } },
    'legal.incident.logged':  { require: ['type', 'severity', 'description', 'reportedAt'], optional: ['remediation'], numbers: ['reportedAt'], ranges: { severity: R15 } },

    // ---------- CUSTOMER SUCCESS ----------
    'cs.nps.logged':           { require: ['score', 'period', 'promoters', 'passives', 'detractors'], optional: ['verbatims', 'ownerId'], numbers: ['score', 'promoters', 'passives', 'detractors'], ranges: { score: RNPS }, arrays: ['verbatims'] },
    // mrr_total (pt-4 part 7): the denominator the >15%-of-MRR escalation needs.
    // Without it the ratio is not computable and R34 stays silent (skip-not-infer).
    'cs.churn.logged':         { require: ['period', 'churned', 'total'], optional: ['mrr_lost', 'mrr_total', 'reason'], numbers: ['churned', 'total', 'mrr_lost', 'mrr_total'] },
    'cs.escalation.logged':    { require: ['id', 'accountName', 'severity', 'description'], optional: ['ownerId', 'dueDate'], numbers: ['dueDate'], ranges: { severity: R15 } },
    'cs.escalation.resolved':  { require: ['escalationId', 'resolution'], optional: ['note'], refs: { escalationId: 'escalations' } },
    'cs.health.logged':        { require: ['accountName', 'score', 'period'], optional: ['ownerId', 'signals'], ranges: { score: R15 }, arrays: ['signals'] },

    // ---------- EXECUTIVE & BOARD ----------
    'exec.board.meeting':    { require: ['date', 'quorum', 'items', 'decisions'], optional: ['note'], numbers: ['date'], bools: ['quorum'], arrays: ['items', 'decisions'] },
    'exec.kpi.reviewed':     { require: ['period', 'metrics'], optional: ['note'], nonemptyArrays: ['metrics'], custom: function (p) {
                                 if (!Array.isArray(p.metrics)) return null;
                                 for (let i = 0; i < p.metrics.length; i++) { const m = p.metrics[i]; if (!m || typeof m.name !== 'string' || typeof m.value !== 'number') return 'metrics[' + i + '] must have name:string and value:number'; if (m.target !== undefined && typeof m.target !== 'number') return 'metrics[' + i + '].target must be a number'; if (m.trend !== undefined && ['up', 'down', 'flat'].indexOf(m.trend) === -1) return 'metrics[' + i + '].trend must be up|down|flat'; }
                                 return null; } },
    'exec.investor.update':  { require: ['period', 'sentiment'], optional: ['note'], enums: { sentiment: ['positive', 'neutral', 'concern'] } },
    'exec.crisis.logged':    { require: ['id', 'title', 'severity', 'type', 'responseTeam', 'activatedAt'], optional: ['ownerId'], numbers: ['activatedAt'], ranges: { severity: R15 }, arrays: ['responseTeam'] },
    'exec.crisis.resolved':  { require: ['crisisId', 'resolvedAt'], optional: ['postmortem'], numbers: ['resolvedAt'], refs: { crisisId: 'crises' } }
  };

  /* Creation types -> the id family they populate. This is the inverse of the
     `refs`/`refArrays` declarations and is what lets the import gate know
     whether an incoming reference resolves. Keep in step with REGISTRY. */
  const CREATES = {
    'objective.created': 'objectives', 'kr.created': 'krs', 'task.created': 'tasks',
    'decision.proposed': 'decisions', 'risk.raised': 'risks', 'review.scheduled': 'reviews',
    'fin.budget.set': 'finBudgets', 'fin.risk.logged': 'finRisks',
    'sales.deal.logged': 'deals', 'sales.quota.set': 'quotas',
    'product.roadmap.item': 'roadmap', 'strategy.okr.set': 'okrs',
    'ops.incident.logged': 'incidents', 'ops.milestone.set': 'milestones',
    'hr.pip.started': 'pips', 'mktg.campaign.logged': 'campaigns',
    'supply.vendor.logged': 'vendors', 'rd.experiment.logged': 'experiments',
    'rd.tech.debt.logged': 'techDebt', 'legal.contract.logged': 'contracts',
    'cs.escalation.logged': 'escalations', 'exec.crisis.logged': 'crises',
    'note.added': 'notes'
  };

  function isBlank(v) { return v === undefined || v === null || v === ''; }

  function validate(type, payload) {
    const errors = [];
    const spec = REGISTRY[type];
    if (!spec) { return { ok: false, errors: ['unknown event type: ' + String(type)] }; }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { return { ok: false, errors: ['payload must be an object'] }; }

    spec.require.forEach(function (k) { if (isBlank(payload[k])) errors.push('missing required field: ' + k); });

    Object.keys(payload).forEach(function (k) {
      if (spec.require.indexOf(k) === -1 && spec.optional.indexOf(k) === -1) errors.push('field not in registry contract: ' + k);
    });

    if (spec.enums) Object.keys(spec.enums).forEach(function (k) {
      if (!isBlank(payload[k]) && spec.enums[k].indexOf(payload[k]) === -1) errors.push('field ' + k + ' must be one of [' + spec.enums[k].join(', ') + ']');
    });
    if (spec.numbers) spec.numbers.forEach(function (k) {
      if (!isBlank(payload[k]) && typeof payload[k] !== 'number') errors.push('field ' + k + ' must be a number');
    });
    if (spec.bools) spec.bools.forEach(function (k) {
      if (!isBlank(payload[k]) && typeof payload[k] !== 'boolean') errors.push('field ' + k + ' must be a boolean');
    });
    if (spec.arrays) spec.arrays.forEach(function (k) {
      if (!isBlank(payload[k]) && !Array.isArray(payload[k])) errors.push('field ' + k + ' must be an array');
    });
    if (spec.nonemptyArrays) spec.nonemptyArrays.forEach(function (k) {
      if (!isBlank(payload[k]) && (!Array.isArray(payload[k]) || payload[k].length === 0)) errors.push('field ' + k + ' must be a non-empty array');
    });
    if (spec.ranges) Object.keys(spec.ranges).forEach(function (k) {
      if (typeof payload[k] === 'number') { const r = spec.ranges[k]; if (payload[k] < r[0] || payload[k] > r[1]) errors.push('field ' + k + ' must be between ' + r[0] + ' and ' + r[1]); }
    });

    if (type === 'settings.changed' && errors.length === 0) {
      const defs = LeadOS.store && LeadOS.store.ALL_SETTING_DEFAULTS;
      if (defs) {
        if (!(payload.key in defs)) errors.push('unknown setting key: ' + String(payload.key));
        else if (typeof payload.value !== typeof defs[payload.key]) errors.push('setting ' + payload.key + ' must be a ' + typeof defs[payload.key]);
        else if (typeof payload.value === 'number' && (!isFinite(payload.value) || payload.value <= 0)) errors.push('setting ' + payload.key + ' must be a positive finite number');
      }
    }

    if (errors.length === 0 && spec.custom) {
      const err = spec.custom(payload);
      if (err) errors.push(err);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function domainLabel(id) { const d = DOMAINS.find(function (x) { return x.id === id; }); return d ? d.label : id; }
  function domainHue(id) { const d = DOMAINS.find(function (x) { return x.id === id; }); return d ? d.hue : 220; }

  LeadOS.events = { REGISTRY: REGISTRY, CREATES: CREATES, DOMAINS: DOMAINS, DOMAIN_IDS: DOMAIN_IDS, REVIEW_KINDS: REVIEW_KINDS, validate: validate, domainLabel: domainLabel, domainHue: domainHue };
})();
