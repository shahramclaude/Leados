import Link from "next/link";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { desc } from "drizzle-orm";
import NewMeetingForm from "@/components/meeting/NewMeetingForm";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const rows = await db.select().from(meetings).orderBy(desc(meetings.createdAt));

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link href="/" className="text-xs text-slate-500 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Meeting Room</h1>
      <p className="mt-2 text-sm text-slate-600">
        Pre-meeting brief → live capture (consent-gated) → post-meeting drafted artifacts → human confirmation.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">
              No meetings yet — create one to see the copilot pipeline end to end.
            </p>
          ) : null}
          {rows.map((m) => (
            <Link
              key={m.id}
              href={`/meetings/${m.id}`}
              className="block rounded-xl bg-white p-5 shadow-sm hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{m.title}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-600">
                  {m.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{new Date(m.scheduledAt).toLocaleString()}</p>
            </Link>
          ))}
        </div>
        <NewMeetingForm />
      </div>
    </main>
  );
}
