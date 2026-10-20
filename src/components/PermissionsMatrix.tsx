"use client";

import { useT } from "@/components/providers/LocaleProvider";
import { ALL_PERMISSIONS, ROLES, can } from "@/lib/domain/rbac";

export function PermissionsMatrix() {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <caption className="mb-2 text-left text-xs text-slate-500">{t("permissions.subtitle")}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-slate-200 p-2 text-left font-medium text-slate-500 dark:border-slate-700">
              {t("permissions.title")}
            </th>
            {ROLES.map((role) => (
              <th key={role} scope="col" className="border-b border-slate-200 p-2 text-left font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
                {t(`role.${role}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALL_PERMISSIONS.map((permission) => (
            <tr key={permission}>
              <th scope="row" className="border-b border-slate-100 p-2 text-left font-normal text-slate-700 dark:border-slate-800 dark:text-slate-300">
                {t(`permission.${permission.replace(":", ".")}`)}
              </th>
              {ROLES.map((role) => (
                <td key={role} className="border-b border-slate-100 p-2 text-center dark:border-slate-800">
                  {can(role, permission) ? (
                    <span aria-label="Allowed" className="text-emerald-600">
                      ✓
                    </span>
                  ) : (
                    <span aria-label="Denied" className="text-slate-300 dark:text-slate-700">
                      —
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
