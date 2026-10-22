// Seeds illustrative baseline data for every seam so the dashboard renders
// something meaningful on first boot. Idempotent: clears LEADOS-owned tables
// and re-inserts a fixed demo dataset. Safe to re-run.
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Clear in FK-safe order.
    await client.query(`truncate table
      fitness_scores, metrics, domains,
      assurance_checks, engines,
      chaos_experiments, risks,
      board_packs, consolidation_runs, entities,
      voc_feedback, strategy_items,
      automation_scores, process_events
      restart identity cascade`);

    const domainRows = await client.query(
      `insert into domains (key, name, category) values
        ('finance', 'Finance', 'operations'),
        ('sales', 'Sales', 'growth'),
        ('people', 'People', 'operations'),
        ('esg', 'ESG', 'risk'),
        ('customer', 'Customer', 'growth')
      returning id, key`,
    );
    const domainId = Object.fromEntries(domainRows.rows.map((r) => [r.key, r.id]));

    await client.query(
      `insert into metrics (domain_id, name, value, target, unit, period) values
        ($1, 'Revenue', 920000, 1000000, 'USD', '2026-Q1'),
        ($1, 'Gross margin', 58, 60, 'pct', '2026-Q1'),
        ($2, 'Pipeline coverage', 2.1, 3, 'ratio', '2026-Q1'),
        ($2, 'Win rate', 24, 28, 'pct', '2026-Q1'),
        ($3, 'Attrition', 11, 9, 'pct', '2026-Q1'),
        ($3, 'eNPS', 32, 40, 'score', '2026-Q1'),
        ($4, 'Scope 1+2 emissions', 410, 450, 'tCO2e', '2026-Q1'),
        ($4, 'Disclosure completeness', 70, 100, 'pct', '2026-Q1'),
        ($5, 'NPS', 41, 50, 'score', '2026-Q1'),
        ($5, 'Support SLA adherence', 91, 95, 'pct', '2026-Q1')`,
      [domainId.finance, domainId.sales, domainId.people, domainId.esg, domainId.customer],
    );

    const engineRows = await client.query(
      `insert into engines (key, name, type) values
        ('forecast-engine', 'Revenue Forecast Engine', 'predictive'),
        ('churn-engine', 'Churn Risk Engine', 'predictive'),
        ('nlp-voc-engine', 'VoC Theme Extraction Engine', 'nlp'),
        ('automation-recommender', 'Automation Recommender', 'optimization'),
        ('esg-estimator', 'ESG Estimation Engine', 'estimation')
      returning id, key`,
    );
    const engineId = Object.fromEntries(engineRows.rows.map((r) => [r.key, r.id]));

    await client.query(
      `insert into assurance_checks (engine_id, check_type, result, severity, notes) values
        ($1, 'drift', 'pass', 'info', 'Forecast error within bounds'),
        ($2, 'drift', 'warn', 'warning', 'Churn model precision down 4pp this period'),
        ($3, 'bias', 'pass', 'info', 'Theme balance checked against source mix'),
        ($4, 'calibration', 'fail', 'critical', 'ESG estimates have never been checked against an external disclosure audit')`,
      [engineId["forecast-engine"], engineId["churn-engine"], engineId["nlp-voc-engine"], engineId["esg-estimator"]],
    );
    // automation-recommender is deliberately left unchecked entirely, to
    // prove the assurance seam surfaces unmonitored engines, not just
    // failing ones.
    await client.query(`update engines set status = 'pass', last_checked_at = now() where key = $1`, [
      engineId["forecast-engine"],
    ]);
    await client.query(`update engines set status = 'warn', last_checked_at = now() where key = $1`, [
      engineId["churn-engine"],
    ]);
    await client.query(`update engines set status = 'pass', last_checked_at = now() where key = $1`, [
      engineId["nlp-voc-engine"],
    ]);
    await client.query(`update engines set status = 'fail', last_checked_at = now() where key = $1`, [
      engineId["esg-estimator"],
    ]);

    const riskRows = await client.query(
      `insert into risks (title, category, likelihood, impact, belief_score, status) values
        ('Key supplier single point of failure', 'operational', 0.3, 0.8, 0.35, 'open'),
        ('Customer data residency breach', 'compliance', 0.15, 0.9, 0.2, 'open'),
        ('Forecast model silent drift', 'ai-governance', 0.4, 0.6, 0.4, 'open')
      returning id, title`,
    );

    await client.query(
      `insert into chaos_experiments (name, target_risk_id, outcome, belief_before, belief_after, notes) values
        ('Supplier outage drill', $1, 'held', 0.35, 0.26, 'Backup supplier activated within SLA'),
        ('Forecast silent-drift drill', $2, 'breached', 0.4, 0.76, 'Drift went undetected for 11 days before this drill caught it — belief raised sharply, by design')`,
      [riskRows.rows[0].id, riskRows.rows[2].id],
    );
    await client.query(`update risks set belief_score = 0.26, updated_at = now() where id = $1`, [
      riskRows.rows[0].id,
    ]);
    await client.query(`update risks set belief_score = 0.76, status = 'escalated', updated_at = now() where id = $1`, [
      riskRows.rows[2].id,
    ]);

    await client.query(
      `insert into entities (name, region, currency, revenue, costs, fx_rate_to_usd, period) values
        ('Leados UK Ltd', 'EMEA', 'GBP', 310000, 210000, 1.27, '2026-Q1'),
        ('Leados US Inc', 'AMER', 'USD', 540000, 400000, 1.0, '2026-Q1'),
        ('Leados APAC Pte', 'APAC', 'SGD', 180000, 140000, 0.74, '2026-Q1')`,
    );

    const strategyRows = await client.query(
      `insert into strategy_items (title, owner, status, priority) values
        ('Fix onboarding drop-off', 'Head of Product', 'in-progress', 'high'),
        ('Expand APAC pricing tiers', 'VP Sales', 'proposed', 'medium')
      returning id, title`,
    );

    await client.query(
      `insert into voc_feedback (source, sentiment, theme, text, linked_strategy_id) values
        ('nps-survey', 'negative', 'onboarding', 'Setup took three support tickets to finish.', $1),
        ('support-ticket', 'negative', 'onboarding', 'Could not find where to invite teammates.', $1),
        ('sales-call', 'neutral', 'pricing', 'Asked about regional pricing for APAC expansion.', $2),
        ('nps-survey', 'positive', 'reporting', 'Dashboards are much clearer than last quarter.', null)`,
      [strategyRows.rows[0].id, strategyRows.rows[1].id],
    );

    await client.query(
      `insert into process_events (process_name, step, duration_ms, automatable) values
        ('invoice-processing', 'data entry', 420000, true),
        ('invoice-processing', 'three-way match', 180000, true),
        ('invoice-processing', 'exception review', 300000, false),
        ('employee-onboarding', 'account provisioning', 240000, true),
        ('employee-onboarding', 'manager sign-off', 360000, false)`,
    );

    await client.query("commit");
    console.log("Seed complete.");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
