import { recordEvent } from "@/lib/app/events";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function captureAction(formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const tagsRaw = String(formData.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await recordEvent({
    type: "signal.captured",
    version: 1,
    payload: { title, body, ...(tags.length ? { tags } : {}) },
  });
  redirect("/events");
}

export default function CapturePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Capture a signal</h1>
      <form action={captureAction} className="ld-surface space-y-4 rounded-xl border p-6">
        <div>
          <label className="block text-sm font-medium" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            data-testid="capture-title"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="Support queue backing up"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="body">
            Details
          </label>
          <textarea
            id="body"
            name="body"
            data-testid="capture-body"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            rows={4}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="tags">
            Tags (comma separated)
          </label>
          <input
            id="tags"
            name="tags"
            data-testid="capture-tags"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            placeholder="support, ops"
          />
        </div>
        <button
          type="submit"
          data-testid="submit-capture"
          className="rounded-lg px-4 py-2 font-medium text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Capture signal
        </button>
      </form>
    </div>
  );
}
