import { db } from "@/db";
import { people } from "@/db/schema";
import {
  buildCsvExport,
  buildExecutiveWeeklyReport,
  getFinancialIntelligenceReport,
} from "@/lib/financialReport";
import { buildOrchestratorResult } from "@/lib/orchestrator";
import type { Domain, Person } from "@/lib/financialOS";

export const dynamic = "force-dynamic";

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

async function loadPeople(): Promise<Person[]> {
  const rows = await db.select().from(people);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    domain: r.domain as Domain,
    team: r.team,
    monthlySalary: toNumber(r.monthlySalary),
    active: r.active,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") ?? "json").toLowerCase();

  try {
    const report = await getFinancialIntelligenceReport();

    if (format === "csv") {
      const csv = buildCsvExport(report);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="financial-export-${report.generatedAt.slice(0, 10)}.csv"`,
        },
      });
    }

    if (format === "executive") {
      const peopleRows = await loadPeople();
      const executive = buildExecutiveWeeklyReport(report, peopleRows);
      return Response.json(executive, {
        headers: {
          "Content-Disposition": `attachment; filename="executive-report-${executive.weekEnding}.json"`,
        },
      });
    }

    if (format !== "json") {
      return Response.json(
        { error: `Unknown format "${format}". Use one of: json, csv, executive.` },
        { status: 400 },
      );
    }

    // Default / "json" format: full flat dump of the financial intelligence report,
    // plus the people roster and orchestrator rollup, for programmatic consumers.
    const peopleRows = await loadPeople();
    const orchestrator = buildOrchestratorResult({ financialHealthScore: report.financialHealthScore });

    return Response.json({
      ...report,
      people: peopleRows,
      orchestrator,
    });
  } catch (error) {
    console.error("GET /api/export failed", error);
    return Response.json({ error: "Failed to build export" }, { status: 500 });
  }
}
