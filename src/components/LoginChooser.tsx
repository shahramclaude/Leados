"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/components/providers/LocaleProvider";
import type { LoginChoice } from "@/lib/app/auth";

export function LoginChooser() {
  const t = useT();
  const router = useRouter();
  const [choices, setChoices] = useState<LoginChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/login")
      .then((res) => res.json())
      .then((data) => setChoices(data.choices))
      .catch(() => setChoices([]));
  }, []);

  async function signIn(choice: LoginChoice) {
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: choice.userId, orgId: choice.orgId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("error.generic"));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("login.title")}</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t("login.subtitle")}</p>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("login.chooseAccount")}</p>
        {choices === null ? (
          <p className="mt-2 text-sm text-slate-500">…</p>
        ) : choices.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t("login.noAccounts")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {choices.map((choice) => (
              <li key={`${choice.userId}:${choice.orgId}`}>
                <button
                  type="button"
                  onClick={() => signIn(choice)}
                  aria-label={`${t("login.signIn")}: ${choice.userName}`}
                  className="flex min-h-[56px] w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left text-sm hover:border-indigo-400 dark:border-slate-700"
                >
                  <span>
                    <span className="block font-medium text-slate-900 dark:text-slate-100">{choice.userName}</span>
                    <span className="block text-xs text-slate-500">
                      {choice.orgName} · {t(`role.${choice.role}`)}
                    </span>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}
      </div>

      <Link
        href="/onboarding"
        className="mt-5 block min-h-[44px] rounded-lg border border-dashed border-slate-300 p-3 text-center text-sm font-medium text-indigo-700 dark:border-slate-600 dark:text-indigo-300"
      >
        {t("login.createOrg")}
      </Link>
    </div>
  );
}
