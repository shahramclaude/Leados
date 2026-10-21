"use client";

import { useState } from "react";
import { TalentView } from "@/components/TalentView";
import { HighPotentialView } from "@/components/HighPotentialView";

export default function TalentPage() {
  const [tab, setTab] = useState<"succession" | "highPotential">("succession");

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Talent &amp; succession</h1>
      <p className="mt-1 text-sm text-slate-600">
        Evidence-linked bench strength per key role, and skill-coverage-based internal-mobility signals. Every
        number here is decision support — a human makes and owns the actual decision.
      </p>
      <div className="mt-4 flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("succession")}
          className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
            tab === "succession" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500"
          }`}
        >
          Succession matrix
        </button>
        <button
          onClick={() => setTab("highPotential")}
          className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
            tab === "highPotential" ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500"
          }`}
        >
          Growth / mobility signals
        </button>
      </div>
      <div className="mt-6">{tab === "succession" ? <TalentView /> : <HighPotentialView />}</div>
    </main>
  );
}
