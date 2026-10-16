/* LeadOS pt-4 - js/engine.js
   Derivation engine. project() folds the event log into state ON EVERY READ.
   Nothing in this module touches localStorage. Every selector is pure and
   takes `now` explicitly so the T-suite can pin time.

   pt-4 part 4 - NAMED PROJECTIONS.
   Doctrine for every projection in this file:
     1. append-order wins  - later events overwrite earlier field values; entity
        maps are keyed, so the last append is always the truth.
     2. nothing derived persists - every structure below is rebuilt from the log
        on each call; none of it is ever written back to storage (G4/G7/G10).
     3. stale state impossible by construction - the `*ById` projections are the
        SAME OBJECT REFERENCES the fold mutates (aliases, not copies), and the
        `open*` sets are recomputed in finalize() at the end of every fold.
        There is no code path that can update an entity without the projection
        seeing it, because there is only one object. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000;

  const CADENCE = [
    { kind: 'revenue',    label: 'Revenue review',   settingKey: 'revenueReviewCadenceDays' },
    { kind: 'ops',        label: 'Ops review',       settingKey: 'opsReviewCadenceDays' },
    { kind: 'board',      label: 'Board meeting',    settingKey: 'boardCadenceDays' },
    { kind: 'compliance', label: 'Compliance audit', settingKey: 'complianceAuditCadenceDays' }
  ];

  const push = function (arr, p, at) { arr.push(Object.assign({ at: at }, p)); };
  const mergeDefined = function (target, p, keys) { keys.forEach(function (k) { if (p[k] !== undefined) target[k] = p[k]; }); };
  const group = function (map, key, item) { (map[key] = map[key] || []).push(item); };

  // Fold handlers: (state, payload, at, ev). Entities are keyed; logs append.
  const MODULE_FOLD = {
    // FINANCE
    'fin.budget.set':      function (s, p, at) { s.finBudgets[p.id] = { id: p.id, period: p.period, amount: p.amount, currency: p.currency, category: p.category, ownerId: p.ownerId || null, actuals: [], setAt: at }; },
    'fin.budget.actuals':  function (s, p, at) { const b = s.finBudgets[p.budgetId]; if (b) b.actuals.push({ actual: p.actual, period: p.period, note: p.note || '', at: at }); },
    'fin.forecast.logged': function (s, p, at) { push(s.finForecasts, p, at); },
    'fin.kpi.logged':      function (s, p, at) { const rec = Object.assign({ at: at }, p); s.finKpis.push(rec); group(s.kpiByMetric, p.metric, rec); },
    'fin.risk.logged':     function (s, p, at) { s.finRisks[p.id] = { id: p.id, title: p.title, severity: p.severity, likelihood: p.likelihood, mitigationPlan: p.mitigationPlan || '', ownerId: p.ownerId || null, reviewDate: p.reviewDate || null, status: 'open', notes: [], loggedAt: at, updatedAt: at }; },
    'fin.risk.updated':    function (s, p, at) { const r = s.finRisks[p.riskId]; if (r) { r.status = p.status; r.updatedAt = at; if (p.note) r.notes.push({ note: p.note, at: at }); } },
    // SALES
    'sales.deal.logged':       function (s, p, at) { s.deals[p.id] = { id: p.id, title: p.title, value: p.value, currency: p.currency, stage: p.stage, ownerId: p.ownerId || null, closeDate: p.closeDate || null, accountName: p.accountName || '', result: null, actualValue: null, lostReason: null, closeNote: '', updates: 0, loggedAt: at, updatedAt: at, closedAt: null }; },
    'sales.deal.updated':      function (s, p, at) { const d = s.deals[p.dealId]; if (d) { mergeDefined(d, p, ['stage', 'value', 'closeDate', 'lostReason']); d.updates++; d.updatedAt = at; } },
    'sales.deal.closed':       function (s, p, at) { const d = s.deals[p.dealId]; if (d) { d.result = p.result; d.actualValue = (p.actualValue !== undefined) ? p.actualValue : null; d.closeNote = p.note || ''; d.closedAt = at; } },
    'sales.pipeline.reviewed': function (s, p, at) { push(s.pipelineReviews, p, at); },
    'sales.quota.set':         function (s, p, at) { s.quotas[p.id] = { id: p.id, personId: p.personId, period: p.period, target: p.target, currency: p.currency, actuals: [], setAt: at }; },
    'sales.quota.actuals':     function (s, p, at) { const q = s.quotas[p.quotaId]; if (q) q.actuals.push({ actual: p.actual, period: p.period, at: at }); },
    // PRODUCT & STRATEGY
    'product.roadmap.item':    function (s, p, at) { s.roadmap[p.id] = { id: p.id, title: p.title, quarter: p.quarter, pillar: p.pillar || '', ownerId: p.ownerId || null, effort: p.effort, impact: p.impact, status: p.status, createdAt: at, statusAt: at }; },
    'product.roadmap.updated': function (s, p, at) { const r = s.roadmap[p.itemId]; if (r) { mergeDefined(r, p, ['status', 'quarter', 'ownerId']); r.statusAt = at; } },
    'product.metric.logged':   function (s, p, at) { push(s.productMetrics, p, at); },
    'product.retro.logged':    function (s, p, at) { push(s.retros, p, at); },
    'strategy.okr.set':        function (s, p, at) { s.okrs[p.id] = { id: p.id, objective: p.objective, quarter: p.quarter, ownerId: p.ownerId || null, keyResults: p.keyResults.map(function (k) { return { kr: k.kr, target: k.target, unit: k.unit, current: null, logs: [] }; }), score: null, closeNote: '', setAt: at, closedAt: null }; },
    'strategy.okr.progress':   function (s, p, at) { const o = s.okrs[p.okrId]; const kr = o && o.keyResults[p.krIndex]; if (kr) { kr.current = p.current; kr.logs.push({ current: p.current, note: p.note || '', at: at }); } },
    'strategy.okr.closed':     function (s, p, at) { const o = s.okrs[p.okrId]; if (o) { o.score = p.score; o.closeNote = p.note || ''; o.closedAt = at; } },
    'strategy.decision':       function (s, p, at) { push(s.strategyDecisions, p, at); },
    // OPERATIONS & DELIVERY
    'ops.incident.logged':   function (s, p, at) { s.incidents[p.id] = { id: p.id, title: p.title, severity: p.severity, systems: p.systems.slice(), startedAt: p.startedAt, detectedAt: p.detectedAt || null, ownerId: p.ownerId || null, resolved: false, resolvedAt: null, rootCause: '', actions: [], loggedAt: at }; },
    'ops.incident.resolved': function (s, p, at) { const i = s.incidents[p.incidentId]; if (i) { i.resolved = true; i.resolvedAt = p.resolvedAt; i.rootCause = p.rootCause || ''; i.actions = (p.actions || []).slice(); } },
    'ops.sla.logged':        function (s, p, at) { const rec = Object.assign({ at: at }, p); s.slaLogs.push(rec); group(s.slaByMetric, p.metric, rec); },
    'ops.capacity.logged':   function (s, p, at) { push(s.capacityLogs, p, at); },
    'ops.process.logged':    function (s, p, at) { push(s.processLogs, p, at); },
    'ops.milestone.set':     function (s, p, at) { s.milestones[p.id] = { id: p.id, title: p.title, dueDate: p.dueDate, ownerId: p.ownerId || null, projectId: p.projectId || null, dependsOn: (p.dependsOn || []).slice(), status: 'on-track', history: [], setAt: at, statusAt: at }; },
    'ops.milestone.updated': function (s, p, at) { const m = s.milestones[p.milestoneId]; if (m) { m.status = p.status; m.statusAt = at; m.history.push({ status: p.status, note: p.note || '', at: at }); } },
    // PEOPLE & HR
    'hr.headcount.planned':     function (s, p, at) { push(s.headcountPlans, p, at); },
    'hr.offer.logged':          function (s, p, at) { push(s.offers, p, at); },
    'hr.attrition.logged':      function (s, p, at) { push(s.attrition, p, at); },
    'hr.performance.logged':    function (s, p, at) { push(s.perfLogs, p, at); },
    'hr.pip.started':           function (s, p, at) { s.pips[p.id] = { id: p.id, personId: p.personId, duration_days: p.duration_days, goals: p.goals.slice(), ownerId: p.ownerId || null, result: null, closeNote: '', startedAt: at, closedAt: null }; },
    'hr.pip.closed':            function (s, p, at) { const x = s.pips[p.pipId]; if (x) { x.result = p.result; x.closeNote = p.note || ''; x.closedAt = at; } },
    'hr.engagement.logged':     function (s, p, at) { push(s.engagement, p, at); },
    'hr.compensation.reviewed': function (s, p, at) { push(s.compReviews, p, at); },
    // MARKETING
    'mktg.campaign.logged':    function (s, p, at) { s.campaigns[p.id] = { id: p.id, name: p.name, channel: p.channel, budget: p.budget, period: p.period, ownerId: p.ownerId || null, results: [], loggedAt: at }; },
    'mktg.campaign.result':    function (s, p, at) { const c = s.campaigns[p.campaignId]; if (c) c.results.push(Object.assign({ at: at }, p)); },
    'mktg.brand.audit':        function (s, p, at) { push(s.brandAudits, p, at); },
    'mktg.content.published':  function (s, p, at) { push(s.content, p, at); },
    // MANUFACTURING
    'mfg.production.logged':   function (s, p, at) { push(s.productionLogs, p, at); },
    'mfg.quality.logged':      function (s, p, at) { push(s.qualityLogs, p, at); },
    'mfg.safety.incident':     function (s, p, at) { push(s.safetyIncidents, p, at); },
    'mfg.equipment.logged':    function (s, p, at) { s.equipment[p.assetId] = { assetId: p.assetId, status: p.status, note: p.note || '', next_maintenance: p.next_maintenance || null, at: at }; },
    'mfg.yield.logged':        function (s, p, at) { push(s.yieldLogs, p, at); },
    // SUPPLY CHAIN
    'supply.vendor.logged':     function (s, p, at) { s.vendors[p.id] = { id: p.id, name: p.name, category: p.category, tier: p.tier, risk_level: p.risk_level, reviewDate: p.reviewDate || null, reviews: [], lastScore: null, loggedAt: at }; },
    'supply.vendor.reviewed':   function (s, p, at) { const v = s.vendors[p.vendorId]; if (v) { v.reviews.push({ score: p.score, note: p.note || '', nextReviewDate: p.nextReviewDate || null, at: at }); v.lastScore = p.score; } },
    'supply.inventory.logged':  function (s, p, at) { push(s.inventoryLogs, p, at); },
    'supply.disruption.logged': function (s, p, at) { push(s.disruptions, p, at); },
    // DESIGN
    'design.review.logged':   function (s, p, at) { push(s.designReviews, p, at); },
    'design.system.updated':  function (s, p, at) { push(s.designSystemUpdates, p, at); },
    'design.research.logged': function (s, p, at) { push(s.designResearch, p, at); },
    'design.ux.metric':       function (s, p, at) { push(s.uxMetrics, p, at); },
    // R&D
    'rd.experiment.logged':   function (s, p, at) { s.experiments[p.id] = { id: p.id, hypothesis: p.hypothesis, method: p.method, ownerId: p.ownerId || null, startDate: p.startDate, reviewDate: p.reviewDate || null, result: null, learnings: [], next: '', loggedAt: at, resultAt: null }; },
    'rd.experiment.result':   function (s, p, at) { const e = s.experiments[p.experimentId]; if (e) { e.result = p.result; e.learnings = (p.learnings || []).slice(); e.next = p.next || ''; e.resultAt = at; } },
    'rd.patent.logged':       function (s, p, at) { push(s.patents, p, at); },
    'rd.tech.debt.logged':    function (s, p, at) { s.techDebt[p.id] = { id: p.id, title: p.title, severity: p.severity, effort: p.effort, ownerId: p.ownerId || null, note: p.note || '', resolved: false, resolveNote: '', loggedAt: at, resolvedAt: null }; },
    'rd.tech.debt.resolved':  function (s, p, at) { const d = s.techDebt[p.debtId]; if (d) { d.resolved = true; d.resolveNote = p.note || ''; d.resolvedAt = at; } },
    // LEGAL
    'legal.compliance.check': function (s, p, at) { const rec = Object.assign({ at: at }, p); s.complianceChecks.push(rec); group(s.complianceByFramework, p.framework, rec); },
    // legal.risk.logged carries no id in the spec -> keyed by its originating
    // event id, which is append-ordered and unique by construction (G3).
    'legal.risk.logged':      function (s, p, at, ev) { const rec = Object.assign({ id: ev.id, at: at }, p); s.legalRisks.push(rec); s.legalRiskById[ev.id] = rec; },
    'legal.contract.logged':  function (s, p, at) { s.contracts[p.id] = { id: p.id, counterparty: p.counterparty, type: p.type, value: p.value || null, expiryDate: p.expiryDate || null, ownerId: p.ownerId || null, status: 'active', note: '', loggedAt: at, statusAt: at }; },
    'legal.contract.updated': function (s, p, at) { const c = s.contracts[p.contractId]; if (c) { c.status = p.status; c.statusAt = at; if (p.note) c.note = p.note; } },
    'legal.incident.logged':  function (s, p, at) { push(s.legalIncidents, p, at); },
    // CUSTOMER SUCCESS
    'cs.nps.logged':          function (s, p, at) { push(s.npsLogs, p, at); },
    'cs.churn.logged':        function (s, p, at) { push(s.churnLogs, p, at); },
    'cs.escalation.logged':   function (s, p, at) { s.escalations[p.id] = { id: p.id, accountName: p.accountName, severity: p.severity, description: p.description, ownerId: p.ownerId || null, dueDate: p.dueDate || null, resolved: false, resolution: '', resolveNote: '', loggedAt: at, resolvedAt: null }; },
    'cs.escalation.resolved': function (s, p, at) { const e = s.escalations[p.escalationId]; if (e) { e.resolved = true; e.resolution = p.resolution; e.resolveNote = p.note || ''; e.resolvedAt = at; } },
    'cs.health.logged':       function (s, p, at) { push(s.csHealthLogs, p, at); },
    // NOTES (pt-4 part 5)
    'note.added':             function (s, p, at) { const rec = { id: p.id, domain: p.domain, text: p.text, refId: p.refId || null, context: p.context || '', at: at }; s.notes[p.id] = rec; s.noteLog.push(rec); if (rec.refId) group(s.notesByRef, rec.refId, rec); },
    // EXECUTIVE & BOARD
    'exec.board.meeting':     function (s, p, at) { push(s.boardMeetings, p, at); },
    'exec.kpi.reviewed':      function (s, p, at) { push(s.execKpiReviews, p, at); },
    'exec.investor.update':   function (s, p, at) { push(s.investorUpdates, p, at); },
    'exec.crisis.logged':     function (s, p, at) { s.crises[p.id] = { id: p.id, title: p.title, severity: p.severity, type: p.type, ownerId: p.ownerId || null, responseTeam: p.responseTeam.slice(), activatedAt: p.activatedAt, resolved: false, postmortem: '', loggedAt: at, resolvedAt: null }; },
    'exec.crisis.resolved':  function (s, p, at) { const c = s.crises[p.crisisId]; if (c) { c.resolved = true; c.postmortem = p.postmortem || ''; c.resolvedAt = p.resolvedAt; } },
    // INTELLIGENCE LAYER (pt-5)
    'insight.acknowledged': function (s, p, at) { s.insightAcks[p.insightId] = { at: at, note: p.note || '' }; },
    'benchmark.set':        function (s, p, at) { const rec = Object.assign({ at: at }, p); s.benchmarks.push(rec); group(s.benchmarkByMetric, p.metric, rec); },
    'cadence.review':       function (s, p, at) { push(s.reviewLog, p, at); },
    'signal.tagged':        function (s, p, at) { const rec = Object.assign({ at: at }, p); push(s.signalTags, p, at); group(s.tagsByEvent, p.eventId, rec); }
  };

  function blankBuckets(s) {
    s.finBudgets = {}; s.finForecasts = []; s.finKpis = []; s.finRisks = {};
    s.deals = {}; s.quotas = {}; s.pipelineReviews = [];
    s.roadmap = {}; s.productMetrics = []; s.retros = []; s.okrs = {}; s.strategyDecisions = [];
    s.incidents = {}; s.slaLogs = []; s.capacityLogs = []; s.processLogs = []; s.milestones = {};
    s.headcountPlans = []; s.offers = []; s.attrition = []; s.perfLogs = []; s.pips = {}; s.engagement = []; s.compReviews = [];
    s.campaigns = {}; s.brandAudits = []; s.content = [];
    s.productionLogs = []; s.qualityLogs = []; s.safetyIncidents = []; s.equipment = {}; s.yieldLogs = [];
    s.vendors = {}; s.inventoryLogs = []; s.disruptions = [];
    s.designReviews = []; s.designSystemUpdates = []; s.designResearch = []; s.uxMetrics = [];
    s.experiments = {}; s.patents = []; s.techDebt = {};
    s.complianceChecks = []; s.legalRisks = []; s.contracts = {}; s.legalIncidents = [];
    s.npsLogs = []; s.churnLogs = []; s.escalations = {}; s.csHealthLogs = [];
    s.boardMeetings = []; s.execKpiReviews = []; s.investorUpdates = []; s.crises = {};
    s.notes = {}; s.noteLog = []; s.notesByRef = {};
    // pt-5 intelligence buckets
    s.insightAcks = {}; s.benchmarks = []; s.benchmarkByMetric = {}; s.reviewLog = []; s.signalTags = []; s.tagsByEvent = {};
    // index projections built during the fold (append-order preserved)
    s.kpiByMetric = {}; s.slaByMetric = {}; s.complianceByFramework = {}; s.legalRiskById = {};
  }

  /* Declarative alias table: named projection -> internal bucket.
     Aliases are assigned by reference, so a named projection can never drift
     from the state the fold mutates. This is the "stale state impossible by
     construction" guarantee, and T18/G10 inspect the identity directly. */
  const ALIASES = {
    budgetById: 'finBudgets', riskById: 'finRisks', forecastHistory: 'finForecasts',
    dealById: 'deals', quotaById: 'quotas',
    okrById: 'okrs', roadmapById: 'roadmap',
    milestoneById: 'milestones', incidentById: 'incidents',
    attritionEvents: 'attrition', engagementHistory: 'engagement', pipById: 'pips',
    campaignById: 'campaigns',
    vendorById: 'vendors', disruptionEvents: 'disruptions',
    yieldHistory: 'yieldLogs', equipmentById: 'equipment',
    contractById: 'contracts',
    npsHistory: 'npsLogs', churnHistory: 'churnLogs', escalationById: 'escalations', noteById: 'notes',
    techDebtById: 'techDebt', experimentById: 'experiments', crisisById: 'crises'
  };

  // open* predicates. All are time-independent: "open" means the log has not
  // yet recorded the closing event, never "overdue" (that is a rule's job).
  const OPEN_SETS = {
    openBudgets:     ['finBudgets',  function (b) { return b.actuals.length === 0; }],      // unreconciled: no actuals logged
    openRisks:       ['finRisks',    function (r) { return r.status === 'open'; }],
    openDeals:       ['deals',       function (d) { return d.result === null; }],
    openOkrs:        ['okrs',        function (o) { return o.closedAt === null; }],
    openMilestones:  ['milestones',  function (m) { return m.status !== 'done'; }],
    openIncidents:   ['incidents',   function (i) { return !i.resolved; }],
    openPips:        ['pips',        function (p) { return p.result === null; }],
    openVendors:     ['vendors',     function (v) { return v.reviews.length === 0; }],      // never reviewed
    openEscalations: ['escalations', function (e) { return !e.resolved; }],
    openTechDebt:    ['techDebt',    function (d) { return !d.resolved; }],
    openExperiments: ['experiments', function (e) { return e.result === null; }],
    openCrises:      ['crises',      function (c) { return !c.resolved; }],
    openContracts:   ['contracts',   function (c) { return c.status === 'active'; }]
  };

  // Roster is derived, never declared: a person exists because the log
  // mentions them. No directory, no invented records.
  function buildRoster(s) {
    const r = {};
    const touch = function (id) { if (!id) return null; if (!r[id]) r[id] = { id: id, quotas: [], performance: [], pips: [], compensation: [], attrition: null, deals: [], sources: {} }; return r[id]; };
    Object.keys(s.quotas).forEach(function (k) { const q = s.quotas[k]; const p = touch(q.personId); if (p) { p.quotas.push(q); p.sources['sales.quota.set'] = true; } });
    Object.keys(s.deals).forEach(function (k) { const d = s.deals[k]; const p = touch(d.ownerId); if (p) { p.deals.push(d); p.sources['sales.deal.logged'] = true; } });
    s.perfLogs.forEach(function (x) { const p = touch(x.personId); if (p) { p.performance.push(x); p.sources['hr.performance.logged'] = true; } });
    Object.keys(s.pips).forEach(function (k) { const x = s.pips[k]; const p = touch(x.personId); if (p) { p.pips.push(x); p.sources['hr.pip.started'] = true; } });
    s.compReviews.forEach(function (x) { const p = touch(x.personId); if (p) { p.compensation.push(x); p.sources['hr.compensation.reviewed'] = true; } });
    s.attrition.forEach(function (x) { const p = touch(x.personId); if (p) { p.attrition = x; p.sources['hr.attrition.logged'] = true; } });
    Object.keys(r).forEach(function (id) {
      const p = r[id];
      p.openPips = p.pips.filter(function (x) { return x.result === null; });
      p.openDeals = p.deals.filter(function (d) { return d.result === null; });
      p.isSales = p.quotas.length > 0 || p.deals.length > 0;
      p.departed = p.attrition !== null;
    });
    return r;
  }

  function finalize(s) {
    Object.keys(ALIASES).forEach(function (name) { s[name] = s[ALIASES[name]]; });
    // grouped-by-person projections (append order within each person)
    s.dealsByPerson = {}; s.quotaByPerson = {};
    Object.keys(s.deals).forEach(function (k) { const d = s.deals[k]; group(s.dealsByPerson, d.ownerId || '(unassigned)', d); });
    Object.keys(s.quotas).forEach(function (k) { const q = s.quotas[k]; group(s.quotaByPerson, q.personId, q); });
    s.rosterById = buildRoster(s);
    // open sets: recomputed every fold, never cached
    Object.keys(OPEN_SETS).forEach(function (name) {
      const src = s[OPEN_SETS[name][0]], pred = OPEN_SETS[name][1];
      s[name] = Object.keys(src).map(function (k) { return src[k]; }).filter(pred);
    });
    return s;
  }

  function project(events) {
    const s = {
      eventCount: events.length,
      appliedSettings: {},
      objectives: {}, krs: {}, tasks: {}, decisions: {}, risks: {}, reviews: {},
      playbooks: [], counts: {}, repairs: [], firstAt: null, lastAt: null
    };
    blankBuckets(s);

    events.forEach(function (ev) {
      s.counts[ev.type] = (s.counts[ev.type] || 0) + 1;
      if (s.firstAt === null || ev.at < s.firstAt) s.firstAt = ev.at;
      if (s.lastAt === null || ev.at > s.lastAt) s.lastAt = ev.at;
      if (ev.meta && ev.meta.repair) s.repairs.push(ev);
      const p = ev.payload || {};

      const mf = MODULE_FOLD[ev.type];
      if (mf) { mf(s, p, ev.at, ev); return; }

      switch (ev.type) {
        case 'settings.changed':
          s.appliedSettings[p.key] = p.value; break;
        case 'objective.created':
          s.objectives[p.id] = { id: p.id, domain: p.domain, title: p.title, owner: p.owner || '', horizon: p.horizon || '', status: 'active', createdAt: ev.at }; break;
        case 'objective.statusChanged':
          if (s.objectives[p.id]) s.objectives[p.id].status = p.status; break;
        case 'kr.created':
          s.krs[p.id] = { id: p.id, objectiveId: p.objectiveId, title: p.title, target: p.target, unit: p.unit, baseline: (p.baseline == null ? 0 : p.baseline), logs: [] }; break;
        case 'kr.progressLogged':
          if (s.krs[p.id]) s.krs[p.id].logs.push({ at: ev.at, value: p.value, note: p.note || '' }); break;
        case 'task.created':
          s.tasks[p.id] = { id: p.id, domain: p.domain, title: p.title, owner: p.owner || '', dueAt: p.dueAt || null, status: 'open', createdAt: ev.at, completedAt: null }; break;
        case 'task.completed':
          if (s.tasks[p.id]) { s.tasks[p.id].status = 'done'; s.tasks[p.id].completedAt = ev.at; } break;
        case 'decision.proposed':
          s.decisions[p.id] = { id: p.id, domain: p.domain, question: p.question, options: (p.options || []).slice(), owner: p.owner, reversibility: p.reversibility, dueAt: p.dueAt || null, status: 'open', choice: null, rationale: null, createdAt: ev.at, decidedAt: null }; break;
        case 'decision.decided':
          if (s.decisions[p.id] && s.decisions[p.id].status === 'open') {
            s.decisions[p.id].status = 'decided'; s.decisions[p.id].choice = p.choice;
            s.decisions[p.id].rationale = p.rationale; s.decisions[p.id].decidedAt = ev.at;
          } break;
        case 'risk.raised':
          s.risks[p.id] = { id: p.id, domain: p.domain, title: p.title, likelihood: p.likelihood, impact: p.impact, mitigation: p.mitigation || '', status: 'open', createdAt: ev.at, updatedAt: ev.at }; break;
        case 'risk.statusChanged':
          if (s.risks[p.id]) { s.risks[p.id].status = p.status; s.risks[p.id].updatedAt = ev.at; } break;
        case 'review.scheduled':
          s.reviews[p.id] = { id: p.id, kind: p.kind, domain: p.domain || null, dueAt: p.dueAt, status: 'scheduled', outcome: null, notes: '', completedAt: null, createdAt: ev.at }; break;
        case 'review.completed':
          if (s.reviews[p.id]) { s.reviews[p.id].status = 'completed'; s.reviews[p.id].outcome = p.outcome; s.reviews[p.id].notes = p.notes || ''; s.reviews[p.id].completedAt = ev.at; } break;
        case 'playbook.applied':
          s.playbooks.push({ id: p.id, domain: p.domain, playbookId: p.playbookId, at: ev.at }); break;
      }
    });
    return finalize(s);
  }

  // Full list of named projections pt-4 part 4 guarantees (inspected by T18/G10).
  const NAMED_PROJECTIONS = Object.keys(ALIASES)
    .concat(Object.keys(OPEN_SETS))
    .concat(['dealsByPerson', 'quotaByPerson', 'kpiByMetric', 'slaByMetric', 'complianceByFramework', 'legalRiskById', 'safetyIncidents', 'boardMeetings', 'execKpiReviews', 'rosterById', 'noteLog', 'notesByRef'])
    // pt-5: six more named projections (56 total), inspected by the same T25/G10 arms.
    .concat(['insightAcks', 'benchmarks', 'benchmarkByMetric', 'reviewLog', 'signalTags', 'tagsByEvent']);

  /* Event -> domain resolution. Namespaced types map by prefix; core types
     carry an explicit `domain`; the remainder resolve through their parent
     entity when a projection is supplied. Anything genuinely domain-less
     (store.initialized, settings.changed) returns null and is reported as
     'system' - never guessed into a domain. */
  const TYPE_PREFIX_DOMAIN = {
    'fin.': 'finance', 'sales.': 'sales', 'product.': 'product', 'strategy.': 'product',
    'ops.': 'operations', 'hr.': 'people', 'mktg.': 'marketing', 'mfg.': 'manufacturing',
    'supply.': 'supplyChain', 'design.': 'design', 'rd.': 'rd', 'legal.': 'legal',
    'cs.': 'customerSuccess', 'exec.': 'executive'
  };
  const PARENT_LOOKUP = {
    'kr.created': ['objectiveId', 'objectives'], 'kr.progressLogged': ['id', 'krsToObjective'],
    'task.completed': ['id', 'tasks'], 'decision.decided': ['id', 'decisions'],
    'objective.statusChanged': ['id', 'objectives'], 'risk.statusChanged': ['id', 'risks'],
    'review.completed': ['id', 'reviews']
  };
  function eventDomain(ev, P) {
    const p = ev.payload || {};
    if (p.domain) return p.domain;
    const keys = Object.keys(TYPE_PREFIX_DOMAIN);
    for (let i = 0; i < keys.length; i++) if (ev.type.indexOf(keys[i]) === 0) return TYPE_PREFIX_DOMAIN[keys[i]];
    if (P && PARENT_LOOKUP[ev.type]) {
      const spec = PARENT_LOOKUP[ev.type];
      if (spec[1] === 'krsToObjective') {
        const kr = P.krs[p.id]; const obj = kr && P.objectives[kr.objectiveId];
        return obj ? obj.domain : null;
      }
      const ent = P[spec[1]] && P[spec[1]][p[spec[0]]];
      if (ent) return ent.domain || null;
    }
    return null;
  }

  function settings(state) { return Object.assign({}, LeadOS.store.ALL_SETTING_DEFAULTS, state.appliedSettings); }

  function knownIds(state) {
    const k = function (o) { return Object.keys(o); };
    return {
      finBudgets: k(state.finBudgets), finRisks: k(state.finRisks), deals: k(state.deals), quotas: k(state.quotas),
      roadmap: k(state.roadmap), okrs: k(state.okrs), incidents: k(state.incidents), milestones: k(state.milestones),
      pips: k(state.pips), campaigns: k(state.campaigns), vendors: k(state.vendors), experiments: k(state.experiments),
      techDebt: k(state.techDebt), contracts: k(state.contracts), escalations: k(state.escalations), crises: k(state.crises),
      objectives: k(state.objectives), krs: k(state.krs), tasks: k(state.tasks), decisions: k(state.decisions),
      risks: k(state.risks), reviews: k(state.reviews)
    };
  }

  // ---- Cadences -------------------------------------------------------------
  function cadenceStatus(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const set = settings(state);
    const out = {};
    CADENCE.forEach(function (c) {
      const reviews = Object.keys(state.reviews).map(function (k) { return state.reviews[k]; }).filter(function (r) { return r.kind === c.kind; });
      const completed = reviews.filter(function (r) { return r.status === 'completed'; }).sort(function (a, b) { return b.completedAt - a.completedAt; });
      const open = reviews.filter(function (r) { return r.status === 'scheduled'; }).sort(function (a, b) { return a.dueAt - b.dueAt; });
      const intervalDays = set[c.settingKey];
      const lastCompletedAt = completed.length ? completed[0].completedAt : null;
      let status, dueAt, overdueDays = 0;
      if (lastCompletedAt === null) { status = 'never'; dueAt = open.length ? open[0].dueAt : null; }
      else {
        dueAt = lastCompletedAt + intervalDays * DAY;
        if (now > dueAt) { status = 'overdue'; overdueDays = Math.ceil((now - dueAt) / DAY); }
        else if (dueAt - now <= DAY) { status = 'due'; }
        else { status = 'ok'; }
      }
      out[c.kind] = { kind: c.kind, label: c.label, settingKey: c.settingKey, intervalDays: intervalDays, lastCompletedAt: lastCompletedAt, dueAt: dueAt, status: status, overdueDays: overdueDays, openScheduled: open.length ? open[0] : null, completedCount: completed.length };
    });
    return out;
  }

  // ---- pt-1 selectors -------------------------------------------------------
  function decisionQueue(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const set = settings(state);
    return Object.keys(state.decisions).map(function (k) { return state.decisions[k]; })
      .filter(function (d) { return d.status === 'open'; })
      .map(function (d) {
        const ageDays = Math.floor((now - d.createdAt) / DAY);
        return Object.assign({}, d, { ageDays: ageDays, stale: ageDays > set.decisionMaxOpenDays, beyondSalesCycle: d.domain === 'sales' && ageDays > set.salesCycleDays });
      })
      .sort(function (a, b) { return b.ageDays - a.ageDays; });
  }
  function decidedLog(state) {
    return Object.keys(state.decisions).map(function (k) { return state.decisions[k]; })
      .filter(function (d) { return d.status === 'decided'; }).sort(function (a, b) { return b.decidedAt - a.decidedAt; });
  }
  function riskRegister(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const set = settings(state);
    return Object.keys(state.risks).map(function (k) { return state.risks[k]; })
      .filter(function (r) { return r.status === 'open' || r.status === 'mitigating'; })
      .map(function (r) { const ageDays = Math.floor((now - r.updatedAt) / DAY); return Object.assign({}, r, { score: r.likelihood * r.impact, ageDays: ageDays, stale: ageDays > set.riskReviewCadenceDays }); })
      .sort(function (a, b) { return (b.score - a.score) || (b.ageDays - a.ageDays); });
  }
  function krView(state) {
    return Object.keys(state.krs).map(function (k) { return state.krs[k]; })
      .map(function (kr) {
        const current = kr.logs.length ? kr.logs[kr.logs.length - 1].value : kr.baseline;
        const span = kr.target - kr.baseline;
        const pct = span > 0 ? Math.max(0, Math.min(100, Math.round(((current - kr.baseline) / span) * 100))) : (kr.target > 0 ? Math.round((current / kr.target) * 100) : 0);
        const obj = state.objectives[kr.objectiveId];
        return Object.assign({}, kr, { current: current, pct: pct, domain: obj ? obj.domain : null, checkIns: kr.logs.length });
      });
  }
  function taskLists(state, now) {
    now = (typeof now === 'number') ? now : Date.now();
    const all = Object.keys(state.tasks).map(function (k) { return state.tasks[k]; });
    const open = all.filter(function (t) { return t.status === 'open'; });
    return { open: open.sort(function (a, b) { return (a.dueAt || Infinity) - (b.dueAt || Infinity); }), overdue: open.filter(function (t) { return t.dueAt !== null && now > t.dueAt; }).sort(function (a, b) { return a.dueAt - b.dueAt; }), doneCount: all.filter(function (t) { return t.status === 'done'; }).length };
  }
  function domainRollups(state) {
    const out = {};
    LeadOS.events.DOMAINS.forEach(function (d) { out[d.id] = { id: d.id, label: d.label, hue: d.hue, activeObjectives: 0, openTasks: 0, openRisks: 0, openDecisions: 0, krCount: 0, playbooks: 0, lastActivityAt: null }; });
    function touch(id, at) { const r = out[id]; if (!r) return; if (at !== null && (r.lastActivityAt === null || at > r.lastActivityAt)) r.lastActivityAt = at; }
    Object.keys(state.objectives).forEach(function (k) { const o = state.objectives[k]; if (out[o.domain] && o.status === 'active') out[o.domain].activeObjectives++; touch(o.domain, o.createdAt); });
    Object.keys(state.tasks).forEach(function (k) { const t = state.tasks[k]; if (out[t.domain] && t.status === 'open') out[t.domain].openTasks++; touch(t.domain, t.completedAt || t.createdAt); });
    Object.keys(state.risks).forEach(function (k) { const r = state.risks[k]; if (out[r.domain] && (r.status === 'open' || r.status === 'mitigating')) out[r.domain].openRisks++; touch(r.domain, r.updatedAt); });
    Object.keys(state.decisions).forEach(function (k) { const d = state.decisions[k]; if (out[d.domain] && d.status === 'open') out[d.domain].openDecisions++; touch(d.domain, d.decidedAt || d.createdAt); });
    Object.keys(state.krs).forEach(function (k) { const kr = state.krs[k]; const o = state.objectives[kr.objectiveId]; if (o && out[o.domain]) out[o.domain].krCount++; });
    state.playbooks.forEach(function (p) { if (out[p.domain]) out[p.domain].playbooks++; touch(p.domain, p.at); });
    return out;
  }
  function totals(state) {
    const objectives = Object.keys(state.objectives).map(function (k) { return state.objectives[k]; });
    return {
      events: state.eventCount,
      activeObjectives: objectives.filter(function (o) { return o.status === 'active'; }).length,
      openDecisions: Object.keys(state.decisions).filter(function (k) { return state.decisions[k].status === 'open'; }).length,
      openRisks: Object.keys(state.risks).filter(function (k) { const r = state.risks[k]; return r.status === 'open' || r.status === 'mitigating'; }).length,
      repairs: state.repairs.length
    };
  }

  LeadOS.engine = {
    DAY: DAY, CADENCE: CADENCE, ALIASES: ALIASES, OPEN_SETS: OPEN_SETS, NAMED_PROJECTIONS: NAMED_PROJECTIONS,
    TYPE_PREFIX_DOMAIN: TYPE_PREFIX_DOMAIN, eventDomain: eventDomain,
    project: project, settings: settings, knownIds: knownIds,
    cadenceStatus: cadenceStatus, decisionQueue: decisionQueue, decidedLog: decidedLog,
    riskRegister: riskRegister, krView: krView, taskLists: taskLists,
    domainRollups: domainRollups, totals: totals
  };
})();

