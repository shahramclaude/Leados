import { db } from "@/db";
import { boardItems } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createBoardItem, deleteBoardItem, updateBoardItemStatus } from "@/lib/actions";
import { Badge, Card, EmptyState, PageHeader, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

const TYPE_OPTIONS = ["resolution", "minutes", "pack", "motion"] as const;
const STATUS_OPTIONS = ["draft", "circulated", "approved", "rejected"] as const;

export default async function BoardPage() {
  const rows = await db.select().from(boardItems).orderBy(desc(boardItems.meetingDate));

  return (
    <div>
      <PageHeader
        title="Board Governance"
        description="Board packs, resolutions, minutes, and motions — tracked from draft through approval."
      />

      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Add a board item</h2>
        <form action={createBoardItem} className="grid gap-4 sm:grid-cols-2">
          <input name="title" required placeholder="Title" className="input sm:col-span-2" />
          <input name="owner" required placeholder="Owner / sponsor" className="input" />
          <input type="date" name="meetingDate" className="input" />
          <select name="type" defaultValue="pack" className="input sm:col-span-2">
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <textarea name="summary" placeholder="Summary" className="input sm:col-span-2" rows={2} />
          <button type="submit" className="btn-primary sm:col-span-2">
            Add board item
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState message="No board items yet." />
      ) : (
        <div className="space-y-4">
          {rows.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {item.type} · Owner: {item.owner} · Meeting: {fmtDate(item.meetingDate)}
                  </p>
                </div>
                <Badge value={item.status} />
              </div>
              {item.summary ? <p className="mt-3 text-sm text-slate-700">{item.summary}</p> : null}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <form action={updateBoardItemStatus} className="flex items-center gap-2">
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
                <form action={deleteBoardItem}>
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
