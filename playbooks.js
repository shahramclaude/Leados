/* LeadOS pt-4 - js/playbooks.js
   Universal-domain playbooks. Applying a playbook emits EVENT SPECS ONLY -
   the store remains the single writer. Each domain is bound to exactly one of
   the four v4 review rhythms, which is what gives the new settings teeth. */
(function () {
  'use strict';
  const LeadOS = (window.LeadOS = window.LeadOS || {});

  // Domain -> governing review rhythm (v4 cadence map).
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

  // Compose - never write. Callers pass settings so review due dates honor v4 cadences.
  function apply(domainId, opts) {
    const pb = get(domainId);
    if (!pb) throw new Error('LeadOS: no playbook for domain ' + domainId);
    const now = (opts && opts.now) || Date.now();
    const settings = (opts && opts.settings) || LeadOS.store.ALL_SETTING_DEFAULTS;
    const kind = DOMAIN_CADENCE[domainId];
    const settingKey = { revenue: 'revenueReviewCadenceDays', ops: 'opsReviewCadenceDays', board: 'boardCadenceDays', compliance: 'complianceAuditCadenceDays' }[kind];
    const objId = uid('obj'), krId = uid('kr');

    const specs = [
      { type: 'playbook.applied', payload: { id: uid('pb'), domain: domainId, playbookId: 'playbook:' + domainId } },
      { type: 'objective.created', payload: { id: objId, domain: domainId, title: pb.objective, owner: (opts && opts.owner) || '', horizon: 'quarter' } },
      { type: 'kr.created', payload: { id: krId, objectiveId: objId, title: pb.kr.title, target: pb.kr.target, unit: pb.kr.unit, baseline: 0 } },
      { type: 'task.created', payload: { id: uid('task'), domain: domainId, title: pb.moves[0], dueAt: now + 7 * LeadOS.engine.DAY } },
      { type: 'task.created', payload: { id: uid('task'), domain: domainId, title: pb.moves[1], dueAt: now + 14 * LeadOS.engine.DAY } },
      { type: 'risk.raised', payload: { id: uid('risk'), domain: domainId, title: pb.risk.title, likelihood: pb.risk.likelihood, impact: pb.risk.impact, mitigation: pb.risk.mitigation } },
      { type: 'review.scheduled', payload: { id: uid('rev'), kind: kind, domain: domainId, dueAt: now + settings[settingKey] * LeadOS.engine.DAY } }
    ];
    return specs;
  }

  LeadOS.playbooks = { PLAYBOOKS: PLAYBOOKS, DOMAIN_CADENCE: DOMAIN_CADENCE, RITUAL_LABEL: RITUAL_LABEL, get: get, apply: apply, uid: uid };
})();
