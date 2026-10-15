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
    'exec.crisis.resolved':   function (s, p, at) { const c = s.crises[p.crisisId]; if (c) { c.resolved = true; c.postmortem = p.postmortem || ''; c.resolvedAt = p.resolvedAt; } }
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
    .concat(['dealsByPerson', 'quotaByPerson', 'kpiByMetric', 'slaByMetric', 'complianceByFramework', 'legalRiskById', 'safetyIncidents', 'boardMeetings', 'execKpiReviews', 'rosterById', 'noteLog', 'notesByRef']);

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
