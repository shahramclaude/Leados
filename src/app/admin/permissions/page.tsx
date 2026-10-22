import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org-context";
import { PERMISSION_REGISTRY, REGISTRY_ROLES } from "@/lib/rbac";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/");
  if (ctx.role !== "Admin") {
    return <p className="lx-muted text-sm text-slate-600">Admin access required.</p>;
  }

  const locale = ctx.locale;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-950">{t(locale, "admin.permissions.title")}</h1>
      <p className="lx-muted mt-1 text-sm text-slate-600">{t(locale, "admin.permissions.hint")}</p>
      <p className="mt-3 text-sm font-medium text-green-700">
        {t(locale, "admin.permissions.consistent", { count: PERMISSION_REGISTRY.length })}
      </p>

      {/* Mobile: card list. Desktop: table. Both read the same registry rows. */}
      <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t(locale, "admin.permissions.methods")}</th>
              <th className="px-4 py-3">{t(locale, "admin.permissions.route")}</th>
              <th className="px-4 py-3">{t(locale, "admin.permissions.roles")}</th>
              <th className="px-4 py-3">{t(locale, "admin.permissions.scopes")}</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_REGISTRY.map((entry) => (
              <tr key={`${entry.method}-${entry.path}`} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{entry.method}</td>
                <td className="px-4 py-3 font-mono text-xs">{entry.path}</td>
                <td className="px-4 py-3">{entry.roles.join(", ")}</td>
                <td className="px-4 py-3">{entry.scope ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-5 grid gap-3 md:hidden">
        {PERMISSION_REGISTRY.map((entry) => (
          <li key={`${entry.method}-${entry.path}`} className="lx-surface rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-mono text-xs text-slate-500">
              {entry.method} {entry.path}
            </p>
            <p className="mt-2 text-sm text-slate-800">
              <span className="font-semibold">{t(locale, "admin.permissions.roles")}:</span> {entry.roles.join(", ")}
            </p>
            <p className="text-sm text-slate-800">
              <span className="font-semibold">{t(locale, "admin.permissions.scopes")}:</span> {entry.scope ?? "—"}
            </p>
          </li>
        ))}
      </ul>

      <p className="lx-muted mt-6 text-xs text-slate-500">Roles known to the registry: {REGISTRY_ROLES.join(", ")}</p>
    </div>
  );
}
