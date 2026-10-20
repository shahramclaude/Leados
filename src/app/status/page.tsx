import { headers } from "next/headers";

export const dynamic = "force-dynamic";

interface Stats {
  status: string;
  uptimeSeconds: number;
  apiVersion: string;
  counts: { decisions: number; findings: number; runs: number; webhookSubscriptions: number };
  webhookHealth: { delivered: number; retrying: number; deadLetter: number };
  generatedAt: string;
}

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const [health, stats] = await Promise.all([
    fetchJson<{ ok: boolean; time: string }>("/api/health"),
    fetchJson<Stats>("/api/stats"),
  ]);

  const operational = health?.ok && stats?.status === "operational";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS Platform</p>
      <h1 className="mt-2 text-4xl font-semibold text-slate-950">Status</h1>

      <div
        className={`mt-6 flex items-center gap-3 rounded-2xl border p-5 ${
          operational ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        }`}
      >
        <span className={`h-3 w-3 rounded-full ${operational ? "bg-emerald-500" : "bg-amber-500"}`} />
        <div>
          <p className="m-0 font-medium text-slate-900">{operational ? "All systems operational" : "Degraded / unreachable"}</p>
          <p className="m-0 text-sm text-slate-600">API version {stats?.apiVersion ?? "unknown"} · generated {stats?.generatedAt ?? "—"}</p>
        </div>
      </div>

      <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Decisions" value={stats?.counts.decisions} />
        <Stat label="Findings" value={stats?.counts.findings} />
        <Stat label="Automation runs" value={stats?.counts.runs} />
        <Stat label="Webhook subs" value={stats?.counts.webhookSubscriptions} />
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="m-0 text-lg font-semibold text-slate-900">Webhook delivery health</h2>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <Stat label="Delivered" value={stats?.webhookHealth.delivered} tone="emerald" />
          <Stat label="Retrying" value={stats?.webhookHealth.retrying} tone="amber" />
          <Stat label="Dead letter" value={stats?.webhookHealth.deadLetter} tone="rose" />
        </div>
      </section>

      <p className="mt-10 text-sm text-slate-500">
        Full API reference: <code>docs/API.md</code> · Delivery log UI: <a className="underline" href="/platform/webhooks">/platform/webhooks</a>
      </p>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value?: number; tone?: "emerald" | "amber" | "rose" }) {
  const toneClass = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "rose" ? "text-rose-600" : "text-slate-950";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <p className={`m-0 text-2xl font-semibold ${toneClass}`}>{value ?? "—"}</p>
      <p className="m-0 mt-1 text-xs uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
