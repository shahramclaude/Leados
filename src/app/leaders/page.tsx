import Link from "next/link";
import { listLeaders } from "@/lib/app/useCases/leaders/listLeaders";

export const dynamic = "force-dynamic";

const BAND_COLORS: Record<string, string> = {
  exemplary: "bg-emerald-100 text-emerald-800",
  ready: "bg-sky-100 text-sky-800",
  developing: "bg-amber-100 text-amber-800",
  emerging: "bg-rose-100 text-rose-800",
};

export default async function LeadersPage() {
  const leaders = await listLeaders();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-slate-950">Leaders</h1>
        <Link
          href="/leaders/new"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Register leader
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Readiness is computed by{" "}
        <code>src/lib/domain/leadership/readinessEngine.ts</code> — a pure function with zero I/O.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {leaders.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No leaders yet.{" "}
            <Link href="/leaders/new" className="text-indigo-600 underline">
              Register the first one.
            </Link>
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Readiness</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaders.map((leader) => (
                <tr key={leader.id}>
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-900">{leader.name}</p>
                    <p className="text-xs text-slate-500">{leader.email}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-700">{leader.role}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        BAND_COLORS[leader.readinessBand ?? ""] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {leader.readinessScore ?? "—"} · {leader.readinessBand ?? "unscored"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
