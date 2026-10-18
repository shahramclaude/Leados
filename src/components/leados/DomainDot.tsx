"use client";

const DOMAIN_DOT: Record<string, string> = {
  people: "bg-blue-400",
  finance: "bg-emerald-400",
  sales: "bg-orange-400",
  ops: "bg-purple-400",
  strategy: "bg-cyan-400",
  gov: "bg-pink-400",
};

export function DomainDot({ domain }: { domain: string }) {
  const color = DOMAIN_DOT[domain] ?? "bg-slate-400";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={domain} />;
}
