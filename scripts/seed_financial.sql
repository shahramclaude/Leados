-- LEADOS Part 10 — financial domain seed.
-- Idempotent: truncates the financial tables it owns before inserting.
-- This file seeds (1) the assumption registry, (2) raw actual ledger lines in
-- `financial_events`, and (3) covenant thresholds. `reported_actuals` (the
-- independent reconciliation ground truth) is intentionally NOT seeded here —
-- scripts/seed.ts derives it by aggregating these same financial_events rows,
-- which is what proves the aggregation logic in financialOS.ts is correct
-- (see the reconciliation test). A real deployment would instead populate
-- `reported_actuals` from the accounting system's ledger close export.

TRUNCATE TABLE financial_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE reported_actuals RESTART IDENTITY CASCADE;
TRUNCATE TABLE covenants RESTART IDENTITY CASCADE;
TRUNCATE TABLE assumptions RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- Assumption registry: every driver the model uses, owned + justified + ranged
-- ---------------------------------------------------------------------------
INSERT INTO assumptions (key, label, category, owner, rationale, unit, low, base, high, version, effective_date, active) VALUES
('revenue_growth_monthly', 'Blended monthly revenue growth (new + expansion)', 'revenue_growth', 'VP Sales — Dana Reyes', 'Trailing 6-month pipeline coverage and win-rate analysis; range reflects pipeline coverage uncertainty for the next two quarters.', '%/mo', 0.0200, 0.0400, 0.0700, 1, '2026-01-15', true),
('gross_churn_monthly', 'Gross revenue churn, monthly', 'churn', 'Head of CS — Priya Nair', 'Cohort churn analysis over trailing 12 months; high end reflects the competitive price-pressure scenario CS is tracking.', '%/mo', 0.0080, 0.0150, 0.0250, 1, '2026-01-15', true),
('price_increase_annual', 'Annualized list price increase', 'price', 'CFO — Marcus Webb', 'Board-approved pricing committee range for FY26; low end assumes a price freeze if competitive pressure intensifies.', '%/yr', 0.0000, 0.0300, 0.0600, 1, '2026-01-15', true),
('comp_inflation_annual', 'Fully-loaded comp inflation, annualized', 'comp_inflation', 'VP People — Jordan Lee', 'Benchmarked against Radford SaaS survey for our bands and geo mix; high end includes a retention-driven off-cycle adjustment.', '%/yr', 0.0300, 0.0450, 0.0700, 1, '2026-01-15', true),
('hiring_plan_net_adds_monthly', 'Net headcount adds per month', 'hiring', 'VP People — Jordan Lee', 'Board-approved FY26 growth-investment hiring plan (pre-Series-B land grab), netted for planned attrition; range reflects hiring-manager capacity to onboard against an aggressive plan.', 'heads/mo', 4, 8, 14, 1, '2026-01-15', true),
('fully_loaded_cost_per_head_monthly', 'Fully-loaded monthly cost per head', 'hiring', 'VP People — Jordan Lee', 'Blended OTE + benefits + payroll tax; FY26 plan skews senior (eng + enterprise sales), range reflects mix of IC vs. senior hires.', '$/head/mo', 12000, 13500, 16000, 1, '2026-01-15', true),
('cogs_pct_of_revenue', 'COGS as % of revenue (hosting, support, payment processing)', 'other', 'CFO — Marcus Webb', 'Trailing 3-month actual ratio plus planned infra efficiency work; high end assumes efficiency work slips.', '% of revenue', 0.1800, 0.2200, 0.2700, 1, '2026-01-15', true),
('opex_other_growth_monthly', 'Non-headcount opex growth, monthly', 'other', 'COO — Alicia Chen', 'Approved G&A/marketing program budget trend; high end includes a planned brand campaign that may be pulled forward.', '%/mo', 0.0050, 0.0150, 0.0300, 1, '2026-01-15', true),
('payment_terms_days', 'Average customer payment terms (DSO proxy)', 'payment_terms', 'Controller — Sam Osei', 'Blended NET terms across current contract mix; high end reflects enterprise deals currently in negotiation requesting NET-60.', 'days', 30, 45, 60, 1, '2026-01-15', true),
('min_runway_months_board_comfort', 'Board comfort threshold for cash runway', 'other', 'CFO — Marcus Webb', 'Board-stated minimum comfort level before requiring an active fundraising motion, set at last board meeting.', 'months', 9, 12, 15, 1, '2026-01-15', true),
('fx_usd_eur', 'USD/EUR drift applied to EUR-denominated contracts', 'fx', 'CFO — Marcus Webb', 'Trailing 12-month volatility band from treasury forecast. REGISTERED BUT NOT YET WIRED into the projection model (EUR book is <5% of revenue) — see AI-SESSION-LOG.md honesty note.', '%/yr', -0.0500, 0.0000, 0.0500, 1, '2026-01-15', true),
('ramp_productivity_months', 'Months for a new rep/engineer to reach full productivity', 'ramp', 'VP Sales — Dana Reyes', 'Onboarding cohort analysis, last 4 cohorts. REGISTERED BUT NOT YET WIRED into the dollar projection — used qualitatively in execution key-person-risk scoring today.', 'months', 2, 3, 5, 1, '2026-01-15', true);

