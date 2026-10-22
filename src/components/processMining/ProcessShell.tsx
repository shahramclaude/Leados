"use client";

// Shared chrome for the Part 28 process-intelligence surfaces: tab nav,
// process picker + "seed demo data" action, and the mandatory provenance
// banner ("discovered from N cases... not the designed process").
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSelectedProcess } from "./useSelectedProcess";

const TABS = [
  { href: "/process-mining", label: "Overview" },
  { href: "/process-mining/xray", label: "Process X-Ray" },
  { href: "/process-mining/bottlenecks", label: "Bottleneck Board" },
  { href: "/process-mining/conformance", label: "Conformance Explorer" },
  { href: "/process-mining/automation", label: "Automation ROI" },
];

export function ProcessShell({
  children,
  onProcessChange,
}: {
  children: (processName: string) => React.ReactNode;
  onProcessChange?: (processName: string) => void;
}) {
  const pathname = usePathname();
  const [processName, setProcessName] = useSelectedProcess();
  const [available, setAvailable] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  const loadProcesses = async () => {
    try {
      const res = await fetch("/api/process-mining/processes");
      const json = await res.json();
      if (json.ok) setAvailable(json.processes);
    } catch {
      // swallow — UI shows empty picker, seed button still works
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  useEffect(() => {
    onProcessChange?.(processName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processName]);

  const seed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await fetch("/api/process-mining/seed", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setSeedMessage(`Seeded: benchmark_flow +${json.inserted.benchmark_flow} events, lead_to_close +${json.inserted.lead_to_close} events.`);
        await loadProcesses();
      } else {
        setSeedMessage(`Seed failed: ${json.error}`);
      }
    } catch (err) {
      setSeedMessage(`Seed failed: ${String(err)}`);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <p className="text-xs uppercase tracking-[0.08em] text-slate-500">LEADOS · Part 28</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Process Intelligence</h1>
          <p className="mt-1 text-sm text-slate-600">
            Mining, conformance, queueing analytics, and automation scoring — computed from the event log, not from
            documentation.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700">
              Process:
              <select
                value={processName}
                onChange={(e) => setProcessName(e.target.value)}
                className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                <option value="benchmark_flow">benchmark_flow</option>
                <option value="lead_to_close">lead_to_close</option>
                {available
                  .filter((p) => p !== "benchmark_flow" && p !== "lead_to_close")
                  .map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
              </select>
            </label>
            <button
              onClick={seed}
              disabled={seeding}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {seeding ? "Seeding…" : "Seed demo data"}
            </button>
            {seedMessage ? <span className="text-xs text-slate-500">{seedMessage}</span> : null}
          </div>

          <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                    active ? "border border-b-0 border-slate-200 bg-slate-100 text-slate-950" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children(processName)}</main>
    </div>
  );
}

export function ProvenanceBanner({ text }: { text: string }) {
  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="font-semibold">Discovered, not designed. </span>
      {text}
    </div>
  );
}
