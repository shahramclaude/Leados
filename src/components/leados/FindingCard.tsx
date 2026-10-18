"use client";

interface Props {
  finding: {
    key: string;
    rule: string;
    domain: string;
    sev: number;
    title: string;
    detail: string;
    personId?: number;
  };
  compact?: boolean;
}

const SEV_STYLES: Record<number, { border: string; badge: string; text: string }> = {
  5: { border: "border-red-600", badge: "bg-red-600", text: "text-red-400" },
  4: { border: "border-amber-600", badge: "bg-amber-600", text: "text-amber-400" },
  3: { border: "border-yellow-600", badge: "bg-yellow-600", text: "text-yellow-400" },
  2: { border: "border-blue-600", badge: "bg-blue-600", text: "text-blue-400" },
  1: { border: "border-green-600", badge: "bg-green-600", text: "text-green-400" },
};

const DOMAIN_COLORS: Record<string, string> = {
  people: "text-blue-400",
  finance: "text-emerald-400",
  sales: "text-orange-400",
  ops: "text-purple-400",
  strategy: "text-cyan-400",
  gov: "text-pink-400",
};

export function FindingCard({ finding: f, compact = false }: Props) {
  const sev = SEV_STYLES[f.sev] ?? SEV_STYLES[1];
  const domainColor = DOMAIN_COLORS[f.domain] ?? "text-slate-400";

  return (
    <div
      className={`bg-slate-900/60 border rounded-xl px-4 py-3 hover:bg-slate-900/80 transition-colors cursor-pointer ${sev.border}`}
      data-key={f.key}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`w-2 h-2 rounded-full inline-block ${sev.badge}`} />
        <span className={`text-xs font-mono ${domainColor}`}>{f.domain.toUpperCase()}</span>
        <span className="text-xs font-mono text-slate-600">{f.rule}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${sev.badge} text-white ml-auto`}>sev {f.sev}</span>
      </div>
      <div className={`${compact ? "text-xs" : "text-sm"} text-slate-100 mt-1 font-medium`}>{f.title}</div>
      {!compact && <div className="text-xs text-slate-500 mt-0.5">{f.detail}</div>}
    </div>
  );
}
