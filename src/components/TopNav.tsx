"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

type Identity = {
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  userName: string;
  role: string;
};

type Session = { userId: string; orgId: string; role: string; userEmail: string } | null;

const TABS = [
  { href: "/", key: "nav.findings" },
  { href: "/agents", key: "nav.agents" },
  { href: "/audit", key: "nav.audit" },
  { href: "/admin/permissions", key: "nav.permissions" },
  { href: "/admin/budgets", key: "nav.budgets" },
] as const;

export function TopNav() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [session, setSession] = useState<Session>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/demo/identities")
      .then((r) => r.json())
      .then((r) => setIdentities(r.data ?? []));
    fetch("/api/session")
      .then((r) => r.json())
      .then((r) => setSession(r.data ?? null));
  }, [pathname]);

  async function switchIdentity(value: string) {
    const [userId, orgId] = value.split("::");
    if (!userId || !orgId) return;
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, orgId }),
    });
    router.refresh();
    window.location.reload();
  }

  const currentValue = session ? `${session.userId}::${session.orgId}` : "";

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold tracking-tight text-slate-950">LEADOS</span>
          <nav className="flex gap-1 text-sm">
            {TABS.map((tab) => (
              <a
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  pathname === tab.href
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t(tab.key)}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {session && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              {session.role}
            </span>
          )}
          <select
            value={currentValue}
            onChange={(e) => switchIdentity(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              {t("identity.placeholder")}
            </option>
            {identities.map((id) => (
              <option key={`${id.userId}::${id.orgId}`} value={`${id.userId}::${id.orgId}`}>
                {id.orgName} · {id.userName} ({id.role})
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
