"use client";

import type { ReactNode } from "react";

/**
 * Per-view "what is this / what should I do here" affordance, used instead
 * of a bare blank screen for any new view a first-run user lands on.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900"
    >
      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function WhatIsThis({ title, body }: { title: string; body: string }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer select-none font-medium text-slate-800 marker:content-none dark:text-slate-100">
        <span aria-hidden="true" className="mr-1.5 inline-block w-4 text-center text-slate-500">?</span>
        {title}
      </summary>
      <p className="mt-2 text-slate-600 dark:text-slate-400">{body}</p>
    </details>
  );
}
