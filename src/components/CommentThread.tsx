"use client";

// Minimal comment/hand-off thread for a finding/approval/task. @mentions are
// parsed server-side and turned into notifications for the mentioned user.

import { useEffect, useState } from "react";

interface Comment {
  id: string;
  parentId: string | null;
  kind: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export function CommentThread({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"comment" | "handoff">("comment");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/comments?entityType=${entityType}&entityId=${entityId}`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { comments: Comment[] };
      setComments(data.comments);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, text, kind }),
    });
    setText("");
    await load();
    setBusy(false);
  };

  return (
    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <p className="font-medium text-slate-700">
            {c.authorName} {c.kind === "handoff" && <span className="text-amber-600">(hand-off)</span>}
          </p>
          <p className="text-slate-600">{c.body}</p>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "comment" | "handoff")}
          className="rounded-md border border-slate-200 px-1 py-1 text-xs"
        >
          <option value="comment">Comment</option>
          <option value="handoff">Hand-off</option>
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="@mention someone…"
          className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
        />
        <button
          disabled={busy}
          onClick={submit}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
