import Link from "next/link";
import PoliciesClient from "./PoliciesClient";

export const dynamic = "force-dynamic";

export default function PoliciesPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/cadence" className="text-sm text-indigo-600 hover:underline">
          ← Rhythm Board
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Cadence Policy Editor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Adaptive-cadence rules in plain language, with a simulation preview against real occurrence history
          before you turn one on.
        </p>
        <PoliciesClient />
      </div>
    </main>
  );
}
