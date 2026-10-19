-- Demo/seed data for OKRs, execution command, decision workspace, scenario
-- & wargame studio, and the early-warning indicator library (Part 6).
-- Run after scripts/seed_financial.sql.

TRUNCATE TABLE okr_check_ins, okr_initiatives, okr_key_results, okr_objectives RESTART IDENTITY CASCADE;
TRUNCATE TABLE exec_dependencies, exec_blockers, exec_milestones, exec_projects RESTART IDENTITY CASCADE;
TRUNCATE TABLE decision_options, decision_criteria, decisions RESTART IDENTITY CASCADE;
TRUNCATE TABLE scenarios RESTART IDENTITY CASCADE;
TRUNCATE TABLE wargames RESTART IDENTITY CASCADE;
TRUNCATE TABLE indicator_readings, indicators RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- OKR cascade: one company objective -> two team objectives -> key results
-- -> initiatives. One team objective is deliberately "on_track" on paper but
-- fed by stale/overconfident key results so the misalignment detector has
-- something real to catch.
-- ---------------------------------------------------------------------------
INSERT INTO okr_objectives (id, title, description, level, owner, parent_id, period, weight) VALUES
(1, 'Reach default-alive unit economics by end of Q2', 'Company-level objective: grow revenue faster than burn without a new raise.', 'company', 'Leo Mitchell (CEO)', NULL, '2026-Q1', 1),
(2, 'Ship the enterprise tier and land 5 logos', 'Team objective under the company default-alive objective.', 'team', 'James Wilson (PM)', 1, '2026-Q1', 1),
(3, 'Cut net burn 15% without slowing delivery', 'Team objective under the company default-alive objective.', 'team', 'Wyatt Adams (CFO)', 1, '2026-Q1', 1);
SELECT setval('okr_objectives_id_seq', 3, true);

INSERT INTO okr_key_results (id, objective_id, title, metric_key, start_value, target_value, current_value, unit, weight, confidence, check_in_cadence, last_check_in_at) VALUES
(1, 2, 'Enterprise logos closed', 'sales_enterprise_logos', 0, 5, 1, 'count', 1, 0.8, 'weekly', now() - interval '20 days'),
(2, 2, 'Enterprise tier GA shipped', 'delivery_enterprise_tier', 0, 1, 0.4, 'fraction', 1, 0.5, 'weekly', now() - interval '3 days'),
(3, 3, 'Net monthly burn', 'finance_net_burn', 260000, 221000, 255000, 'usd', 1, 0.7, 'monthly', now() - interval '35 days'),
(4, 3, 'Headcount cost as % of revenue', 'finance_headcount_pct_revenue', 2.1, 1.6, 1.9, 'ratio', 1, 0.6, 'monthly', now() - interval '10 days');
SELECT setval('okr_key_results_id_seq', 4, true);

INSERT INTO okr_initiatives (id, key_result_id, title, status, contribution_weight, execution_project_id) VALUES
(1, 1, 'Enterprise sales motion revamp', 'at_risk', 1, 1),
(2, 2, 'Enterprise tier engineering build-out', 'at_risk', 1, 2),
(3, 3, 'Headcount cost discipline review', 'on_track', 1, NULL);
SELECT setval('okr_initiatives_id_seq', 3, true);

INSERT INTO okr_check_ins (key_result_id, value, confidence, note, author) VALUES
(1, 1, 0.8, 'One logo closed, three in late-stage pipeline.', 'James Wilson'),
(2, 0.4, 0.5, 'Billing integration slipped two weeks.', 'Ethan Kim'),
(3, 255000, 0.7, 'Burn down slightly from last month.', 'Wyatt Adams');

