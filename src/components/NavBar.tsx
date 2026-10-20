"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export function NavBar() {
  const { user, loading, logout } = useSession();
  const router = useRouter();

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-950">
          LEADOS
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {!loading && user && (
            <>
              <Link href="/dashboard" className="text-slate-700 hover:text-slate-950">
                People
              </Link>
              {user.role === "admin" && (
                <Link href="/admin/audit" className="text-slate-700 hover:text-slate-950">
                  Audit log
                </Link>
              )}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {user.email} · {user.role}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  router.push("/login");
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
              >
                Log out
              </button>
            </>
          )}
          {!loading && !user && (
            <>
              <Link href="/login" className="text-slate-700 hover:text-slate-950">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-slate-950 px-3 py-1.5 text-white hover:bg-slate-800"
              >
                Create organization
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
