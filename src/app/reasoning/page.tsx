import { listClaimsWithEvidence, buildDialectic } from "@/lib/reasoning";
import { createClaimAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReasoningPage() {
  const claims = await listClaimsWithEvidence();
  const scopes = Array.from(new Set(claims.map((c) => c.scope)));
  const dialectics = await Promise.all(scopes.map((s) => buildDialectic(s)));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 60</p>
        <h1 className="text-2xl font-semibold text-white">Hypothesis &amp; Reasoning Workbench</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every claim is stored with mandatory evidence (enforced by a deferred DB constraint trigger — a claim
          cannot commit without an evidence link). Contradictions are flagged, never silently averaged.
        </p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Dialectic solver — thesis vs. antithesis by scope</h2>
        <div className="mt-3 space-y-4">
          {dialectics.length === 0 && <p className="text-sm text-slate-500">No claims yet.</p>}
          {dialectics.map((d) => (
            <div key={d.scope} className="rounded-xl border border-slate-800 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{d.scope}</p>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-emerald-400">Thesis</p>
                  <p className="text-sm text-slate-300">{d.thesis ? d.thesis.text : "—"}</p>
                  {d.thesis && <p className="text-xs text-slate-500">confidence {d.thesis.confidence}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-rose-400">Antithesis (steelman)</p>
                  <p className="text-sm text-slate-300">{d.antithesis ? d.antithesis.text : "—"}</p>
                  {d.antithesis && <p className="text-xs text-slate-500">confidence {d.antithesis.confidence}</p>}
                </div>
              </div>
              {d.unresolved.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-xs text-amber-300">
                  {d.unresolved.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={createClaimAction} className="card space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">New claim (evidence required)</h3>
          <label className="block text-xs text-slate-400">
            Claim text
            <textarea name="text" required rows={2} className="mt-1 w-full" />
          </label>
          <label className="block text-xs text-slate-400">
            Scope (groups claims into a debate)
            <input name="scope" required className="mt-1 w-full" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-400">
              Kind
              <select name="kind" className="mt-1 w-full">
                <option value="descriptive">descriptive</option>
                <option value="causal">causal</option>
                <option value="normative">normative</option>
                <option value="predictive">predictive</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Polarity
              <select name="polarity" className="mt-1 w-full">
                <option value="supports">supports</option>
                <option value="opposes">opposes</option>
              </select>
            </label>
          </div>
          <label className="block text-xs text-slate-400">
            Confidence (0–1)
            <input type="number" step="0.01" min={0} max={1} name="confidence" defaultValue={0.6} className="mt-1 w-full" />
          </label>
          <label className="block text-xs text-slate-400">
            Evidence source ref
            <input name="evidenceSourceRef" required className="mt-1 w-full" />
          </label>
          <label className="block text-xs text-slate-400">
            Evidence reliability (0–1)
            <input type="number" step="0.01" min={0} max={1} name="evidenceReliability" defaultValue={0.6} className="mt-1 w-full" />
          </label>
          <label className="block text-xs text-slate-400">
            Evidence extract
            <textarea name="evidenceExtract" required rows={2} className="mt-1 w-full" />
          </label>
          <button className="btn btn-primary" type="submit">
            Add claim
          </button>
        </form>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-200">All claims ({claims.length})</h3>
          <div className="mt-3 max-h-[480px] space-y-3 overflow-y-auto pr-2">
            {claims.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-800 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`badge ${c.polarity === "supports" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                    {c.polarity}
                  </span>
                  <span
                    className={`badge ${
                      c.status === "conflict" ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-200">{c.text}</p>
                <p className="mt-1 text-xs text-slate-500">
                  scope: {c.scope} · kind: {c.kind} · confidence: {c.confidence}
                </p>
                <div className="mt-2 space-y-1">
                  {c.evidence.map((e) =>
                    e ? (
                      <p key={e.id} className="text-xs text-slate-500">
                        ↳ evidence ({e.kind}, reliability {e.reliability}): {e.extract}
                      </p>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
