import { db } from "@/db";
import * as s from "@/db/schema";
import { sql, count as drizzleCount } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import Link from "next/link";
import { Card, Badge } from "@/components/Shell";
import { NAV_ITEMS } from "@/lib/nav";

export const dynamic = "force-dynamic";

async function count(table: PgTable) {
  const [{ value }] = await db.select({ value: drizzleCount() }).from(table);
  return value;
}

export default async function HomePage() {
  await db.execute(sql`select 1`);

  const [
    opportunities,
    accounts,
    inventoryItems,
    decisionRecords,
    extensionsCount,
    gateRows,
  ] = await Promise.all([
    count(s.opportunities),
    count(s.accounts),
    count(s.inventoryItems),
    count(s.decisionRecords),
    count(s.extensions),
    db.select().from(s.gateLedger),
  ]);

  const gatePass = gateRows.filter((g) => g.status === "pass").length;
  const gateFail = gateRows.filter((g) => g.status === "fail").length;
  const gateUnknown = gateRows.filter((g) => g.status === "unknown").length;
  const gateNeverRun = gateRows.filter((g) => g.status === "never-run").length;

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">LEADOS · Pack 3 scope</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Intelligence &amp; Governance Console</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
          This console is a scoped, working implementation of the business-intelligence breadth (Parts 92-99)
          and platform-hardening/governance surfaces (Parts 100-107) described in the LEADOS Pack 3 specification,
          built against a single real Next.js + Drizzle + PostgreSQL application. Infrastructure that cannot
          genuinely execute in this environment &mdash; Terraform applies, CI runners, load-test traffic generators,
          automated pen-test campaigns &mdash; is represented honestly as governance records with a{" "}
          <Badge tone="slate">never-run</Badge> status rather than simulated. See the{" "}
          <Link href="/governance" className="font-medium text-indigo-600 underline">
            Capstone Readiness Gate
          </Link>{" "}
          for the full honest matrix.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Open opportunities" value={opportunities} href="/revenue" />
        <Stat label="Tracked accounts" value={accounts} href="/customers" />
        <Stat label="Inventory SKUs" value={inventoryItems} href="/supply-chain" />
        <Stat label="Decision records" value={decisionRecords} href="/collaboration" />
      </section>

      <section>
        <Card title="Program gate status (Part 107 capstone, live)">
          <div className="flex flex-wrap gap-3 text-sm">
            <GateStat label="Pass" value={gatePass} tone="green" />
            <GateStat label="Fail" value={gateFail} tone="red" />
            <GateStat label="Unknown" value={gateUnknown} tone="amber" />
            <GateStat label="Never-run" value={gateNeverRun} tone="slate" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Gates are re-queried live from <code>gate_ledger</code> on every page load &mdash; not copied from a prior report.
          </p>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Modules ({NAV_ITEMS.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition hover:border-indigo-300 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900">{item.label}</p>
                  <Badge tone="indigo">{item.part}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.group}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Tip: populate demo data with <code>POST /api/dev/seed</code> (idempotent &mdash; safe to call repeatedly).
      </p>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition hover:border-indigo-300 hover:shadow-md">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
      </Card>
    </Link>
  );
}

function GateStat({ label, value, tone }: { label: string; value: number; tone: "green" | "red" | "amber" | "slate" }) {
  return (
    <div className="flex items-center gap-2">
      <Badge tone={tone}>{label}</Badge>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}
