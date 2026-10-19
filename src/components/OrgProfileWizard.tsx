"use client";
import React, { useState } from "react";
import { DOMAINS, type Domain, type OrgProfile, type OrgSize } from "@/lib/types";
import { defaultDomainsForOrgType } from "@/lib/onboardingSeed";

const ORG_TYPES: { id: OrgSize; label: string }[] = [
  { id: "startup", label: "Startup (<50 people)" },
  { id: "scaleup", label: "Scale-up (50-200)" },
  { id: "enterprise", label: "Enterprise (200+)" },
  { id: "nonprofit", label: "Non-profit" },
  { id: "other", label: "Other" },
];

const CONCERNS: { id: OrgProfile["topConcern"]; label: string }[] = [
  { id: "retention", label: "Retention risk" },
  { id: "runway", label: "Financial runway" },
  { id: "execution", label: "Execution gaps" },
  { id: "culture", label: "Culture" },
  { id: "strategy", label: "Strategy" },
  { id: "compliance", label: "Compliance" },
];

export function OrgProfileWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [orgType, setOrgType] = useState<OrgSize>("startup");
  const [activeDomains, setActiveDomains] = useState<Domain[]>(defaultDomainsForOrgType("startup"));
  const [leaders, setLeaders] = useState([{ name: "", role: "" }]);
  const [topConcern, setTopConcern] = useState<OrgProfile["topConcern"]>("retention");
  const [submitting, setSubmitting] = useState(false);

  function pickOrgType(t: OrgSize) {
    setOrgType(t);
    setActiveDomains(defaultDomainsForOrgType(t));
  }
  function toggleDomain(d: Domain) {
    setActiveDomains((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  async function finish() {
    setSubmitting(true);
    const profile: OrgProfile = {
      orgType,
      activeDomains,
      leaders: leaders.filter((l) => l.name.trim()),
      topConcern,
    };
    await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
    setSubmitting(false);
    onComplete();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-12 text-slate-100">
      <div className="mb-8 text-center">
        <div className="text-2xl font-bold">Welcome to Leados</div>
        <div className="mt-1 text-sm text-slate-400">Let&apos;s personalize your organizational intelligence cockpit — step {step} of 5.</div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        {step === 1 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">What kind of organization are you?</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ORG_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickOrgType(t.id)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm ${orgType === t.id ? "border-sky-500 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-300 hover:border-slate-600"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">What domains are active for your org?</h2>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  onClick={() => toggleDomain(d)}
                  className={`rounded-full border px-3 py-1.5 text-xs capitalize ${activeDomains.includes(d) ? "border-emerald-500 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-400"}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Who are your first leaders?</h2>
            <div className="space-y-2">
              {leaders.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.name}
                    onChange={(e) => setLeaders((cur) => cur.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Name"
                    className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                  <input
                    value={l.role}
                    onChange={(e) => setLeaders((cur) => cur.map((x, idx) => (idx === i ? { ...x, role: e.target.value } : x)))}
                    placeholder="Role"
                    className="flex-1 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              ))}
            </div>
            {leaders.length < 5 && (
              <button onClick={() => setLeaders((cur) => [...cur, { name: "", role: "" }])} className="mt-3 text-xs text-sky-400 hover:underline">
                + add another leader
              </button>
            )}
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">What is your most urgent concern right now?</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CONCERNS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTopConcern(c.id)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm ${topConcern === c.id ? "border-amber-500 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-300 hover:border-slate-600"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="mb-2 text-lg font-semibold">Ready to generate your live signal board</h2>
            <p className="mb-4 text-sm text-slate-400">
              We&apos;ll create a personalized set of sample events (people, OKRs, decisions, signals) tagged as onboarding samples so your Signal
              Board lights up immediately. You can replace them with real events at any time from the Data view.
            </p>
            <ul className="mb-4 space-y-1 text-xs text-slate-500">
              <li>• Org type: {orgType}</li>
              <li>• Domains: {activeDomains.join(", ")}</li>
              <li>• Leaders: {leaders.filter((l) => l.name).map((l) => l.name).join(", ") || "none yet"}</li>
              <li>• Top concern: {topConcern}</li>
            </ul>
            <button
              onClick={finish}
              disabled={submitting}
              className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
            >
              {submitting ? "Generating…" : "Generate my signal board"}
            </button>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="text-xs text-slate-500 disabled:opacity-0">
            ← Back
          </button>
          {step < 5 && (
            <button onClick={() => setStep((s) => Math.min(5, s + 1))} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700">
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