-- ---------------------------------------------------------------------------
-- Actual ledger lines (financial_events, source='actual'). 8 historical months.
-- ---------------------------------------------------------------------------

-- Opening cash balance, carried as a financing inflow dated at the start of the tracked window.
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-06-01', 'financing', 'opening_cash_balance', 2500000.00, 'Cash on hand at the start of the tracked operating history (post Series A).', 'actual');

-- NOTE ON SCALE: per-customer ACV is set at ~$26-27k/year (mid-market B2B SaaS,
-- ~500-570 logos) so that revenue is in a realistic ratio to a 42-51 person
-- headcount base. An earlier draft of this seed used SMB-style $295/mo pricing
-- against the same headcount, which produced a historically-already-negative
-- cash balance — an internally inconsistent "going concern" story. Fixed here.

-- 2025-06
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-06-28', 'revenue', 'subscription', 1100000.00, '500 customers @ $2,200/mo', 'actual', 500, 2200.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-06-28', 'cogs', 'hosting_support_payments', -253000.00, '23.0% of revenue', 'actual'),
('2025-06-28', 'salaries', 'fully_loaded', -504000.00, '42 FTE @ $12,000/mo fully loaded', 'actual'),
('2025-06-28', 'opex_other', 'ga_marketing', -60000.00, 'G&A + marketing programs', 'actual'),
('2025-06-28', 'headcount', 'actual', 42, 'Headcount at month end (FTE)', 'actual');

-- 2025-07
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-07-28', 'revenue', 'subscription', 1131520.00, '512 customers @ $2,210/mo', 'actual', 512, 2210.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-07-28', 'cogs', 'hosting_support_payments', -254592.00, '22.5% of revenue', 'actual'),
('2025-07-28', 'salaries', 'fully_loaded', -518150.00, '43 FTE @ $12,050/mo fully loaded', 'actual'),
('2025-07-28', 'opex_other', 'ga_marketing', -61000.00, 'G&A + marketing programs', 'actual'),
('2025-07-28', 'headcount', 'actual', 43, 'Headcount at month end (FTE)', 'actual');

-- 2025-08
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-08-28', 'revenue', 'subscription', 1157000.00, '520 customers @ $2,225/mo', 'actual', 520, 2225.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-08-28', 'cogs', 'hosting_support_payments', -254540.00, '22.0% of revenue', 'actual'),
('2025-08-28', 'salaries', 'fully_loaded', -532400.00, '44 FTE @ $12,100/mo fully loaded', 'actual'),
('2025-08-28', 'opex_other', 'ga_marketing', -62500.00, 'G&A + marketing programs', 'actual'),
('2025-08-28', 'headcount', 'actual', 44, 'Headcount at month end (FTE)', 'actual');

