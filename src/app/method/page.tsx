import Link from "next/link";
import { contractGaps } from "@/lib/coverageSeedData";

export const dynamic = "force-dynamic";

export default function MethodPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to dashboard
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold text-slate-950">Method & contract gaps</h1>
      </header>

      <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">How the seed rows were derived</h2>
        <p className="text-slate-700">
          One keyword family per part, searched with <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">rg -il</code> across
          <code className="rounded bg-slate-100 px-1 py-0.5 text-sm"> src/ tests/ docs/</code> of the real clone. A keyword hit proves the
          <em> word</em> exists, not the <em>feature</em>. Status badges mean:
        </p>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-semibold text-emerald-700">✅ canonical</span> — evidence in the
            canonical app (<code>src/app/**</code>, <code>src/lib/**</code>, <code>src/db/**</code>,{" "}
            <code>tests/**</code>) or authoritative docs.
          </li>
          <li>
            <span className="font-semibold text-amber-700">🟡 partial</span> — evidence exists but
            is thin, docs-only, or lives in legacy-generation code (
            <code>src/views/*</code>, <code>src/modules/*</code>, root <code>*.js</code>/
            <code>*.tsx</code> — the C2 quarantine) which must NOT be extended.
          </li>
          <li>
            <span className="font-semibold text-rose-700">🔴 absent</span> — essentially no
            evidence; the part is genuinely missing or exists only as a name.
          </li>
        </ul>
        <p className="mt-4 text-slate-700">
          This matrix is a first-pass seed: every row is a claim to verify, not a fact. Phase 0
          upgrades each row (present / partial / missing / legacy-quarantined) against live
          commands — recorded via the verification form on each part&apos;s page — and the
          verified matrix is what should be copied into <code>LEADOS-STATE.md</code> §Coverage.
        </p>
      </section>

      <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Phase-0 dry-run findings</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
          <li>
            <strong>Wrong-checkout trap is real.</strong> A stray extract can sit inside another
            repository&apos;s work tree, so <code>git rev-parse --show-toplevel</code> / <code>git log</code>{" "}
            can silently show a foreign project&apos;s history. Phase 0 must verify{" "}
            <code>git remote get-url origin</code> equals the canonical Leados repo before anything
            else.
          </li>
          <li>
            <strong>Git history is not part evidence.</strong> 100 "Add files via upload" bulk
            commits can never answer "which parts are delivered" —{" "}
            <code>LEADOS-STATE.md</code> + this matrix + <code>docs/</code> are the continuity
            record.
          </li>
          <li>
            <strong>Case-colliding filenames.</strong> e.g. <code>src/lib/monteCarlo.ts</code> vs{" "}
            <code>src/lib/montecarlo.ts</code> (and <code>src/lib/intelligence/montecarlo.ts</code>
            ). Treat case-twins as one file pending a Decommission decision.
          </li>
          <li>
            <strong>Broad-but-shallow coverage.</strong> Every part 00–58 has some evidence, but a
            handful of rows are thin (legacy-only, docs-only, or absent) — tracked on the{" "}
            <Link href="/gaps" className="underline">
              gaps register
            </Link>
            .
          </li>
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Contract gaps</h2>
        <ul className="space-y-4">
          {contractGaps.map((gap) => (
            <li key={gap.id} className="rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-900">
                  {gap.id}. {gap.title}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    gap.status === "fixed"
                      ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20"
                      : "bg-amber-100 text-amber-800 ring-amber-600/20"
                  }`}
                >
                  {gap.status === "fixed" ? "fixed in Session Opener" : "open"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{gap.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
