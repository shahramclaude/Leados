"use client";

const SEV_BADGE: Record<number, string> = {
  5: "bg-red-600 text-white",
  4: "bg-amber-600 text-white",
  3: "bg-yellow-600 text-black",
  2: "bg-blue-600 text-white",
  1: "bg-green-600 text-white",
};

export function SeverityBadge({ sev }: { sev: number }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${SEV_BADGE[sev] ?? "bg-slate-600 text-white"}`}>
      sev {sev}
    </span>
  );
}
