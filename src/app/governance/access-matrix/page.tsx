import { Fragment } from "react";
import { allCombinations, type ResourceType } from "@/lib/governance/access";
import { BOARD_TIERS } from "@/lib/governance/types";

export const dynamic = "force-dynamic";

const RESOURCES: ResourceType[] = [
  "board_pack_full",
  "board_pack_committee_scope",
  "board_pack_public_summary",
  "resolution_register",
  "minutes_full",
  "minutes_public_summary",
  "information_request",
  "whistleblower_channel",
  "conflicts_register",
  "governance_metrics_aggregate",
  "governance_metrics_individual",
];

export default function AccessMatrixPage() {
  const matrix = allCombinations();
  const lookup = new Map(
    matrix.map((m) => [`${m.tier}|${m.resource}|${m.action}`, m.expected]),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-950">Board-tier access-attempt matrix</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Board materials are among the most sensitive data in LEADOS. Every cell below is enforced
        in <code>src/lib/governance/access.ts</code> and re-checked server-side on every API route —
        this page only renders the same matrix the <code>npm run verify</code> gate exercises.
        Blank cells with a dash are explicit denials, not omissions.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1100px] text-left text-xs">
          <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2">Tier</th>
              {RESOURCES.map((r) => (
                <th key={r} colSpan={2} className="px-3 py-2 text-center">
                  {r.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-1"></th>
              {RESOURCES.map((r) => (
                <Fragment key={r}>
                  <th className="px-3 py-1 text-center">R</th>
                  <th className="px-3 py-1 text-center">W</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BOARD_TIERS.map((tier) => (
              <tr key={tier}>
                <td className="sticky left-0 bg-white px-3 py-2 font-medium text-slate-900">
                  {tier}
                </td>
                {RESOURCES.map((r) => (
                  <>
                    <Cell key={r + "-r"} allowed={lookup.get(`${tier}|${r}|read`) ?? false} />
                    <Cell key={r + "-w"} allowed={lookup.get(`${tier}|${r}|write`) ?? false} />
                  </>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Cell({ allowed }: { allowed: boolean }) {
  return (
    <td className={`px-3 py-2 text-center ${allowed ? "text-emerald-700" : "text-slate-300"}`}>
      {allowed ? "✓" : "–"}
    </td>
  );
}
