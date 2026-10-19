import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Leados Command Center</h1>
      <p className="mt-3 text-slate-400">
        Leadership cockpit: live people intelligence, flight risk, burnout, and 1:1 quality signals.
      </p>
      <Link
        href="/people"
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 transition-colors"
      >
        Open People Intelligence →
      </Link>
    </div>
  );
}
