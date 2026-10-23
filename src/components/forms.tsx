"use client";

// Small client-side form helpers shared across Part 43 surfaces. Kept in one
// file to avoid a sprawling component list — each form just calls its
// server action and lets `revalidatePath` refresh the server-rendered data.

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className = "",
}: {
  action: (formData: FormData) => Promise<unknown>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className={className}
      action={(formData) => {
        startTransition(async () => {
          await action(formData);
          router.refresh();
        });
      }}
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

export function InlineButton({
  onRun,
  label,
  pendingLabel = "Working…",
  className = "",
}: {
  onRun: () => Promise<unknown>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await onRun();
          router.refresh();
        })
      }
      className={
        className ||
        "rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      }
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function TextField({ name, label, placeholder, defaultValue }: { name: string; label: string; placeholder?: string; defaultValue?: string }) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        required
      />
    </label>
  );
}

export function TextAreaField({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <textarea name={name} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} required />
    </label>
  );
}

export function SelectField({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      <select name={name} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useBoolState(initial: boolean) {
  return useState(initial);
}
