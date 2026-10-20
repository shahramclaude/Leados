"use client";

import type { ReactNode } from "react";
import { can } from "@/lib/domain/rbac";
import type { Permission, Role } from "@/lib/domain/types";
import { useT } from "@/components/providers/LocaleProvider";

/**
 * Permission-aware UI: renders children when the role has the permission,
 * otherwise renders a disabled affordance WITH an explanation rather than
 * silently hiding functionality (so users understand why, per the brief).
 */
export function PermissionGate({
  role,
  permission,
  children,
  hideWhenDenied = false,
}: {
  role: Role;
  permission: Permission;
  children: ReactNode;
  hideWhenDenied?: boolean;
}) {
  const t = useT();
  if (can(role, permission)) return <>{children}</>;
  if (hideWhenDenied) return null;
  return (
    <div
      aria-disabled="true"
      title={t("permissionGate.denied", { role: t(`role.${role}`) })}
      className="cursor-not-allowed rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
    >
      {t("permissionGate.denied", { role: t(`role.${role}`) })}
    </div>
  );
}
