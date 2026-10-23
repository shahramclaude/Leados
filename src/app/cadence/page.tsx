import { db } from "@/db";
import { cadenceItems } from "@/db/schema";
import { asc } from "drizzle-orm";
import { createCadenceItem, deleteCadenceItem, updateCadenceStatus } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const TYPE_OPTIONS = ["meeting", "ritual", "review"] as const;
const FREQUENCY_OPTIONS = ["daily", "weekly", "biweekly", "monthly", "quarterly"] as const;
const STATUS_OPTIONS = ["active", "paused"] as const;

export default async function CadencePage() {
  const rows = await db.select().from(cadenceItems).orderBy(asc(cadenceItems.nextOccurrence));

  return (
    <div>
      <PageHeader
        title="Operating Cadence"
        description="The rhythm of leadership: recurring meetings, rituals, and review cycles."
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add a cadence item</h2>
        <form action={createCadenceItem} className="grid gap-4 sm:grid-cols-2">
          <input name="title" required placeholder="Title (e.g. Weekly Ops Review)" className="input sm:col-span-2" />
          <input name="owner" required placeholder="Owner" className="input" />
          <input type="datetime-local" name="nextOccurrence" className="input" />
          <select name="type" defaultValue="meeting" className="input">
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select name="frequency" defaultValue="weekly" className="input">
            {FREQUENCY_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary sm:col-span-2">
            Add cadence item
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No cadence items scheduled yet." />
      ) : (
        <div className="space-y-4">
          {rows.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {item.type} · {item.frequency} · Owner: {item.owner}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Next: {fmtDate(item.nextOccurrence)}</p>
                </div>
                <Badge value={item.status} />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <form action={updateCadenceStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={item.id} />
                  <select name="status" defaultValue={item.status} className="input-sm">
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary">
                    Update
                  </button>
                </form>
                <form action={deleteCadenceItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="btn-danger">
                    Delete
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
