import Link from "next/link";
import { getCompositeHealth } from "@/lib/health/composite";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await getCompositeHealth();

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          System status: {health.status}
        </h1>
        <p className="mt-4 text-base text-slate-700">
          This working tree is an honest, minimal, fully-buildable core: Next.js (App Router) + PostgreSQL via
          Drizzle, with a consolidated health system, structured logging, metrics, and a documented release
          process. See <code className="rounded bg-slate-100 px-1 py-0.5">README.md</code> and{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5">FEATURES.md</code> for exactly what is and isn&apos;t
          implemented.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/health"
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Open health dashboard →
          </Link>
          <a
            href="/api/health"
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            GET /api/health
          </a>
          <a
            href="/api/metrics"
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            GET /api/metrics
          </a>
        </div>
      </section>
    </main>
  );
}