-- ---------------------------------------------------------------------------
-- Execution command: two projects, one healthy, one at risk with a blocker
-- on its critical path.
-- ---------------------------------------------------------------------------
INSERT INTO exec_projects (id, name, description, status, start_date, target_date) VALUES
(1, 'Enterprise sales motion revamp', 'New enterprise pricing, security review package, and outbound playbook.', 'at_risk', (now() - interval '30 days')::date, (now() + interval '45 days')::date),
(2, 'Enterprise tier engineering build-out', 'SSO, audit log, and usage-based billing for the enterprise tier.', 'active', (now() - interval '45 days')::date, (now() + interval '30 days')::date);
SELECT setval('exec_projects_id_seq', 2, true);

INSERT INTO exec_milestones (id, project_id, title, duration_days, duration_p90_days, depends_on, due_date, status, completed_at) VALUES
(1, 1, 'Security review package complete', 10, 18, '[]', (now() - interval '5 days')::date, 'blocked', NULL),
(2, 1, 'Enterprise pricing finalized', 5, 8, '[1]', (now() + interval '5 days')::date, 'not_started', NULL),
(3, 1, 'Outbound playbook launched', 7, 12, '[2]', (now() + interval '20 days')::date, 'not_started', NULL),
(4, 2, 'SSO integration', 14, 21, '[]', (now() - interval '2 days')::date, 'in_progress', NULL),
(5, 2, 'Audit log shipped', 10, 14, '[4]', (now() + interval '15 days')::date, 'not_started', NULL),
(6, 2, 'Usage-based billing shipped', 12, 20, '[5]', (now() + interval '28 days')::date, 'not_started', NULL);
SELECT setval('exec_milestones_id_seq', 6, true);

INSERT INTO exec_blockers (id, project_id, milestone_id, title, severity, impact_days, raised_at, resolved_at) VALUES
(1, 1, 1, 'Waiting on third-party SOC2 auditor scheduling', 'high', 12, now() - interval '9 days', NULL),
(2, 2, 4, 'SSO vendor SDK has a breaking change pending upstream fix', 'critical', 7, now() - interval '4 days', NULL);
SELECT setval('exec_blockers_id_seq', 2, true);

INSERT INTO exec_dependencies (upstream_project_id, downstream_project_id, note) VALUES
(2, 1, 'Enterprise sales cannot close security-sensitive logos until SSO + audit log ship.');

-- ---------------------------------------------------------------------------
-- Decision workspace: one urgent two-way-door pricing decision, one
-- irreversible one-way-door infra decision further out.
-- ---------------------------------------------------------------------------
INSERT INTO decisions (id, title, domain, status, context, door_type, impact, deadline, pre_mortem) VALUES
(1, 'Set enterprise tier list price', 'revenue', 'proposed', 'Enterprise prospects are price-anchoring off a competitor at $40k/yr; we need a list price before the next 3 late-stage deals close.', 'two_way', 4,
  (now() + interval '6 days')::date,
  '[{"prompt":"It is 12 months from now and this decision failed badly. What happened?"},{"prompt":"What assumption, if wrong, breaks this decision the most?"}]'::jsonb),
(2, 'Migrate primary datastore to a multi-region cluster', 'operations', 'proposed', 'Current single-region Postgres is a growing availability risk as enterprise SLAs tighten; migration is expensive and hard to reverse once customer data is live on the new topology.', 'one_way', 5,
  (now() + interval '60 days')::date,
  '[{"prompt":"It is 12 months from now and this decision failed badly. What happened?"},{"prompt":"Who would have seen this failure coming, and what did they know that we do not?"}]'::jsonb);
SELECT setval('decisions_id_seq', 2, true);

INSERT INTO decision_criteria (decision_id, name, weight) VALUES
(1, 'Win rate impact', 0.4),
(1, 'Revenue per logo', 0.35),
(1, 'Competitive differentiation', 0.25),
(2, 'Reliability improvement', 0.5),
(2, 'Migration risk', 0.3),
(2, 'Cost', 0.2);

