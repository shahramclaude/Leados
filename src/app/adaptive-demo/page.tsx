"use client";

import { useState } from "react";
import { AdaptationProvider, useAdaptation } from "@/components/adaptation/AdaptationProvider";
import { CognitiveStyleQuestionnaire } from "@/components/adaptation/CognitiveStyleQuestionnaire";
import { DensitySwitcher } from "@/components/adaptation/DensitySwitcher";
import { DomainCard } from "@/components/adaptation/DomainCard";
import { TransparencyPanel } from "@/components/adaptation/TransparencyPanel";
import { DOMAINS, type Domain } from "@/lib/familiarity";

const DOMAIN_LABEL: Record<Domain, string> = {
  finance: "Finance",
  people: "People",
  risk: "Risk",
  tech: "Technology",
};

function Shell() {
  const { standardView, setStandardView, profile, ready } = useAdaptation();
  const [activeDomain, setActiveDomain] = useState<Domain>("finance");
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">LEADOS · Part 41</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Adaptive Executive Dashboard</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              The density, layout and ordering below adapt to how you use this page. Every fact is always shown — adaptation only changes
              its form. Open &ldquo;This view is adapted because…&rdquo; at any time to see why, or switch to the standard view to compare.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            <input type="checkbox" checked={standardView} onChange={(e) => setStandardView(e.target.checked)} data-testid="standard-view-toggle" />
            Standard view (disable adaptation for comparison)
          </label>
        </header>

        {ready && profile && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <DensitySwitcher />
            <button
              type="button"
              onClick={() => setShowQuestionnaire(true)}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Revise cognitive-style questionnaire
            </button>
          </section>
        )}

        <nav className="flex flex-wrap gap-2" role="tablist">
          {DOMAINS.map((domain) => {
            const expertise = profile?.expertise[domain];
            return (
              <button
                key={domain}
                role="tab"
                aria-selected={activeDomain === domain}
                onClick={() => setActiveDomain(domain)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  activeDomain === domain ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {DOMAIN_LABEL[domain]}
                {expertise && <span className="ml-2 text-[10px] opacity-70">({expertise.level})</span>}
              </button>
            );
          })}
        </nav>

        <DomainCard domain={activeDomain} />
        <TransparencyPanel domain={activeDomain} />

        <CognitiveStyleQuestionnaire />
        {showQuestionnaire && <CognitiveStyleQuestionnaire forceOpen onClose={() => setShowQuestionnaire(false)} />}
      </div>
    </main>
  );
}

export default function AdaptiveDemoPage() {
  return (
    <AdaptationProvider>
      <Shell />
    </AdaptationProvider>
  );
}
