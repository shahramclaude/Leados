import { db } from "@/db";
import {
  people,
  oneOnOnes,
  decisions,
  metricDefs,
  metricValues,
  events,
  notifications,
  rules,
  ruleEvaluations,
  playbooks,
  insights,
  scenarios,
  settings,
  autonomousRuns,
} from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [
    peopleRows,
    oneOnOnesRows,
    decisionsRows,
    metricDefsRows,
    metricValuesRows,
    eventsRows,
    notificationsRows,
    rulesRows,
    ruleEvaluationsRows,
    playbooksRows,
    insightsRows,
    scenariosRows,
    settingsRows,
    autonomousRunsRows,
  ] = await Promise.all([
    db.select().from(people),
    db.select().from(oneOnOnes),
    db.select().from(decisions),
    db.select().from(metricDefs),
    db.select().from(metricValues),
    db.select().from(events),
    db.select().from(notifications),
    db.select().from(rules),
    db.select().from(ruleEvaluations),
    db.select().from(playbooks),
    db.select().from(insights),
    db.select().from(scenarios),
    db.select().from(settings),
    db.select().from(autonomousRuns),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    people: peopleRows,
    oneOnOnes: oneOnOnesRows,
    decisions: decisionsRows,
    metricDefs: metricDefsRows,
    metricValues: metricValuesRows,
    events: eventsRows,
    notifications: notificationsRows,
    rules: rulesRows,
    ruleEvaluations: ruleEvaluationsRows,
    playbooks: playbooksRows,
    insights: insightsRows,
    scenarios: scenariosRows,
    settings: settingsRows,
    autonomousRuns: autonomousRunsRows,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=leados-export.json",
    },
  });
}
