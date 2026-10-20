export const dynamic = "force-dynamic";

import WebhooksClient from "./WebhooksClient";

export default function WebhooksAdminPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS Platform</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Webhook subscriptions &amp; delivery log</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Paste an API token with the <code>webhooks</code> scope (mint one at <code>POST /api/v1/tokens</code>) to manage
        subscriptions and inspect delivery attempts, including retries and dead letters.
      </p>
      <WebhooksClient />
    </main>
  );
}
