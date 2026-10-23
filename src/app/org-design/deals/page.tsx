"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Deal = { id: number; name: string; targetCompany: string; phase: string; createdAt: string };

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [name, setName] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [closeDate, setCloseDate] = useState("");

  function load() {
    fetch("/api/org-design/deals").then((r) => r.json()).then((d) => setDeals(d.deals ?? []));
  }

  useEffect(load, []);

  async function createDeal() {
    if (!name || !targetCompany) return;
    await fetch("/api/org-design/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, targetCompany, closeDate: closeDate || undefined }),
    });
    setName("");
    setTargetCompany("");
    setCloseDate("");
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">New deal</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <input placeholder="Deal name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Target company" value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button onClick={createDeal} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Create deal
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="m-0 text-lg font-semibold text-slate-950">Deals</h2>
        <div className="mt-3 space-y-2">
          {deals.map((d) => (
            <Link key={d.id} href={`/org-design/deals/${d.id}`} className="block rounded-xl border border-slate-200 px-4 py-3 hover:border-indigo-400 hover:bg-indigo-50/40">
              <p className="m-0 font-medium text-slate-900">{d.name} — acquiring {d.targetCompany}</p>
              <p className="m-0 text-xs text-slate-500">phase: {d.phase} · created {new Date(d.createdAt).toLocaleDateString()}</p>
            </Link>
          ))}
          {deals.length === 0 && <p className="text-sm text-slate-400">No deals yet — seed demo data from the Overview tab or create one above.</p>}
        </div>
      </section>
    </div>
  );
}
