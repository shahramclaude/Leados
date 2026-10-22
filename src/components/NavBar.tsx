import Link from "next/link";
import type { SessionUser } from "@/lib/session";
import { LogoutButton } from "@/components/LogoutButton";

export function NavBar({ session }: { session: SessionUser | null }) {
  return (
    <nav className="flex items-center justify-between border-b border-slate-300 bg-white px-6 py-3">
      <div className="flex items-center gap-4 text-sm font-medium">
        <Link href="/" className="font-semibold text-slate-900">
          LEADOS
        </Link>
        {session && (
          <>
            <Link href="/" className="text-slate-600 hover:text-slate-950">
              People
            </Link>
            <Link href="/privacy" className="text-slate-600 hover:text-slate-950">
              Privacy
            </Link>
            {session.role === "admin" && (
              <Link href="/admin" className="text-slate-600 hover:text-slate-950">
                Admin
              </Link>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-sm">
        {session ? (
          <>
            <span className="text-slate-500">
              {session.email} · {session.role}
            </span>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="text-slate-600 hover:text-slate-950">
              Log in
            </Link>
            <Link href="/register" className="text-slate-600 hover:text-slate-950">
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
