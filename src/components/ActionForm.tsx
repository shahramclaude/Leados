"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: string[];
  defaultValue?: string;
};

export function ActionForm({
  endpoint,
  fields,
  submitLabel,
  description,
}: {
  endpoint: string;
  fields: Field[];
  submitLabel: string;
  description?: ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function onSubmit(formData: FormData) {
    setStatus("loading");
    const payload: Record<string, string> = {};
    for (const field of fields) {
      payload[field.name] = String(formData.get(field.name) ?? "");
    }
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Request failed");
        return;
      }
      setStatus("ok");
      setMessage("Saved.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Network error");
    }
  }

  return (
    <form
      action={onSubmit}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      {description ? <p className="w-full text-xs text-slate-500">{description}</p> : null}
      {fields.map((field) => (
        <label key={field.name} className="flex flex-col text-xs font-medium text-slate-600">
          {field.label}
          {field.type === "select" ? (
            <select
              name={field.name}
              defaultValue={field.defaultValue}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
            >
              {field.options?.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={field.defaultValue}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
            />
          )}
        </label>
      ))}
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {status === "loading" ? "Running…" : submitLabel}
      </button>
      {message ? (
        <span className={`text-xs ${status === "error" ? "text-red-600" : "text-emerald-600"}`}>
          {message}
        </span>
      ) : null}
    </form>
  );
}
