-- Demo/seed data for the Financial Operating System (Part 6).
-- Clears and repopulates people, financial_events, finance_assumptions,
-- financial_plan_lines, and hiring_plan_items with a plausible ~40-person,
-- 9-month-history seed-stage company, plus a forward hiring plan and a
-- monthly budget so variance analysis has something to compare against.

TRUNCATE TABLE financial_events, financial_plan_lines, hiring_plan_items, people RESTART IDENTITY CASCADE;

-- finance_assumptions (singleton, keep existing id if present)
DELETE FROM finance_assumptions;
INSERT INTO finance_assumptions (current_cash_balance, baseline_monthly_revenue, baseline_revenue_growth_rate, gross_margin_pct, covenant_min_cash_months, covenant_min_cash_balance)
VALUES (3000000, 72000, 0.03, 0.72, 3, 500000);

-- people: ~40 across domains/teams. Some have monthlySalary on file; others
-- are left NULL on purpose to exercise the role-cost-fallback estimator.
INSERT INTO people (name, role, domain, team, monthly_salary, active) VALUES
('Ava Thompson', 'Engineering Manager', 'engineering', 'Platform Engineering', 22500, true),
('Liam Chen', 'Senior Software Engineer', 'engineering', 'Platform Engineering', 19500, true),
('Noah Patel', 'Software Engineer', 'engineering', 'Platform Engineering', NULL, true),
('Mia Rodriguez', 'Software Engineer', 'engineering', 'Platform Engineering', NULL, true),
('Ethan Kim', 'Staff Engineer', 'engineering', 'Platform Engineering', 24500, true),
('Olivia Nguyen', 'Senior Software Engineer', 'engineering', 'Product Engineering', 19800, true),
('Lucas Garcia', 'Software Engineer', 'engineering', 'Product Engineering', NULL, true),
('Sophia Martin', 'Software Engineer', 'engineering', 'Product Engineering', NULL, true),
('Mason Lee', 'Data Scientist', 'engineering', 'Product Engineering', 16800, true),
('Isabella Brown', 'Principal Engineer', 'engineering', 'Product Engineering', 27500, true),
('James Wilson', 'Product Manager', 'product', 'Core Product', 17500, true),
('Amelia Davis', 'Senior Product Manager', 'product', 'Core Product', 20800, true),
('Benjamin Moore', 'Product Manager', 'product', 'Core Product', NULL, true),
('Charlotte Taylor', 'Designer', 'design', 'Design', 13800, true),
('Henry Anderson', 'Senior Designer', 'design', 'Design', 16500, true),
('Evelyn Thomas', 'Designer', 'design', 'Design', NULL, true),
('Alexander Jackson', 'Account Executive', 'sales', 'Enterprise Sales', 13500, true),
('Harper White', 'Account Executive', 'sales', 'Enterprise Sales', NULL, true),
('Daniel Harris', 'Sales Manager', 'sales', 'Enterprise Sales', 18500, true),
('Abigail Martinez', 'Sales Rep', 'sales', 'SMB Sales', NULL, true),
('Matthew Thompson', 'Sales Rep', 'sales', 'SMB Sales', NULL, true),
('Ella Robinson', 'Customer Success Manager', 'sales', 'SMB Sales', 11800, true),
('Joseph Clark', 'VP Sales', 'sales', 'Enterprise Sales', 27500, true),
('Avery Lewis', 'Marketing Manager', 'marketing', 'Growth Marketing', 14500, true),
('Scarlett Walker', 'Marketing Specialist', 'marketing', 'Growth Marketing', NULL, true),
('Jack Hall', 'Marketing Specialist', 'marketing', 'Growth Marketing', NULL, true),
('Grace Allen', 'Data Analyst', 'marketing', 'Growth Marketing', 11900, true),
('Samuel Young', 'Operations Manager', 'operations', 'Business Operations', 15400, true),
('Victoria King', 'Customer Support', 'operations', 'Business Operations', NULL, true),
('David Wright', 'Customer Support', 'operations', 'Business Operations', NULL, true),
('Zoey Scott', 'Office Manager', 'operations', 'Business Operations', 8700, true),
('Carter Green', 'Finance Analyst', 'finance', 'Finance & Accounting', 12800, true),
('Luna Baker', 'Controller', 'finance', 'Finance & Accounting', 17900, true),
('Wyatt Adams', 'CFO', 'finance', 'Finance & Accounting', 31000, true),
('Chloe Nelson', 'HR Manager', 'people', 'People Ops', 13200, true),
('Levi Hill', 'Recruiter', 'people', 'People Ops', NULL, true),
('Aria Campbell', 'Recruiter', 'people', 'People Ops', NULL, true),
('Leo Mitchell', 'CEO', 'other', 'Leadership', 29000, true),
('Nora Roberts', 'COO', 'other', 'Leadership', 27500, true),
('Hudson Carter', 'Software Engineer', 'engineering', 'Platform Engineering', NULL, false);

