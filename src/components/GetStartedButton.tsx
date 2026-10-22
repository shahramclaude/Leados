"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GetStartedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    const res = await fetch("/api/dev/bootstrap", { method: "POST" });
    const data = (await res.json()) as { orgs: { orgId: string; userIds: Record<string, string> }[] };
    const first = data.orgs[0];
    await fetch("/api/dev/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: first.orgId, userId: first.userIds.Admin }),
    });
    setLoading(false);
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading}
      className="lx-tap-target rounded-xl bg-[color:var(--accent)] px-6 py-3 text-base font-semibold text-white shadow-sm"
    >
      {loading ? "Setting up…" : "Start demo workspace"}
    </button>
  );
}
