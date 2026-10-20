import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Part 10 — The Open Platform</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          LEADOS Platform API
        </h1>
        <p className="mt-4 text-base text-slate-700">
          A stable, versioned, documented programmatic surface: REST API v1, OpenAPI 3.1 spec, generated TypeScript
          SDK, outbound webhooks with HMAC + retries, a realtime SSE API, and an automation job kernel.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm font-medium">
          <Link className="rounded-lg bg-slate-900 px-4 py-2 text-white" href="/status">
            Status page
          </Link>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 text-slate-800" href="/platform/webhooks">
            Webhook delivery log
          </Link>
          <a className="rounded-lg border border-slate-300 px-4 py-2 text-slate-800" href="/api-spec.yaml">
            api-spec.yaml
          </a>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          Full guide: <code>docs/API.md</code> · SDK: <code>sdk.ts</code> · Spec: <code>api-spec.yaml</code>
        </p>
      </section>
    </main>
  );
}