-- financial_events: 9 months of per-team operating expense + monthly
-- revenue + one funding event + a latest P&L summary. Expenses step up
-- ~14% in the most recent 3 months to exercise the "accelerating burn"
-- trend classifier.
WITH months AS (
  SELECT gs AS month_offset, date_trunc('month', now()) - (gs || ' months')::interval + interval '14 days' AS event_date
  FROM generate_series(0, 8) AS gs
),
teams AS (
  SELECT * FROM (VALUES
    ('engineering', 'Platform Engineering', 95000),
    ('engineering', 'Product Engineering', 88000),
    ('product',     'Core Product',        42000),
    ('design',      'Design',              28000),
    ('sales',       'Enterprise Sales',    46000),
    ('sales',       'SMB Sales',           22000),
    ('marketing',   'Growth Marketing',    34000),
    ('operations',  'Business Operations', 26000),
    ('finance',     'Finance & Accounting',24000),
    ('people',      'People Ops',          16000)
  ) AS t(domain, team, base_monthly_cost)
)
INSERT INTO financial_events (date, type, domain, team, amount, description, category)
SELECT
  m.event_date,
  'expense',
  t.domain,
  t.team,
  ROUND((t.base_monthly_cost * (CASE WHEN m.month_offset <= 2 THEN 1.14 ELSE 1.0 END)
         * (0.95 + (('x' || substr(md5(t.team || m.month_offset::text), 1, 6))::bit(24)::int::numeric / 16777215 * 0.1)))::numeric, 2),
  'Monthly operating expense — ' || t.team,
  'opex'
FROM months m
CROSS JOIN teams t;

-- Monthly revenue, growing ~3%/month from a $55k base.
INSERT INTO financial_events (date, type, domain, team, amount, description, category)
SELECT
  date_trunc('month', now()) - (gs || ' months')::interval + interval '20 days',
  'revenue',
  NULL,
  NULL,
  ROUND((55000 * POWER(1.03, 8 - gs))::numeric, 2),
  'Monthly recurring revenue',
  'revenue'
FROM generate_series(0, 8) AS gs;

-- One-time funding event 8 months ago.
INSERT INTO financial_events (date, type, domain, team, amount, description, category)
VALUES (date_trunc('month', now()) - interval '8 months' + interval '2 days', 'funding', NULL, NULL, 2500000, 'Seed extension round', 'funding');

-- Latest P&L summary (informational; excluded from burn-rate math by design).
INSERT INTO financial_events (date, type, domain, team, amount, description, category)
VALUES (date_trunc('month', now()) + interval '1 day', 'pl_summary', NULL, NULL, 1, 'Monthly P&L summary published to the board', 'reporting');

-- financial_plan_lines: current-month budget per team, set ~8% below what
-- actuals will land at so the variance report has a real, explainable
-- "we overspent engineering" story to tell.
INSERT INTO financial_plan_lines (period_month, domain, team, category, type, planned_amount)
SELECT date_trunc('month', now())::date, domain, team, 'opex', 'expense', base_monthly_cost * 0.92
FROM (VALUES
  ('engineering', 'Platform Engineering', 95000),
  ('engineering', 'Product Engineering', 88000),
  ('product',     'Core Product',        42000),
  ('design',      'Design',              28000),
  ('sales',       'Enterprise Sales',    46000),
  ('sales',       'SMB Sales',           22000),
  ('marketing',   'Growth Marketing',    34000),
  ('operations',  'Business Operations', 26000),
  ('finance',     'Finance & Accounting',24000),
  ('people',      'People Ops',          16000)
) AS t(domain, team, base_monthly_cost);

INSERT INTO financial_plan_lines (period_month, domain, team, category, type, planned_amount)
VALUES (date_trunc('month', now())::date, NULL, NULL, 'revenue', 'revenue', 68000);

-- hiring_plan_items: a forward hiring plan so runway projections are
-- conditioned on planned headcount growth, not just historical burn.
INSERT INTO hiring_plan_items (role, domain, team, start_month, monthly_cost_estimate, headcount_delta, scenario_tag) VALUES
('Senior Software Engineer', 'engineering', 'Platform Engineering', date_trunc('month', now() + interval '1 month')::date, 19500, 1, 'base'),
('Account Executive', 'sales', 'Enterprise Sales', date_trunc('month', now() + interval '2 months')::date, 13500, 1, 'base'),
('Customer Success Manager', 'sales', 'SMB Sales', date_trunc('month', now() + interval '3 months')::date, 12500, 1, 'base');
