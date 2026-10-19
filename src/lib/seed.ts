import { db } from "@/db";
import { decisions, people, projects } from "@/db/schema";
import { generateDecisions, generatePeople, generateProjects } from "@/lib/engine";

let seeded = false;
let seeding: Promise<void> | null = null;

/**
 * Lazily seeds the demo dataset on first access so a fresh database is
 * immediately useful without a separate migration/seed step in CI or local
 * dev. Idempotent: checks row counts before inserting.
 */
export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  if (seeding) return seeding;

  seeding = (async () => {
    const [existingPeople, existingProjects, existingDecisions] = await Promise.all([
      db.select({ id: people.id }).from(people).limit(1),
      db.select({ id: projects.id }).from(projects).limit(1),
      db.select({ id: decisions.id }).from(decisions).limit(1),
    ]);

    if (existingPeople.length === 0) {
      await db.insert(people).values(
        generatePeople(24).map((p) => ({
          name: p.name,
          role: p.role,
          team: p.team,
          tenureMonths: p.tenureMonths,
          sentiment: p.sentiment,
          engagement: p.engagement,
          flightRisk: p.flightRisk,
          lastCheckIn: new Date(p.lastCheckIn),
        })),
      );
    }

    if (existingProjects.length === 0) {
      await db.insert(projects).values(
        generateProjects(10).map((p) => ({
          name: p.name,
          owner: p.owner,
          team: p.team,
          status: p.status,
          health: p.health,
          budgetUsed: p.budgetUsed,
          budgetTotal: p.budgetTotal,
          dueDate: new Date(p.dueDate),
        })),
      );
    }

    if (existingDecisions.length === 0) {
      await db.insert(decisions).values(
        generateDecisions(10).map((d) => ({
          title: d.title,
          owner: d.owner,
          status: d.status,
          severity: d.severity,
          dueDate: new Date(d.dueDate),
          description: d.description,
        })),
      );
    }

    seeded = true;
  })();

  return seeding;
}
