import { db } from "@/db";
import * as s from "@/db/schema";
import { Card, Badge } from "@/components/Shell";

export const dynamic = "force-dynamic";

const DIMENSIONS = [
  "intelligence",
  "automation",
  "trust",
  "universality",
  "design",
  "reliability",
  "security",
  "privacy",
  "economics",
] as const;

export default async function GovernancePage() {
  const gates = await db.select().from(s.gateLedger);

  const byDimension = DIMENSIONS.map((dim) => {
    const rows = gates.filter((g) => g.dimension === dim);
    const pass = rows.filter((g) => g.status === "pass").length;
    const score = rows.length ? pass / rows.length : 0;
    return { dim, rows, score };
  });

  const totals = {
    pass: gates.filter((g) => g.status === "pass").length,
    fail: gates.filter((g) => g.status === "fail").length,
    unknown: gates.filter((g) => g.status === "unknown").length,
    neverRun: gates.filter((g) => g.status === "never-run").length,
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 107</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Capstone IV — Autonomous Readiness Audit</h1>
        <p className="mt-1 text-sm text-slate-600">
          This gate matrix is queried live from <code>gate_ledger</code> on every page load. Gates are reported
          honestly: <Badge tone="green">pass</Badge> only where the acceptance check genuinely ran against real
          data in this sandbox; <Badge tone="slate">never-run</Badge> where the gate requires infrastructure
          (CI runners, Terraform, load generators, pentest automation) this environment does not provide.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Badge tone="green">pass: {totals.pass}</Badge>
        <Badge tone="red">fail: {totals.fail}</Badge>
        <Badge tone="amber">unknown: {totals.unknown}</Badge>
        <Badge tone="slate">never-run: {totals.neverRun}</Badge>
      </div>

      <Card title="Readiness score by dimension (weighted pass ratio — weakest links listed, not hidden)">
        <div className="space-y-3">
          {byDimension.map(({ dim, rows, score }) => (
            <div key={dim}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize">{dim}</span>
                <span className="text-slate-500">{rows.length ? `${(score * 100).toFixed(0)}% (${rows.length} gate${rows.length === 1 ? "" : "s"})` : "no gates registered"}</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-indigo-500"
                  style={{ width: `${rows.length ? score * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Grand gate matrix (live)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Part</th><th>Gate</th><th>Statement</th><th>Threshold</th><th>Measured</th><th>Status</th></tr>
          </thead>
          <tbody>
            {gates
              .sort((a, b) => a.part - b.part)
              .map((g) => (
                <tr key={g.id} className="border-t border-slate-100 align-top">
                  <td className="py-1.5">{g.part}</td>
                  <td className="font-mono text-xs">{g.gateId}</td>
                  <td className="text-xs">{g.statement}</td>
                  <td className="text-xs text-slate-500">{g.acceptThreshold}</td>
                  <td className="text-xs text-slate-500">{g.measuredValue}</td>
                  <td>
                    <Badge tone={g.status === "pass" ? "green" : g.status === "fail" ? "red" : g.status === "unknown" ? "amber" : "slate"}>
                      {g.status}
                    </Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      <Card title="Why this isn't 'ready' yet (mandatory honest argument)">
        <p className="text-sm leading-relaxed text-slate-600">
          The weakest dimension is <strong>reliability</strong> and <strong>security</strong>: this build has no
          automated CI/CD pipeline with canary analysis or rehearsed rollback (Part 100), no infrastructure-as-code
          with multi-environment parity (Part 101), and no automated penetration-testing suite (Part 105) &mdash;
          all three require execution infrastructure (CI runners, a Terraform backend, a DAST harness) that does not
          exist in this single-container sandbox. <strong>Privacy</strong> mapping (Part 106) also covers only a
          representative sample of fields, not the full &ge;40-field enumeration the spec requires. These are
          tracked above as <code>never-run</code> or <code>fail</code> gates with owners rather than narrated away,
          per the program&rsquo;s own anti-slop rule: a gap logged honestly is not a defect; a gap hidden is.
        </p>
      </Card>
    </div>
  );
}