/* ============================================================================
   RULES ENGINE  (pt-4 part 11: merged here from the former js/rules.js to
   restore the 10-file structure. Same module file, separate IIFE, loaded
   after the projection code it depends on. Public namespace LeadOS.rules is
   unchanged, so health.js and ui.js are untouched by the move.)

   Every rule is a pure function (P, today) -> findings[]. `today` is injected
   (never Date.now inside a rule) so the T-suite can pin time.

   DOCTRINES ENFORCED STRUCTURALLY (pt-4 part 9):
   1. Stable keys: `key` = `<rule>:<scope|refs[0]>` — second-run safe.
   2. Sev 3 ceiling for trend-derived severity, clamped by fin() itself and
      disclosed in the basis. Exceptions: safety (R28), legal fail (R30).
   3. >= 3 measured points before any trend claim (R20/R33 slopes excepted).
   4. Missing fields SKIP, never infer.
   5. A count is never certainty — basis prints the math and its source.
   6. Every finding carries .play, or .playNone says why not.
   ========================================================================= */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000, H = 3600000;
  const MIN_TREND_POINTS = 3;
  const TREND_SEV_CEILING = 3;

  const PB = {
    fin: 'playbook:finance', sales: 'playbook:sales', product: 'playbook:product',
    ops: 'playbook:operations', people: 'playbook:people', mktg: 'playbook:marketing',
    mfg: 'playbook:manufacturing', supply: 'playbook:supplyChain', design: 'playbook:design',
    rd: 'playbook:rd', legal: 'playbook:legal', cs: 'playbook:customerSuccess', exec: 'playbook:executive'
  };

  function fin(o) {
    if (!o.rule || !o.sev || !o.conf || !o.title) throw new Error('finding missing identity fields');
    if (!o.play && !o.playNone) throw new Error(o.rule + ': finding has neither .play nor .playNone');
    const refs = o.refs || [], basis = (o.basis || []).slice();
    let sev = o.sev;
    if (o.trend && sev > TREND_SEV_CEILING) {
      basis.push('trend-derived severity capped at ' + TREND_SEV_CEILING + ' by doctrine (pattern evidence suggested ' + sev + '); direct-data rules are not capped');
      sev = TREND_SEV_CEILING;
    }
    const scope = o.scope !== undefined ? String(o.scope) : (refs.length ? String(refs[0]) : '*');
    return {
      rule: o.rule, key: o.rule + ':' + scope, scope: scope,
      sev: sev, conf: o.conf, title: o.title,
      basis: basis, refs: refs, trend: !!o.trend,
      play: o.play || null, playNone: o.playNone || null
    };
  }
  const clampSev = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  const vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  const dBetween = function (a, b) { return (b - a) / DAY; };
  function slope(ys) {
    const n = ys.length; if (n < 2) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
    const den = n * sxx - sx * sx;
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
  }
  function median(nums) {
    const a = nums.slice().sort(function (x, y) { return x - y; });
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  const money = function (n) { return Math.round(n).toLocaleString('en-US'); };
  const pct = function (x) { return (x * 100).toFixed(1) + '%'; };
  const iso = function (ts) { return new Date(ts).toISOString().slice(0, 10); };

  /* ---- R1–R10 — heritage rules (reconstructed; AI-SESSION-LOG §10) ---- */
  /* part 13 defect fix: the factory must receive the rule id. fin() throws on
     a blank .rule by design (T12b), so passing '' here made R1–R4 crash any
     run in which a cadence fired — caught red by the headless battery (§52). */
  function ruleCadence(id, kind, play) {
    return function (P, today) {
      const c = LeadOS.engine.cadenceStatus(P, today)[kind];
      const set = LeadOS.engine.settings(P);
      const interval = set[c.settingKey], out = [];
      if (c.status === 'overdue') out.push(fin({ rule: id, scope: kind, sev: 3, conf: 'HIGH', title: c.label + ' is ' + c.overdueDays + 'd overdue', basis: ['every ' + interval + 'd; last completed ' + (c.lastCompletedAt ? iso(c.lastCompletedAt) : 'unknown') + '; due ' + iso(c.dueAt)], play: play }));
      else if (c.status === 'never' && P.firstAt !== null && dBetween(P.firstAt, today) > interval) out.push(fin({ rule: id, scope: kind, sev: 2, conf: 'HIGH', title: c.label + ' has never run', basis: ['log is ' + Math.floor(dBetween(P.firstAt, today)) + 'd old; cadence is ' + interval + 'd'], play: play }));
      return out;
    };
  }

  const RULES = [
    { id: 'R1', fn: ruleCadence('R1', 'revenue', PB.fin) },
    { id: 'R2', fn: ruleCadence('R2', 'ops', PB.ops) },
    { id: 'R3', fn: ruleCadence('R3', 'board', PB.exec) },
    { id: 'R4', fn: ruleCadence('R4', 'compliance', PB.legal) },

    { id: 'R5', fn: function (P, today) {
      return LeadOS.engine.decisionQueue(P, today).filter(function (d) { return d.stale; }).map(function (d) {
        return fin({ rule: 'R5', sev: 3, conf: 'HIGH', title: 'Decision open ' + d.ageDays + 'd: ' + d.question, basis: ['max open ' + LeadOS.engine.settings(P).decisionMaxOpenDays + 'd; owner ' + d.owner + '; domain ' + d.domain], refs: [d.id], play: 'playbook:' + d.domain });
      });
    } },
    { id: 'R6', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      return LeadOS.engine.decisionQueue(P, today).filter(function (d) { return d.beyondSalesCycle; }).map(function (d) {
        return fin({ rule: 'R6', sev: d.ageDays > 1.5 * set.salesCycleDays ? 4 : 3, conf: 'HIGH', title: 'Sales decision aged past a full cycle (' + d.ageDays + 'd)', basis: [d.question + '; salesCycleDays=' + set.salesCycleDays + '; age=' + d.ageDays + 'd'], refs: [d.id], play: PB.sales });
      });
    } },
    { id: 'R7', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      return LeadOS.engine.riskRegister(P, today).filter(function (r) { return r.stale; }).map(function (r) {
        return fin({ rule: 'R7', sev: r.ageDays > 3 * set.riskReviewCadenceDays ? 3 : 2, conf: 'HIGH', title: 'Risk unreviewed ' + r.ageDays + 'd: ' + r.title, basis: ['review cycle ' + set.riskReviewCadenceDays + 'd; score ' + r.score + ' (L' + r.likelihood + '×I' + r.impact + ')'], refs: [r.id], play: 'playbook:' + r.domain });
      });
    } },
    { id: 'R8', fn: function (P, today) {
      const set = LeadOS.engine.settings(P), out = [];
      LeadOS.engine.krView(P).forEach(function (kr) {
        const obj = P.objectives[kr.objectiveId];
        if (!obj || obj.status !== 'active') return;
        const lastAt = kr.logs.length ? kr.logs[kr.logs.length - 1].at : obj.createdAt;
        const silent = Math.floor(dBetween(lastAt, today));
        if (silent > set.krCheckInCadenceDays) out.push(fin({ rule: 'R8', sev: 2, conf: 'HIGH', title: 'KR silent ' + silent + 'd: ' + kr.title, basis: ['check-in cadence ' + set.krCheckInCadenceDays + 'd; current ' + kr.current + ' ' + kr.unit + ' of ' + kr.target], refs: [kr.id], play: 'playbook:' + (kr.domain || 'product') }));
      });
      return out;
    } },
    { id: 'R9', fn: function (P, today) {
      return LeadOS.engine.taskLists(P, today).overdue.map(function (t) {
        const late = Math.floor(dBetween(t.dueAt, today));
        return fin({ rule: 'R9', sev: late > 14 ? 3 : 2, conf: 'HIGH', title: 'Task ' + late + 'd overdue: ' + t.title, basis: ['due ' + iso(t.dueAt)], refs: [t.id], play: 'playbook:' + t.domain });
      });
    } },
    { id: 'R10', fn: function (P, today) {
      const hasKr = {};
      Object.keys(P.krs).forEach(function (k) { hasKr[P.krs[k].objectiveId] = true; });
      return vals(P.objectives).filter(function (o) { return o.status === 'active' && !hasKr[o.id] && dBetween(o.createdAt, today) > 14; }).map(function (o) {
        return fin({ rule: 'R10', sev: 2, conf: 'HIGH', title: 'Objective has no KR: ' + o.title, basis: ['active ' + Math.floor(dBetween(o.createdAt, today)) + 'd with zero key results — unmeasurable'], refs: [o.id], play: 'playbook:' + o.domain });
      });
    } },

    /* ---- R11–R40 ---- */

    { id: 'R11', fn: function (P, today) {
      const RESOLVED = ['mitigated', 'accepted', 'closed'];
      return vals(P.finRisks).filter(function (r) {
        if (!r.reviewDate || r.reviewDate >= today) return false;
        return !(RESOLVED.indexOf(r.status) !== -1 && r.updatedAt >= r.reviewDate);
      }).map(function (r) {
        const factor = r.likelihood >= 4 ? 1 : 0;
        const sev = clampSev(r.severity + factor, 3, 5);
        return fin({ rule: 'R11', sev: sev, conf: 'HIGH', title: 'Financial risk review overdue: ' + r.title, basis: ['reviewDate ' + iso(r.reviewDate) + ' is ' + Math.floor(dBetween(r.reviewDate, today)) + 'd past', 'sev math: clamp(severity ' + r.severity + ' + likelihood-band ' + factor + ', 3, 5) = ' + sev, 'status is "' + r.status + '"; only fin.risk.updated clears this'], refs: [r.id], play: PB.fin });
      });
    } },
    { id: 'R12', fn: function (P, today) {
      return vals(P.deals).filter(function (d) {
        return !d.result && d.closeDate && d.closeDate < today && d.updatedAt <= d.closeDate;
      }).map(function (d) {
        const past = Math.floor(dBetween(d.closeDate, today));
        return fin({ rule: 'R12', sev: past > 30 ? 4 : 3, conf: 'HIGH', title: 'Deal ' + past + 'd past closeDate, untouched: ' + d.title, basis: ['value ' + money(d.value) + ' ' + d.currency + '; stage "' + d.stage + '"; closeDate ' + iso(d.closeDate), past > 30 ? '>30d past close -> sev 4' : 'past close -> sev 3', 'a pipeline nobody cleans is a pipeline that lies'], refs: [d.id], play: PB.sales });
      });
    } },
    { id: 'R13', fn: function (P) {
      const out = [];
      vals(P.quotas).forEach(function (q) {
        if (!q.actuals.length || !q.target) return;
        const last = q.actuals[q.actuals.length - 1];
        const rate = last.actual / q.target;
        if (rate >= 0.7) return;
        out.push(fin({ rule: 'R13', sev: rate < 0.5 ? 4 : 3, conf: 'HIGH', title: 'Quota attainment ' + pct(rate) + ' for ' + q.personId + ' (' + last.period + ')', basis: ['math: ' + money(last.actual) + ' / ' + money(q.target) + ' = ' + pct(rate) + ' (thresholds 70% / 50%)', 'source: sales.quota.actuals, latest record for this quota'], refs: [q.id], play: PB.sales }));
      });
      return out;
    } },
    { id: 'R14', fn: function (P, today) {
      return vals(P.okrs).filter(function (o) {
        if (o.closedAt) return false;
        if (o.keyResults.some(function (kr) { return kr.logs.length > 0; })) return false;
        return dBetween(o.setAt, today) > 21;
      }).map(function (o) {
        const silent = dBetween(o.setAt, today);
        return fin({ rule: 'R14', sev: silent > 42 ? 3 : 2, conf: 'HIGH', title: 'OKR silent ' + Math.floor(silent) + 'd: ' + o.objective, basis: ['set ' + iso(o.setAt) + '; zero progress events (thresholds 21d / 42d, strictly)', 'an OKR without a signal is a wish'], refs: [o.id], play: PB.product });
      });
    } },
    { id: 'R15', fn: function (P) {
      const out = [];
      const closed = vals(P.okrs).filter(function (o) { return o.closedAt && typeof o.score === 'number'; })
        .sort(function (a, b) { return a.closedAt - b.closedAt; });
      closed.forEach(function (o) {
        if (o.score >= 0.4) return;
        out.push(fin({ rule: 'R15', sev: o.score === 0 ? 4 : 3, conf: 'HIGH', title: 'OKR scored ' + o.score + ': ' + o.objective, basis: ['score math: ' + o.score + ' < 0.4 threshold' + (o.score === 0 ? ' (score 0 -> sev 4)' : ''), 'source: strategy.okr.closed for ' + o.quarter], refs: [o.id], play: PB.product }));
      });
      let run = [];
      closed.forEach(function (o) { run = o.score < 0.4 ? run.concat([o]) : []; });
      if (run.length >= MIN_TREND_POINTS) {
        out.push(fin({ rule: 'R15', scope: 'pattern', trend: true, sev: 4, conf: 'HIGH', title: 'Pattern: ' + run.length + ' consecutive OKRs scored < 0.4', basis: ['run: ' + run.map(function (o) { return o.id + '=' + o.score; }).join(', '), 'measured points: ' + run.length + ' (>=3 requirement met) — systemic, not a blip'], refs: run.map(function (o) { return o.id; }), play: PB.product }));
      }
      return out;
    } },
    { id: 'R16', fn: function (P, today) {
      const out = [];
      vals(P.incidents).forEach(function (i) {
        const thr = i.severity >= 4 ? 4 * H : i.severity === 3 ? 24 * H : 72 * H;
        const sev = clampSev(i.severity, 3, 5);
        if (i.resolved) {
          const gap = i.resolvedAt - i.startedAt;
          if (gap > thr) out.push(fin({ rule: 'R16', sev: sev, conf: 'HIGH', title: 'MTTR ' + (gap / H).toFixed(1) + 'h on sev' + i.severity + ' incident: ' + i.title, basis: ['MTTR math: resolvedAt − startedAt = ' + (gap / H).toFixed(1) + 'h; threshold 4h for severity ' + i.severity, 'started ' + new Date(i.startedAt).toISOString() + '; resolved ' + new Date(i.resolvedAt).toISOString()], refs: [i.id], play: PB.ops }));
        } else if (today - i.startedAt > thr) {
          out.push(fin({ rule: 'R16', sev: sev, conf: 'HIGH', title: 'Incident open ' + ((today - i.startedAt) / H).toFixed(1) + 'h (over threshold): ' + i.title, basis: ['threshold ' + thr / H + 'h for severity ' + i.severity + '; still unresolved'], refs: [i.id], play: PB.ops }));
        }
      });
      return out;
    } },
    { id: 'R17', fn: function (P) {
      const out = [], byMetric = {};
      P.slaLogs.forEach(function (l) {
        if (l.met !== false) return;
        out.push(fin({ rule: 'R17', scope: l.metric + ':' + l.period, sev: 3, conf: 'HIGH', title: 'SLA miss: ' + l.metric + ' (' + l.period + ')', basis: ['gap math: target ' + l.target + ' − actual ' + l.actual + ' = ' + (l.target - l.actual).toFixed(2), 'source: ops.sla.logged met=false'], play: PB.ops }));
        (byMetric[l.metric] = byMetric[l.metric] || []).push(l);
      });
      Object.keys(byMetric).forEach(function (m) {
        const misses = byMetric[m]; if (misses.length < MIN_TREND_POINTS) return;
        out.push(fin({ rule: 'R17', scope: m + ':streak', trend: true, sev: 4, conf: 'HIGH', title: 'SLA ' + m + ' missed ' + misses.length + ' consecutive periods', basis: ['streak: ' + misses.map(function (x) { return x.period + '(' + x.actual + '/' + x.target + ')'; }).join(' '), 'measured points: ' + misses.length + ' (>=3 met)'], play: PB.ops }));
      });
      return out;
    } },
    { id: 'R18', fn: function (P, today) {
      const out = [];
      vals(P.milestones).forEach(function (m) {
        if (m.status === 'done') return;
        const past = m.dueDate < today;
        if (m.status === 'at-risk' || m.status === 'blocked' || past) {
          out.push(fin({ rule: 'R18', sev: past ? 4 : 3, conf: 'HIGH', title: 'Milestone ' + m.status + (past ? ' and past due' : '') + ': ' + m.title, basis: ['due ' + iso(m.dueDate) + (past ? ' (' + Math.floor(dBetween(m.dueDate, today)) + 'd past)' : ''), m.dependsOn.length ? 'dependsOn: ' + m.dependsOn.join(', ') : 'no declared dependencies'], refs: [m.id], play: PB.ops }));
        }
      });
      return out;
    } },
    { id: 'R19', fn: function (P, today) {
      const w = P.attrition.filter(function (a) { return dBetween(a.at, today) <= 60; });
      if (w.length < 2) return [];
      const vol = w.filter(function (a) { return a.reason === 'voluntary'; }).length;
      const invol = w.filter(function (a) { return a.reason === 'involuntary'; }).length;
      const restr = w.filter(function (a) { return a.reason === 'restructure'; }).length;
      return [fin({ rule: 'R19', scope: '60d', trend: true, sev: w.length >= 3 ? 4 : 3, conf: 'MEDIUM', title: 'Attrition spike: ' + w.length + ' departures in 60d', basis: ['breakdown: voluntary ' + vol + ' · involuntary ' + invol + ' · restructure ' + restr + ' (of ' + w.length + ')', 'source: hr.attrition.logged inside a rolling 60d window', 'a second departure is a pattern, not a coincidence'], refs: w.map(function (a) { return a.personId; }), play: PB.people })];
    } },
    { id: 'R20', fn: function (P, today) {
      const logs = P.engagement.slice().sort(function (a, b) { return a.at - b.at; });
      const out = [];
      if (!logs.length) return out;
      const last = logs[logs.length - 1];
      if (last.score < 6.5) {
        const ys = logs.map(function (l) { return l.score; });
        const sl = ys.length >= 2 ? slope(ys) : 0;
        const trendLine = ys.length >= 2 && sl < 0 ? ['slope: ' + sl.toFixed(3) + ' per period over ' + ys.length + ' periods (declining)'] : [];
        out.push(fin({ rule: 'R20', scope: 'score', sev: last.score < 5 ? 4 : 3, conf: trendLine.length ? 'MEDIUM' : 'HIGH', title: 'Engagement score ' + last.score + '/10 (' + last.period + ')', basis: ['thresholds 6.5 / 5.0; respondents ' + last.respondents + ' (source: hr.engagement.logged)'].concat(trendLine), play: PB.people }));
      }
      if (logs.length >= MIN_TREND_POINTS) {
        const gaps = [];
        for (let i = 1; i < logs.length; i++) gaps.push(logs[i].at - logs[i - 1].at);
        const med = median(gaps);
        if (today - last.at > 2 * med) out.push(fin({ rule: 'R20', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'Engagement survey cadence broken', basis: ['median interval ' + Math.round(med / DAY) + 'd; silence now ' + Math.floor(dBetween(last.at, today)) + 'd (> 2x median)'], play: PB.people }));
      }
      return out;
    } },
    { id: 'R21', fn: function (P, today) {
      return vals(P.pips).filter(function (x) { return !x.result && x.startedAt + x.duration_days * DAY < today; }).map(function (x) {
        return fin({ rule: 'R21', sev: 4, conf: 'HIGH', title: 'PIP past its ' + x.duration_days + 'd term with no review: ' + x.personId, basis: ['started ' + iso(x.startedAt) + '; ' + Math.floor(dBetween(x.startedAt, today)) + 'd elapsed; goals: ' + x.goals.join('; '), 'a PIP is a commitment, not a filing'], refs: [x.id], play: PB.people });
      });
    } },
    { id: 'R22', fn: function (P) {
      const out = [];
      vals(P.finBudgets).forEach(function (b) {
        if (!b.amount) return;
        b.actuals.forEach(function (a) {
          const v = Math.abs(a.actual - b.amount) / b.amount;
          if (v <= 0.15) return;
          const dir = a.actual > b.amount ? 'overspend' : 'underspend';
          out.push(fin({ rule: 'R22', scope: b.id + ':' + a.period, sev: v > 0.30 ? 4 : 3, conf: 'HIGH', title: 'Budget variance ' + pct(v) + ' (' + dir + '): ' + b.category + ' ' + a.period, basis: ['math: |' + money(a.actual) + ' − ' + money(b.amount) + '| / ' + money(b.amount) + ' = ' + pct(v) + ' (thresholds 15% / 30%)', 'source: fin.budget.actuals against fin.budget.set', 'underspend fires at the same thresholds — both are signals'], refs: [b.id], play: PB.fin }));
        });
      });
      return out;
    } },
    { id: 'R23', fn: function (P) {
      const out = [], byMetric = {};
      P.finKpis.forEach(function (k) { if (k.target && k.target !== 0) (byMetric[k.metric] = byMetric[k.metric] || []).push(k); });
      Object.keys(byMetric).forEach(function (m) {
        const logs = byMetric[m].sort(function (a, b) { return a.at - b.at; });
        const last = logs[logs.length - 1];
        const ratio = last.value / last.target;
        if (ratio >= 0.85) return;
        const sl = logs.length >= MIN_TREND_POINTS ? slope(logs.map(function (k) { return k.value; })) : 0;
        const trendLine = logs.length >= MIN_TREND_POINTS && sl < 0 ? ['slope: ' + sl.toFixed(3) + ' per period over ' + logs.length + ' measured points'] : [];
        out.push(fin({ rule: 'R23', scope: m, sev: ratio < 0.7 ? 4 : 3, conf: trendLine.length ? 'MEDIUM' : 'HIGH', title: 'KPI ' + m + ' at ' + pct(ratio) + ' of target', basis: ['math: ' + last.value + ' / ' + last.target + ' = ' + pct(ratio) + ' (thresholds 85% / 70%)', 'source: fin.kpi.logged, latest record for this metric'].concat(trendLine), play: PB.fin }));
      });
      return out;
    } },
    { id: 'R24', fn: function (P) {
      const out = [], checkable = [];
      P.finForecasts.forEach(function (f) {
        let actual = 0, found = false;
        vals(P.finBudgets).forEach(function (b) { b.actuals.forEach(function (a) { if (a.period === f.period) { actual += a.actual; found = true; } }); });
        if (!found || !actual) return;
        const dev = Math.abs(f.revenue - actual) / actual;
        checkable.push({ f: f, actual: actual, dev: dev, over: f.revenue > actual });
        if (dev > 0.20) out.push(fin({ rule: 'R24', scope: f.period, sev: 3, conf: 'HIGH', title: 'Forecast off ' + pct(dev) + ' for ' + f.period, basis: ['math: |' + money(f.revenue) + ' − ' + money(actual) + '| / ' + money(actual) + ' = ' + pct(dev), 'source: fin.forecast.logged vs summed fin.budget.actuals for the same period', f.revenue > actual ? 'over-optimistic' : 'over-conservative'], play: PB.fin }));
      });
      let streak = 0;
      checkable.sort(function (a, b) { return a.f.at - b.f.at; }).forEach(function (c) { streak = c.over && c.dev > 0.20 ? streak + 1 : 0; });
      if (streak >= MIN_TREND_POINTS) out.push(fin({ rule: 'R24', scope: 'streak', trend: true, sev: 4, conf: 'HIGH', title: 'Systematic over-optimism: ' + streak + ' consecutive over-forecasts', basis: ['measured points: ' + streak + ' (>=3 met); all deviations >20% in the same direction'], play: PB.fin }));
      return out;
    } },
    { id: 'R25', fn: function (P, today) {
      return vals(P.vendors).filter(function (v) {
        if (v.risk_level < 4 || !v.reviewDate || v.reviewDate >= today) return false;
        return !v.reviews.some(function (r) { return r.at >= v.reviewDate; });
      }).map(function (v) {
        return fin({ rule: 'R25', sev: v.risk_level === 5 ? 4 : 3, conf: 'HIGH', title: 'High-risk vendor unreviewed: ' + v.name, basis: ['risk_level ' + v.risk_level + '; reviewDate ' + iso(v.reviewDate) + ' past ' + Math.floor(dBetween(v.reviewDate, today)) + 'd', 'a high-risk vendor is a single point of failure you chose to forget about'], refs: [v.id], play: PB.supply });
      });
    } },
    { id: 'R26', fn: function (P, today) {
      return P.disruptions.filter(function (d) {
        if (d.severity < 4 || dBetween(d.at, today) <= 7) return false;
        const reviewed = d.vendorId && P.vendors[d.vendorId] && P.vendors[d.vendorId].reviews.some(function (r) { return r.at > d.at; });
        const ack = P.disruptions.some(function (later) { return later !== d && later.at > d.at && later.vendorId === d.vendorId && d.vendorId && later.mitigation; });
        return !reviewed && !ack;
      }).map(function (d) {
        return fin({ rule: 'R26', scope: 'disruption:' + d.at, sev: 4, conf: 'HIGH', title: 'Unmitigated supply disruption, open ' + Math.floor(dBetween(d.at, today)) + 'd', basis: ['severity ' + d.severity + '; no vendor review and no mitigation acknowledgement since', d.description], refs: d.vendorId ? [d.vendorId] : [], play: PB.supply });
      });
    } },
    { id: 'R27', fn: function (P) {
      const out = [], byLine = {};
      P.yieldLogs.forEach(function (y) { if (typeof y.yield_pct !== 'number') return; (byLine[y.line || '(plant)'] = byLine[y.line || '(plant)'] || []).push(y); });
      Object.keys(byLine).forEach(function (line) {
        const logs = byLine[line].sort(function (a, b) { return a.at - b.at; });
        const last = logs[logs.length - 1];
        if (last.yield_pct >= 90) return;
        const sl = logs.length >= MIN_TREND_POINTS ? slope(logs.map(function (y) { return y.yield_pct; })) : 0;
        const trendLine = logs.length >= MIN_TREND_POINTS && sl < 0 ? ['slope: ' + sl.toFixed(3) + ' yield-points per period over ' + logs.length + ' points'] : [];
        out.push(fin({ rule: 'R27', scope: line, sev: last.yield_pct < 80 ? 4 : 3, conf: trendLine.length ? 'MEDIUM' : 'HIGH', title: 'Yield ' + last.yield_pct + '% on ' + line + ' (' + last.period + ')', basis: ['thresholds 90% / 80%; source: mfg.yield.logged, latest record for this line'].concat(trendLine), play: PB.mfg }));
      });
      return out;
    } },
    { id: 'R28', fn: function (P, today) {
      // DOCTRINE EXCEPTION: safety reads direct data and is never trend-capped.
      const out = [];
      P.safetyIncidents.forEach(function (i) {
        if (i.severity === 5) out.push(fin({ rule: 'R28', scope: 'sev5:' + i.at, sev: 5, conf: 'HIGH', title: 'Sev-5 safety incident: ' + i.type, basis: [i.description, 'any sev-5 safety incident fires immediately — direct data, not a trend'], play: PB.mfg }));
      });
      const w = P.safetyIncidents.filter(function (i) { return dBetween(i.at, today) <= 30; });
      if (w.length >= 2) out.push(fin({ rule: 'R28', scope: '30d', sev: 4, conf: 'HIGH', title: w.length + ' safety incidents in 30d', basis: ['types: ' + w.map(function (i) { return i.type; }).join(', '), 'safety is the named exception to the sev-3 trend ceiling', 'a second safety incident is never acceptable'], play: PB.mfg }));
      return out;
    } },
    { id: 'R29', fn: function (P, today) {
      const out = [];
      vals(P.equipment).forEach(function (e) {
        const ageH = (today - e.at) / H;
        if (e.status === 'down' && ageH > 4) out.push(fin({ rule: 'R29', sev: 4, conf: 'HIGH', title: 'Asset down ' + ageH.toFixed(1) + 'h: ' + e.assetId, basis: ['down threshold 4h; no "operational" entry since'], refs: [e.assetId], play: PB.mfg }));
        else if (e.status === 'degraded' && ageH > 24) out.push(fin({ rule: 'R29', sev: 3, conf: 'HIGH', title: 'Asset degraded ' + ageH.toFixed(1) + 'h: ' + e.assetId, basis: ['degraded threshold 24h; note: ' + (e.note || '—')], refs: [e.assetId], play: PB.mfg }));
      });
      return out;
    } },
    { id: 'R30', fn: function (P, today) {
      // DOCTRINE EXCEPTION: a logged 'fail' is direct data -> sev 5, never capped.
      const out = [], set = LeadOS.engine.settings(P), byFw = {};
      P.complianceChecks.forEach(function (c) { (byFw[c.framework] = byFw[c.framework] || []).push(c); });
      let lastAny = null;
      Object.keys(byFw).forEach(function (fw) {
        const logs = byFw[fw].sort(function (a, b) { return a.at - b.at; });
        const last = logs[logs.length - 1];
        if (!lastAny || last.at > lastAny.at) lastAny = last;
        if (last.result === 'fail') { out.push(fin({ rule: 'R30', scope: fw, sev: 5, conf: 'HIGH', title: 'Compliance FAIL: ' + fw, basis: ['latest check ' + iso(last.at) + '; findings: ' + (last.findings.join('; ') || 'none itemized'), 'a logged fail is direct data — fires immediately, exempt from the trend ceiling'], play: PB.legal })); return; }
        if (last.result === 'finding' && dBetween(last.at, today) > 30) out.push(fin({ rule: 'R30', scope: fw, sev: 4, conf: 'HIGH', title: 'Compliance finding aged ' + Math.floor(dBetween(last.at, today)) + 'd: ' + fw, basis: ['findings: ' + (last.findings.join('; ') || 'none itemized'), 'no subsequent pass for this framework — direct data'], play: PB.legal }));
      });
      if (!P.complianceChecks.length) {
        if (P.firstAt !== null && dBetween(P.firstAt, today) > set.complianceAuditCadenceDays) out.push(fin({ rule: 'R30', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'No compliance check ever logged', basis: ['log older than complianceAuditCadenceDays (' + set.complianceAuditCadenceDays + 'd)'], play: PB.legal }));
      } else if (lastAny && dBetween(lastAny.at, today) > set.complianceAuditCadenceDays) {
        out.push(fin({ rule: 'R30', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'Compliance check cadence miss', basis: ['last check ' + Math.floor(dBetween(lastAny.at, today)) + 'd ago; cadence ' + set.complianceAuditCadenceDays + 'd'], play: PB.legal }));
      }
      return out;
    } },
    { id: 'R31', fn: function (P, today) {
      const out = [];
      P.legalRisks.forEach(function (r) {
        const overdue = r.dueDate && r.dueDate < today;
        if (overdue) out.push(fin({ rule: 'R31', scope: r.id, sev: 4, conf: 'HIGH', title: 'Legal risk past dueDate: ' + r.title, basis: ['area ' + r.area + '; due ' + iso(r.dueDate) + '; owner ' + (r.ownerId || 'null') + '; no update on record'], refs: [r.id], play: PB.legal }));
        else if (r.ownerId === null || r.ownerId === undefined) out.push(fin({ rule: 'R31', scope: r.id, sev: 3, conf: 'HIGH', title: 'Legal risk unowned: ' + r.title, basis: ['ownerId is explicitly null — an explicit null is data', 'area ' + r.area + '; severity ' + r.severity], refs: [r.id], play: PB.legal }));
      });
      return out;
    } },
    { id: 'R32', fn: function (P, today) {
      const out = [], SAFE = ['renewed', 'terminated'];
      vals(P.contracts).forEach(function (c) {
        if (!c.expiryDate || SAFE.indexOf(c.status) !== -1) return;
        const delta = dBetween(today, c.expiryDate);
        if (delta < 0 && c.status === 'active') { out.push(fin({ rule: 'R32', sev: 5, conf: 'HIGH', title: 'Contract expired but still "active": ' + c.counterparty, basis: ['expired ' + Math.floor(-delta) + 'd ago (' + iso(c.expiryDate) + ')'], refs: [c.id], play: PB.legal })); return; }
        if (delta <= 7) out.push(fin({ rule: 'R32', sev: 4, conf: 'HIGH', title: 'Contract expires in ' + Math.max(0, Math.ceil(delta)) + 'd: ' + c.counterparty, basis: ['expiry ' + iso(c.expiryDate) + '; status ' + c.status], refs: [c.id], play: PB.legal }));
        else if (delta <= 30) out.push(fin({ rule: 'R32', sev: 3, conf: 'HIGH', title: 'Contract expires in ' + Math.ceil(delta) + 'd: ' + c.counterparty, basis: ['expiry ' + iso(c.expiryDate) + '; status ' + c.status], refs: [c.id], play: PB.legal }));
      });
      return out;
    } },
    { id: 'R33', fn: function (P, today) {
      const logs = P.npsLogs.slice().sort(function (a, b) { return a.at - b.at; });
      const out = [];
      if (!logs.length) return out;
      const last = logs[logs.length - 1];
      if (last.score < 0) out.push(fin({ rule: 'R33', scope: 'nps', sev: 4, conf: 'HIGH', title: 'NPS negative: ' + last.score, basis: ['detractors ' + last.detractors + ' vs promoters ' + last.promoters + ' (' + last.period + ') — direct measurement'], play: PB.cs }));
      else if (logs.length >= 2) {
        const sl = slope(logs.map(function (l) { return l.score; }));
        if (sl < 0 && last.score < 30) out.push(fin({ rule: 'R33', scope: 'nps', trend: true, sev: 3, conf: 'MEDIUM', title: 'NPS declining to ' + last.score, basis: ['slope: ' + sl.toFixed(2) + ' per period over ' + logs.length + ' periods; latest ' + last.score + ' < 30'], play: PB.cs }));
      }
      if (dBetween(last.at, today) > 90) out.push(fin({ rule: 'R33', scope: 'cadence', sev: 2, conf: 'HIGH', title: 'No NPS logged in ' + Math.floor(dBetween(last.at, today)) + 'd', basis: ['cadence miss threshold 90d'], play: PB.cs }));
      return out;
    } },
    { id: 'R34', fn: function (P) {
      const out = [];
      P.churnLogs.forEach(function (c) {
        if (!c.total) return;
        const rate = c.churned / c.total;
        const mrrRate = (typeof c.mrr_lost === 'number' && typeof c.mrr_total === 'number' && c.mrr_total > 0) ? (c.mrr_lost / c.mrr_total) : null;
        const countFires = rate > 0.05, mrrFires = mrrRate !== null && mrrRate > 0.15;
        if (!countFires && !mrrFires) return;
        const basis = ['math: ' + c.churned + ' / ' + c.total + ' = ' + pct(rate) + ' (thresholds 5% / 10%)', 'source: cs.churn.logged for ' + c.period];
        if (mrrRate !== null) basis.push('MRR math: ' + money(c.mrr_lost) + ' / ' + money(c.mrr_total) + ' = ' + pct(mrrRate) + (mrrFires ? ' > 15% -> sev 4 regardless of account count' : ' (under the 15% escalation)'));
        else if (typeof c.mrr_lost === 'number') basis.push('mrr_lost ' + money(c.mrr_lost) + ' logged without mrr_total; the >15%-of-MRR escalation is NOT inferred (skip-not-infer)');
        out.push(fin({ rule: 'R34', scope: c.period, sev: (rate > 0.10 || mrrFires) ? 4 : 3, conf: 'HIGH', title: 'Churn ' + pct(rate) + ' in ' + c.period + (mrrFires ? ' · MRR loss ' + pct(mrrRate) : ''), basis: basis, play: PB.cs }));
      });
      return out;
    } },
    { id: 'R35', fn: function (P, today) {
      const out = [];
      vals(P.escalations).forEach(function (e) {
        if (e.resolved) return;
        if (e.severity === 5 && (today - e.loggedAt) > 4 * H) { out.push(fin({ rule: 'R35', sev: 5, conf: 'HIGH', title: 'Sev-5 escalation unresolved ' + ((today - e.loggedAt) / H).toFixed(1) + 'h: ' + e.accountName, basis: [e.description, 'sev-5 unresolved > 4h -> immediate sev-5 finding'], refs: [e.id], play: PB.cs })); return; }
        if (e.dueDate && e.dueDate < today) out.push(fin({ rule: 'R35', sev: clampSev(e.severity, 3, 5), conf: 'HIGH', title: 'Escalation ' + Math.floor(dBetween(e.dueDate, today)) + 'd overdue: ' + e.accountName, basis: [e.description, 'inherited severity ' + e.severity + ' clamped 3-5'], refs: [e.id], play: PB.cs }));
      });
      return out;
    } },
    { id: 'R36', fn: function (P, today) {
      const out = [];
      const qual = vals(P.campaigns).filter(function (c) { return c.results.some(function (r) { return r.spend_actual > 0 && r.conversions > 0; }); })
        .sort(function (a, b) { return a.loggedAt - b.loggedAt; });
      const cpa = function (c) { const r = c.results[c.results.length - 1]; return r.spend_actual / r.conversions; };
      qual.forEach(function (c, i) {
        if (i < MIN_TREND_POINTS) return;
        const prev3 = qual.slice(i - MIN_TREND_POINTS, i).map(cpa);
        const avg = prev3.reduce(function (a, b) { return a + b; }, 0) / prev3.length;
        const mine = cpa(c);
        if (mine > 2 * avg) out.push(fin({ rule: 'R36', trend: true, sev: 3, conf: 'MEDIUM', title: 'CPA ' + money(mine) + ' vs avg ' + money(avg) + ': ' + c.name, basis: ['math: ' + money(mine) + ' > 2 × mean(' + prev3.map(money).join(', ') + ') = ' + money(2 * avg), 'basis campaigns: ' + prev3.length + ' measured (>=3 met)'], refs: [c.id], play: PB.mktg }));
      });
      vals(P.campaigns).forEach(function (c) {
        if (!c.results.length && dBetween(c.loggedAt, today) > 14) out.push(fin({ rule: 'R36', sev: 2, conf: 'HIGH', title: 'Campaign live ' + Math.floor(dBetween(c.loggedAt, today)) + 'd, zero results: ' + c.name, basis: ['budget ' + money(c.budget) + '; channel ' + c.channel], refs: [c.id], play: PB.mktg }));
      });
      return out;
    } },
    { id: 'R37', fn: function (P, today) {
      return vals(P.experiments).filter(function (e) { return !e.result && e.reviewDate && e.reviewDate < today; }).map(function (e) {
        return fin({ rule: 'R37', sev: 3, conf: 'HIGH', title: 'Experiment past reviewDate, no result: ' + e.hypothesis, basis: ['reviewDate ' + iso(e.reviewDate) + ' past ' + Math.floor(dBetween(e.reviewDate, today)) + 'd; method ' + e.method, 'a hypothesis nobody tested is a bet nobody called'], refs: [e.id], play: PB.rd });
      });
    } },
    { id: 'R38', fn: function (P, today) {
      const items = vals(P.techDebt).filter(function (d) { return !d.resolved && dBetween(d.loggedAt, today) <= 90; });
      if (!items.length) return [];
      const terms = items.map(function (d) { return { id: d.id, term: d.severity * d.effort, text: d.severity + 'x' + d.effort }; });
      const sum = terms.reduce(function (a, t) { return a + t.term; }, 0);
      if (sum <= 30) return [];
      return [fin({ rule: 'R38', scope: 'backlog', sev: sum > 60 ? 4 : 3, conf: 'MEDIUM', title: 'Tech debt mass ' + sum + ' accumulated in 90d', basis: ['math: ' + terms.map(function (t) { return t.text; }).join(' + ') + ' = ' + sum + ' (thresholds 30 / 60)', 'source: unresolved rd.tech.debt.logged items inside a 90d window'], refs: terms.map(function (t) { return t.id; }), play: PB.rd })];
    } },
    { id: 'R39', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      if (!P.boardMeetings.length) {
        if (P.firstAt !== null && dBetween(P.firstAt, today) > set.boardCadenceDays) return [fin({ rule: 'R39', scope: 'board', sev: 2, conf: 'HIGH', title: 'No board meeting ever logged', basis: ['log is ' + Math.floor(dBetween(P.firstAt, today)) + 'd old; boardCadenceDays=' + set.boardCadenceDays], play: PB.exec })];
        return [];
      }
      const last = P.boardMeetings.reduce(function (a, b) { return a.at > b.at ? a : b; });
      const gap = dBetween(last.at, today);
      if (gap > set.boardCadenceDays) return [fin({ rule: 'R39', scope: 'board', sev: 3, conf: 'HIGH', title: 'Board cadence miss: ' + Math.floor(gap) + 'd since last meeting', basis: ['boardCadenceDays=' + set.boardCadenceDays + '; quorum was ' + (last.quorum ? 'met' : 'NOT met'), 'source: exec.board.meeting dates'], play: PB.exec })];
      return [];
    } },
    { id: 'R40', fn: function (P, today) {
      const set = LeadOS.engine.settings(P);
      if (!P.execKpiReviews.length) return [];
      const last = P.execKpiReviews.reduce(function (a, b) { return a.at > b.at ? a : b; });
      const gap = dBetween(last.at, today);
      if (gap > 2 * set.revenueReviewCadenceDays) return [fin({ rule: 'R40', scope: 'kpi', sev: 3, conf: 'HIGH', title: 'Executive KPI review ' + Math.floor(gap) + 'd stale', basis: ['gap > 2x revenueReviewCadenceDays (' + set.revenueReviewCadenceDays + 'd)'], play: PB.exec })];
      if (gap > set.revenueReviewCadenceDays) return [fin({ rule: 'R40', scope: 'kpi', sev: 2, conf: 'HIGH', title: 'Executive KPI review gap: ' + Math.floor(gap) + 'd', basis: ['revenueReviewCadenceDays=' + set.revenueReviewCadenceDays], play: PB.exec })];
      return [];
    } }
  ];

  function run(P, today) {
    const out = [];
    RULES.forEach(function (r) {
      (r.fn(P, today) || []).forEach(function (f) {
        if (!f.rule) { f.rule = r.id; f.key = r.id + ':' + f.scope; }
        out.push(f);
      });
    });
    out.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : (a.title < b.title ? -1 : a.title > b.title ? 1 : 0); });
    return out;
  }

  LeadOS.rules = { RULES: RULES, run: run, fin: fin, MIN_TREND_POINTS: MIN_TREND_POINTS, TREND_SEV_CEILING: TREND_SEV_CEILING, PLAY_IDS: Object.keys(PB).map(function (k) { return PB[k]; }) };
})();

