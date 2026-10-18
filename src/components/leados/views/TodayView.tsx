"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/AppContext";
import { formatRelative } from "@/components/leados/Shell";
import GaugeArc from "@/components/leados/ui/GaugeArc";
import { SkeletonCard, SkeletonList } from "@/components/leados/ui/Skeleton";
import { postJson } from "@/lib/useFetch";
import { DOMAIN_LABELS, SEVERITY_COLORS } from "@/lib/domains";
import type { CaptureType, PriorityItem } from "@/lib/types";

const CAPTURE_TYPES: Array<{ value: CaptureType; label: string }> = [
  { value: "one_on_one", label: "1:1 note" },
  { value: "decision", label: "Decision" },
  { value: "metric_update", label: "Metric update" },
  { value: "incident", label: "Incident" },
  { value: "feedback", label: "Feedback" },
];

function healthEmoji(score: number): string {
  if (score >= 75) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

export default function TodayView() {
  const router = useRouter();
  const { intelligence, decisionHealth, weeklyBriefing, priorityQueue, upcoming, loading, toast, refetch } =
    useAppContext();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Map<string, number>>(new Map());
  const [captureText, setCaptureText] = useState("");
  const [classification, setClassification] = useState<{ type: CaptureType; confidence: number } | null>(null);
  const [overrideType, setOverrideType] = useState<CaptureType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const visibleQueue = useMemo<PriorityItem[]>(() => {
    const now = Date.now();
    return priorityQueue.filter((item) => {
      if (dismissed.has(item.id)) return false;
      const snoozeUntil = snoozed.get(item.id);
      if (snoozeUntil && snoozeUntil > now) return false;
      return true;
    });
  }, [priorityQueue, dismissed, snoozed]);

  const handleCaptureSubmit = async () => {
    const trimmed = captureText.trim();
    if (trimmed.length === 0) {
      setCaptureError("Type something before pressing Enter.");
      return;
    }
    setCaptureError(null);
    setSubmitting(true);
    try {
      const result = await postJson<{ classification: { type: CaptureType; confidence: number } }>("/api/capture", {
        text: trimmed,
        type: overrideType,
      });
      setClassification(result.classification);
      toast(`Captured as ${result.classification.type.replace("_", " ")}`, 2);
      setCaptureText("");
      setOverrideType(null);
      refetch();
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Could not capture this note.");
    } finally {
      setSubmitting(false);
    }
  };

  const unreadStatusSegments = [
    {
      key: "health",
      label: `${healthEmoji(intelligence.orgHealthScore)} Org Health ${intelligence.orgHealthScore}`,
      onClick: () => router.push("/leados/intelligence"),
    },
    {
      key: "critical",
      label: `${intelligence.criticalFindingsCount} Critical Finding${intelligence.criticalFindingsCount === 1 ? "" : "s"}`,
      onClick: () => router.push("/leados/signals"),
    },
    {
      key: "decisions",
      label: `${decisionHealth.overdueCount} Decision${decisionHealth.overdueCount === 1 ? "" : "s"} Overdue`,
      onClick: () => router.push("/leados/decisions"),
    },
    {
      key: "updated",
      label: `Last updated ${formatRelative(new Date(intelligence.generatedAt))}`,
      onClick: () => refetch(),
    },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-800 bg-[#0d1016] px-6 py-3 text-sm">
        {unreadStatusSegments.map((seg, i) => (
          <button key={seg.key} onClick={seg.onClick} className="flex items-center gap-2 text-slate-300 hover:text-white">
            {i > 0 && <span className="text-slate-700">·</span>}
            {seg.label}
          </button>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-5">
        <section className="flex flex-col gap-3 xl:col-span-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Priority Queue</h2>
          {loading && priorityQueue.length === 0 ? (
            <SkeletonList rows={5} />
          ) : visibleQueue.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-500">
              Nothing urgent right now. 🎉
            </div>
          ) : (
            visibleQueue.map((item) => (
              <PriorityCard
                key={item.id}
                item={item}
                onDone={() => {
                  setDismissed((prev) => new Set(prev).add(item.id));
                  toast("Marked done", 1);
                }}
                onSnooze={() => {
                  setSnoozed((prev) => new Map(prev).set(item.id, Date.now() + 24 * 3600 * 1000));
                  toast("Snoozed for 24h", 1);
                }}
                onOpen={() => {
                  if (item.sourceType === "decision") router.push("/leados/decisions");
                  else if (item.domain === "people") router.push("/leados/people");
                  else router.push("/leados/signals");
                }}
              />
            ))
          )}

          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Upcoming (7 days)</h2>
          {loading && upcoming.length === 0 ? (
            <SkeletonList rows={3} />
          ) : upcoming.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
              No upcoming deadlines in the next 7 days.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {upcoming.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    item.overdue ? "border-amber-600/50 bg-amber-950/30 text-amber-200" : "border-slate-800 bg-slate-900/50 text-slate-300"
                  }`}
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 text-slate-500">
                    {item.type.replace("_", " ")} · {new Date(item.date).toLocaleDateString()}
                    {item.overdue ? " · overdue" : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 xl:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Intelligence Snapshot</h2>
          {loading && intelligence.domainHealth.length === 0 ? (
            <SkeletonCard />
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Org Health Score</p>
                  <p className="text-5xl font-bold text-slate-50">{intelligence.orgHealthScore}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {intelligence.domainHealth.slice(0, 5).map((d) => (
                  <GaugeArc key={d.domain} label={DOMAIN_LABELS[d.domain]} value={d.score} size={76} />
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-300">
                {weeklyBriefing.executiveSummary}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 border-t border-slate-800 bg-[#0d1016] px-6 py-3">
        <div className="flex items-center gap-2">
          <input
            value={captureText}
            onChange={(e) => {
              setCaptureText(e.target.value);
              setCaptureError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) void handleCaptureSubmit();
            }}
            placeholder="Quick capture — type anything: a 1:1 note, a decision, a metric update, an incident…"
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-600"
          />
          <select
            value={overrideType ?? ""}
            onChange={(e) => setOverrideType(e.target.value === "" ? null : (e.target.value as CaptureType))}
            className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-2 text-xs text-slate-300"
          >
            <option value="">Auto-classify</option>
            {CAPTURE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            disabled={submitting}
            onClick={() => void handleCaptureSubmit()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Routing…" : "Capture"}
          </button>
        </div>
        {captureError && <p className="mt-1 text-xs text-red-400">{captureError}</p>}
        {classification && (
          <p className="mt-1 text-xs text-slate-500">
            Classified as <span className="text-slate-300">{classification.type.replace("_", " ")}</span> with{" "}
            {(classification.confidence * 100).toFixed(0)}% confidence.
          </p>
        )}
      </div>
    </div>
  );
}

function PriorityCard({
  item,
  onDone,
  onSnooze,
  onOpen,
}: {
  item: PriorityItem;
  onDone: () => void;
  onSnooze: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
      <div className="w-1.5" style={{ backgroundColor: SEVERITY_COLORS[item.severity] }} />
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-100">{item.title}</p>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
            {item.domain}
          </span>
        </div>
        <p className="text-xs text-slate-400">{item.context}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-indigo-700/50 bg-indigo-950/40 px-2 py-0.5 text-[11px] text-indigo-300">
            {item.suggestedAction}
          </span>
          <div className="ml-auto flex gap-1.5">
            <button onClick={onDone} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">
              Done
            </button>
            <button onClick={onSnooze} className="rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">
              Snooze 24h
            </button>
            <button onClick={onOpen} className="rounded-md bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-500">
              Open
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