INSERT INTO decision_options (decision_id, label, description, criteria_scores, estimated_value, uncertainty_low, uncertainty_high, probability_of_success) VALUES
(1, '$35k/yr list price', 'Slightly under the competitor anchor to win on price.', '{"Win rate impact":0.75,"Revenue per logo":0.55,"Competitive differentiation":0.4}'::jsonb, 420000, 250000, 600000, 0.65),
(1, '$48k/yr list price', 'Above the competitor anchor, positioned on security/compliance differentiation.', '{"Win rate impact":0.45,"Revenue per logo":0.85,"Competitive differentiation":0.8}'::jsonb, 540000, 200000, 850000, 0.45),
(2, 'Migrate now (phased, 8 weeks)', 'Phased migration with a dual-write period.', '{"Reliability improvement":0.85,"Migration risk":0.4,"Cost":0.5}'::jsonb, 300000, -150000, 700000, 0.6),
(2, 'Defer 2 quarters, add read replicas first', 'Cheaper near-term reliability improvement; defers the harder migration.', '{"Reliability improvement":0.5,"Migration risk":0.8,"Cost":0.8}'::jsonb, 120000, 0, 250000, 0.8);

-- ---------------------------------------------------------------------------
-- Scenario studio: base case + a downside "slower enterprise close" scenario,
-- the latter versioned as a fork of the base case.
-- ---------------------------------------------------------------------------
INSERT INTO scenarios (id, name, description, kind, assumptions, results, early_warning_indicators, version, parent_scenario_id) VALUES
(1, 'Base case', 'Current trailing burn/revenue trend held constant.', 'finance',
  '{"startingCash":3000000,"monthlyBurn":180000,"monthlyRevenue":72000,"revenueGrowthRate":0.03,"burnVolatility":0.18,"headcountDelta":0,"monthlyBurnDelta":0,"months":24,"seed":1337}'::jsonb,
  '{}'::jsonb, '[]'::jsonb, 1, NULL);
SELECT setval('scenarios_id_seq', 1, true);

-- ---------------------------------------------------------------------------
-- Early-warning indicator library + 4 weeks of history so trend-break
-- detection has something to compare against on first board-pack run.
-- ---------------------------------------------------------------------------
INSERT INTO indicators (key, label, domain, unit, direction, warning_threshold, critical_threshold) VALUES
('runway_months_p50', 'Median simulated runway', 'financial', 'months', 'below_bad', 9, 5),
('burn_trend_pct', 'Burn trend (vs prior quarter)', 'financial', '%', 'above_bad', 0.08, 0.2),
('covenant_headroom_pct', 'Covenant headroom', 'financial', '%', 'below_bad', 0.25, 0.05),
('delivery_confidence_avg', 'Average delivery confidence', 'delivery', '0-1', 'below_bad', 0.55, 0.35),
('open_critical_blockers', 'Open critical-severity blockers', 'delivery', 'count', 'above_bad', 1, 3),
('okr_off_track_share', 'Share of key results off-track', 'delivery', '%', 'above_bad', 0.25, 0.45),
('competitor_win_rate_against_us', 'Simulated competitor win probability', 'market', '0-1', 'above_bad', 0.45, 0.6),
('decision_backlog_overdue', 'Overdue decisions awaiting a call', 'people', 'count', 'above_bad', 2, 5);

INSERT INTO indicator_readings (indicator_key, value, recorded_at)
SELECT 'runway_months_p50', v, now() - (d || ' days')::interval
FROM (VALUES (21, 16.5), (14, 15.8), (7, 14.2), (0, 13.1)) AS t(d, v);

INSERT INTO indicator_readings (indicator_key, value, recorded_at)
SELECT 'burn_trend_pct', v, now() - (d || ' days')::interval
FROM (VALUES (21, 0.02), (14, 0.04), (7, 0.09), (0, 0.14)) AS t(d, v);

INSERT INTO indicator_readings (indicator_key, value, recorded_at)
SELECT 'delivery_confidence_avg', v, now() - (d || ' days')::interval
FROM (VALUES (21, 0.68), (14, 0.6), (7, 0.5), (0, 0.42)) AS t(d, v);
