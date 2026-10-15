/* LeadOS pt-4 - js/health.js
   The authority wall.
   T-suite: deterministic proof on synthetic fixtures (never touches the store).
   G-suite: live inspection of the real localStorage payload.
   pt-4 part 3 adds T12–T17 (rules engine R1–R40) and G9 (live rules run). */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000, H = 3600000;
  const T0 = 1720000000000; // pinned epoch - fixtures never call Date.now()

  function fev(seq, type, payload, opts) {
    const e = { seq: seq, id: 't-' + seq, at: (opts && opts.at) || (T0 + seq * 1000), type: type, payload: payload };
    if (opts && opts.meta) e.meta = opts.meta;
    return e;
  }
  function v3raw(events) {
    return { schemaVersion: 3, meta: { lineage: 'pt', createdAt: T0, migrationsApplied: ['1>2', '2>3'], migrationRepairs: { '1>2': 0, '2>3': 0 } }, events: events };
  }
  function repairCount(raw, migrationId) {
    return raw.events.filter(function (e) { return e.meta && e.meta.repair && e.meta.migration === migrationId; }).length;
  }

  // ---------- part-2 fixtures: one canonical payload per registered new type ----------
  const NEW_TYPE_FIXTURES = {
    'fin.budget.set': { id: 'fb1', period: '2025-Q3', amount: 500000, currency: 'USD', category: 'opex' },
    'fin.budget.actuals': { budgetId: 'fb1', actual: 472000, period: '2025-Q3' },
    'fin.forecast.logged': { period: '2025-Q4', revenue: 900000, cost: 720000, margin: 0.2, confidence: 0.7 },
    'fin.kpi.logged': { metric: 'gross-margin', value: 68, unit: '%', period: '2025-Q3', target: 70 },
    'fin.risk.logged': { id: 'fr1', title: 'Runway compression', severity: 4, likelihood: 3 },
    'fin.risk.updated': { riskId: 'fr1', status: 'mitigated' },
    'sales.deal.logged': { id: 'sd1', title: 'Acme expansion', value: 120000, currency: 'USD', stage: 'proposal', accountName: 'Acme' },
    'sales.deal.updated': { dealId: 'sd1', stage: 'negotiation' },
    'sales.deal.closed': { dealId: 'sd1', result: 'won', actualValue: 115000 },
    'sales.pipeline.reviewed': { note: 'weekly', totalValue: 480000, dealCount: 12 },
    'sales.quota.set': { id: 'sq1', personId: 'rep-7', period: '2025-Q3', target: 400000, currency: 'USD' },
    'sales.quota.actuals': { quotaId: 'sq1', actual: 415000, period: '2025-Q3' },
    'product.roadmap.item': { id: 'pr1', title: 'SSO', quarter: 'Q3', effort: 3, impact: 5, status: 'planned' },
    'product.roadmap.updated': { itemId: 'pr1', status: 'shipped' },
    'product.metric.logged': { name: 'activation', value: 42, unit: '%', period: '2025-09' },
    'product.retro.logged': { went_well: ['shipping cadence'], improve: ['scope creep'], actions: ['stricter briefs'] },
    'strategy.okr.set': { id: 'so1', objective: 'Land mid-market', quarter: 'Q3', keyResults: [{ kr: 'New logos', target: 30, unit: 'count' }] },
    'strategy.okr.progress': { okrId: 'so1', krIndex: 0, current: 18 },
    'strategy.okr.closed': { okrId: 'so1', score: 0.72 },
    'strategy.decision': { title: 'Pricing model', severity: 4, alternatives: ['seat', 'usage'], chosen: 'seat', rationale: 'predictability' },
    'ops.incident.logged': { id: 'oi1', title: 'API latency', severity: 2, systems: ['api'], startedAt: T0 },
    'ops.incident.resolved': { incidentId: 'oi1', resolvedAt: T0 + 3600000, actions: ['add index'], rootCause: 'missing index' },
    'ops.sla.logged': { metric: 'uptime', target: 99.9, actual: 99.95, period: '2025-09', met: true },
    'ops.capacity.logged': { headcount: 42, openRoles: 6, period: '2025-Q3' },
    'ops.process.logged': { name: 'release', period: '2025-09', cycle_time_days: 4 },
    'ops.milestone.set': { id: 'om1', title: 'Beta', dueDate: T0 + 30 * DAY, dependsOn: [] },
    'ops.milestone.updated': { milestoneId: 'om1', status: 'at-risk' },
    'hr.headcount.planned': { role: 'AE', level: 'L4', targetDate: T0 + 60 * DAY },
    'hr.offer.logged': { candidateName: 'J. Doe', role: 'AE', level: 'L4', result: 'accepted' },
    'hr.attrition.logged': { personId: 'u-9', reason: 'voluntary' },
    'hr.performance.logged': { personId: 'u-3', rating: 'exceeds', period: '2025-H1' },
    'hr.pip.started': { id: 'hp1', personId: 'u-3', duration_days: 30, goals: ['ship weekly'] },
    'hr.pip.closed': { pipId: 'hp1', result: 'improved' },
    'hr.engagement.logged': { score: 7.8, period: '2025-Q3', respondents: 96 },
    'hr.compensation.reviewed': { personId: 'u-3', changeType: 'raise' },
    'mktg.campaign.logged': { id: 'mc1', name: 'Launch', channel: 'paid', budget: 50000, period: '2025-Q3' },
    'mktg.campaign.result': { campaignId: 'mc1', leads: 420, conversions: 33, spend_actual: 47200 },
    'mktg.brand.audit': { period: '2025-Q3', nps: 34, sentiment: 'positive' },
    'mktg.content.published': { title: 'Founder letter', channel: 'blog', reach: 12000 },
    'mfg.production.logged': { period: '2025-W38', units_planned: 1000, units_actual: 972, defects: 11 },
    'mfg.quality.logged': { metric: 'first-pass-yield', value: 98.2, unit: '%', target: 98, period: '2025-W38' },
    'mfg.safety.incident': { severity: 2, type: 'near-miss', description: 'unguarded belt', corrective_actions: ['guard refit'], date: T0 },
    'mfg.equipment.logged': { assetId: 'press-1', status: 'degraded', next_maintenance: T0 + 7 * DAY },
    'mfg.yield.logged': { period: '2025-W38', yield_pct: 97.4 },
    'supply.vendor.logged': { id: 'sv1', name: 'FabCo', category: 'components', tier: 1, risk_level: 2 },
    'supply.vendor.reviewed': { vendorId: 'sv1', score: 4, note: 'solid' },
    'supply.inventory.logged': { quantity: 840, unit: 'pcs', period: '2025-W38', reorder_point: 300 },
    'supply.disruption.logged': { vendorId: 'sv1', description: 'port delay', severity: 2 },
    'design.review.logged': { title: 'Onboarding v2', personIds: ['u-1', 'u-2'], verdict: 'iterate' },
    'design.system.updated': { component: 'Button', version: '3.1.0', breaking: false },
    'design.research.logged': { method: 'interviews', participants: 8, insights: ['setup anxiety'] },
    'design.ux.metric': { metric: 'task-success', value: 91, unit: '%', period: '2025-09' },
    'rd.experiment.logged': { id: 're1', hypothesis: 'Onboarding lift', method: 'A/B', startDate: T0 },
    'rd.experiment.result': { experimentId: 're1', result: 'validated', learnings: ['+12% activation'] },
    'rd.patent.logged': { title: 'Adaptive sync', filedDate: T0, status: 'filed' },
    'rd.tech.debt.logged': { id: 'rt1', title: 'Legacy auth', severity: 4, effort: 3 },
    'rd.tech.debt.resolved': { debtId: 'rt1' },
    'legal.compliance.check': { framework: 'SOC2', period: '2025-H1', result: 'pass', findings: [] },
    'legal.risk.logged': { title: 'Data residency', severity: 3, area: 'privacy' },
    'legal.contract.logged': { id: 'lc1', counterparty: 'VendorX', type: 'MSA', value: 90000 },
    'legal.contract.updated': { contractId: 'lc1', status: 'renewed' },
    'legal.incident.logged': { type: 'breach-notice', severity: 4, description: 'vendor incident', reportedAt: T0 },
    'cs.nps.logged': { score: 41, period: '2025-Q3', promoters: 120, passives: 60, detractors: 40 },
    'cs.churn.logged': { period: '2025-09', churned: 2, total: 180, mrr_lost: 4200 },
    'cs.escalation.logged': { id: 'ce1', accountName: 'Acme', severity: 3, description: 'SSO broken' },
    'cs.escalation.resolved': { escalationId: 'ce1', resolution: 'patched in 4.2.1' },
    'cs.health.logged': { accountName: 'Acme', score: 4, period: '2025-Q3' },
    'exec.board.meeting': { date: T0, quorum: true, items: ['Q3 review'], decisions: ['approve budget'] },
    'exec.kpi.reviewed': { period: '2025-Q3', metrics: [{ name: 'ARR', value: 4200000, target: 4000000, trend: 'up' }] },
    'exec.investor.update': { period: '2025-Q3', sentiment: 'positive' },
    'exec.crisis.logged': { id: 'ec1', title: 'Data exposure', severity: 5, type: 'security', responseTeam: ['sec', 'legal'], activatedAt: T0 },
    'exec.crisis.resolved': { crisisId: 'ec1', resolvedAt: T0 + 2 * DAY }
  };

  /* ---------- rules battery: one deterministic fixture that forces all 40 rules ----------
     today = T0 + 100d. Every rule R1–R40 fires at least once. */
  function buildSeed() {
    const A = T0, today = A + 100 * DAY;
    let seq = 0; const evs = [];
    function add(type, payload, at) { evs.push(fev(++seq, type, payload, { at: at })); }
    add('store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, A);
    // R1–R4 cadences (overdue branch): old completed reviews per kind
    add('review.scheduled', { id: 'cR', kind: 'compliance', dueAt: A - 190 * DAY }, A - 191 * DAY);
    add('review.completed', { id: 'cR', outcome: 'done' }, A - 190 * DAY);
    [['revenue', 10], ['ops', 10], ['board', 5]].forEach(function (x, i) {
      add('review.scheduled', { id: 'r' + i, kind: x[0], dueAt: A + x[1] * DAY }, A);
      add('review.completed', { id: 'r' + i, outcome: 'done' }, A + x[1] * DAY);
    });
    // R5–R10 heritage signals
    add('decision.proposed', { id: 'dEng', domain: 'engineering', question: 'Monolith or services?', options: ['mono', 'svc'], owner: 'cto', reversibility: 'irreversible' }, A + DAY);
    add('decision.proposed', { id: 'dSal', domain: 'sales', question: 'Discount path?', options: ['a', 'b'], owner: 'cro', reversibility: 'reversible' }, A + DAY);
    add('risk.raised', { id: 'rk1', domain: 'sales', title: 'Churn drift', likelihood: 2, impact: 2 }, A + DAY);
    add('objective.created', { id: 'o1', domain: 'sales', title: 'Grow revenue' }, A + DAY);
    add('kr.created', { id: 'k1', objectiveId: 'o1', title: 'ARR', target: 100, unit: 'k' }, A + DAY);
    add('task.created', { id: 'tk1', domain: 'sales', title: 'Call list', dueAt: A + 10 * DAY }, A + DAY);
    add('objective.created', { id: 'o2', domain: 'finance', title: 'Unmeasured goal' }, A + DAY);
    // R11
    add('fin.risk.logged', { id: 'fr1', title: 'Runway compression', severity: 4, likelihood: 4, reviewDate: A + 30 * DAY }, A + 2 * DAY);
    // R12
    add('sales.deal.logged', { id: 'dl1', title: 'Stale deal', value: 50000, currency: 'USD', stage: 'proposal', closeDate: A + 40 * DAY }, A + 3 * DAY);
    // R13
    add('sales.quota.set', { id: 'q1', personId: 'rep-1', period: 'Q3', target: 1000, currency: 'USD' }, A + 3 * DAY);
    add('sales.quota.actuals', { quotaId: 'q1', actual: 400, period: 'Q3' }, A + 60 * DAY);
    // R14
    add('strategy.okr.set', { id: 'ok1', objective: 'Silent OKR', quarter: 'Q3', keyResults: [{ kr: 'X', target: 1, unit: 'n' }] }, A + 5 * DAY);
    // R15
    ['okA', 'okB', 'okC'].forEach(function (id, i) {
      add('strategy.okr.set', { id: id, objective: 'Objective ' + id, quarter: 'Q' + (i + 1), keyResults: [{ kr: 'Y', target: 10, unit: 'n' }] }, A + (40 + i) * DAY);
      add('strategy.okr.closed', { okrId: id, score: [0.3, 0.2, 0.35][i] }, A + (50 + i * 5) * DAY);
    });
    // R16
    add('ops.incident.logged', { id: 'in1', title: 'DB saturation', severity: 4, systems: ['db'], startedAt: A + 90 * DAY }, A + 90 * DAY);
    add('ops.incident.resolved', { incidentId: 'in1', resolvedAt: A + 90 * DAY + 10 * H, actions: ['add read replica'] }, A + 90 * DAY + 10 * H);
    // R17
    [70, 80, 90].forEach(function (d, i) { add('ops.sla.logged', { metric: 'uptime', target: 99.9, actual: 99.0, period: 'W' + (i + 1), met: false }, A + d * DAY); });
    // R18
    add('ops.milestone.set', { id: 'ms1', title: 'GA launch', dueDate: A + 50 * DAY, dependsOn: [] }, A + 10 * DAY);
    add('ops.milestone.updated', { milestoneId: 'ms1', status: 'at-risk' }, A + 40 * DAY);
    // R19
    add('hr.attrition.logged', { personId: 'u-1', reason: 'voluntary' }, A + 70 * DAY);
    add('hr.attrition.logged', { personId: 'u-2', reason: 'involuntary' }, A + 80 * DAY);
    // R20
    add('hr.engagement.logged', { score: 7.5, period: 'H1', respondents: 50 }, A + 30 * DAY);
    add('hr.engagement.logged', { score: 5.8, period: 'H2', respondents: 52 }, A + 70 * DAY);
    // R21
    add('hr.pip.started', { id: 'pp1', personId: 'u-3', duration_days: 30, goals: ['ship weekly'] }, A + 10 * DAY);
    // R22
    add('fin.budget.set', { id: 'b1', period: 'Q2', amount: 100000, currency: 'USD', category: 'opex' }, A + 5 * DAY);
    add('fin.budget.actuals', { budgetId: 'b1', actual: 60000, period: 'Q2' }, A + 60 * DAY);
    // R23
    add('fin.kpi.logged', { metric: 'gross-margin', value: 60, unit: '%', period: 'Q3', target: 100 }, A + 80 * DAY);
    // R24
    add('fin.forecast.logged', { period: 'Q2', revenue: 100000, cost: 80000, margin: 0.2, confidence: 0.8 }, A + 20 * DAY);
    // R25
    add('supply.vendor.logged', { id: 'v1', name: 'FabCo', category: 'components', tier: 1, risk_level: 5, reviewDate: A + 30 * DAY }, A + 5 * DAY);
    // R26
    add('supply.disruption.logged', { vendorId: 'v1', description: 'factory fire', severity: 4 }, A + 80 * DAY);
    // R27
    add('mfg.yield.logged', { period: 'W38', yield_pct: 75, line: 'L1' }, A + 85 * DAY);
    // R28
    add('mfg.safety.incident', { severity: 2, type: 'cut', description: 'blade guard', corrective_actions: ['refit'], date: A + 85 * DAY }, A + 85 * DAY);
    add('mfg.safety.incident', { severity: 5, type: 'crush', description: 'press accident', corrective_actions: ['lockout'], date: A + 90 * DAY }, A + 90 * DAY);
    // R29
    add('mfg.equipment.logged', { assetId: 'press-9', status: 'down' }, A + 99 * DAY);
    // R30
    add('legal.compliance.check', { framework: 'SOC2', period: 'H1', result: 'fail', findings: ['access review missing'] }, A + 80 * DAY);
    // R31
    add('legal.risk.logged', { title: 'GDPR exposure', severity: 3, area: 'privacy', dueDate: A + 50 * DAY }, A + 40 * DAY);
    // R32
    add('legal.contract.logged', { id: 'ct1', counterparty: 'Alpha', type: 'MSA', expiryDate: A + 120 * DAY }, A + 10 * DAY);
    add('legal.contract.logged', { id: 'ct2', counterparty: 'Beta', type: 'NDA', expiryDate: A + 105 * DAY }, A + 10 * DAY);
    add('legal.contract.logged', { id: 'ct3', counterparty: 'Gamma', type: 'SOW', expiryDate: A + 90 * DAY }, A + 10 * DAY);
    // R33
    add('cs.nps.logged', { score: 40, period: 'Q2', promoters: 50, passives: 30, detractors: 20 }, A + 40 * DAY);
    add('cs.nps.logged', { score: 20, period: 'Q3', promoters: 40, passives: 40, detractors: 20 }, A + 80 * DAY);
    // R34
    add('cs.churn.logged', { period: 'Q3', churned: 8, total: 100 }, A + 85 * DAY);
    // R35
    add('cs.escalation.logged', { id: 'e1', accountName: 'Acme', severity: 3, description: 'billing dispute', dueDate: A + 60 * DAY }, A + 50 * DAY);
    add('cs.escalation.logged', { id: 'e2', accountName: 'Globex', severity: 5, description: 'data loss claim' }, A + 99 * DAY);
    // R36
    add('mktg.campaign.logged', { id: 'mc1', name: 'C1', channel: 'paid', budget: 1000, period: 'Q2' }, A + 10 * DAY);
    add('mktg.campaign.result', { campaignId: 'mc1', spend_actual: 1000, conversions: 10 }, A + 20 * DAY);
    add('mktg.campaign.logged', { id: 'mc2', name: 'C2', channel: 'paid', budget: 1100, period: 'Q2' }, A + 11 * DAY);
    add('mktg.campaign.result', { campaignId: 'mc2', spend_actual: 1100, conversions: 10 }, A + 21 * DAY);
    add('mktg.campaign.logged', { id: 'mc3', name: 'C3', channel: 'paid', budget: 1050, period: 'Q2' }, A + 12 * DAY);
    add('mktg.campaign.result', { campaignId: 'mc3', spend_actual: 1050, conversions: 10 }, A + 22 * DAY);
    add('mktg.campaign.logged', { id: 'mc4', name: 'C4', channel: 'paid', budget: 5000, period: 'Q3' }, A + 30 * DAY);
    add('mktg.campaign.result', { campaignId: 'mc4', spend_actual: 5000, conversions: 10 }, A + 40 * DAY);
    add('mktg.campaign.logged', { id: 'mc5', name: 'C5 silent', channel: 'events', budget: 2000, period: 'Q3' }, A + 80 * DAY);
    // R37
    add('rd.experiment.logged', { id: 'ex1', hypothesis: 'Pricing page lifts conversion', method: 'A/B', startDate: A + 10 * DAY, reviewDate: A + 30 * DAY }, A + 10 * DAY);
    // R38
    add('rd.tech.debt.logged', { id: 'td1', title: 'Legacy auth', severity: 4, effort: 5 }, A + 50 * DAY);
    add('rd.tech.debt.logged', { id: 'td2', title: 'Sync layer', severity: 3, effort: 4 }, A + 60 * DAY);
    // R39
    add('exec.board.meeting', { date: A + 5 * DAY, quorum: true, items: ['Q1'], decisions: ['approve plan'] }, A + 5 * DAY);
    // R40
    add('exec.kpi.reviewed', { period: 'Q2', metrics: [{ name: 'ARR', value: 1, target: 1, trend: 'up' }] }, A + 60 * DAY);
    return { events: evs, today: today };
  }
  function batteryFindings() { const b = buildSeed(); return LeadOS.rules.run(LeadOS.engine.project(b.events), b.today); }
  function shapeOk(f) {
    const validPlay = f.play === null || LeadOS.rules.PLAY_IDS.indexOf(f.play) !== -1 || /^playbook:[a-zA-Z]+$/.test(f.play);
    return /^R([1-9]|[1-3][0-9]|40)$/.test(f.rule) &&
      Number.isInteger(f.sev) && f.sev >= 1 && f.sev <= 5 &&
      ['HIGH', 'MEDIUM', 'LOW'].indexOf(f.conf) !== -1 &&
      typeof f.title === 'string' && f.title.length > 0 &&
      Array.isArray(f.basis) && Array.isArray(f.refs) &&
      ((f.play && validPlay) || (typeof f.playNone === 'string' && f.playNone.length > 0));
  }

  // ---------- T-suite ----------
  const T = [
    ['T1', '3>4 backfills exactly the five v4 settings on a bare v3 store', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const applied = LeadOS.store.foldSettings(raw.events);
      const missing = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return !(k in applied); });
      return { pass: missing.length === 0, detail: missing.length ? 'missing: ' + missing.join(', ') : 'all 5 keys project after migration; ' + repairCount(raw, '3>4') + ' repair events written' };
    }],
    ['T2', '3>4 backfilled values equal the v4 defaults exactly (90 / 30 / 14 / 90 / 180)', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const applied = LeadOS.store.foldSettings(raw.events);
      const bad = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return applied[k] !== LeadOS.store.V4_SETTING_DEFAULTS[k]; });
      return { pass: bad.length === 0, detail: bad.length ? 'wrong defaults: ' + bad.join(', ') : 'salesCycle 90, revenue 30, ops 14, board 90, compliance 180' };
    }],
    ['T3', '3>4 is idempotent: replaying it appends zero new repairs', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const len = raw.events.length, counted = raw.meta.migrationRepairs['3>4'];
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const stable = raw.events.length === len && raw.meta.migrationRepairs['3>4'] === counted;
      return { pass: stable, detail: stable ? 'second run: +0 events, count stable at ' + counted : 'second run mutated the store' };
    }],
    ['T4', '3>4 never overwrites a leader-set value (salesCycleDays 45 survives)', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' }), fev(2, 'settings.changed', { key: 'salesCycleDays', value: 45 })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const applied = LeadOS.store.foldSettings(raw.events);
      const repairs = repairCount(raw, '3>4');
      const ok = applied.salesCycleDays === 45 && repairs === 4;
      return { pass: ok, detail: ok ? 'user value 45 preserved; only the 4 untouched keys backfilled' : 'salesCycleDays=' + applied.salesCycleDays + ', repairs=' + repairs };
    }],
    ['T5', 'meta.migrationRepairs[3>4] equals the repair events written to the log', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      LeadOS.store.MIGRATIONS['3>4'](raw);
      const fromLog = repairCount(raw, '3>4');
      return { pass: raw.meta.migrationRepairs['3>4'] === fromLog, detail: 'meta=' + raw.meta.migrationRepairs['3>4'] + ', log=' + fromLog };
    }],
    ['T6', 'cadence math honors v4 interval keys: never -> ok -> due -> overdue', function () {
      const C = T0 + 100 * DAY;
      function stateWith(completed) {
        const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' })];
        if (completed) {
          evs.push(fev(2, 'review.scheduled', { id: 'r1', kind: 'revenue', dueAt: C }, { at: C - DAY }));
          evs.push(fev(3, 'review.completed', { id: 'r1', outcome: 'done' }, { at: C }));
        }
        return LeadOS.engine.project(evs);
      }
      const s1 = stateWith(true);
      const cs = LeadOS.engine.cadenceStatus;
      const a = cs(s1, C + 28 * DAY).revenue.status;
      const b = cs(s1, C + 30 * DAY - 1000).revenue.status;
      const c = cs(s1, C + 30 * DAY + 1).revenue.status;
      const d = cs(s1, C + 44 * DAY).revenue.overdueDays;
      const e = cs(stateWith(false), C).revenue.status;
      const ok = a === 'ok' && b === 'due' && c === 'overdue' && d === 14 && e === 'never';
      return { pass: ok, detail: 'ok/due/overdue/never = ' + [a, b, c, e].join('/') + '; overdueDays=' + d };
    }],
    ['T7', 'project() is a pure fold: no store access, deterministic, non-mutating', function () {
      const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }), fev(2, 'settings.changed', { key: 'opsReviewCadenceDays', value: 7 })];
      const before = JSON.stringify(evs);
      const origLoad = LeadOS.store.load, origGet = LeadOS.store.getEvents;
      let pass = true, detail = 'no store access; deterministic; source events untouched';
      LeadOS.store.load = function () { throw new Error('project touched the store'); };
      LeadOS.store.getEvents = function () { throw new Error('project touched the store'); };
      try {
        const a = JSON.stringify(LeadOS.engine.project(evs));
        const b = JSON.stringify(LeadOS.engine.project(evs));
        if (a !== b) { pass = false; detail = 'non-deterministic projection'; }
        if (JSON.stringify(evs) !== before) { pass = false; detail = 'projection mutated its input'; }
      } catch (err) { pass = false; detail = err.message; }
      finally { LeadOS.store.load = origLoad; LeadOS.store.getEvents = origGet; }
      return { pass: pass, detail: detail };
    }],
    ['T8', 'registry rejects unknown types, rogue fields, and malformed payloads', function () {
      const v = LeadOS.events.validate;
      const ok = !v('definitely.not.real', {}).ok && !v('settings.changed', { key: 'notASetting', value: 5 }).ok &&
        !v('objective.created', { id: 'x', domain: 'sales' }).ok && !v('task.created', { id: 't', domain: 'sales', title: 'x', hacker: 1 }).ok &&
        v('decision.proposed', { id: 'd', domain: 'sales', question: 'q?', options: ['a', 'b'], owner: 'o', reversibility: 'reversible' }).ok;
      return { pass: ok, detail: ok ? '4 malformed events rejected, 1 valid accepted' : 'validator misbehaved' };
    }],
    ['T9', 'salesCycleDays drives the beyond-cycle flag on sales decisions only', function () {
      const evs = [
        fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }),
        fev(2, 'decision.proposed', { id: 'ds', domain: 'sales', question: 'pricing?', options: ['a', 'b'], owner: 'cro', reversibility: 'reversible' }, { at: T0 }),
        fev(3, 'decision.proposed', { id: 'de', domain: 'engineering', question: 'stack?', options: ['a', 'b'], owner: 'cto', reversibility: 'irreversible' }, { at: T0 })
      ];
      const q91 = LeadOS.engine.decisionQueue(LeadOS.engine.project(evs), T0 + 91 * DAY);
      const q10 = LeadOS.engine.decisionQueue(LeadOS.engine.project(evs), T0 + 10 * DAY);
      const ok = q91.find(function (d) { return d.id === 'ds'; }).beyondSalesCycle === true &&
                 q91.find(function (d) { return d.id === 'de'; }).beyondSalesCycle === false &&
                 q10.find(function (d) { return d.id === 'ds'; }).beyondSalesCycle === false;
      return { pass: ok, detail: 'sales@91d beyond-cycle, engineering@91d not, sales@10d not' };
    }],
    ['T10', 'all 11 part-2 families fold: entities mutate, actuals attach, closures close', function () {
      let seq = 0; const A = T0;
      const evs = [fev(++seq, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' })];
      function add(type, payload, at) { evs.push(fev(++seq, type, payload, { at: at || (A + seq * 1000) })); }
      add('fin.budget.set', { id: 'b1', period: 'Q3', amount: 500000, currency: 'USD', category: 'opex' });
      add('fin.budget.actuals', { budgetId: 'b1', actual: 472000, period: 'Q3' });
      add('sales.deal.logged', { id: 'd1', title: 'Acme', value: 120000, currency: 'USD', stage: 'proposal' });
      add('sales.deal.updated', { dealId: 'd1', stage: 'negotiation' });
      add('sales.deal.closed', { dealId: 'd1', result: 'won', actualValue: 115000 });
      add('sales.quota.set', { id: 'q1', personId: 'r7', period: 'Q3', target: 400000, currency: 'USD' });
      add('sales.quota.actuals', { quotaId: 'q1', actual: 415000, period: 'Q3' });
      add('product.roadmap.item', { id: 'ri1', title: 'SSO', quarter: 'Q3', effort: 3, impact: 5, status: 'planned' });
      add('product.roadmap.updated', { itemId: 'ri1', status: 'shipped' });
      add('strategy.okr.set', { id: 'o1', objective: 'Land', quarter: 'Q3', keyResults: [{ kr: 'Logos', target: 30, unit: 'count' }] });
      add('strategy.okr.progress', { okrId: 'o1', krIndex: 0, current: 18 });
      add('strategy.okr.closed', { okrId: 'o1', score: 0.72 });
      add('ops.incident.logged', { id: 'i1', title: 'Latency', severity: 2, systems: ['api'], startedAt: A });
      add('ops.incident.resolved', { incidentId: 'i1', resolvedAt: A + 3600000, actions: ['index'], rootCause: 'missing index' });
      add('ops.milestone.set', { id: 'm1', title: 'Beta', dueDate: A + 30 * DAY, dependsOn: [] });
      add('ops.milestone.set', { id: 'm2', title: 'GA', dueDate: A + 60 * DAY, dependsOn: ['m1'] });
      add('ops.milestone.updated', { milestoneId: 'm2', status: 'at-risk' });
      add('hr.pip.started', { id: 'p1', personId: 'u3', duration_days: 30, goals: ['ship'] });
      add('hr.pip.closed', { pipId: 'p1', result: 'improved' });
      add('mktg.campaign.logged', { id: 'c1', name: 'Launch', channel: 'paid', budget: 50000, period: 'Q3' });
      add('mktg.campaign.result', { campaignId: 'c1', leads: 420, conversions: 33 });
      add('supply.vendor.logged', { id: 'v1', name: 'FabCo', category: 'comp', tier: 1, risk_level: 2 });
      add('supply.vendor.reviewed', { vendorId: 'v1', score: 4 });
      add('supply.disruption.logged', { vendorId: 'v1', description: 'port delay', severity: 2 });
      add('rd.experiment.logged', { id: 'e1', hypothesis: 'Lift', method: 'A/B', startDate: A });
      add('rd.experiment.result', { experimentId: 'e1', result: 'validated', learnings: ['+12%'] });
      add('rd.tech.debt.logged', { id: 'td1', title: 'Legacy auth', severity: 4, effort: 3 });
      add('rd.tech.debt.resolved', { debtId: 'td1' });
      add('legal.contract.logged', { id: 'ct1', counterparty: 'VX', type: 'MSA', value: 90000 });
      add('legal.contract.updated', { contractId: 'ct1', status: 'renewed' });
      add('cs.escalation.logged', { id: 'es1', accountName: 'Acme', severity: 3, description: 'SSO broken' });
      add('cs.escalation.resolved', { escalationId: 'es1', resolution: 'patched' });
      add('exec.crisis.logged', { id: 'cr1', title: 'Exposure', severity: 5, type: 'security', responseTeam: ['sec'], activatedAt: A });
      add('exec.crisis.resolved', { crisisId: 'cr1', resolvedAt: A + 2 * DAY });
      add('mfg.equipment.logged', { assetId: 'press-1', status: 'operational' });
      add('mfg.equipment.logged', { assetId: 'press-1', status: 'degraded' });
      add('ops.sla.logged', { metric: 'uptime', target: 99.9, actual: 99.95, period: 'M9', met: true });
      add('cs.nps.logged', { score: 41, period: 'Q3', promoters: 12, passives: 6, detractors: 4 });
      add('exec.board.meeting', { date: A, quorum: true, items: ['Q3'], decisions: ['approve'] });
      const s = LeadOS.engine.project(evs);
      const checks = [
        ['budget actuals attach', s.finBudgets.b1.actuals.length === 1],
        ['deal mutated then closed won', s.deals.d1.result === 'won' && s.deals.d1.stage === 'negotiation' && s.deals.d1.actualValue === 115000],
        ['quota actuals attach', s.quotas.q1.actuals.length === 1],
        ['roadmap status moved', s.roadmap.ri1.status === 'shipped'],
        ['okr kr current + score', s.okrs.o1.keyResults[0].current === 18 && s.okrs.o1.score === 0.72],
        ['incident resolved with actions', s.incidents.i1.resolved === true && s.incidents.i1.actions.length === 1],
        ['milestone dependency + status', s.milestones.m2.dependsOn[0] === 'm1' && s.milestones.m2.status === 'at-risk'],
        ['pip closed improved', s.pips.p1.result === 'improved'],
        ['campaign result attaches', s.campaigns.c1.results.length === 1],
        ['vendor score updated', s.vendors.v1.lastScore === 4],
        ['experiment concluded', s.experiments.e1.result === 'validated'],
        ['tech debt resolved', s.techDebt.td1.resolved === true],
        ['contract renewed', s.contracts.ct1.status === 'renewed'],
        ['escalation resolved', s.escalations.es1.resolved === true],
        ['crisis resolved', s.crises.cr1.resolved === true],
        ['equipment latest wins', s.equipment['press-1'].status === 'degraded'],
        ['log buckets fill', s.slaLogs.length === 1 && s.npsLogs.length === 1 && s.boardMeetings.length === 1]
      ];
      const failed = checks.filter(function (c) { return !c[1]; }).map(function (c) { return c[0]; });
      return { pass: failed.length === 0, detail: failed.length ? 'failed: ' + failed.join('; ') : checks.length + ' fold assertions across 11 families hold' };
    }],
    ['T11', 'every part-2 type is registered and gate-enforced (72 contracts, 7 rejection paths)', function () {
      const v = LeadOS.events.validate;
      const types = Object.keys(NEW_TYPE_FIXTURES);
      const unregistered = types.filter(function (t) { return !LeadOS.events.REGISTRY[t]; });
      const rejected = types.filter(function (t) { return !v(t, NEW_TYPE_FIXTURES[t]).ok; });
      const negatives = [
        ['fin.risk.updated', { riskId: 'x', status: 'paused' }],
        ['strategy.okr.closed', { okrId: 'x', score: 2 }],
        ['ops.sla.logged', { metric: 'a', target: 99, actual: 98, period: 'Q3', met: 'yes' }],
        ['strategy.okr.set', { id: 'o', objective: 'x', quarter: 'Q3', keyResults: [] }],
        ['strategy.decision', { title: 't', severity: 3, alternatives: ['a', 'b'], chosen: 'c', rationale: 'r' }],
        ['supply.vendor.logged', { id: 'v', name: 'n', category: 'c', tier: 5, risk_level: 3 }],
        ['exec.kpi.reviewed', { period: 'Q3', metrics: [{ name: 'ARR', value: 'lots' }] }]
      ];
      const wrongRejects = negatives.filter(function (n) { return v(n[0], n[1]).ok; });
      const ok = unregistered.length === 0 && rejected.length === 0 && wrongRejects.length === 0;
      return { pass: ok, detail: ok ? types.length + ' types accepted with canonical payloads; ' + negatives.length + ' malformed payloads rejected' : 'unregistered: ' + unregistered.join(',') + ' | rejected: ' + rejected.join(',') + ' | wrongly accepted: ' + wrongRejects.map(function (n) { return n[0]; }).join(',') };
    }],
    ['T12', 'finding contract: every finding matches the fin() shape, sev 1–5, play xor playNone', function () {
      const F = batteryFindings();
      const bad = F.filter(function (f) { return !shapeOk(f); });
      return { pass: F.length > 0 && bad.length === 0, detail: bad.length ? 'malformed findings: ' + bad.slice(0, 2).map(function (f) { return JSON.stringify(f).slice(0, 90); }).join(' | ') : F.length + ' findings, all shape-valid; play ids resolve or playNone printed' };
    }],
    ['T13', 'rules engine is deterministic: two runs over the same (P, today) are identical', function () {
      const b = buildSeed();
      const P = LeadOS.engine.project(b.events);
      const before = JSON.stringify(P);
      const a = JSON.stringify(LeadOS.rules.run(P, b.today));
      const c = JSON.stringify(LeadOS.rules.run(P, b.today));
      const ok = a === c && JSON.stringify(P) === before;
      return { pass: ok, detail: ok ? 'stable sort order, no time-of-day leakage, P untouched' : 'nondeterminism or mutation detected' };
    }],
    /* ---- pt-4 part 7: T14-T20 projection tests ---- */
    ['T14', 'v3 store climbs to v4 with all five new settings backfilled', function () {
      const raw = v3raw([fev(1, 'store.initialized', { schemaVersion: 3, lineageTag: 'pt-3' })]);
      let v = raw.schemaVersion;
      while (v < 4) { LeadOS.store.MIGRATIONS[v + '>' + (v + 1)](raw); v = raw.schemaVersion; }
      const set = LeadOS.engine.settings(LeadOS.engine.project(raw.events));
      const bad = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return set[k] !== LeadOS.store.V4_SETTING_DEFAULTS[k]; });
      const ok = raw.schemaVersion === 4 && bad.length === 0 && raw.meta.migrationsApplied.indexOf('3>4') !== -1;
      return { pass: ok, detail: ok ? 'v3 -> v4; ' + LeadOS.store.V4_NEW_KEYS.map(function (k) { return k + '=' + set[k]; }).join(' ') : 'schema=' + raw.schemaVersion + ' bad=' + bad.join(',') };
    }],
    ['T15', 'fin.risk projection: open vs closed counts track every status transition', function () {
      const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' })];
      let s = 1;
      ['a', 'b', 'c', 'd'].forEach(function (id) { evs.push(fev(++s, 'fin.risk.logged', { id: id, title: 'risk ' + id, severity: 3, likelihood: 3 })); });
      evs.push(fev(++s, 'fin.risk.updated', { riskId: 'b', status: 'mitigated' }));
      evs.push(fev(++s, 'fin.risk.updated', { riskId: 'c', status: 'accepted' }));
      evs.push(fev(++s, 'fin.risk.updated', { riskId: 'd', status: 'closed' }));
      const P = LeadOS.engine.project(evs);
      const byStatus = {};
      Object.keys(P.riskById).forEach(function (k) { const st = P.riskById[k].status; byStatus[st] = (byStatus[st] || 0) + 1; });
      const ok = Object.keys(P.riskById).length === 4 && P.openRisks.length === 1 && P.openRisks[0].id === 'a' &&
        byStatus.open === 1 && byStatus.mitigated === 1 && byStatus.accepted === 1 && byStatus.closed === 1;
      return { pass: ok, detail: ok ? '4 logged · 1 open (a) · mitigated/accepted/closed 1 each' : 'open=' + P.openRisks.length + ' statuses=' + JSON.stringify(byStatus) };
    }],
    ['T16', 'sales.deal projection: pipeline math (open count/value, won/lost, actual value)', function () {
      const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' })];
      let s = 1;
      [['d1', 100], ['d2', 250], ['d3', 400], ['d4', 50]].forEach(function (x) {
        evs.push(fev(++s, 'sales.deal.logged', { id: x[0], title: x[0], value: x[1], currency: 'USD', stage: 'proposal', ownerId: 'rep-1' }));
      });
      evs.push(fev(++s, 'sales.deal.updated', { dealId: 'd2', value: 300, stage: 'negotiation' }));
      evs.push(fev(++s, 'sales.deal.closed', { dealId: 'd3', result: 'won', actualValue: 380 }));
      evs.push(fev(++s, 'sales.deal.closed', { dealId: 'd4', result: 'lost' }));
      const P = LeadOS.engine.project(evs);
      const openValue = P.openDeals.reduce(function (a, d) { return a + d.value; }, 0);
      const won = Object.keys(P.dealById).filter(function (k) { return P.dealById[k].result === 'won'; });
      const lost = Object.keys(P.dealById).filter(function (k) { return P.dealById[k].result === 'lost'; });
      const ok = P.openDeals.length === 2 && openValue === 400 && won.length === 1 && lost.length === 1 &&
        P.dealById.d2.value === 300 && P.dealById.d3.actualValue === 380 && P.dealsByPerson['rep-1'].length === 4;
      return { pass: ok, detail: ok ? 'open 2 = 100+300 = 400 (update applied); won 1 @380 actual; lost 1' : 'open=' + P.openDeals.length + ' value=' + openValue };
    }],
    ['T17', 'strategy.okr projection: KR progress and closing score math', function () {
      const evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' })];
      let s = 1;
      evs.push(fev(++s, 'strategy.okr.set', { id: 'o1', objective: 'Grow', quarter: 'Q3', keyResults: [{ kr: 'Logos', target: 50, unit: 'n' }, { kr: 'ACV', target: 20, unit: 'k' }] }));
      evs.push(fev(++s, 'strategy.okr.progress', { okrId: 'o1', krIndex: 0, current: 20 }));
      evs.push(fev(++s, 'strategy.okr.progress', { okrId: 'o1', krIndex: 0, current: 35 }));
      evs.push(fev(++s, 'strategy.okr.progress', { okrId: 'o1', krIndex: 1, current: 10 }));
      evs.push(fev(++s, 'strategy.okr.set', { id: 'o2', objective: 'Retain', quarter: 'Q3', keyResults: [{ kr: 'GRR', target: 95, unit: '%' }] }));
      evs.push(fev(++s, 'strategy.okr.closed', { okrId: 'o2', score: 0.65 }));
      const P = LeadOS.engine.project(evs);
      const o1 = P.okrById.o1, o2 = P.okrById.o2;
      const attain = (o1.keyResults[0].current / o1.keyResults[0].target + o1.keyResults[1].current / o1.keyResults[1].target) / 2;
      const ok = o1.keyResults[0].current === 35 && o1.keyResults[0].logs.length === 2 && o1.keyResults[1].current === 10 &&
        Math.abs(attain - 0.60) < 1e-9 && o2.score === 0.65 && o2.closedAt !== null && P.openOkrs.length === 1 && P.openOkrs[0].id === 'o1';
      return { pass: ok, detail: ok ? 'latest-wins 35/50 & 10/20 -> mean attainment 0.60; closed o2 score 0.65; 1 open' : 'kr0=' + o1.keyResults[0].current + ' attain=' + attain };
    }],
    ['T18', 'ops.incident projection: MTTR computed from logged -> resolved', function () {
      const A = T0, evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      let s = 1;
      evs.push(fev(++s, 'ops.incident.logged', { id: 'i1', title: 'A', severity: 3, systems: ['api'], startedAt: A }, { at: A }));
      evs.push(fev(++s, 'ops.incident.resolved', { incidentId: 'i1', resolvedAt: A + 2 * 3600000, actions: ['fix'] }, { at: A + 2 * 3600000 }));
      evs.push(fev(++s, 'ops.incident.logged', { id: 'i2', title: 'B', severity: 4, systems: ['db'], startedAt: A }, { at: A }));
      evs.push(fev(++s, 'ops.incident.resolved', { incidentId: 'i2', resolvedAt: A + 6 * 3600000, actions: ['failover'] }, { at: A + 6 * 3600000 }));
      evs.push(fev(++s, 'ops.incident.logged', { id: 'i3', title: 'C', severity: 2, systems: ['web'], startedAt: A }, { at: A }));
      const P = LeadOS.engine.project(evs);
      const resolved = Object.keys(P.incidentById).map(function (k) { return P.incidentById[k]; }).filter(function (i) { return i.resolved; });
      const mttr = resolved.reduce(function (a, i) { return a + (i.resolvedAt - i.startedAt); }, 0) / resolved.length / 3600000;
      const ok = resolved.length === 2 && mttr === 4 && P.openIncidents.length === 1 && P.openIncidents[0].id === 'i3' && P.incidentById.i1.actions.length === 1;
      return { pass: ok, detail: ok ? 'MTTR = (2h + 6h) / 2 = 4h; 1 incident still open' : 'resolved=' + resolved.length + ' mttr=' + mttr };
    }],
    ['T19', 'hr.attrition projection: counts by reason and by period window', function () {
      const A = T0, evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      let s = 1;
      [['u1', 'voluntary', 5], ['u2', 'voluntary', 20], ['u3', 'involuntary', 40], ['u4', 'restructure', 100], ['u5', 'voluntary', 120]].forEach(function (x) {
        evs.push(fev(++s, 'hr.attrition.logged', { personId: x[0], reason: x[1] }, { at: A + x[2] * DAY }));
      });
      const P = LeadOS.engine.project(evs);
      const byReason = {};
      P.attritionEvents.forEach(function (a) { byReason[a.reason] = (byReason[a.reason] || 0) + 1; });
      const today = A + 130 * DAY;
      const in60 = P.attritionEvents.filter(function (a) { return (today - a.at) / DAY <= 60; });
      const in90 = P.attritionEvents.filter(function (a) { return (today - a.at) / DAY <= 90; });
      const ok = P.attritionEvents.length === 5 && byReason.voluntary === 3 && byReason.involuntary === 1 && byReason.restructure === 1 &&
        in60.length === 2 && in90.length === 2 && P.rosterById.u3.departed === true;
      return { pass: ok, detail: ok ? '5 events · voluntary 3 / involuntary 1 / restructure 1 · 2 inside 60d window' : 'reasons=' + JSON.stringify(byReason) + ' in60=' + in60.length };
    }],
    ['T20', 'supply.vendor projection: review gap measured from reviewDate to last review', function () {
      const A = T0, evs = [fev(1, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      let s = 1;
      evs.push(fev(++s, 'supply.vendor.logged', { id: 'v1', name: 'Reviewed late', category: 'c', tier: 1, risk_level: 4, reviewDate: A + 10 * DAY }, { at: A }));
      evs.push(fev(++s, 'supply.vendor.reviewed', { vendorId: 'v1', score: 4 }, { at: A + 25 * DAY }));
      evs.push(fev(++s, 'supply.vendor.logged', { id: 'v2', name: 'Never reviewed', category: 'c', tier: 2, risk_level: 5, reviewDate: A + 10 * DAY }, { at: A }));
      const P = LeadOS.engine.project(evs);
      const v1 = P.vendorById.v1, v2 = P.vendorById.v2;
      const gap = (v1.reviews[v1.reviews.length - 1].at - v1.reviewDate) / DAY;
      const ok = gap === 15 && v1.lastScore === 4 && v2.lastScore === null && v2.reviews.length === 0 &&
        P.openVendors.length === 1 && P.openVendors[0].id === 'v2';
      return { pass: ok, detail: ok ? 'v1 reviewed 15d after its due date; v2 never reviewed (openVendors=1)' : 'gap=' + gap + ' openVendors=' + P.openVendors.length };
    }],

    ['T21', 'trend discipline: below 3 measured points no trend-derived finding fires', function () {
      let seq = 0; const A = T0;
      const evs = [fev(++seq, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      function add(type, payload, at) { evs.push(fev(++seq, type, payload, { at: at })); }
      // R36 with only 2 measured campaigns (cpa 100 then 500) -> must NOT fire
      add('mktg.campaign.logged', { id: 'a1', name: 'A', channel: 'paid', budget: 100, period: 'Q1' }, A + DAY);
      add('mktg.campaign.result', { campaignId: 'a1', spend_actual: 100, conversions: 1 }, A + 2 * DAY);
      add('mktg.campaign.logged', { id: 'a2', name: 'B', channel: 'paid', budget: 500, period: 'Q1' }, A + 3 * DAY);
      add('mktg.campaign.result', { campaignId: 'a2', spend_actual: 500, conversions: 1 }, A + 4 * DAY);
      // R23 with only 2 declining periods -> threshold finding may fire, but NO slope basis
      add('fin.kpi.logged', { metric: 'gm', value: 100, unit: '%', period: 'Q1', target: 200 }, A + 5 * DAY);
      add('fin.kpi.logged', { metric: 'gm', value: 80, unit: '%', period: 'Q2', target: 200 }, A + 6 * DAY);
      const F = LeadOS.rules.run(LeadOS.engine.project(evs), A + 50 * DAY);
      const r36 = F.filter(function (f) { return f.rule === 'R36'; });
      const r23 = F.filter(function (f) { return f.rule === 'R23'; });
      const slopeLeak = r23.some(function (f) { return f.basis.some(function (l) { return l.indexOf('slope:') === 0; }); });
      const ok = r36.length === 0 && r23.length === 1 && !slopeLeak;
      return { pass: ok, detail: 'R36 with 2 points: ' + r36.length + ' findings (want 0); R23 2-point basis carries no slope line: ' + !slopeLeak };
    }],
    ['T22', 'skip-not-infer: missing fields and missing actuals produce zero findings', function () {
      let seq = 0; const A = T0;
      const evs = [fev(++seq, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      function add(type, payload, at) { evs.push(fev(++seq, type, payload, { at: at })); }
      add('sales.quota.set', { id: 'qz', personId: 'p', period: 'Q1', target: 1000, currency: 'USD' }, A + DAY);          // no actuals -> R13 silent
      add('fin.budget.set', { id: 'bz', period: 'Q1', amount: 50000, currency: 'USD', category: 'x' }, A + DAY);            // no actuals -> R22 silent
      add('fin.kpi.logged', { metric: 'no-target-kpi', value: 10, unit: '%', period: 'Q1' }, A + DAY);                      // no target -> R23 silent
      add('legal.contract.logged', { id: 'cz', counterparty: 'NoExpiry Inc', type: 'MSA' }, A + DAY);                       // no expiryDate -> R32 silent
      const F = LeadOS.rules.run(LeadOS.engine.project(evs), A + 400 * DAY);
      const hit = F.filter(function (f) { return ['R13', 'R22', 'R23', 'R32'].indexOf(f.rule) !== -1; });
      return { pass: hit.length === 0, detail: hit.length ? 'inferred something: ' + hit.map(function (f) { return f.rule; }).join(',') : 'R13/R22/R23/R32 all silent with missing inputs — nothing inferred' };
    }],
    ['T23', 'severity escalations per spec: R11 sev5, R12 sev4, R15 pattern sev4 (G28), R28/R30/R32/R35 sev5', function () {
      const F = batteryFindings();
      const want = [['R11', 5], ['R12', 4], ['R15', 4], ['R16', 4], ['R28', 5], ['R30', 5], ['R32', 5], ['R35', 5]];
      const missing = want.filter(function (w) { return !F.some(function (f) { return f.rule === w[0] && f.sev === w[1]; }); });
      return { pass: missing.length === 0, detail: missing.length ? 'missing escalations: ' + missing.map(function (w) { return w[0] + ' sev' + w[1]; }).join(', ') : want.length + ' rule/severity escalation pairs confirmed' };
    }],
    ['T24', 'coverage: every rule R1–R40 fires at least once in the seed', function () {
      const F = batteryFindings();
      const missing = LeadOS.rules.RULES.map(function (r) { return r.id; }).filter(function (id) { return !F.some(function (f) { return f.rule === id; }); });
      return { pass: missing.length === 0 && LeadOS.rules.RULES.length === 40, detail: missing.length ? 'silent rules: ' + missing.join(', ') : 'all 40 rules exercised; ' + F.length + ' total findings in battery' };
    }],
    ['T25', 'named projections: all present, aliases are identical references, open sets exclude closed, append-order wins', function () {
      let seq = 0; const A = T0;
      const evs = [fev(++seq, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      function add(type, payload, at) { evs.push(fev(++seq, type, payload, { at: at || (A + seq * 1000) })); }
      // one open + one closed entity per closable family
      add('fin.budget.set', { id: 'bOpen', period: 'Q1', amount: 1000, currency: 'USD', category: 'opex' });
      add('fin.budget.set', { id: 'bDone', period: 'Q1', amount: 2000, currency: 'USD', category: 'capex' });
      add('fin.budget.actuals', { budgetId: 'bDone', actual: 1900, period: 'Q1' });
      add('fin.risk.logged', { id: 'frOpen', title: 'open risk', severity: 3, likelihood: 3 });
      add('fin.risk.logged', { id: 'frShut', title: 'closed risk', severity: 3, likelihood: 3 });
      add('fin.risk.updated', { riskId: 'frShut', status: 'closed' });
      add('sales.deal.logged', { id: 'dOpen', title: 'open deal', value: 10, currency: 'USD', stage: 'new', ownerId: 'rep-1' });
      add('sales.deal.logged', { id: 'dShut', title: 'won deal', value: 20, currency: 'USD', stage: 'new', ownerId: 'rep-1' });
      add('sales.deal.closed', { dealId: 'dShut', result: 'won' });
      add('sales.quota.set', { id: 'qa', personId: 'rep-1', period: 'Q1', target: 100, currency: 'USD' });
      add('strategy.okr.set', { id: 'oOpen', objective: 'open okr', quarter: 'Q1', keyResults: [{ kr: 'x', target: 1, unit: 'n' }] });
      add('strategy.okr.set', { id: 'oShut', objective: 'closed okr', quarter: 'Q1', keyResults: [{ kr: 'x', target: 1, unit: 'n' }] });
      add('strategy.okr.closed', { okrId: 'oShut', score: 0.9 });
      add('ops.milestone.set', { id: 'mOpen', title: 'open ms', dueDate: A + DAY, dependsOn: [] });
      add('ops.milestone.set', { id: 'mShut', title: 'done ms', dueDate: A + DAY, dependsOn: [] });
      add('ops.milestone.updated', { milestoneId: 'mShut', status: 'done' });
      add('ops.incident.logged', { id: 'iOpen', title: 'open inc', severity: 3, systems: ['api'], startedAt: A });
      add('ops.incident.logged', { id: 'iShut', title: 'closed inc', severity: 3, systems: ['api'], startedAt: A });
      add('ops.incident.resolved', { incidentId: 'iShut', resolvedAt: A + 1000, actions: ['fix'] });
      add('ops.sla.logged', { metric: 'uptime', target: 99, actual: 98, period: 'P1', met: false });
      add('ops.sla.logged', { metric: 'uptime', target: 99, actual: 99.5, period: 'P2', met: true });
      add('hr.pip.started', { id: 'pOpen', personId: 'u1', duration_days: 30, goals: ['g'] });
      add('hr.pip.started', { id: 'pShut', personId: 'u2', duration_days: 30, goals: ['g'] });
      add('hr.pip.closed', { pipId: 'pShut', result: 'improved' });
      add('hr.attrition.logged', { personId: 'u9', reason: 'voluntary' });
      add('hr.engagement.logged', { score: 7, period: 'Q1', respondents: 10 });
      add('fin.kpi.logged', { metric: 'gm', value: 1, unit: '%', period: 'P1' });
      add('fin.kpi.logged', { metric: 'gm', value: 2, unit: '%', period: 'P2' });
      add('fin.forecast.logged', { period: 'Q1', revenue: 1, cost: 1, margin: 0, confidence: 0.5 });
      add('supply.vendor.logged', { id: 'vOpen', name: 'Unreviewed', category: 'c', tier: 1, risk_level: 2 });
      add('supply.vendor.logged', { id: 'vSeen', name: 'Reviewed', category: 'c', tier: 1, risk_level: 2 });
      add('supply.vendor.reviewed', { vendorId: 'vSeen', score: 4 });
      add('supply.disruption.logged', { description: 'delay', severity: 2 });
      add('mfg.yield.logged', { period: 'P1', yield_pct: 95 });
      add('mfg.safety.incident', { severity: 1, type: 'slip', description: 'wet floor', corrective_actions: [], date: A });
      add('mfg.equipment.logged', { assetId: 'press-1', status: 'down' });
      add('mfg.equipment.logged', { assetId: 'press-1', status: 'operational' });   // append-order wins
      add('legal.compliance.check', { framework: 'SOC2', period: 'H1', result: 'pass', findings: [] });
      add('legal.risk.logged', { title: 'legal risk without id', severity: 2, area: 'privacy' });
      add('legal.contract.logged', { id: 'ctA', counterparty: 'Alpha', type: 'MSA' });
      add('legal.contract.logged', { id: 'ctB', counterparty: 'Beta', type: 'MSA' });
      add('legal.contract.updated', { contractId: 'ctB', status: 'terminated' });
      add('cs.nps.logged', { score: 10, period: 'Q1', promoters: 1, passives: 1, detractors: 1 });
      add('cs.churn.logged', { period: 'Q1', churned: 1, total: 100 });
      add('cs.escalation.logged', { id: 'eOpen', accountName: 'Acme', severity: 3, description: 'x' });
      add('cs.escalation.logged', { id: 'eShut', accountName: 'Beta', severity: 3, description: 'y' });
      add('cs.escalation.resolved', { escalationId: 'eShut', resolution: 'fixed' });
      add('mktg.campaign.logged', { id: 'cmp1', name: 'C', channel: 'paid', budget: 10, period: 'Q1' });
      add('rd.tech.debt.logged', { id: 'tdOpen', title: 'open debt', severity: 2, effort: 2 });
      add('rd.tech.debt.logged', { id: 'tdShut', title: 'closed debt', severity: 2, effort: 2 });
      add('rd.tech.debt.resolved', { debtId: 'tdShut' });
      add('rd.experiment.logged', { id: 'exOpen', hypothesis: 'h1', method: 'A/B', startDate: A });
      add('rd.experiment.logged', { id: 'exShut', hypothesis: 'h2', method: 'A/B', startDate: A });
      add('rd.experiment.result', { experimentId: 'exShut', result: 'validated', learnings: ['l'] });
      add('exec.board.meeting', { date: A, quorum: true, items: [], decisions: [] });
      add('exec.kpi.reviewed', { period: 'Q1', metrics: [{ name: 'ARR', value: 1 }] });
      const P = LeadOS.engine.project(evs);

      const required = ['budgetById', 'openBudgets', 'riskById', 'openRisks', 'dealById', 'openDeals', 'dealsByPerson', 'quotaByPerson',
        'okrById', 'openOkrs', 'milestoneById', 'openMilestones', 'incidentById', 'openIncidents', 'slaByMetric',
        'attritionEvents', 'engagementHistory', 'pipById', 'openPips', 'kpiByMetric', 'forecastHistory',
        'vendorById', 'openVendors', 'disruptionEvents', 'yieldHistory', 'safetyIncidents', 'equipmentById',
        'complianceByFramework', 'legalRiskById', 'contractById', 'npsHistory', 'churnHistory', 'openEscalations',
        'campaignById', 'techDebtById', 'openTechDebt', 'experimentById', 'openExperiments', 'boardMeetings', 'execKpiReviews'];
      const missing = required.filter(function (k) { return P[k] === undefined; });

      const ids = function (arr) { return arr.map(function (x) { return x.id; }).sort().join(','); };
      const checks = [
        ['aliases are the same reference, not copies', P.budgetById === P.finBudgets && P.dealById === P.deals && P.okrById === P.okrs && P.equipmentById === P.equipment],
        ['openBudgets = unreconciled only', ids(P.openBudgets) === 'bOpen'],
        ['openRisks excludes closed', ids(P.openRisks) === 'frOpen'],
        ['openDeals excludes won', ids(P.openDeals) === 'dOpen'],
        ['openOkrs excludes scored', ids(P.openOkrs) === 'oOpen'],
        ['openMilestones excludes done', ids(P.openMilestones) === 'mOpen'],
        ['openIncidents excludes resolved', ids(P.openIncidents) === 'iOpen'],
        ['openPips excludes closed', ids(P.openPips) === 'pOpen'],
        ['openVendors = never reviewed', ids(P.openVendors) === 'vOpen'],
        ['openEscalations excludes resolved', ids(P.openEscalations) === 'eOpen'],
        ['openTechDebt excludes resolved', ids(P.openTechDebt) === 'tdOpen'],
        ['openExperiments excludes concluded', ids(P.openExperiments) === 'exOpen'],
        ['openContracts excludes terminated', ids(P.openContracts) === 'ctA'],
        ['append-order wins on overwrite', P.equipmentById['press-1'].status === 'operational'],
        ['slaByMetric groups in append order', P.slaByMetric.uptime.length === 2 && P.slaByMetric.uptime[0].period === 'P1'],
        ['kpiByMetric groups in append order', P.kpiByMetric.gm.length === 2 && P.kpiByMetric.gm[1].value === 2],
        ['complianceByFramework grouped', P.complianceByFramework.SOC2.length === 1],
        ['legalRiskById keyed by event id', Object.keys(P.legalRiskById).length === 1],
        ['dealsByPerson grouped', P.dealsByPerson['rep-1'].length === 2],
        ['quotaByPerson grouped', P.quotaByPerson['rep-1'].length === 1],
        ['history projections carry entries', P.engagementHistory.length === 1 && P.npsHistory.length === 1 && P.churnHistory.length === 1 && P.yieldHistory.length === 1 && P.forecastHistory.length === 1 && P.attritionEvents.length === 1 && P.disruptionEvents.length === 1 && P.safetyIncidents.length === 1 && P.boardMeetings.length === 1 && P.execKpiReviews.length === 1]
      ];
      const failed = checks.filter(function (c) { return !c[1]; }).map(function (c) { return c[0]; });
      const ok = missing.length === 0 && failed.length === 0;
      return { pass: ok, detail: ok ? required.length + ' named projections present; ' + checks.length + ' structural assertions hold' : (missing.length ? 'missing: ' + missing.join(', ') + ' | ' : '') + 'failed: ' + failed.join('; ') };
    }],
    ['T26', 'interactive playbooks: 14 present, prefill pure, fields declared, submit emits registry-valid events', function () {
      const REQUIRED = ['risk-review', 'deal-review', 'quota-review', 'okr-checkin', 'incident-review', 'attrition-review', 'budget-review', 'vendor-review', 'safety-review', 'compliance-review', 'churn-review', 'tech-debt-sprint', 'board-prep', 'experiment-debrief'];
      const have = LeadOS.playbooks.INTERACTIVE.map(function (p) { return p.id; });
      const missingPb = REQUIRED.filter(function (id) { return have.indexOf(id) === -1; });
      if (missingPb.length) return { pass: false, detail: 'missing playbooks: ' + missingPb.join(', ') };

      // battery: at least one eligible target for every playbook
      let seq = 0; const A = T0, today = A + 100 * DAY;
      const evs = [fev(++seq, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      function add(type, payload, at) { evs.push(fev(++seq, type, payload, { at: at || (A + seq * 1000) })); }
      add('fin.risk.logged', { id: 'fr1', title: 'Runway', severity: 4, likelihood: 4, reviewDate: A + 10 * DAY });
      add('legal.contract.logged', { id: 'ct1', counterparty: 'Alpha', type: 'MSA', expiryDate: A + 110 * DAY });
      add('legal.risk.logged', { title: 'GDPR', severity: 3, area: 'privacy' });
      add('sales.deal.logged', { id: 'd1', title: 'Acme', value: 50000, currency: 'USD', stage: 'proposal', closeDate: A + 40 * DAY });
      add('sales.quota.set', { id: 'q1', personId: 'rep-1', period: 'Q3', target: 1000, currency: 'USD' });
      add('sales.quota.actuals', { quotaId: 'q1', actual: 400, period: 'Q3' });
      add('strategy.okr.set', { id: 'ok1', objective: 'Land mid-market', quarter: 'Q3', keyResults: [{ kr: 'Logos', target: 30, unit: 'count' }, { kr: 'ACV', target: 50, unit: 'k' }] });
      add('ops.incident.logged', { id: 'in1', title: 'DB saturation', severity: 4, systems: ['db'], startedAt: A + 90 * DAY });
      add('hr.attrition.logged', { personId: 'u-1', reason: 'voluntary' }, A + 70 * DAY);
      add('hr.attrition.logged', { personId: 'u-2', reason: 'involuntary' }, A + 80 * DAY);
      add('hr.engagement.logged', { score: 6, period: 'H1', respondents: 40 }, A + 60 * DAY);
      add('fin.budget.set', { id: 'b1', period: 'Q2', amount: 100000, currency: 'USD', category: 'opex' });
      add('fin.budget.actuals', { budgetId: 'b1', actual: 60000, period: 'Q2' });
      add('supply.vendor.logged', { id: 'v1', name: 'FabCo', category: 'comp', tier: 1, risk_level: 5, reviewDate: A + 20 * DAY });
      add('supply.disruption.logged', { vendorId: 'v1', description: 'fire', severity: 4 });
      add('mfg.safety.incident', { severity: 3, type: 'cut', description: 'blade guard', corrective_actions: [], date: A + 85 * DAY });
      add('legal.compliance.check', { framework: 'SOC2', period: 'H1', result: 'finding', findings: ['access review'] });
      add('cs.churn.logged', { period: 'Q3', churned: 8, total: 100 });
      add('cs.nps.logged', { score: 20, period: 'Q3', promoters: 40, passives: 40, detractors: 20 });
      add('rd.tech.debt.logged', { id: 'td1', title: 'Legacy auth', severity: 4, effort: 5 });
      add('rd.tech.debt.logged', { id: 'td2', title: 'Sync layer', severity: 3, effort: 4 });
      add('rd.experiment.logged', { id: 'ex1', hypothesis: 'Pricing lift', method: 'A/B', startDate: A + 10 * DAY, reviewDate: A + 30 * DAY });
      add('exec.kpi.reviewed', { period: 'Q2', metrics: [{ name: 'ARR', value: 100, target: 120, trend: 'flat' }] }, A + 50 * DAY);
      add('exec.board.meeting', { date: A + 5 * DAY, quorum: true, items: ['Q1'], decisions: ['approve'] }, A + 5 * DAY);

      const P = LeadOS.engine.project(evs);
      const snapshot = JSON.stringify(P);
      const problems = [];

      function synth(f) {
        if (f.type === 'checkbox') return true;
        if (f.type === 'multiselect') return (f.options || []).map(function (o) { return o.value; });
        if (f.type === 'lines') return ['action one', 'action two'];
        if (f.type === 'number') return (typeof f.value === 'number') ? f.value : 1;
        if (f.type === 'date') return (typeof f.value === 'number') ? f.value : today;
        if (f.type === 'select') return f.value || (f.options && f.options[0]);
        return (typeof f.value === 'string' && f.value) ? f.value : 'recorded during review';
      }

      LeadOS.playbooks.INTERACTIVE.forEach(function (pb) {
        const cands = pb.candidates(P) || [];
        if (!cands.length) { problems.push(pb.id + ': no candidate in battery'); return; }
        const ctx = { today: today, targetId: cands[0].id, settings: LeadOS.engine.settings(P) };
        const pre = pb.prefill(ctx, P);
        if (!pre || pre.ok !== true) { problems.push(pb.id + ': prefill not ok'); return; }
        if (!Array.isArray(pre.facts) || !pre.facts.length) problems.push(pb.id + ': prefill returned no facts');
        if (!Array.isArray(pre.missing)) problems.push(pb.id + ': prefill missing[] absent');
        const fields = pb.fields(pre);
        if (!Array.isArray(fields) || !fields.length) { problems.push(pb.id + ': no fields declared'); return; }
        fields.forEach(function (f) {
          if (!f.name || !f.label || !f.type) problems.push(pb.id + ': field missing name/label/type');
          if (f.recommended && !f.source) problems.push(pb.id + '.' + f.name + ': recommended value is not labeled with a source');
        });
        const v = {};
        fields.forEach(function (f) { v[f.name] = synth(f); });
        let specs;
        try { specs = pb.submit(v, ctx, pre); }
        catch (e) { problems.push(pb.id + ': submit threw ' + e.message); return; }
        if (!Array.isArray(specs) || !specs.length) { problems.push(pb.id + ': submit produced no events'); return; }
        specs.forEach(function (s) {
          const verdict = LeadOS.events.validate(s.type, s.payload);
          if (!verdict.ok) problems.push(pb.id + ' -> ' + s.type + ': ' + verdict.errors[0]);
        });
      });
      if (JSON.stringify(P) !== snapshot) problems.push('prefill/submit mutated the projection');
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : REQUIRED.length + ' playbooks: prefill pure, fields labeled, submit output registry-valid' };
    }],
    ['T27', 'UI contract: every route has a view, quick-capture forms produce registry-valid payloads, roster derives from the log', function () {
      const problems = [];
      const UI = LeadOS.ui;
      if (!UI) return { pass: false, detail: 'ui module not loaded' };

      // (a) routes <-> views
      ['today', 'signals', 'playbooks', 'finance', 'sales', 'ops', 'strategy', 'domains', 'roster', 'cadences', 'decisions', 'risks', 'data', 'health'].forEach(function (id) {
        if (UI.ROUTE_IDS.indexOf(id) === -1) problems.push('route missing: ' + id);
        if (typeof UI.VIEWS[id] !== 'function') problems.push('no view for route ' + id);
      });
      // (b) filter chips + domain tabs resolve to real domains
      UI.FILTERS.forEach(function (f) { if (f[1] !== null && LeadOS.events.DOMAIN_IDS.indexOf(f[1]) === -1) problems.push('filter chip ' + f[0] + ' -> unknown domain ' + f[1]); });
      UI.DOMAIN_TABS.forEach(function (t) {
        if (LeadOS.events.DOMAIN_IDS.indexOf(t[0]) === -1) problems.push('domain tab -> unknown domain ' + t[0]);
        if (!Object.keys(LeadOS.events.REGISTRY).some(function (x) { return x.indexOf(t[2]) === 0; })) problems.push('domain tab ' + t[1] + ' prefix matches no event type');
      });

      // (c) quick capture: drive the REAL form builder with synthetic input
      const PREFIXES = ['fin.', 'sales.', 'ops.', 'product.', 'strategy.', 'hr.', 'mktg.', 'mfg.', 'supply.', 'design.', 'rd.', 'legal.', 'cs.', 'exec.'];
      const captured = Object.keys(LeadOS.events.REGISTRY).filter(function (t) { return PREFIXES.some(function (p) { return t.indexOf(p) === 0; }); });
      const isoDay = new Date(T0 + 50 * DAY).toISOString().slice(0, 10);
      captured.forEach(function (type) {
        const fields = UI.captureFields(type);
        const spec = LeadOS.events.REGISTRY[type];
        spec.require.forEach(function (r) {
          if (r === 'id') return;
          if (!fields.some(function (f) { return f.name === r; })) problems.push(type + ': required field ' + r + ' has no form control');
        });
        const form = document.createElement('form');
        fields.forEach(function (f) {
          let el;
          if (f.kind === 'bool') { el = document.createElement('input'); el.type = 'checkbox'; el.checked = true; }
          else if (f.kind === 'lines') {
            el = document.createElement('textarea');
            el.value = (type === 'strategy.okr.set') ? 'New logos | 30 | count'
              : (type === 'exec.kpi.reviewed') ? 'ARR | 4200000 | 4000000 | up'
                : 'line one\nline two';
          } else {
            el = document.createElement('input');
            if (f.kind === 'date') el.value = isoDay;
            else if (f.kind === 'num') el.value = String(f.range ? f.range[0] : 1);
            else if (f.kind === 'select') el.value = f.options[0];
            else el.value = 'synthetic';
          }
          el.name = f.name;
          form.appendChild(el);
        });
        let payload;
        try { payload = UI.buildCapturePayload(form, type); }
        catch (e) { problems.push(type + ': capture builder threw ' + e.message); return; }
        const verdict = LeadOS.events.validate(type, payload);
        if (!verdict.ok) problems.push(type + ' capture -> ' + verdict.errors[0]);
      });

      // (d) roster + event-domain mapping over a fixture log
      let seq = 0; const A = T0;
      const evs = [fev(++seq, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
      function add(t, p) { evs.push(fev(++seq, t, p, { at: A + seq * 1000 })); }
      add('sales.quota.set', { id: 'q1', personId: 'rep-1', period: 'Q3', target: 100, currency: 'USD' });
      add('sales.quota.actuals', { quotaId: 'q1', actual: 40, period: 'Q3' });
      add('sales.deal.logged', { id: 'd1', title: 'Acme', value: 10, currency: 'USD', stage: 'new', ownerId: 'rep-1' });
      add('hr.performance.logged', { personId: 'rep-1', rating: 'meets', period: 'H1' });
      add('hr.pip.started', { id: 'p1', personId: 'u-2', duration_days: 30, goals: ['ship'] });
      add('hr.compensation.reviewed', { personId: 'rep-1', changeType: 'raise' });
      add('hr.attrition.logged', { personId: 'u-3', reason: 'voluntary' });
      add('objective.created', { id: 'o1', domain: 'design', title: 'Systematize' });
      add('kr.created', { id: 'k1', objectiveId: 'o1', title: 'coverage', target: 80, unit: '%' });
      add('kr.progressLogged', { id: 'k1', value: 40 });
      const P = LeadOS.engine.project(evs);
      const r = P.rosterById;
      if (!r['rep-1'] || r['rep-1'].quotas.length !== 1 || r['rep-1'].deals.length !== 1 || r['rep-1'].performance.length !== 1 || r['rep-1'].compensation.length !== 1) problems.push('roster: rep-1 dossier incomplete');
      if (!r['rep-1'] || r['rep-1'].isSales !== true) problems.push('roster: sales role not detected');
      if (!r['u-2'] || r['u-2'].openPips.length !== 1) problems.push('roster: open PIP not tracked');
      if (!r['u-3'] || r['u-3'].departed !== true) problems.push('roster: departure not tracked');
      if (Object.keys(r).length !== 3) problems.push('roster invented or dropped people: ' + Object.keys(r).join(','));
      evs.forEach(function (ev) {
        const d = LeadOS.engine.eventDomain(ev, P);
        if (d !== null && LeadOS.events.DOMAIN_IDS.indexOf(d) === -1) problems.push('eventDomain produced unknown domain ' + d + ' for ' + ev.type);
      });
      if (LeadOS.engine.eventDomain(evs[evs.length - 1], P) !== 'design') problems.push('kr.progressLogged did not resolve its domain through the parent objective');
      if (LeadOS.engine.eventDomain(evs[0], P) !== null) problems.push('store.initialized should be domain-less, not guessed');

      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : UI.ROUTE_IDS.length + ' routes wired; ' + captured.length + ' capture forms registry-valid; roster + domain mapping exact' };
    }]
  ];

  // ---------- G-suite (live store) ----------
  const G = [
    ['G1', 'exactly one LeadOS localStorage key exists: leados:data', function () {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('leados') === 0) keys.push(k); }
      const ok = keys.length === 1 && keys[0] === LeadOS.store.KEY;
      return { pass: ok, detail: ok ? 'namespace holds only leados:data' : 'unexpected keys: ' + keys.join(', ') };
    }],
    ['G2', 'schemaVersion is 4 and lineage is pt', function () {
      const raw = LeadOS.store.load();
      const ok = raw.schemaVersion === 4 && raw.meta.lineage === 'pt' && LeadOS.store.LINEAGE_TAG === 'pt-4';
      return { pass: ok, detail: 'schemaVersion=' + raw.schemaVersion + ', lineage=' + raw.meta.lineage + ', tag=' + LeadOS.store.LINEAGE_TAG };
    }],
    ['G3', 'append-only integrity: contiguous seq, unique ids, monotonic time, every event registry-valid', function () {
      const raw = LeadOS.store.load();
      const ids = {}, problems = [];
      let lastAt = -Infinity;
      raw.events.forEach(function (e, i) {
        if (e.seq !== i + 1) problems.push('seq gap at index ' + i);
        if (ids[e.id]) problems.push('duplicate id ' + e.id); ids[e.id] = true;
        if (e.at < lastAt) problems.push('time moved backwards at ' + e.id); lastAt = e.at;
        const verdict = LeadOS.events.validate(e.type, e.payload);
        if (!verdict.ok) problems.push(e.id + ': ' + verdict.errors[0]);
      });
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : raw.events.length + ' events verified against the registry' };
    }],
    ['G4', 'nothing derived is persisted: root and meta keys inside whitelist', function () {
      const raw = LeadOS.store.load();
      const rootBad = Object.keys(raw).filter(function (k) { return LeadOS.store.RAW_ROOT_WHITELIST.indexOf(k) === -1; });
      const metaBad = Object.keys(raw.meta).filter(function (k) { return LeadOS.store.META_WHITELIST.indexOf(k) === -1; });
      const ok = rootBad.length === 0 && metaBad.length === 0;
      return { pass: ok, detail: ok ? 'payload shape clean: only schemaVersion, meta, events' : 'rogue keys: ' + rootBad.concat(metaBad).join(', ') };
    }],
    ['G5', 'live projection contains all five v4 settings as positive numbers', function () {
      const state = LeadOS.engine.project(LeadOS.store.load().events);
      const set = LeadOS.engine.settings(state);
      const bad = LeadOS.store.V4_NEW_KEYS.filter(function (k) { return typeof set[k] !== 'number' || !isFinite(set[k]) || set[k] <= 0; });
      return { pass: bad.length === 0, detail: bad.length ? 'bad: ' + bad.join(', ') : LeadOS.store.V4_NEW_KEYS.map(function (k) { return k + '=' + set[k]; }).join(' ') };
    }],
    ['G6', 'repair accounting consistent: migrationRepairs matches repair events; migrations ordered', function () {
      const raw = LeadOS.store.load();
      const problems = [];
      Object.keys(raw.meta.migrationRepairs).forEach(function (id) {
        const inLog = raw.events.filter(function (e) { return e.meta && e.meta.repair && e.meta.migration === id; }).length;
        if (raw.meta.migrationRepairs[id] !== inLog) problems.push(id + ': meta=' + raw.meta.migrationRepairs[id] + ' log=' + inLog);
      });
      let prev = 0;
      raw.meta.migrationsApplied.forEach(function (id) {
        const from = parseInt(id.split('>')[0], 10);
        if (isNaN(from) || from <= prev) problems.push('migration order broken at ' + id);
        prev = from;
      });
      return { pass: problems.length === 0, detail: problems.length ? problems.join(' | ') : 'applied=[' + raw.meta.migrationsApplied.join(', ') + '], repairs=' + JSON.stringify(raw.meta.migrationRepairs) };
    }],
    ['G7', 'projection is pure against the live log: two reads identical, log untouched', function () {
      const raw = LeadOS.store.load();
      const before = JSON.stringify(raw.events);
      const a = JSON.stringify(LeadOS.engine.project(raw.events));
      const b = JSON.stringify(LeadOS.engine.project(raw.events));
      const ok = a === b && JSON.stringify(raw.events) === before;
      return { pass: ok, detail: ok ? 'deterministic, non-mutating read over ' + raw.events.length + ' events' : 'projection impurity detected' };
    }],
    ['G8', 'referential integrity: every declared *Id reference resolves to an entity in the log', function () {
      const raw = LeadOS.store.load();
      const ids = LeadOS.engine.knownIds(LeadOS.engine.project(raw.events));
      const problems = [];
      function check(ev, field, family, value) {
        if (value === undefined || value === null) return;
        const universe = ids[family];
        if (!universe) { problems.push('unknown ref family ' + family + ' in ' + ev.type); return; }
        if (universe.indexOf(value) === -1) problems.push(ev.id + ' ' + ev.type + ': ' + field + '=' + value + ' not in ' + family);
      }
      raw.events.forEach(function (ev) {
        const spec = LeadOS.events.REGISTRY[ev.type];
        if (!spec) return;
        if (spec.refs) Object.keys(spec.refs).forEach(function (f) { check(ev, f, spec.refs[f], ev.payload[f]); });
        if (spec.refArrays) Object.keys(spec.refArrays).forEach(function (f) { (ev.payload[f] || []).forEach(function (v) { check(ev, f, spec.refArrays[f], v); }); });
      });
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : 'all references resolve across ' + raw.events.length + ' events' };
    }],
    ['G9', 'rules engine over the live log: runs clean, findings shape-valid, playbooks resolvable, P unmutated', function () {
      const P = LeadOS.engine.project(LeadOS.store.load().events);
      const before = JSON.stringify(P);
      const F = LeadOS.rules.run(P, Date.now());
      const plays = {};
      LeadOS.playbooks.PLAYBOOKS.forEach(function (pb) { plays['playbook:' + pb.domain] = true; });
      const bad = F.filter(function (f) {
        return !shapeOk(f) || (f.play && !plays[f.play] && LeadOS.rules.PLAY_IDS.indexOf(f.play) === -1);
      });
      const ok = bad.length === 0 && JSON.stringify(P) === before;
      const perRule = {};
      F.forEach(function (f) { perRule[f.rule] = (perRule[f.rule] || 0) + 1; });
      return { pass: ok, detail: ok ? F.length + ' live findings across ' + Object.keys(perRule).length + ' rules; every play id resolves to a real playbook' : 'bad findings: ' + bad.slice(0, 2).map(function (f) { return f.rule + ':' + (f.play || f.playNone); }).join(' | ') };
    }],
    ['G10', 'named projections live: all present, open sets subset their entity map, none of it persisted', function () {
      const raw = LeadOS.store.load();
      const P = LeadOS.engine.project(raw.events);
      const problems = [];
      LeadOS.engine.NAMED_PROJECTIONS.forEach(function (k) { if (P[k] === undefined) problems.push('missing projection ' + k); });
      // every open* entry must be the very object held in its entity map
      Object.keys(LeadOS.engine.OPEN_SETS).forEach(function (name) {
        const src = P[LeadOS.engine.OPEN_SETS[name][0]];
        (P[name] || []).forEach(function (item) {
          const key = item.id || item.assetId;
          if (src[key] !== item) problems.push(name + ': entry ' + key + ' is a copy, not the live entity');
        });
      });
      // aliases must be reference-identical to their source bucket
      Object.keys(LeadOS.engine.ALIASES).forEach(function (name) {
        if (P[name] !== P[LeadOS.engine.ALIASES[name]]) problems.push('alias ' + name + ' diverged from ' + LeadOS.engine.ALIASES[name]);
      });
      // and nothing derived may appear in the persisted payload
      const persisted = Object.keys(raw).concat(Object.keys(raw.meta));
      LeadOS.engine.NAMED_PROJECTIONS.forEach(function (k) { if (persisted.indexOf(k) !== -1) problems.push('projection ' + k + ' leaked into storage'); });
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : LeadOS.engine.NAMED_PROJECTIONS.length + ' projections derived per read; zero leaked into leados:data' };
    }],
    ['G11', 'playbooks over the live log: rules all covered, prefill honest, recommendations labeled, no mutation', function () {
      const P = LeadOS.engine.project(LeadOS.store.load().events);
      const before = JSON.stringify(P);
      const problems = [];
      const ruleIds = LeadOS.rules.RULES.map(function (r) { return r.id; });
      LeadOS.playbooks.INTERACTIVE.forEach(function (pb) {
        pb.forRules.forEach(function (r) { if (ruleIds.indexOf(r) === -1) problems.push(pb.id + ': declares unknown rule ' + r); });
        let cands;
        try { cands = pb.candidates(P) || []; } catch (e) { problems.push(pb.id + ': candidates threw ' + e.message); return; }
        if (!cands.length) return;                       // nothing to review is a valid live state
        try {
          const pre = pb.prefill({ today: Date.now(), targetId: cands[0].id, settings: LeadOS.engine.settings(P) }, P);
          if (!pre || typeof pre.ok !== 'boolean') { problems.push(pb.id + ': prefill returned no verdict'); return; }
          if (pre.ok) {
            pb.fields(pre).forEach(function (f) {
              if (f.recommended && !f.source) problems.push(pb.id + '.' + f.name + ': unlabeled recommendation');
            });
          }
        } catch (e) { problems.push(pb.id + ': prefill threw ' + e.message); }
      });
      if (JSON.stringify(P) !== before) problems.push('a playbook mutated the live projection');
      const covered = {};
      LeadOS.playbooks.INTERACTIVE.forEach(function (pb) { pb.forRules.forEach(function (r) { covered[r] = true; }); });
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : LeadOS.playbooks.INTERACTIVE.length + ' playbooks cover ' + Object.keys(covered).length + ' rules; all recommendations carry a source' };
    }],
    ['G12', 'live UI state: view state confined to sessionStorage, every live event maps to a domain or honest system', function () {
      const problems = [];
      // view state must never appear in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.indexOf('leados') === 0 && k !== LeadOS.store.KEY) problems.push('view state leaked into localStorage: ' + k);
      }
      const raw = LeadOS.store.load();
      if (JSON.stringify(raw).indexOf('leados:ui') !== -1) problems.push('ui state key found inside the event log');
      // no UI-only concepts persisted as events
      raw.events.forEach(function (ev) { if (ev.type.indexOf('ui.') === 0 || ev.type.indexOf('view.') === 0) problems.push('UI event persisted: ' + ev.type); });
      // domain resolution is total and honest over the live log
      const P = LeadOS.engine.project(raw.events);
      let domained = 0, systemic = 0;
      raw.events.forEach(function (ev) {
        let d;
        try { d = LeadOS.engine.eventDomain(ev, P); }
        catch (e) { problems.push('eventDomain threw on ' + ev.type); return; }
        if (d === null) { systemic++; return; }
        if (LeadOS.events.DOMAIN_IDS.indexOf(d) === -1) problems.push(ev.type + ' -> unknown domain ' + d);
        domained++;
      });
      // every finding is filterable by the Today chips
      LeadOS.rules.run(P, Date.now()).forEach(function (f) {
        if (f.play) {
          const d = String(f.play).replace('playbook:', '');
          if (LeadOS.events.DOMAIN_IDS.indexOf(d) === -1) problems.push('finding ' + f.rule + ' carries unfilterable playbook ' + f.play);
        }
      });
      return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 3).join(' | ') : domained + ' events domain-mapped, ' + systemic + ' honestly system; sessionStorage state never touches leados:data' };
    }]
  ];

  /* ================= G14-G30: rule-boundary GOLDENS =================
     Deterministic scenarios pinned to T0. These prove the exact fire/quiet
     boundaries of the rules engine. They are part of the full suite; the boot
     gate deliberately runs only the live-store checks G1-G12, so a rule-logic
     regression surfaces loudly in Health without bricking a leader's data.
     G13 is intentionally unallocated (the brief numbers from G14). */
  const A = T0;
  function evsOf(rows) {
    let s = 0;
    const out = [fev(++s, 'store.initialized', { schemaVersion: 4, lineageTag: 'pt-4' }, { at: A })];
    rows.forEach(function (r) { out.push(fev(++s, r[0], r[1], { at: A + (r[2] || 0) * DAY })); });
    return out;
  }
  // run rule `id` over rows, with `today` expressed in days from T0
  function R(rows, todayDays, id) {
    return LeadOS.rules.run(LeadOS.engine.project(evsOf(rows)), A + todayDays * DAY)
      .filter(function (f) { return f.rule === id; });
  }
  const sevs = function (fs) { return fs.map(function (f) { return f.sev; }).sort().join(','); };
  function golden(cases) {
    const bad = cases.filter(function (c) { return !c[1]; }).map(function (c) { return c[0]; });
    return { pass: bad.length === 0, detail: bad.length ? 'failed: ' + bad.join(' | ') : cases.length + ' boundary cases hold: ' + cases.map(function (c) { return c[0]; }).join(' · ') };
  }

  const GOLDENS = [
    ['G14', 'R11 financial risk review: past due fires HIGH; resolved quiets; update before reviewDate does not count', function () {
      const base = [['fin.risk.logged', { id: 'fr1', title: 'Runway', severity: 4, likelihood: 4, reviewDate: A + 10 * DAY }, 0]];
      const fires = R(base, 20, 'R11');
      const quiet = R(base.concat([['fin.risk.updated', { riskId: 'fr1', status: 'mitigated' }, 12]]), 20, 'R11');
      const early = R(base.concat([['fin.risk.updated', { riskId: 'fr1', status: 'mitigated' }, 5]]), 20, 'R11');
      const notYet = R(base, 9, 'R11');
      return golden([
        ['past due fires sev5 HIGH', fires.length === 1 && fires[0].sev === 5 && fires[0].conf === 'HIGH'],
        ['mitigated on/after reviewDate quiets', quiet.length === 0],
        ['update before reviewDate does NOT count', early.length === 1],
        ['before reviewDate quiet', notYet.length === 0]
      ]);
    }],
    ['G15', 'R12 deal stale: closeDate+1 fires sev3; update after closeDate quiets; >30d past escalates to sev4', function () {
      const base = [['sales.deal.logged', { id: 'd1', title: 'Acme', value: 50000, currency: 'USD', stage: 'proposal', closeDate: A + 10 * DAY }, 0]];
      return golden([
        ['closeDate+1 fires sev3', (function () { const f = R(base, 11, 'R12'); return f.length === 1 && f[0].sev === 3; })()],
        ['on closeDate quiet', R(base, 10, 'R12').length === 0],
        ['updated after closeDate quiets', R(base.concat([['sales.deal.updated', { dealId: 'd1', stage: 'negotiation' }, 11]]), 15, 'R12').length === 0],
        ['31d past fires sev4', (function () { const f = R(base, 41, 'R12'); return f.length === 1 && f[0].sev === 4; })()],
        ['closed deal quiet', R(base.concat([['sales.deal.closed', { dealId: 'd1', result: 'won' }, 11]]), 60, 'R12').length === 0]
      ]);
    }],
    ['G16', 'R13 quota: <70% sev3, <50% sev4, missing actuals skip, 100% quiet', function () {
      const q = function (actual) {
        const rows = [['sales.quota.set', { id: 'q1', personId: 'rep', period: 'Q3', target: 1000, currency: 'USD' }, 0]];
        if (actual !== null) rows.push(['sales.quota.actuals', { quotaId: 'q1', actual: actual, period: 'Q3' }, 5]);
        return R(rows, 10, 'R13');
      };
      return golden([
        ['65% fires sev3', (function () { const f = q(650); return f.length === 1 && f[0].sev === 3; })()],
        ['40% fires sev4', (function () { const f = q(400); return f.length === 1 && f[0].sev === 4; })()],
        ['exactly 70% quiet', q(700).length === 0],
        ['100% quiet', q(1000).length === 0],
        ['missing actuals skip', q(null).length === 0]
      ]);
    }],
    ['G17', 'R14 OKR silence: 21d quiet, 22d fires, closed OKR quiet regardless', function () {
      const base = [['strategy.okr.set', { id: 'o1', objective: 'Grow', quarter: 'Q3', keyResults: [{ kr: 'x', target: 1, unit: 'n' }] }, 0]];
      const closed = base.concat([['strategy.okr.closed', { okrId: 'o1', score: 0.8 }, 5]]);
      const progressed = base.concat([['strategy.okr.progress', { okrId: 'o1', krIndex: 0, current: 1 }, 30]]);
      return golden([
        ['exactly 21d quiet', R(base, 21, 'R14').length === 0],
        ['22d fires sev2', (function () { const f = R(base, 22, 'R14'); return f.length === 1 && f[0].sev === 2; })()],
        ['43d fires sev3', (function () { const f = R(base, 43, 'R14'); return f.length === 1 && f[0].sev === 3; })()],
        ['closed OKR quiet at 100d', R(closed, 100, 'R14').length === 0],
        ['progress logged quiets', R(progressed, 100, 'R14').length === 0]
      ]);
    }],
    ['G18', 'R16 MTTR: sev4 resolved in 3h quiet, unresolved 5h fires, math printed in basis', function () {
      const H = 3600000;
      const inc = function (sev) { return ['ops.incident.logged', { id: 'i1', title: 'X', severity: sev, systems: ['api'], startedAt: A }, 0]; };
      const fast = R([inc(4), ['ops.incident.resolved', { incidentId: 'i1', resolvedAt: A + 3 * H, actions: ['fix'] }, 0]], 2, 'R16');
      const slow = R([inc(4), ['ops.incident.resolved', { incidentId: 'i1', resolvedAt: A + 10 * H, actions: ['fix'] }, 0]], 2, 'R16');
      const openNow = LeadOS.rules.run(LeadOS.engine.project(evsOf([inc(4)])), A + 5 * H).filter(function (f) { return f.rule === 'R16'; });
      const openEarly = LeadOS.rules.run(LeadOS.engine.project(evsOf([inc(4)])), A + 3 * H).filter(function (f) { return f.rule === 'R16'; });
      const lowSev = R([inc(2), ['ops.incident.resolved', { incidentId: 'i1', resolvedAt: A + 50 * H, actions: ['fix'] }, 3]], 5, 'R16');
      return golden([
        ['sev4 resolved 3h quiet', fast.length === 0],
        ['sev4 resolved 10h fires sev4', slow.length === 1 && slow[0].sev === 4],
        ['MTTR math printed', slow.length === 1 && /10\.0h/.test(slow[0].title) && slow[0].basis.join(' ').indexOf('threshold 4h') !== -1],
        ['sev4 unresolved 5h fires', openNow.length === 1],
        ['sev4 unresolved 3h quiet', openEarly.length === 0],
        ['sev2 resolved 50h quiet (72h threshold)', lowSev.length === 0]
      ]);
    }],
    ['G19', 'R19 attrition: 1 quiet, 2 sev3, 3 sev4, breakdown printed', function () {
      const a = function (id, reason, d) { return ['hr.attrition.logged', { personId: id, reason: reason }, d]; };
      const one = R([a('u1', 'voluntary', 10)], 30, 'R19');
      const two = R([a('u1', 'voluntary', 10), a('u2', 'involuntary', 20)], 30, 'R19');
      const three = R([a('u1', 'voluntary', 10), a('u2', 'involuntary', 20), a('u3', 'voluntary', 25)], 30, 'R19');
      const old = R([a('u1', 'voluntary', 10), a('u2', 'voluntary', 20)], 100, 'R19');
      return golden([
        ['1 departure quiet', one.length === 0],
        ['2 in 60d sev3 MEDIUM', two.length === 1 && two[0].sev === 3 && two[0].conf === 'MEDIUM'],
        ['3 in 60d sev4', three.length === 1 && three[0].sev === 4],
        ['breakdown printed', two.length === 1 && /voluntary 1 · involuntary 1/.test(two[0].basis.join(' '))],
        ['outside 60d window quiet', old.length === 0]
      ]);
    }],
    ['G20', 'R22 budget variance: 14% quiet, 16% sev3, 31% sev4, underspend fires with direction printed', function () {
      const b = function (actual) {
        return R([['fin.budget.set', { id: 'b1', period: 'Q2', amount: 100000, currency: 'USD', category: 'opex' }, 0],
          ['fin.budget.actuals', { budgetId: 'b1', actual: actual, period: 'Q2' }, 5]], 10, 'R22');
      };
      const under = b(84000);
      return golden([
        ['14% over quiet', b(114000).length === 0],
        ['16% over sev3', (function () { const f = b(116000); return f.length === 1 && f[0].sev === 3; })()],
        ['31% over sev4', (function () { const f = b(131000); return f.length === 1 && f[0].sev === 4; })()],
        ['16% under fires sev3', under.length === 1 && under[0].sev === 3],
        ['direction printed', under.length === 1 && /underspend/.test(under[0].title)],
        ['variance math printed', under.length === 1 && under[0].basis.join(' ').indexOf('math:') !== -1]
      ]);
    }],
    ['G21', 'R28 safety: single quiet, 2 in 30d sev4, ANY sev5 immediate, sev4 alone not immediate', function () {
      const inc = function (sev, d) { return ['mfg.safety.incident', { severity: sev, type: 't' + sev, description: 'd', corrective_actions: [], date: A + d * DAY }, d]; };
      const one = R([inc(2, 10)], 20, 'R28');
      const two = R([inc(2, 10), inc(3, 20)], 25, 'R28');
      const five = R([inc(5, 10)], 20, 'R28');
      const fourOnly = R([inc(4, 10)], 20, 'R28');
      const oldFive = R([inc(5, 10)], 300, 'R28');
      return golden([
        ['single sev2 quiet', one.length === 0],
        ['2 in 30d sev4', two.length === 1 && two[0].sev === 4],
        ['single sev5 fires sev5 immediately', five.length === 1 && five[0].sev === 5],
        ['single sev4 does NOT fire immediately', fourOnly.length === 0],
        ['sev5 still fires outside the 30d window', oldFive.length === 1 && oldFive[0].sev === 5]
      ]);
    }],
    ['G22', 'R30 compliance: pass quiet, finding+31d sev4, fail sev5 immediately, cadence miss sev2', function () {
      const chk = function (result, d) { return ['legal.compliance.check', { framework: 'SOC2', period: 'H1', result: result, findings: result === 'pass' ? [] : ['access review'] }, d]; };
      const pass = R([chk('pass', 0)], 30, 'R30');
      const finding30 = R([chk('finding', 0)], 30, 'R30');
      const finding31 = R([chk('finding', 0)], 31, 'R30');
      const fail = R([chk('fail', 0)], 1, 'R30');
      const cadence = R([chk('pass', 0)], 181, 'R30');
      const never = R([['task.created', { id: 't1', domain: 'legal', title: 'x' }, 0]], 181, 'R30');
      return golden([
        ['pass quiet', pass.length === 0],
        ['finding at 30d quiet', finding30.length === 0],
        ['finding at 31d sev4', finding31.length === 1 && finding31[0].sev === 4],
        ['fail sev5 immediately', fail.length === 1 && fail[0].sev === 5],
        ['cadence miss after 180d sev2', cadence.length === 1 && cadence[0].sev === 2],
        ['no check ever + aged log sev2', never.length === 1 && never[0].sev === 2]
      ]);
    }],
    ['G23', 'R32 contract expiry: 31d quiet, 29d sev3, 6d sev4, expired+active sev5', function () {
      const c = function (expiryDays, status) {
        const rows = [['legal.contract.logged', { id: 'c1', counterparty: 'Alpha', type: 'MSA', expiryDate: A + expiryDays * DAY }, 0]];
        if (status) rows.push(['legal.contract.updated', { contractId: 'c1', status: status }, 1]);
        return R(rows, 0, 'R32');
      };
      return golden([
        ['31d out quiet', c(31).length === 0],
        ['29d out sev3', (function () { const f = c(29); return f.length === 1 && f[0].sev === 3; })()],
        ['6d out sev4', (function () { const f = c(6); return f.length === 1 && f[0].sev === 4; })()],
        ['expired + still active sev5', (function () { const f = c(-1); return f.length === 1 && f[0].sev === 5; })()],
        ['renewed quiets', c(5, 'renewed').length === 0],
        ['terminated quiets', c(-5, 'terminated').length === 0]
      ]);
    }],
    ['G24', 'R34 churn: 4.9% quiet, 5.1% sev3, 10.1% sev4, MRR>15% sev4 regardless of count, math printed', function () {
      const ch = function (churned, total, lost, mrrTotal) {
        const p = { period: 'Q3', churned: churned, total: total };
        if (lost !== undefined) p.mrr_lost = lost;
        if (mrrTotal !== undefined) p.mrr_total = mrrTotal;
        return R([['cs.churn.logged', p, 0]], 5, 'R34');
      };
      const mrr = ch(1, 1000, 16000, 100000);
      const noBase = ch(1, 1000, 16000);
      return golden([
        ['4.9% quiet', ch(49, 1000).length === 0],
        ['5.1% sev3', (function () { const f = ch(51, 1000); return f.length === 1 && f[0].sev === 3; })()],
        ['10.1% sev4', (function () { const f = ch(101, 1000); return f.length === 1 && f[0].sev === 4; })()],
        ['MRR 16% fires sev4 at 0.1% count', mrr.length === 1 && mrr[0].sev === 4],
        ['MRR math printed', mrr.length === 1 && mrr[0].basis.join(' ').indexOf('MRR math:') !== -1],
        ['no mrr_total -> not inferred', noBase.length === 0]
      ]);
    }],
    ['G25', 'R37 experiment: reviewDate+1 fires; result before reviewDate quiet; result exactly on reviewDate quiet', function () {
      const base = [['rd.experiment.logged', { id: 'e1', hypothesis: 'h', method: 'A/B', startDate: A, reviewDate: A + 10 * DAY }, 0]];
      const resultBefore = base.concat([['rd.experiment.result', { experimentId: 'e1', result: 'validated', learnings: ['l'] }, 9]]);
      const resultOn = base.concat([['rd.experiment.result', { experimentId: 'e1', result: 'inconclusive', learnings: ['l'] }, 10]]);
      const noReviewDate = [['rd.experiment.logged', { id: 'e2', hypothesis: 'h', method: 'A/B', startDate: A }, 0]];
      return golden([
        ['reviewDate+1 with no result fires sev3', (function () { const f = R(base, 11, 'R37'); return f.length === 1 && f[0].sev === 3; })()],
        ['on reviewDate quiet', R(base, 10, 'R37').length === 0],
        ['result before reviewDate quiet', R(resultBefore, 30, 'R37').length === 0],
        ['result exactly on reviewDate quiet', R(resultOn, 30, 'R37').length === 0],
        ['no reviewDate -> skip, not infer', R(noReviewDate, 300, 'R37').length === 0]
      ]);
    }],
    ['G26', 'R38 tech debt: 29 quiet, 31 sev3, 61 sev4, resolved items leave the total, math printed', function () {
      const d = function (id, sev, eff) { return ['rd.tech.debt.logged', { id: id, title: id, severity: sev, effort: eff }, 1]; };
      const q29 = R([d('a', 5, 5), d('b', 2, 2)], 10, 'R38');                                   // 25 + 4 = 29
      const s31 = R([d('a', 5, 5), d('b', 3, 2)], 10, 'R38');                                   // 25 + 6 = 31
      const s61 = R([d('a', 5, 5), d('b', 5, 5), d('c', 4, 3)], 10, 'R38');                     // 25+25+12 = 62
      const cleared = R([d('a', 5, 5), d('b', 3, 2), ['rd.tech.debt.resolved', { debtId: 'b' }, 2]], 10, 'R38');
      return golden([
        ['mass 29 quiet', q29.length === 0],
        ['mass 31 sev3', s31.length === 1 && s31[0].sev === 3],
        ['mass 62 sev4', s61.length === 1 && s61[0].sev === 4],
        ['resolved item removed from total', cleared.length === 0],
        ['score math printed', s31.length === 1 && /5x5 \+ 3x2 = 31/.test(s31[0].basis.join(' '))]
      ]);
    }],
    ['G27', 'R39 board cadence: exactly boardCadenceDays quiet, +1d fires, never + aged log sev2', function () {
      const meet = [['exec.board.meeting', { date: A, quorum: true, items: ['x'], decisions: ['y'] }, 0]];
      const never = [['task.created', { id: 't1', domain: 'executive', title: 'x' }, 0]];
      return golden([
        ['exactly 90d quiet', R(meet, 90, 'R39').length === 0],
        ['91d fires sev3', (function () { const f = R(meet, 91, 'R39'); return f.length === 1 && f[0].sev === 3; })()],
        ['never logged + log older than cadence sev2', (function () { const f = R(never, 91, 'R39'); return f.length === 1 && f[0].sev === 2; })()],
        ['never logged + young log quiet', R(never, 10, 'R39').length === 0]
      ]);
    }],
    ['G28', 'R15 OKR score: 0.41 quiet, 0.39 sev3, score 0 sev4, 3 consecutive <0.4 sev4', function () {
      const okr = function (id, score, d) {
        return [['strategy.okr.set', { id: id, objective: 'O' + id, quarter: 'Q', keyResults: [{ kr: 'k', target: 1, unit: 'n' }] }, d],
          ['strategy.okr.closed', { okrId: id, score: score }, d + 1]];
      };
      const run3 = okr('a', 0.3, 0).concat(okr('b', 0.2, 5)).concat(okr('c', 0.35, 10));
      const f3 = R(run3, 30, 'R15');
      return golden([
        ['0.41 quiet', R(okr('a', 0.41, 0), 10, 'R15').length === 0],
        ['0.39 sev3 single period', (function () { const f = R(okr('a', 0.39, 0), 10, 'R15'); return f.length === 1 && f[0].sev === 3; })()],
        ['score 0 sev4', (function () { const f = R(okr('a', 0, 0), 10, 'R15'); return f.length === 1 && f[0].sev === 4; })()],
        ['3 consecutive <0.4 adds sev4 pattern', f3.length === 4 && f3.filter(function (x) { return x.sev === 4; }).length === 1],
        ['pattern basis names the run', f3.some(function (x) { return x.sev === 4 && /a=0.3, b=0.2, c=0.35/.test(x.basis.join(' ')); })]
      ]);
    }],
    ['G29', 'R25 vendor: risk 3 skipped, risk 4 + past due sev3, risk 5 sev4, reviewed after due quiets', function () {
      const v = function (risk, reviewedDay) {
        const rows = [['supply.vendor.logged', { id: 'v1', name: 'FabCo', category: 'c', tier: 1, risk_level: risk, reviewDate: A + 10 * DAY }, 0]];
        if (reviewedDay !== undefined) rows.push(['supply.vendor.reviewed', { vendorId: 'v1', score: 4 }, reviewedDay]);
        return R(rows, 20, 'R25');
      };
      return golden([
        ['risk_level 3 skipped', v(3).length === 0],
        ['risk_level 4 past due sev3', (function () { const f = v(4); return f.length === 1 && f[0].sev === 3; })()],
        ['risk_level 5 past due sev4', (function () { const f = v(5); return f.length === 1 && f[0].sev === 4; })()],
        ['reviewed after reviewDate quiets', v(5, 12).length === 0],
        ['review before reviewDate does not count', v(5, 5).length === 1],
        ['no reviewDate -> skip', R([['supply.vendor.logged', { id: 'v2', name: 'X', category: 'c', tier: 1, risk_level: 5 }, 0]], 300, 'R25').length === 0]
      ]);
    }],
    ['G30', 'full seed: buildSeed() exercises every rule R1–R40 with shape-valid findings', function () {
      const b = buildSeed();
      const F = LeadOS.rules.run(LeadOS.engine.project(b.events), b.today);
      const missing = LeadOS.rules.RULES.map(function (r) { return r.id; }).filter(function (id) { return !F.some(function (f) { return f.rule === id; }); });
      const malformed = F.filter(function (f) { return !shapeOk(f); });
      const ok = LeadOS.rules.RULES.length === 40 && missing.length === 0 && malformed.length === 0;
      return { pass: ok, detail: ok ? 'seed of ' + b.events.length + ' events fires all 40 rules -> ' + F.length + ' findings, all shape-valid' : (missing.length ? 'silent: ' + missing.join(',') : 'malformed: ' + malformed.length) };
    }]
  ];
  // Boot gate inspects the live store only (G1-G12). Goldens join the full
  // suite: a rule-logic regression must be loud in Health, not a brick wall
  // between a leader and their own data.
  const LIVE_G = G.slice();
  GOLDENS.forEach(function (row) { G.push(row); });

  const CLAIMS = [
    { id: 'C1', text: 'Five v4 settings exist with exact defaults (90 / 30 / 14 / 90 / 180).', by: ['T1', 'T2', 'G5'] },
    { id: 'C2', text: 'Backfill appends repair events and never overwrites leader-set values.', by: ['T4', 'G3'] },
    { id: 'C3', text: 'All repairs counted in meta.migrationRepairs, reconstructible from the log.', by: ['T5', 'G6'] },
    { id: 'C4', text: 'Migration 3>4 is idempotent on replay.', by: ['T3'] },
    { id: 'C5', text: 'Single localStorage key leados:data, schemaVersion 4, lineage pt.', by: ['G1', 'G2', 'G4'] },
    { id: 'C6', text: 'Append-only store; nothing derived persisted; project() is a pure fold.', by: ['G3', 'G4', 'G7', 'T7'] },
    { id: 'C7', text: 'Revenue / ops / board / compliance cadences derive from v4 settings.', by: ['T6', 'G5'] },
    { id: 'C8', text: 'salesCycleDays drives the beyond-cycle flag on sales decisions.', by: ['T9', 'G5'] },
    { id: 'C9', text: 'Every event in the log satisfies the registry contract.', by: ['T8', 'G3'] },
    { id: 'C10', text: 'All 72 part-2 event types are registered and gate-enforced.', by: ['T11', 'G3'] },
    { id: 'C11', text: 'All 11 new families derive state: entities mutate, actuals attach, closures close.', by: ['T10', 'G7'] },
    { id: 'C12', text: 'Referential integrity: every declared *Id reference resolves within the log.', by: ['G8', 'T10'] },
    { id: 'C13', text: 'Rules engine implements R1–R40 and every rule is exercised.', by: ['T24', 'T12'] },
    { id: 'C14', text: 'Every finding honors the fin() contract (sev 1–5, conf, play xor playNone).', by: ['T12', 'G9'] },
    { id: 'C15', text: 'Trend/severity discipline: >=3 measured points, spec ceilings, skip-not-infer.', by: ['T21', 'T22', 'T23'] },
    { id: 'C16', text: 'Signals are derived per read and never persisted.', by: ['G4', 'G7', 'G9', 'T13'] },
    { id: 'C17', text: 'All 40 named projections exist; open sets exclude closed entities; append-order wins.', by: ['T25', 'G10'] },
    { id: 'C18', text: 'Stale state impossible: projections alias the folded entities and never persist.', by: ['G10', 'G4', 'G7'] },
    { id: 'C19', text: 'All 14 interactive playbooks exist; submit() emits only registry-valid events.', by: ['T26', 'G3'] },
    { id: 'C20', text: 'No playbook fakes certainty: recommendations are labeled with a source, gaps are declared.', by: ['T26', 'G11'] },
    { id: 'C21', text: 'All rail routes resolve to views; quick-capture forms emit registry-valid events.', by: ['T27', 'G3'] },
    { id: 'C22', text: 'View state (filter, tab, person) lives in sessionStorage only and never enters the log.', by: ['G12', 'G1', 'G4'] },
    { id: 'C23', text: 'Every part-2 family projects correctly: risk counts, pipeline math, OKR score, MTTR, attrition, vendor gap.', by: ['T15', 'T16', 'T17', 'T18', 'T19', 'T20'] },
    { id: 'C24', text: 'Rule fire/quiet boundaries are pinned by goldens — no rule drifts a threshold silently.', by: ['G14', 'G15', 'G16', 'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23', 'G24', 'G25', 'G26', 'G27', 'G28', 'G29'] },
    { id: 'C25', text: 'The seed exercises all 40 rules and every finding it produces is shape-valid.', by: ['G30', 'T24', 'T12'] }
  ];

  function runSuite(suite) {
    return suite.map(function (row) {
      const id = row[0], name = row[1], fn = row[2];
      try { const r = fn(); return { id: id, name: name, pass: !!r.pass, detail: r.detail }; }
      catch (e) { return { id: id, name: name, pass: false, detail: 'threw: ' + e.message }; }
    });
  }
  function evaluateClaims(t, g) {
    const byId = {};
    t.concat(g).forEach(function (r) { byId[r.id] = r.pass; });
    return CLAIMS.map(function (c) { return { id: c.id, text: c.text, by: c.by, pass: c.by.every(function (id) { return byId[id] === true; }) }; });
  }
  function runG() { return runSuite(G); }
  function runAll() {
    const t = runSuite(T), g = runSuite(G);
    return { at: Date.now(), t: t, g: g, claims: evaluateClaims(t, g), ok: t.concat(g).every(function (r) { return r.pass; }) };
  }
  // Boot gate: live-store integrity only (G1-G12).
  function boot() { const g = runSuite(LIVE_G); return { ok: g.every(function (r) { return r.pass; }), g: g }; }

  LeadOS.health = { T: T, G: G, LIVE_G: LIVE_G, GOLDENS: GOLDENS, CLAIMS: CLAIMS, buildSeed: buildSeed, runAll: runAll, runG: runG, boot: boot };
})();