/* ============================================================================
   CORRELATION ENGINE  (pt-5; third IIFE — the brief asked for a new module
   `js/correlate.js` while mandating the same 10-file structure. The part-11
   precedent resolves the contradiction the same way: dependency-ordered merge
   into js/engine.js after the rules it consumes. LeadOS.correlate is the
   public namespace; js/correlate.js joins UNLOADED and T31 fails if a script
   tag ever references it. Logged in AI-SESSION-LOG pt-15 §62/§66.)

   correlate(P, today) -> { clusters, insights, heatmap }  — pure, injected
   clock, nothing persisted. Findings come from rules.run(P, today) per read.

   DOCTRINES (same as the rules layer, printed everywhere):
   1. A finding never lies about its evidence: ages come from resolvable entity
      timestamps; undated evidence is stated, never re-dated.
   2. The math is printed: every cluster, insight and heat contribution shows
      its arithmetic and the setting it used.
   3. Missing fields skip: findings without dated evidence are EXCLUDED from
      the heat sum (listed in heatmap.excluded), never given an age.
   4. heatmapDecayFactor is a labeled assumption from settings, printed in
      every formula string.
   ============================================================================ */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000;
  /* Labeled threshold, printed wherever used: a domain is "hot" when its heat
     score reaches the equivalent of three sev-3 signals at full weight. */
  const HOT_SCORE = 9;

  /* Where evidence timestamps live, per projection bucket. A finding's age is
     the NEWEST timestamp resolvable from its refs (its evidence is that fresh),
     else null = undated (stated, never re-dated). */
  const TIME_FIELDS = {
    objectives: ['createdAt'], krs: [], tasks: ['createdAt', 'completedAt'], decisions: ['createdAt', 'decidedAt'],
    risks: ['updatedAt', 'createdAt'], reviews: ['createdAt', 'completedAt'],
    finBudgets: ['setAt'], finRisks: ['updatedAt', 'loggedAt'], deals: ['updatedAt', 'loggedAt'], quotas: ['setAt'],
    roadmap: ['statusAt', 'createdAt'], okrs: ['closedAt', 'setAt'], incidents: ['startedAt', 'loggedAt'],
    milestones: ['statusAt', 'setAt'], pips: ['startedAt'], campaigns: ['loggedAt'], vendors: ['loggedAt'],
    experiments: ['loggedAt'], techDebt: ['loggedAt'], contracts: ['statusAt', 'loggedAt'],
    escalations: ['loggedAt'], crises: ['loggedAt'], equipment: ['at'], notes: ['at']
  };

  const rd3 = function (x) { return Math.round(x * 1000) / 1000; };
  const vals = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };

  function domainOf(f) { return f.play ? String(f.play).replace('playbook:', '') : null; }

  /* Latest activity timestamp for a person id, from the roster's own sources. */
  function personAt(P, pid) {
    const r = P.rosterById && P.rosterById[pid];
    if (!r) return null;
    let t = null;
    const touch = function (x) { if (typeof x === 'number' && (t === null || x > t)) t = x; };
    (r.quotas || []).forEach(function (q) { touch(q.setAt); });
    (r.deals || []).forEach(function (d) { touch(d.updatedAt); touch(d.loggedAt); });
    (r.performance || []).forEach(function (x) { touch(x.at); });
    (r.pips || []).forEach(function (x) { touch(x.startedAt); });
    (r.compensation || []).forEach(function (x) { touch(x.at); });
    if (r.attrition) touch(r.attrition.at);
    return t;
  }

  /* Resolve one ref id across entity buckets: { at, trail[], persons[] }. */
  function resolveRef(P, ref) {
    const out = { at: null, trail: [], persons: [] };
    Object.keys(TIME_FIELDS).forEach(function (bucket) {
      const ent = P[bucket] && P[bucket][ref];
      if (!ent) return;
      TIME_FIELDS[bucket].forEach(function (f) {
        if (typeof ent[f] === 'number' && (out.at === null || ent[f] > out.at)) out.at = ent[f];
      });
      if (bucket === 'krs' && ent.logs && ent.logs.length) {
        const t = ent.logs[ent.logs.length - 1].at;
        if (t > out.at || out.at === null) out.at = t;
      }
      if (bucket === 'quotas' && ent.personId) { out.persons.push(ent.personId); out.trail.push('ref ' + ref + ' → quota.personId ' + ent.personId); }
      if (bucket === 'deals' && ent.ownerId) { out.persons.push(ent.ownerId); out.trail.push('ref ' + ref + ' → deal.ownerId ' + ent.ownerId); }
      if (bucket === 'pips' && ent.personId) { out.persons.push(ent.personId); out.trail.push('ref ' + ref + ' → pip.personId ' + ent.personId); }
      if (bucket === 'equipment') out.trail.push('ref ' + ref + ' → asset ' + ref);
    });
    if (P.rosterById && P.rosterById[ref]) { out.persons.push(ref); out.trail.push('ref ' + ref + ' is a roster person'); }
    return out;
  }

  /* Typed anchors for one finding: entity: / person: / metric: / line: — typed
     so coincidental id strings in different families cannot collide silently.
     Metric anchors are claimed only when the scope string is an ACTUAL folded
     metric (kpiByMetric / slaByMetric) — printed, never inferred. */
  function anchorsFor(f, P) {
    const anchors = {}, trail = [], persons = [];
    (f.refs || []).forEach(function (ref) {
      const r = resolveRef(P, ref);
      const inAnyBucket = Object.keys(TIME_FIELDS).some(function (b) { return P[b] && P[b][ref]; });
      if (inAnyBucket) { anchors['entity:' + ref] = true; }
      else if (!r.persons.length) { trail.push('ref ' + ref + ' resolves to no entity — recorded, not guessed'); }
      r.persons.forEach(function (pid) { anchors['person:' + pid] = true; persons.push(pid); });
      trail.push.apply(trail, r.trail);
    });
    if (f.rule === 'R23' && P.kpiByMetric && P.kpiByMetric[f.scope]) { anchors['metric:' + f.scope] = true; trail.push('scope ' + f.scope + ' is a folded fin KPI metric'); }
    if (f.rule === 'R17') {
      const m = String(f.scope).split(':')[0];
      if (P.slaByMetric && P.slaByMetric[m]) { anchors['metric:' + m] = true; trail.push('scope ' + f.scope + ' → folded SLA metric ' + m); }
    }
    if (f.rule === 'R27') { anchors['line:' + f.scope] = true; trail.push('scope ' + f.scope + ' → production line'); }
    return { anchors: anchors, trail: trail, persons: persons };
  }

  function evidenceAt(f, P) {
    let t = null;
    (f.refs || []).forEach(function (ref) {
      const r = resolveRef(P, ref);
      if (r.at !== null && (t === null || r.at > t)) t = r.at;
      r.persons.forEach(function (pid) { const pt = personAt(P, pid); if (pt !== null && (t === null || pt > t)) t = pt; });
    });
    if (t === null) (f.refs || []).forEach(function (ref) { const pt = personAt(P, ref); if (pt !== null && (t === null || pt > t)) t = pt; });
    return t;
  }

  function slope(ys) {
    const n = ys.length; if (n < 2) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i; }
    const den = n * sxx - sx * sx;
    return den === 0 ? 0 : (n * sxy - sx * sy) / den;
  }

  function correlate(P, today) {
    const set = LeadOS.engine.settings(P);
    const win = set.correlationWindowDays, decay = set.heatmapDecayFactor;
    const findings = LeadOS.rules.run(P, today);

    /* ---- per-finding evidence record ---- */
    const recs = findings.map(function (f) {
      const a = anchorsFor(f, P);
      const t = evidenceAt(f, P);
      return {
        key: f.key, rule: f.rule, sev: f.sev, conf: f.conf, title: f.title,
        domain: domainOf(f), anchors: a.anchors, trail: a.trail, persons: a.persons,
        at: t, ageDays: t === null ? null : rd3((today - t) / DAY)
      };
    });
    recs.forEach(function (r) { r.fresh = r.ageDays === null ? true : r.ageDays <= win; });

    /* ---- union-find over edges: shared typed anchor, or same domain with
            both evidence ages inside the correlation window ---- */
    const parent = recs.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function union(i, j) { const a = find(i), b = find(j); if (a < b) parent[b] = a; else if (b < a) parent[a] = b; }
    for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) {
      const A = recs[i], B = recs[j];
      const shared = Object.keys(A.anchors).filter(function (k) { return B.anchors[k]; });
      if (shared.length) { union(i, j); continue; }
      if (A.domain && A.domain === B.domain && A.fresh && B.fresh) union(i, j);
    }
    const groups = {};
    recs.forEach(function (r, i) { (groups[find(i)] = groups[find(i)] || []).push(r); });

    const clusters = vals(groups).filter(function (g) { return g.length >= 2; }).map(function (g) {
      g.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      const keys = g.map(function (r) { return r.key; });
      const doms = g.map(function (r) { return r.domain || 'system'; });
      const uniqD = doms.filter(function (d, i) { return doms.indexOf(d) === i; }).sort();
      const sev = Math.max.apply(null, g.map(function (r) { return r.sev; }));
      /* shared anchors present in >= 2 members, most-shared first, key asc */
      const counts = {};
      g.forEach(function (r) { Object.keys(r.anchors).forEach(function (k) { counts[k] = (counts[k] || 0) + 1; }); });
      const shared = Object.keys(counts).filter(function (k) { return counts[k] >= 2; })
        .sort(function (a, b) { return (counts[b] - counts[a]) || (a < b ? -1 : 1); });
      const anchor = shared.length ? shared[0] : null;
      const ages = g.map(function (r) { return r.ageDays === null ? 'undated' : r.ageDays + 'd'; });
      const rulesN = g.map(function (r) { return r.rule; }).filter(function (x, i, a2) { return a2.indexOf(x) === i; }).length;
      const pattern = anchor
        ? g.length + ' signals anchored on ' + anchor + ' — a single verified thread, not ' + g.length + ' separate problems'
        : (uniqD.length === 1
          ? uniqD[0] + ': ' + g.length + ' co-occurring signals (' + rulesN + ' rules) — systemic, not isolated'
          : 'cross-domain pattern: ' + g.length + ' signals across ' + uniqD.join(' + ') + ' (' + rulesN + ' rules)');
      const conf = anchor ? 'high' : (g.length >= 3 ? 'medium' : 'low');
      const confWhy = anchor
        ? 'anchor ' + anchor + ' verified in ' + counts[anchor] + ' of ' + g.length + ' findings via projections → high'
        : (g.length >= 3
          ? g.length + ' findings in domain scope within window ' + win + 'd (ages ' + ages.join(', ') + ') → medium; 2-point domain-only pairs stay low'
          : '2 findings, domain co-occurrence only (ages ' + ages.join(', ') + ' vs window ' + win + 'd) → low; no shared entity verified');
      const trail = [];
      g.forEach(function (r) { r.trail.slice(0, 2).forEach(function (t) { if (trail.indexOf(t) === -1) trail.push(t); }); });
      return {
        id: keys.join('+'),
        findings: keys,
        domains: uniqD,
        sharedEntity: anchor,
        severity: sev,
        pattern: pattern,
        confidence: conf,
        confWhy: confWhy,
        trail: trail.slice(0, 4),
        members: g.map(function (r) { return { key: r.key, rule: r.rule, sev: r.sev, title: r.title, domain: r.domain, ageDays: r.ageDays }; })
      };
    }).sort(function (a, b) { return (b.severity - a.severity) || (a.id < b.id ? -1 : 1); });

    /* ---- heatmap: weight = sev x decay^ageDays; windowed; undated excluded ---- */
    const formula = 'weight = sev × heatmapDecayFactor^ageDays · factor ' + decay + ' (v5 setting · labeled assumption, printed) · window ' + win + 'd';
    const byDom = {}, excluded = [];
    LeadOS.events.DOMAINS.forEach(function (d) { byDom[d.id] = { domain: d.id, label: d.label, score: 0, contrib: [] }; });
    byDom.system = { domain: null, label: 'system', score: 0, contrib: [] };
    recs.forEach(function (r) {
      const cell = byDom[r.domain || 'system'];
      if (r.ageDays === null) { excluded.push({ key: r.key, why: 'no resolvable evidence timestamp — decay not computable; excluded, not dated by fiat' }); return; }
      if (r.ageDays > win) { excluded.push({ key: r.key, why: 'evidence ' + r.ageDays + 'd old > window ' + win + 'd — decays out of the picture' }); return; }
      const w = r.sev * Math.pow(decay, r.ageDays);
      cell.contrib.push({ key: r.key, sev: r.sev, ageDays: r.ageDays, weight: rd3(w), math: 'sev ' + r.sev + ' × ' + decay + '^' + r.ageDays + ' = ' + rd3(w) });
    });
    const byDomain = vals(byDom).map(function (c) {
      c.contrib.sort(function (a, b) { return b.weight - a.weight || (a.key < b.key ? -1 : 1); });
      c.score = rd3(c.contrib.reduce(function (a, x) { return a + x.weight; }, 0));
      return c;
    }).sort(function (a, b) { return b.score - a.score || (a.label < b.label ? -1 : 1); });
    const heatmap = { byDomain: byDomain, excluded: excluded, formula: formula, window: win, decay: decay, hotScore: HOT_SCORE };

    /* ---- insights: promoted clusters, cross-domain persons, hot domains ---- */
    const acks = P.insightAcks || {};
    const insights = [];
    clusters.forEach(function (c) {
      if (!(c.severity >= 4 || c.findings.length >= 3 || c.domains.length > 1)) return;
      insights.push({
        id: 'insight:' + c.id, kind: 'cluster', title: c.pattern,
        basis: [c.confWhy, 'members: ' + c.findings.join(', '), 'promotion rule: sev ≥ 4, or ≥ 3 findings, or > 1 domain (this cluster: sev ' + c.severity + ', ' + c.findings.length + ' findings, ' + c.domains.length + ' domain(s))'],
        clusterIds: [c.id], sev: c.severity, conf: c.confidence, play: 'playbook:' + c.domains[0], suppressible: true
      });
    });
    /* person anchored in >= 2 findings across >= 2 domains */
    const byPerson = {};
    recs.forEach(function (r) { Object.keys(r.anchors).forEach(function (k) { if (k.indexOf('person:') === 0) (byPerson[k] = byPerson[k] || []).push(r); }); });
    Object.keys(byPerson).sort().forEach(function (k) {
      const rs = byPerson[k];
      const doms = rs.map(function (r) { return r.domain || 'system'; }).filter(function (d, i, a) { return a.indexOf(d) === i; });
      if (rs.length < 2 || doms.length < 2) return;
      const keys = rs.map(function (r) { return r.key; }).sort();
      insights.push({
        id: 'insight:' + k + ':' + keys.join('+'), kind: 'person',
        title: k + ' sits at the center of ' + rs.length + ' findings across ' + doms.length + ' domains (' + doms.join(' + ') + ')',
        basis: ['resolved through projections (quotaById.personId / dealById.ownerId / pipById.personId / roster), every resolution printed in the cluster trail', 'members: ' + keys.join(', ')],
        clusterIds: [], sev: Math.max.apply(null, rs.map(function (r) { return r.sev; })), conf: 'medium', play: 'playbook:people', suppressible: true
      });
    });
    byDomain.forEach(function (c) {
      if (c.domain === null || c.score < HOT_SCORE) return;
      insights.push({
        id: 'insight:heat:' + c.domain, kind: 'heatmap',
        title: c.label + ' heat ' + c.score + ' ≥ ' + HOT_SCORE + ' — sustained, decay-weighted signal load, not a single spike',
        basis: [formula, 'top contributions: ' + c.contrib.slice(0, 3).map(function (x) { return x.math; }).join(' · ')],
        clusterIds: [], sev: c.score >= HOT_SCORE * 2 ? 4 : 3, conf: 'medium', play: 'playbook:' + c.domain, suppressible: true
      });
    });
    insights.sort(function (a, b) { return (b.sev - a.sev) || (a.id < b.id ? -1 : 1); });
    insights.forEach(function (i) {
      const ack = acks[i.id];
      i.acknowledged = !!ack; i.ackAt = ack ? ack.at : null; i.ackNote = ack ? ack.note : '';
    });

    return {
      clusters: clusters,
      insights: insights,
      heatmap: heatmap,
      totals: { findings: findings.length, clustered: clusters.reduce(function (a, c) { return a + c.findings.length; }, 0), insightsActive: insights.filter(function (i) { return !i.acknowledged; }).length, insightsAcked: insights.filter(function (i) { return i.acknowledged; }).length },
      settingsUsed: { correlationWindowDays: win, trendMinPeriods: set.trendMinPeriods, heatmapDecayFactor: decay }
    };
  }

  /* ---- trend analytics: internal series vs logged benchmarks ----
     Internal series are assembled from the log's own metric buckets; a metric
     the log does not measure gets NO comparison (status printed, not inferred).
     A trend is claimed only with >= trendMinPeriods measured points (v5
     setting); otherwise the gate prints why it is silent. */
  const INTERNAL_SERIES = function (P) {
    const out = {};
    const add = function (metric, rec) { (out[metric] = out[metric] || []).push(rec); };
    Object.keys(P.kpiByMetric || {}).forEach(function (m) { P.kpiByMetric[m].forEach(function (r) { add(m, { at: r.at, value: r.value, unit: r.unit }); }); });
    (P.npsHistory || []).forEach(function (r) { add('nps', { at: r.at, value: r.score, unit: 'nps' }); });
    (P.engagementHistory || []).forEach(function (r) { add('engagement-score', { at: r.at, value: r.score, unit: '/10' }); });
    (P.yieldHistory || []).forEach(function (r) { add('yield', { at: r.at, value: r.yield_pct, unit: '%' }); });
    Object.keys(P.slaByMetric || {}).forEach(function (m) { P.slaByMetric[m].forEach(function (r) { add(m, { at: r.at, value: r.actual, unit: 'sla' }); }); });
    (P.productMetrics || []).forEach(function (r) { add(r.name, { at: r.at, value: r.value, unit: r.unit }); });
    (P.uxMetrics || []).forEach(function (r) { add(r.metric, { at: r.at, value: r.value, unit: r.unit }); });
    Object.keys(out).forEach(function (m) { out[m].sort(function (a, b) { return a.at - b.at; }); });
    return out;
  };

  function benchmarkCompare(P) {
    const set = LeadOS.engine.settings(P);
    const minP = set.trendMinPeriods;
    const internal = INTERNAL_SERIES(P);
    return Object.keys(P.benchmarkByMetric || {}).sort().map(function (m) {
      const logs = P.benchmarkByMetric[m];
      const bench = logs[logs.length - 1];
      const series = internal[m];
      const base = {
        metric: m, benchmark: { value: bench.value, unit: bench.unit, source: bench.source, period: bench.period, type: bench.type, at: bench.at },
        benchmarksLogged: logs.length
      };
      if (!series || !series.length) {
        return Object.assign(base, { comparable: false, status: 'no internal series for ' + m + ' — comparison not inferred' });
      }
      const last = series[series.length - 1];
      const delta = last.value - bench.value;
      const pct = bench.value !== 0 ? delta / Math.abs(bench.value) : null;
      let trend;
      if (series.length >= minP) {
        const sl = slope(series.map(function (x) { return x.value; }));
        trend = { claimed: true, slope: rd3(sl), points: series.length, why: 'slope ' + rd3(sl) + ' per point over ' + series.length + ' measured points (>= trendMinPeriods ' + minP + ')' };
      } else {
        trend = { claimed: false, points: series.length, why: 'only ' + series.length + ' measured point(s) < trendMinPeriods ' + minP + ' — no trend claimed' };
      }
      return Object.assign(base, {
        comparable: true,
        internalLatest: { value: last.value, unit: last.unit, at: last.at },
        seriesLength: series.length,
        delta: rd3(delta), deltaPct: pct === null ? null : rd3(pct),
        math: 'internal latest ' + last.value + ' − benchmark ' + bench.value + ' = ' + rd3(delta) + (pct === null ? '' : ' (' + rd3(pct * 100) + '%)'),
        trend: trend
      });
    });
  }

  LeadOS.correlate = { correlate: correlate, benchmarkCompare: benchmarkCompare, HOT_SCORE: HOT_SCORE, INTERNAL_SERIES: INTERNAL_SERIES };
})();
