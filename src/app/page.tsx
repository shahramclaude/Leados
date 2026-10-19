import { getEventsOverview } from "@/lib/app/events/listEvents";
import { ROUTES } from "@/app/routes";

export const dynamic = "force-dynamic";

function formatTimestamp(value: Date): string {
  return new Date(value).toISOString().replace("T", " ").replace("Z", " UTC");
}

export default async function HomePage() {
  const overview = await getEventsOverview(10);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">
          Part 0 — Ground Truth &amp; Architecture Foundation
        </p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          LEADOS
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Leadership Intelligence Operating System. This is the honest, buildable foundation: a Next.js App Router
          app wired to Postgres through Drizzle, a layered <code>src/lib</code> architecture (domain → platform →
          app → routes), and a versioned event schema registry. No leadership-intelligence engines (Signal Board,
          Thermodynamics, CAS, Risk Register) exist yet — see <code>FEATURES.md</code> for the honest capability
          table and <code>README.md</code> for the roadmap.
        </p>

        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Postgres connection: <strong>OK</strong> — this page would have thrown during render if the database were
          unreachable.
        </div>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <h2 className="text-xl font-semibold text-slate-950">Route table</h2>
        <p className="mt-2 text-sm text-slate-600">Sourced directly from <code>src/app/routes.ts</code>.</p>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4 font-medium">Path</th>
              <th className="py-2 pr-4 font-medium">Label</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {ROUTES.map((route) => (
              <tr key={route.path} className="border-b border-slate-100">
                <td className="py-2 pr-4 font-mono text-slate-800">{route.path}</td>
                <td className="py-2 pr-4 text-slate-700">{route.label}</td>
                <td className="py-2 pr-4">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    {route.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold text-slate-950">Event log</h2>
          <span className="text-sm text-slate-500">{overview.total} total event(s)</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Every row is validated against <code>src/lib/domain/eventSchema.ts</code> before it reaches Postgres.
          Append one with <code>POST /api/events</code>.
        </p>

        {overview.recent.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No events recorded yet. Run <code>npm run db:seed</code> or POST to <code>/api/events</code>.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {overview.recent.map((event) => (
              <li key={event.id} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-800">
                    {event.type}@{event.version}
                  </span>
                  <span className="text-xs text-slate-500">{formatTimestamp(event.createdAt)}</span>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
