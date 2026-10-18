"use client";

import { useState } from "react";
import Badge from "./ui/Badge";
import Tooltip from "./ui/Tooltip";
import { domainColor } from "./ui/tokens";
import { IconChevronLeft, IconChevronRight } from "./icons";
import type { Finding as FindingType } from "@/lib/leados/data";

export interface ProactiveRailProps {
  findings: FindingType[];
  collapsed: boolean;
  onToggle: () => void;
}

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export default function ProactiveRail({ findings, collapsed, onToggle }: ProactiveRailProps) {
  const [filter, setFilter] = useState<"all" | "critical">("all");
  const live = findings.filter((f) => f.status !== "resolved");
  const visible = filter === "critical" ? live.filter((f) => f.severity === "sev5" || f.severity === "sev4") : live;

  if (collapsed) {
    return (
      <aside
        className="hidden shrink-0 flex-col items-center gap-3 border-l py-4 xl:flex"
        style={{ width: 48, backgroundColor: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
      >
        <button
          onClick={onToggle}
          aria-label="Expand proactive rail"
          className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors focus-visible:outline-none"
          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
        >
          <IconChevronLeft width={13} height={13} />
        </button>
        <span
          className="rounded-full font-data"
          style={{
            backgroundColor: "color-mix(in srgb, var(--sev5) 18%, transparent)",
            color: "var(--sev5)",
            fontSize: 10,
            padding: "2px 6px",
          }}
        >
          {live.filter((f) => f.severity === "sev5").length}
        </span>
      </aside>
    );
  }

  return (
    <aside
      className="hidden shrink-0 flex-col border-l xl:flex"
      style={{ width: 288, backgroundColor: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>
            Proactive Feed
          </h2>
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>Live findings requiring attention</p>
        </div>
        <button
          onClick={onToggle}
          aria-label="Collapse proactive rail"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none"
          style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}
        >
          <IconChevronRight width={13} height={13} />
        </button>
      </div>

      <div className="flex gap-1.5 px-4 pt-3">
        {(["all", "critical"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="rounded-full border px-2.5 py-1 capitalize transition-colors focus-visible:outline-none"
            style={{
              fontSize: "var(--fs-xs)",
              borderColor: filter === key ? "var(--accent-blue)" : "var(--border-default)",
              color: filter === key ? "var(--text-primary)" : "var(--text-secondary)",
              backgroundColor: filter === key ? "color-mix(in srgb, var(--accent-blue) 16%, transparent)" : "transparent",
            }}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {visible.length === 0 && (
          <p className="px-2 py-8 text-center" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-sm)" }}>
            No active findings. All clear.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {visible.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border p-3 transition-colors"
              style={{ backgroundColor: "var(--bg-elevated)", borderColor: "var(--border-default)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant={f.severity} size="sm" />
                <span className="font-data" style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>
                  {f.id}
                </span>
              </div>
              <p className="mt-2 font-medium leading-snug" style={{ color: "var(--text-primary)", fontSize: "var(--fs-sm)" }}>
                {f.title}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Tooltip content={f.domain.replace("domain-", "")}>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: domainColor[f.domain] }}
                  />
                </Tooltip>
                <span style={{ color: "var(--text-tertiary)", fontSize: "var(--fs-xs)" }}>{timeAgo(f.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
