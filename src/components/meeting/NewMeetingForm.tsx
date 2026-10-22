"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewMeetingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Quarterly Planning Sync");
  const [names, setNames] = useState("Amara (organizer), Dev, Priya");
  const [busy, setBusy] = useState(false);

  async function createMeeting() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const participants = names
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => ({
          name: n.replace(/\(organizer\)/i, "").trim(),
          isOrganizer: /\(organizer\)/i.test(n),
        }));

      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          participants,
          agenda: [{ title: "Review Q2 results and set Q3 priorities" }],
        }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/meetings/${data.meeting.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-fit rounded-xl bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">New meeting</h2>
      <label className="mt-3 block text-xs font-medium text-slate-600">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Participants (comma separated, mark one &quot;(organizer)&quot;)
      </label>
      <textarea
        value={names}
        onChange={(e) => setNames(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <button
        onClick={createMeeting}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create meeting"}
      </button>
    </div>
  );
}
