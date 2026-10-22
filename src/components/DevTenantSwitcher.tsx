"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DemoUser = { orgSlug: string; orgName: string; orgId: string; role: string; userId: string };

// DEV-ONLY control, standing in for real sign-in (see AI-SESSION-LOG.md).
// Lets a reviewer switch between two isolated demo tenants and six roles to
// exercise RBAC + tenancy isolation directly from the UI.
export function DevTenantSwitcher({ options, currentUserId }: { options: DemoUser[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchTo(option: DemoUser) {
    setPending(true);
    await fetch("/api/dev/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: option.orgId, userId: option.userId }),
    });
    router.refresh();
    setPending(false);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="hidden sm:inline">Demo session</span>
      <select
        className="lx-tap-target rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
        value={currentUserId}
        disabled={pending}
        onChange={(e) => {
          const option = options.find((o) => o.userId === e.target.value);
          if (option) void switchTo(option);
        }}
      >
        {options.map((option) => (
          <option key={option.userId} value={option.userId}>
            {option.orgName} · {option.role}
          </option>
        ))}
      </select>
    </label>
  );
}
