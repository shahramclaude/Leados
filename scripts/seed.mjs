// Deterministic seed data for LEADOS. Safe to re-run: truncates and reinserts.
// Run with: node --env-file=.env scripts/seed.mjs
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const ANCHOR = new Date("2026-02-02T09:00:00Z");
const days = (n) => new Date(ANCHOR.getTime() + n * 86400000).toISOString();

function series(base, step, points = 14) {
  return Array.from({ length: points }).map((_, i) => ({
    t: new Date(ANCHOR.getTime() - (points - i) * 86400000).toISOString().slice(0, 10),
    v: Math.round((base + step * i) * 100) / 100,
  }));
}

async function main() {
  await pool.query(`TRUNCATE people, decisions, signals, metrics, knowledge_items, hypotheses, financial_lines, playbooks, activity_log RESTART IDENTITY CASCADE`);

  await pool.query(
    `INSERT INTO people (name, role, team, email, risk_level, status, focus_area, tenure_months, updated_at) VALUES
    ('Amara Osei', 'Staff Engineer', 'Platform', 'amara.osei@leados.io', 'low', 'active', 'Reliability', 38, $1),
    ('Devon Clarke', 'Product Manager', 'Growth', 'devon.clarke@leados.io', 'medium', 'active', 'Activation', 22, $1),
    ('Priya Natarajan', 'Finance Lead', 'Finance', 'priya.n@leados.io', 'low', 'active', 'FP&A', 54, $1),
    ('Hassan Malik', 'Engineering Manager', 'Platform', 'hassan.malik@leados.io', 'high', 'leave', 'Infra', 61, $1),
    ('Yuki Tanaka', 'Data Scientist', 'Insights', 'yuki.tanaka@leados.io', 'low', 'active', 'Forecasting', 15, $1),
    ('Lena Fischer', 'Design Lead', 'Product', 'lena.fischer@leados.io', 'medium', 'active', 'Design systems', 29, $1),
    ('Carlos Mendes', 'Sales Director', 'Revenue', 'carlos.mendes@leados.io', 'medium', 'active', 'Enterprise', 47, $1),
    ('Grace Okafor', 'Support Lead', 'Customer', 'grace.okafor@leados.io', 'low', 'active', 'Retention', 33, $1),
    ('Tomas Novak', 'Security Engineer', 'Platform', 'tomas.novak@leados.io', 'high', 'active', 'AppSec', 11, $1),
    ('Mei Lin', 'Ops Manager', 'Operations', 'mei.lin@leados.io', 'medium', 'offboarding', 'Vendor mgmt', 8, $1)
    `,
    [ANCHOR.toISOString()],
  );

  await pool.query(
    `INSERT INTO decisions (title, description, track, category, status, owner, severity, financial_impact, due_date, created_at, decided_at) VALUES
    ('Approve Q1 infra scale-up', 'Add two read replicas ahead of the enterprise launch traffic spike.', 'execution', 'Infrastructure', 'pending', 'Amara Osei', 4, 42000, $2, $1, NULL),
    ('Sunset legacy billing importer', 'Retire the CSV importer once 95% of accounts are on the new API path.', 'execution', 'Finance systems', 'pending', 'Priya Natarajan', 2, 6000, $3, $1, NULL),
    ('Expand EU data residency', 'Stand up an EU region to unblock three enterprise deals.', 'strategic', 'Market expansion', 'pending', 'Carlos Mendes', 5, 310000, $4, $1, NULL),
    ('Freeze non-critical hiring', 'Hold open reqs outside Platform/Security until Q2 revenue confirms.', 'strategic', 'Headcount', 'scheduled', 'Priya Natarajan', 3, -180000, $5, $1, NULL),
    ('Raise support SLA tier', 'Offer a 1-hour SLA tier to enterprise accounts at $15k/yr uplift.', 'strategic', 'Revenue', 'approved', 'Grace Okafor', 3, 95000, $6, $1, $1),
    ('Rotate exposed API credential', 'Rotate the webhook signing secret flagged by the security scan.', 'execution', 'Security', 'approved', 'Tomas Novak', 5, 0, $1, $1, $1),
    ('Deprecate v1 export endpoint', 'Turn off the v1 export endpoint; usage is below 0.4% of calls.', 'execution', 'Platform', 'rejected', 'Hassan Malik', 1, 0, $7, $1, $1),
    ('Fund onboarding redesign', 'Fund the redesigned activation flow projected to lift D7 retention.', 'strategic', 'Growth', 'pending', 'Devon Clarke', 3, 54000, $4, $1, NULL),
    ('Renegotiate CDN contract', 'Switch tiering to cut egress cost 18% with no latency regression.', 'execution', 'Vendor', 'scheduled', 'Mei Lin', 2, 21000, $5, $1, NULL),
    ('Launch forecast confidence bands', 'Ship p10/p90 bands on the finance dashboard before board prep.', 'execution', 'Analytics', 'approved', 'Yuki Tanaka', 2, 0, $1, $1, $1),
    ('Consolidate design tokens', 'Merge three overlapping component kits into one documented system.', 'execution', 'Design systems', 'pending', 'Lena Fischer', 2, 0, $3, $1, NULL),
    ('Increase enterprise churn reserve', 'Raise the churn reserve 2pts given renewal risk signals.', 'strategic', 'Finance', 'pending', 'Priya Natarajan', 4, -40000, $6, $1, NULL)
    `,
    [ANCHOR.toISOString(), days(1), days(3), days(5), days(7), days(10), days(-4)],
  );

  await pool.query(
    `INSERT INTO signals (label, category, severity, trend, value, change_pct, detected_at, source) VALUES
    ('Checkout error rate', 'Reliability', 4, 'up', 2.3, 38.0, $1, 'Synthetic monitor'),
    ('Enterprise pipeline value', 'Revenue', 2, 'up', 1240000, 12.5, $1, 'CRM'),
    ('D7 activation rate', 'Growth', 3, 'down', 41.2, -6.4, $1, 'Product analytics'),
    ('Support backlog age', 'Customer', 3, 'up', 18.4, 22.1, $1, 'Helpdesk'),
    ('Infra spend vs budget', 'Finance', 2, 'flat', 0.4, 0.8, $1, 'Cloud billing'),
    ('Open critical CVEs', 'Security', 5, 'up', 2, 100.0, $1, 'Vuln scanner'),
    ('NPS (enterprise)', 'Customer', 1, 'up', 54, 4.2, $1, 'Survey pipeline'),
    ('On-call pages / week', 'Reliability', 3, 'down', 6, -14.0, $1, 'PagerDuty export'),
    ('Churn risk accounts', 'Revenue', 4, 'up', 9, 28.0, $1, 'Health score model'),
    ('Forecast variance (revenue)', 'Finance', 2, 'down', 3.1, -1.1, $1, 'Monte Carlo cache')
    `,
    [ANCHOR.toISOString()],
  );

  const metricRows = [
    ["Monthly recurring revenue", "Revenue", "USD", 482000, 500000, 462000, 482000, 505000, series(430000, 3700)],
    ["Gross margin", "Finance", "%", 71.4, 73, 69.8, 71.4, 73.1, series(68, 0.26)],
    ["D7 activation", "Growth", "%", 41.2, 48, 37.5, 41.2, 45.0, series(39, 0.15)],
    ["P1 incident count", "Reliability", "count", 3, 1, 1, 3, 5, series(4, -0.08)],
    ["Support CSAT", "Customer", "%", 92.3, 95, 89.1, 92.3, 94.8, series(90, 0.17)],
    ["Net revenue retention", "Revenue", "%", 108.6, 112, 103.2, 108.6, 113.5, series(104, 0.33)],
    ["Infra cost per 1k requests", "Finance", "USD", 0.84, 0.75, 0.78, 0.84, 0.91, series(0.95, -0.008)],
    ["Security findings open", "Reliability", "count", 14, 8, 10, 14, 19, series(20, -0.4)],
  ];
  for (const [name, category, unit, value, target, p10, p50, p90, s] of metricRows) {
    await pool.query(
      `INSERT INTO metrics (name, category, unit, value, target, p10, p50, p90, series, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, category, unit, value, target, p10, p50, p90, JSON.stringify(s), ANCHOR.toISOString()],
    );
  }

  await pool.query(
    `INSERT INTO knowledge_items (title, summary, tag, confidence, updated_at) VALUES
    ('Checkout latency correlates with cart abandonment', 'Every +100ms of checkout latency tracks with a 1.8% abandonment increase across the last two quarters.', 'Growth', 82, $1),
    ('EU enterprise buyers require data residency', 'Of the last 9 lost enterprise EU deals, 6 cited missing EU data residency as a blocker.', 'Revenue', 91, $1),
    ('On-call load concentrated in Platform', '70% of pages in the last 90 days originated from three Platform services.', 'Reliability', 88, $1),
    ('Support tier upsell has low cannibalization', 'Accounts upgrading to the 1-hour SLA tier show no measurable drop in base-tier renewals.', 'Revenue', 74, $1),
    ('Design token sprawl increases review time', 'PRs touching UI took 2.3x longer to review before token consolidation began.', 'Engineering', 69, $1),
    ('Forecast bands reduce board back-and-forth', 'Adding p10/p90 bands to the finance deck cut board follow-up questions by about a third.', 'Finance', 77, $1),
    ('Legacy CSV importer drives support tickets', 'The legacy importer accounts for 11% of billing support tickets despite 5% of billing volume.', 'Finance', 85, $1),
    ('Security findings cluster after dependency bumps', 'Most new critical findings appear within 48 hours of a major dependency upgrade.', 'Security', 80, $1)
    `,
    [ANCHOR.toISOString()],
  );

  await pool.query(
    `INSERT INTO hypotheses (statement, status, confidence, owner, evidence_count, updated_at) VALUES
    ('Reducing checkout latency by 150ms lifts conversion by 1%+', 'testing', 64, 'Devon Clarke', 3, $1),
    ('EU region launch unlocks $900k in stalled pipeline within two quarters', 'testing', 58, 'Carlos Mendes', 2, $1),
    ('Splitting the on-call rotation by service cuts P1 count 20%', 'validated', 81, 'Amara Osei', 5, $1),
    ('SLA upsell will reach 12% attach rate among enterprise accounts', 'testing', 47, 'Grace Okafor', 2, $1),
    ('Token consolidation cuts UI PR review time by 30%', 'validated', 73, 'Lena Fischer', 4, $1),
    ('Confidence bands reduce finance review cycles by one meeting', 'testing', 55, 'Yuki Tanaka', 1, $1),
    ('Retiring the CSV importer will not raise churn', 'validated', 69, 'Priya Natarajan', 3, $1),
    ('Mandatory dependency review window reduces critical CVEs 25%', 'testing', 51, 'Tomas Novak', 2, $1)
    `,
    [ANCHOR.toISOString()],
  );

  await pool.query(
    `INSERT INTO financial_lines (name, category, amount, period, forecast_low, forecast_high) VALUES
    ('Subscription revenue', 'revenue', 412000, '2026-01', 398000, 428000),
    ('Usage-based revenue', 'revenue', 70000, '2026-01', 61000, 81000),
    ('Professional services', 'revenue', 18000, '2026-01', 14000, 23000),
    ('Cloud infrastructure', 'cost', 96000, '2026-01', 90000, 104000),
    ('Third-party SaaS', 'cost', 31000, '2026-01', 29000, 34000),
    ('Payroll — Platform', 'cost', 184000, '2026-01', 184000, 184000),
    ('Payroll — Revenue', 'cost', 142000, '2026-01', 142000, 142000),
    ('Support tooling', 'cost', 12000, '2026-01', 11000, 13500),
    ('Security tooling', 'cost', 9000, '2026-01', 9000, 11000),
    ('Marketing programs', 'cost', 38000, '2026-01', 32000, 45000)
    `,
    [],
  );

  await pool.query(
    `INSERT INTO playbooks (name, description, trigger, status, last_run_at, success_rate) VALUES
    ('Checkout error rollback', 'Automatically rolls back the last checkout deploy when error rate exceeds 2%.', 'Checkout error rate > 2% for 5 min', 'active', $1, 96.5),
    ('Churn-risk save sequence', 'Triggers a CSM outreach sequence for accounts crossing the churn-risk threshold.', 'Health score drops below 40', 'active', $1, 61.2),
    ('Credential rotation', 'Rotates flagged API credentials and notifies the owning team.', 'Security scan flags exposed credential', 'active', $1, 100.0),
    ('Marketing spend pacing', 'Pauses underperforming campaigns once CAC exceeds target by 25%.', 'CAC > 1.25x target for 3 days', 'draft', NULL, 0),
    ('CDN renegotiation tracker', 'Tracks egress savings weekly after the CDN contract change.', 'Monthly on the 1st', 'active', $1, 100.0),
    ('Onboarding nudge sequence', 'Sends a nudge sequence to accounts stalled in onboarding for 3+ days.', 'Onboarding step idle > 3 days', 'archived', $1, 42.0)
    `,
    [ANCHOR.toISOString()],
  );

  await pool.query(
    `INSERT INTO activity_log (entity, entity_id, change, actor, occurred_at) VALUES
    ('decision', 5, 'Approved — SLA tier launch scheduled for next sprint', 'Grace Okafor', $1),
    ('decision', 6, 'Approved — credential rotation completed', 'Tomas Novak', $1),
    ('decision', 7, 'Rejected — usage too low to justify migration cost', 'Hassan Malik', $1),
    ('decision', 10, 'Approved — confidence bands shipped to finance dashboard', 'Yuki Tanaka', $1),
    ('signal', 6, 'Severity escalated from 4 to 5 after second CVE detected', 'Tomas Novak', $1),
    ('metric', 4, 'P1 incident count crossed target threshold', 'Amara Osei', $1),
    ('playbook', 1, 'Checkout error rollback executed automatically', 'System', $1),
    ('person', 4, 'Marked as on leave; on-call rotation updated', 'Amara Osei', $1)
    `,
    [ANCHOR.toISOString()],
  );

  console.log("Seed complete.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
