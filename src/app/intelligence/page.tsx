import Link from "next/link";

export default function IntelligenceOverviewPage() {
  const cards = [
    {
      href: "/intelligence/industry",
      title: "Industry Lens",
      body: "Market concentration (HHI), entry/exit flows, price/capacity cycle heuristic, and the extended value chain with tier-2/3 coverage gaps marked honestly.",
    },
    {
      href: "/intelligence/contagion",
      title: "Contagion Map",
      body: "Cascade simulations (supplier failure, demand shock, regulatory shock) with wide intervals and parameter-sensitivity sliders — model estimates only.",
    },
    {
      href: "/intelligence/benchmark",
      title: "Benchmark View",
      body: "Percentile positioning against a transparent, editable peer definition — never cherry-picked flattering peers, sample-size honesty enforced.",
    },
    {
      href: "/intelligence/radar",
      title: "External Radar",
      body: "External signals filtered by source reliability, with crisis-elevation thresholds surfaced when breached.",
    },
  ];

  return (
    <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-950">{c.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{c.body}</p>
        </Link>
      ))}
    </div>
  );
}
