"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setStoredSession } from "@/lib/client-session";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong");
        return;
      }
      setStoredSession(body.apiKey, body.name);
      setApiKey(body.apiKey);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Onboarding</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Create your tenant to get an API key for the rest of the journey.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <label htmlFor="tenant-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Organization name
          </label>
          <input
            id="tenant-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            placeholder="Acme Co"
          />
        </div>
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {pending ? "Creating…" : "Create tenant"}
        </button>
      </form>

      {apiKey ? (
        <div data-testid="onboarding-success" className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-700 dark:bg-emerald-950">
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Tenant created. Your API key (saved locally for this browser):
          </p>
          <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs dark:bg-slate-900">{apiKey}</code>
          <button
            type="button"
            onClick={() => router.push("/capture")}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Continue to capture →
          </button>
        </div>
      ) : null}
    </main>
  );
}
