import { listEvents } from "@/lib/app/events";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const page = await listEvents(new URLSearchParams({ limit: "50" }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Event Log</h1>
      <p style={{ color: "var(--muted)" }}>{page.total} events total.</p>
      <ul className="space-y-2" data-testid="events-list">
        {page.items.map((event) => (
          <li key={event.id} className="ld-surface rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">
                {event.type}@{event.version}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
            <pre className="mt-2 overflow-x-auto text-xs" style={{ color: "var(--muted)" }}>
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </li>
        ))}
        {page.items.length === 0 && <p>No events yet — try the Capture or Onboarding pages.</p>}
      </ul>
    </div>
  );
}
