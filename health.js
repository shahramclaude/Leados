/* LeadOS pt-4 - js/health.js
   The authority wall.
   T-suite: deterministic proof on synthetic fixtures (never touches the store).
   G-suite: live inspection of the real localStorage payload.
   The UI may not claim anything that is not covered here (see CLAIMS).
   pt-4 part 2 adds T10/T11 (72-type contract + fold flows) and G8 (referential
   integrity across every *Id field in the log). */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});
  const DAY = 86400000;
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

  // ---------- T-suite (fixtures) ----------
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
      const bad1 = v('definitely.not.real', {}).ok;
      const bad2 = v('settings.changed', { key: 'notASetting', value: 5 }).ok;
      const bad3 = v('objective.created', { id: 'x', domain: 'sales' }).ok;
      const bad4 = v('task.created', { id: 't', domain: 'sales', title: 'x', hacker: 1 }).ok;
      const good = v('decision.proposed', { id: 'd', domain: 'sales', question: 'q?', options: ['a', 'b'], owner: 'o', reversibility: 'reversible' }).ok;
      const ok = !bad1 && !bad2 && !bad3 && !bad4 && good;
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
    }]
  ];

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
    { id: 'C12', text: 'Referential integrity: every declared *Id reference resolves within the log.', by: ['G8', 'T10'] }
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
  function boot() { const g = runG(); return { ok: g.every(function (r) { return r.pass; }), g: g }; }

  LeadOS.health = { T: T, G: G, CLAIMS: CLAIMS, runAll: runAll, runG: runG, boot: boot };
})();