-- 2025-09 (includes a one-time legal cost)
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-09-28', 'revenue', 'subscription', 1180480.00, '527 customers @ $2,240/mo', 'actual', 527, 2240.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-09-28', 'cogs', 'hosting_support_payments', -271510.40, '23.0% of revenue', 'actual'),
('2025-09-28', 'salaries', 'fully_loaded', -546750.00, '45 FTE @ $12,150/mo fully loaded', 'actual'),
('2025-09-28', 'opex_other', 'ga_marketing', -63000.00, 'G&A + marketing programs', 'actual'),
('2025-09-28', 'one_time', 'legal', -25000.00, 'One-time legal cost, contract dispute settlement', 'actual'),
('2025-09-28', 'headcount', 'actual', 45, 'Headcount at month end (FTE)', 'actual');

-- 2025-10
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-10-28', 'revenue', 'subscription', 1217250.00, '541 customers @ $2,250/mo', 'actual', 541, 2250.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-10-28', 'cogs', 'hosting_support_payments', -273881.25, '22.5% of revenue', 'actual'),
('2025-10-28', 'salaries', 'fully_loaded', -573400.00, '47 FTE @ $12,200/mo fully loaded', 'actual'),
('2025-10-28', 'opex_other', 'ga_marketing', -64500.00, 'G&A + marketing programs', 'actual'),
('2025-10-28', 'headcount', 'actual', 47, 'Headcount at month end (FTE)', 'actual');

-- 2025-11 (includes a venture debt draw-down)
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-11-28', 'revenue', 'subscription', 1240740.00, '549 customers @ $2,260/mo', 'actual', 549, 2260.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-11-28', 'cogs', 'hosting_support_payments', -272962.80, '22.0% of revenue', 'actual'),
('2025-11-28', 'salaries', 'fully_loaded', -590400.00, '48 FTE @ $12,300/mo fully loaded', 'actual'),
('2025-11-28', 'opex_other', 'ga_marketing', -66000.00, 'G&A + marketing programs', 'actual'),
('2025-11-28', 'financing', 'venture_debt_drawdown', 500000.00, 'Venture debt tranche 2 draw-down', 'actual'),
('2025-11-28', 'headcount', 'actual', 48, 'Headcount at month end (FTE)', 'actual');

-- 2025-12 (holiday support cost bump)
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2025-12-28', 'revenue', 'subscription', 1266660.00, '558 customers @ $2,270/mo', 'actual', 558, 2270.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2025-12-28', 'cogs', 'hosting_support_payments', -297765.10, '23.5% of revenue (holiday support coverage)', 'actual'),
('2025-12-28', 'salaries', 'fully_loaded', -607600.00, '49 FTE @ $12,400/mo fully loaded', 'actual'),
('2025-12-28', 'opex_other', 'ga_marketing', -67500.00, 'G&A + marketing programs', 'actual'),
('2025-12-28', 'headcount', 'actual', 49, 'Headcount at month end (FTE)', 'actual');

-- 2026-01
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source, units, unit_price) VALUES
('2026-01-28', 'revenue', 'subscription', 1304160.00, '572 customers @ $2,280/mo', 'actual', 572, 2280.00);
INSERT INTO financial_events (event_date, category, subcategory, amount, description, source) VALUES
('2026-01-28', 'cogs', 'hosting_support_payments', -293436.00, '22.5% of revenue', 'actual'),
('2026-01-28', 'salaries', 'fully_loaded', -637500.00, '51 FTE @ $12,500/mo fully loaded', 'actual'),
('2026-01-28', 'opex_other', 'ga_marketing', -69000.00, 'G&A + marketing programs', 'actual'),
('2026-01-28', 'headcount', 'actual', 51, 'Headcount at month end (FTE)', 'actual');

-- ---------------------------------------------------------------------------
-- Covenants
-- ---------------------------------------------------------------------------
INSERT INTO covenants (name, metric, operator, threshold, active) VALUES
('Venture debt minimum cash covenant', 'min_cash', '>=', 1000000, true),
('Board comfort runway covenant (informal)', 'cash_runway_months', '>=', 9, true);
