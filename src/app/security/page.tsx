import { db } from "@/db";
import * as s from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Card, Badge } from "@/components/Shell";

export const dynamic = "force-dynamic";

async function addFinding(formData: FormData) {
  "use server";
  await db.insert(s.securityFindings).values({
    severity: String(formData.get("severity") || "low"),
    findingClass: String(formData.get("findingClass") || "web"),
    description: String(formData.get("description") || ""),
    slaDays: Number(formData.get("slaDays") || 30),
  });
  revalidatePath("/security");
}

async function mitigate(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  await db.update(s.securityFindings).set({ status: "mitigated" }).where(eq(s.securityFindings.id, id));
  revalidatePath("/security");
}

const PENTEST_CLASSES = ["web", "api", "authz", "ai-prompt-injection", "ai-data-leak", "supply-chain", "infra"] as const;

function daysSince(d: Date | string) {
  return Math.round((Date.now() - new Date(d).getTime()) / 86400000);
}

export default async function SecurityPage() {
  const findings = await db.select().from(s.securityFindings).orderBy(desc(s.securityFindings.discoveredAt));
  const open = findings.filter((f) => f.status === "open");
  const overdue = open.filter((f) => daysSince(f.discoveredAt) > f.slaDays);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 105</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Security &amp; Supply-Chain Hardening</h1>
        <p className="mt-1 text-sm text-slate-600">
          Findings are tracked to an SLA, never silently closed. The spec&rsquo;s 7 pentest classes are enumerated
          below; this sandbox has no automated DAST/pentest runner, so coverage is tracked manually and honestly.
        </p>
      </header>

      <Card title="Pentest suite class coverage (enumerated, manual tracking in this sandbox)">
        <div className="flex flex-wrap gap-2">
          {PENTEST_CLASSES.map((c) => {
            const n = findings.filter((f) => f.findingClass === c).length;
            return <Badge key={c} tone={n > 0 ? "indigo" : "slate"}>{c} ({n})</Badge>;
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Open findings"><p className="text-2xl font-semibold">{open.length}</p></Card>
        <Card title="Overdue vs SLA"><p className="text-2xl font-semibold text-rose-600">{overdue.length}</p></Card>
        <Card title="Mitigated"><p className="text-2xl font-semibold text-emerald-600">{findings.filter((f) => f.status === "mitigated").length}</p></Card>
      </div>

      <Card title="Log a finding">
        <form action={addFinding} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <select name="severity" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <select name="findingClass" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            {PENTEST_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="slaDays" type="number" placeholder="SLA days" defaultValue={30} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="description" placeholder="Description" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-1" />
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 sm:col-span-4 sm:w-fit">Log finding</button>
        </form>
      </Card>

      <Card title={`Findings (${findings.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Severity</th><th>Class</th><th>Description</th><th>SLA</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="py-1.5"><Badge tone={f.severity === "critical" ? "red" : f.severity === "high" ? "amber" : "slate"}>{f.severity}</Badge></td>
                <td>{f.findingClass}</td>
                <td className="text-xs text-slate-600">{f.description}</td>
                <td className="text-xs">{daysSince(f.discoveredAt)}d / {f.slaDays}d</td>
                <td><Badge tone={f.status === "mitigated" ? "green" : f.status === "accepted" ? "slate" : "amber"}>{f.status}</Badge></td>
                <td>
                  {f.status === "open" && (
                    <form action={mitigate}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Mark mitigated</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
