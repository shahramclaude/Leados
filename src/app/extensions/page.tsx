import { db } from "@/db";
import * as s from "@/db/schema";
import { desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Card, Badge } from "@/components/Shell";

export const dynamic = "force-dynamic";

async function addExtension(formData: FormData) {
  "use server";
  const capabilities = String(formData.get("capabilities") || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  await db.insert(s.extensions).values({
    name: String(formData.get("name") || ""),
    kind: String(formData.get("kind") || "widget"),
    capabilities,
    verified: "none",
  });
  revalidatePath("/extensions");
}

const CAPABILITY_RISK: Record<string, number> = {
  "read:scope": 1,
  "write:scope": 2,
  "ui:render": 1,
  "ai:invoke": 2,
  "net:egress": 3,
};

export default async function ExtensionsPage() {
  const extensions = await db.select().from(s.extensions).orderBy(desc(s.extensions.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 98</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Extensibility Platform v2</h1>
        <p className="mt-1 text-sm text-slate-600">
          One extension mechanism for widgets, integrations, rule-packs, and workflow templates. Every extension
          declares scoped capabilities; the highest-risk declared capability sets its effective trust tier.
        </p>
      </header>

      <Card title="Register an extension manifest">
        <form action={addExtension} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input name="name" placeholder="Extension name" required className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <select name="kind" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="widget">widget</option>
            <option value="integration">integration</option>
            <option value="report">report</option>
            <option value="rule-pack">rule-pack</option>
            <option value="workflow-template">workflow-template</option>
          </select>
          <input name="capabilities" placeholder="Capabilities (comma-separated)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Register (unverified)</button>
        </form>
      </Card>

      <Card title={`Registry (${extensions.length})`}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Name</th><th>Kind</th><th>Capabilities</th><th>Risk tier</th><th>Verification</th><th>Installs</th></tr>
          </thead>
          <tbody>
            {extensions.map((e) => {
              const risk = Math.max(0, ...e.capabilities.map((c) => CAPABILITY_RISK[c] ?? 1));
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="py-1.5">{e.name}</td>
                  <td><Badge tone="slate">{e.kind}</Badge></td>
                  <td className="text-xs text-slate-600">{e.capabilities.join(", ") || "—"}</td>
                  <td>
                    <Badge tone={risk >= 3 ? "red" : risk === 2 ? "amber" : "green"}>T{risk}</Badge>
                  </td>
                  <td>
                    <Badge tone={e.verified === "security+quality" ? "green" : e.verified === "security" ? "indigo" : "slate"}>{e.verified}</Badge>
                  </td>
                  <td>{e.installCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
