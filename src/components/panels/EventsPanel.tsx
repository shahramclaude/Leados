import { listEvents } from "@/lib/server/repositories/events";
import { EventsListClient } from "./EventsListClient";
import type { EventDTO } from "@/lib/data/types";

// Server Component. Fetches directly through the repository (no self-HTTP
// round trip — that would be a waterfall: browser -> this server -> its own
// API route -> DB, when server -> DB is one hop). Graceful degradation:
// render what exists, mark what's missing, instead of failing the whole
// panel for a transient DB blip.
export default async function EventsPanel() {
  let events: EventDTO[] = [];
  let degraded = false;

  try {
    const { rows } = await listEvents({ limit: 100 });
    events = rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  } catch (err) {
    console.error("[EventsPanel] partial failure", err);
    degraded = true;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Events</h2>
      <EventsListClient events={events} degraded={degraded} />
    </section>
  );
}
