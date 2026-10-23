import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ok } from "@/lib/leados/crud";
import { MODULES } from "@/lib/leados/modules";
import {
  ideas,
  mediaItems,
  partners,
  integrationPlans,
  synergyItems,
  regulatoryItems,
  teamDiagnostics,
  negotiationCases,
  benchRoles,
  successors,
  agentRoles,
  fitnessFunctions,
  rituals,
  tenants,
  processSpecs,
  valueHypotheses,
  methodCandidates,
  charterStatements,
} from "@/db/schema";

const PRIMARY_TABLE: Record<string, unknown> = {
  innovation: ideas,
  brand: mediaItems,
  partnerships: partners,
  mna: integrationPlans,
  regulatory: regulatoryItems,
  team: teamDiagnostics,
  negotiation: negotiationCases,
  succession: benchRoles,
  agents: agentRoles,
  architecture: fitnessFunctions,
  rituals: rituals,
  deployment: tenants,
  formal: processSpecs,
  value: valueHypotheses,
  research: methodCandidates,
  capstone: charterStatements,
};

async function countOf(table: unknown): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await db.select({ n: sql<number>`count(*)` }).from(table as any)) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

async function countWhere(table: unknown, condition: ReturnType<typeof sql>): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await db.select({ n: sql<number>`count(*)` }).from(table as any).where(condition)) as { n: number }[];
  return Number(rows[0]?.n ?? 0);
}

export async function GET() {
  const moduleStatus = await Promise.all(
    MODULES.map(async (m) => {
      const n = await countOf(PRIMARY_TABLE[m.slug]);
      return { part: m.part, slug: m.slug, name: m.name, status: n > 0 ? "measured" : "unknown", records: n };
    })
  );

  const [ideasTotal, ideasWithKill] = await Promise.all([
    countOf(ideas),
    countWhere(ideas, sql`kill_metric is not null and kill_threshold is not null and kill_by_date is not null`),
  ]);
  const [synergyTotal, synergyVerified] = await Promise.all([countOf(synergyItems), countWhere(synergyItems, sql`finance_verified = true`)]);
  const [regTotal, regStrongEvidence] = await Promise.all([
    countOf(regulatoryItems),
    countWhere(regulatoryItems, sql`evidence_class in ('primary-source', 'official-summary')`),
  ]);
  const [agentTotal, agentOwned] = await Promise.all([countOf(agentRoles), countWhere(agentRoles, sql`human_accountable is not null and human_accountable <> ''`)]);
  const [successorsTotal, successorsEvidenced] = await Promise.all([
    countOf(successors),
    countWhere(successors, sql`evidence_notes is not null and evidence_notes <> ''`),
  ]);
  const [ritualTotal] = await Promise.all([countOf(rituals)]);
  const [charterTotal, charterVerified] = await Promise.all([countOf(charterStatements), countWhere(charterStatements, sql`verified = true`)]);

  const safeRatio = (num: number, den: number) => (den > 0 ? num / den : null);

  const measuredModules = moduleStatus.filter((m) => m.status === "measured").length;

  const fivePromises = [
    {
      name: "Intelligence",
      value: safeRatio(ideasWithKill, ideasTotal),
      evidence: `${ideasWithKill}/${ideasTotal} ideas carry pre-committed kill criteria before 'build'`,
      weakest: ideasTotal === 0 ? "No ideas recorded yet — unknown" : `${ideasTotal - ideasWithKill} idea(s) still missing kill criteria`,
    },
    {
      name: "Automation",
      value: ritualTotal > 0 ? 1 : null,
      evidence: `${ritualTotal} management ritual(s) registered with a human-minutes budget`,
      weakest: ritualTotal === 0 ? "No rituals registered yet — unknown" : "Ritual run-rate over time is not yet tracked historically",
    },
    {
      name: "Trust",
      value: safeRatio(synergyVerified, synergyTotal) ?? safeRatio(regStrongEvidence, regTotal),
      evidence: `${synergyVerified}/${synergyTotal} synergies finance-verified; ${regStrongEvidence}/${regTotal} regulatory items on primary evidence`,
      weakest: synergyTotal === 0 && regTotal === 0 ? "No synergies or regulatory items recorded yet — unknown" : "Unverified synergies and press-only regulatory items still exist",
    },
    {
      name: "Universality",
      value: measuredModules / MODULES.length,
      evidence: `${measuredModules}/${MODULES.length} modules carry at least one real record`,
      weakest: `${MODULES.length - measuredModules} module(s) still show 'unknown' — no fabricated data was inserted to hide this`,
    },
    {
      name: "Dignity",
      value: (() => {
        const ratios = [safeRatio(agentOwned, agentTotal), safeRatio(successorsEvidenced, successorsTotal)].filter((r): r is number => r !== null);
        return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
      })(),
      evidence: `${agentOwned}/${agentTotal} agent roles have a human accountable; ${successorsEvidenced}/${successorsTotal} successors have evidence on file`,
      weakest: "No individual-level scoring API exists anywhere in this codebase (architectural, not a metric)",
    },
  ];

  return ok({
    measuredAt: new Date().toISOString(),
    moduleStatus,
    coverage: { declared: MODULES.length, measured: measuredModules, neverRun: MODULES.length - measuredModules },
    fivePromises,
    charter: { total: charterTotal, verified: charterVerified },
  });
}
