"use client";

import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/api";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-md border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50"
      onClick={async () => {
        await apiFetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
