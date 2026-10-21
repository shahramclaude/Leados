"use client";

// Dev-only identity switcher (see src/lib/currentUser.ts — this part has no
// real auth). Lets you see the Now surface + notifications scoped to each
// seeded role without a login flow.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UserOption {
  id: string;
  name: string;
  role: string;
}

export default function ViewAsSwitcher() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users ?? []);
        setCurrentId(data.user?.id ?? "");
      })
      .catch(() => {});
  }, []);

  async function switchTo(userId: string) {
    await fetch("/api/me/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setCurrentId(userId);
    router.refresh();
  }

  if (users.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      View as
      <select
        value={currentId}
        onChange={(e) => switchTo(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}
