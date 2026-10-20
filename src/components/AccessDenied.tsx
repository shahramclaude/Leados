"use client";

import { useT } from "@/components/providers/LocaleProvider";
import type { Role } from "@/lib/domain/types";

export function AccessDenied({ role }: { role: Role }) {
  const t = useT();
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("error.forbidden")}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        {t("permissionGate.denied", { role: t(`role.${role}`) })}
      </p>
    </main>
  );
}
