import { PERMISSIONS, ROLE_PERMISSIONS, type Role } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["owner", "admin", "analyst", "viewer"];

export default function PermissionsPage() {
  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-950">Permission registry</h1>
        <p className="mt-1 text-sm text-slate-600">
          The single source of truth in <code className="rounded bg-slate-200 px-1">src/lib/permissions.ts</code>.
          Internal routes, the public API, and this page all read the same table — nothing here is
          hard-coded twice.
        </p>
      </section>
      <table className="w-full table-auto border-collapse overflow-hidden rounded-xl bg-white text-sm shadow-sm">
        <thead className="bg-slate-900 text-left text-white">
          <tr>
            <th className="px-3 py-2">Permission</th>
            {ROLES.map((role) => (
              <th key={role} className="px-3 py-2 text-center capitalize">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((perm) => (
            <tr key={perm} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono text-xs">{perm}</td>
              {ROLES.map((role) => (
                <td key={role} className="px-3 py-2 text-center">
                  {ROLE_PERMISSIONS[role].includes(perm) ? "✅" : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
