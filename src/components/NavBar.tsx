"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/clientApi";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/people", label: "People" },
  { href: "/users", label: "Users" },
  { href: "/webhooks", label: "Webhooks" },
  { href: "/audit", label: "Audit" },
];

export function NavBar({ email, role }: { email: string; role: string }) {
  const router = useRouter();

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-slate-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-slate-900">LEADOS</span>
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            {email} <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase">{role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
