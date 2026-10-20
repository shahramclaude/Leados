export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">
          Part 13 — security &amp; compliance baseline
        </p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          LEADOS
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700">
          Enterprise-grade trust for organizational people data: authenticated,
          authorized, validated, rate-limited, and tamper-evidently audited on
          every read and write. See <code>SECURITY_AUDIT.md</code>,{" "}
          <code>docs/THREAT-MODEL.md</code> and <code>docs/SECURITY.md</code> for the
          full architecture.
        </p>
        <div className="mt-8 flex gap-3">
          <a
            href="/register"
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create an organization
          </a>
          <a
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Log in
          </a>
        </div>
      </section>
    </main>
  );
}
