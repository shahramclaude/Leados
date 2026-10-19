"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOMAIN_ORDER } from "@/lib/domains";
import type {
  AgentCycleResult,
  CommandPaletteItem,
  Domain,
  Finding,
  OrchestratorResult,
  RealtimeServerEvent,
} from "@/lib/types";
import { APP_ROUTES } from "@/lib/routes";

export interface RealtimeState {
  orchestratorResult: OrchestratorResult | null;
  agentStatus: AgentCycleResult | null;
  lastUpdated: Date | null;
  sseConnected: boolean;
  isRunning: boolean;
  criticalCount: number;
  urgentCount: number;
  domainHealthMap: Record<Domain, number>;
  cascadeRisk: number;
  triggerRun: () => Promise<void>;
  dismissFinding: (id: string) => void;
  commandPaletteData: CommandPaletteItem[];
}

const EMPTY_DOMAIN_MAP = DOMAIN_ORDER.reduce((acc, d) => {
  acc[d] = 0;
  return acc;
}, {} as Record<Domain, number>);

function mergeFindings(existing: Finding[], incoming: Finding[]): Finding[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const f of incoming) byId.set(f.id, f);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function buildCommandPalette(result: OrchestratorResult | null): CommandPaletteItem[] {
  if (!result) return [];
  const items: CommandPaletteItem[] = [];

  const criticalFindings = [...result.findings]
    .filter((f) => !f.dismissed && f.severity >= 4)
    .sort((a, b) => b.severity - a.severity);
  for (const f of criticalFindings) {
    items.push({
      type: "finding",
      id: f.id,
      label: f.title,
      sublabel: `${f.domain.toUpperCase()} · SEV ${f.severity}`,
      severity: f.severity,
      route: `/${f.domain === "legal" || f.domain === "product" || f.domain === "culture" ? "signals" : f.domain}`,
    });
  }

  const recentDecisions = [...result.decisions]
    .filter((d) => d.status === "open")
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  for (const d of recentDecisions) {
    items.push({
      type: "decision",
      id: d.id,
      label: d.title,
      sublabel: `${d.domain.toUpperCase()} · DECISION`,
      severity: null,
      route: "/execution",
    });
  }

  const triggeredPlaybooks = result.playbooks.filter((p) => p.status === "triggered");
  for (const p of triggeredPlaybooks) {
    items.push({
      type: "blocker",
      id: p.id,
      label: p.title,
      sublabel: `${p.domain.toUpperCase()} · PLAYBOOK`,
      severity: null,
      route: "/execution",
    });
  }

  for (const h of result.hypotheses) {
    items.push({
      type: "hypothesis",
      id: h.id,
      label: h.title,
      sublabel: `${h.domain.toUpperCase()} · ${h.status.toUpperCase()}`,
      severity: null,
      route: "/hypotheses",
    });
  }

  for (const p of result.people) {
    items.push({
      type: "person",
      id: p.id,
      label: p.name,
      sublabel: `${p.role} · ${p.domain.toUpperCase()}`,
      severity: null,
      route: "/people",
    });
  }

  for (const r of APP_ROUTES) {
    items.push({
      type: "route",
      id: r.path,
      label: r.label,
      sublabel: r.path,
      severity: null,
      route: r.path,
    });
  }

  return items.slice(0, 200);
}

export function useRealtimeIntelligence(): RealtimeState {
  const [orchestratorResult, setOrchestratorResult] = useState<OrchestratorResult | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentCycleResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(1000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((data: { orchestratorResult: OrchestratorResult; agentStatus: AgentCycleResult }) => {
        if (cancelled) return;
        setOrchestratorResult(data.orchestratorResult);
        setAgentStatus(data.agentStatus);
        setLastUpdated(new Date());
      })
      .catch(() => {});

    function connect() {
      if (!mountedRef.current) return;
      const es = new EventSource("/api/events/stream");
      esRef.current = es;

      es.addEventListener("connected", () => {
        setSseConnected(true);
        retryRef.current = 1000;
      });

      es.addEventListener("findings_delta", (ev) => {
        const payload = JSON.parse((ev as MessageEvent).data) as Extract<
          RealtimeServerEvent,
          { type: "findings_delta" }
        >;
        setOrchestratorResult((prev) =>
          prev
            ? {
                ...prev,
                findings: mergeFindings(prev.findings, payload.findings),
                domainHealth: payload.domainHealth,
                orgHealthScore: payload.orgHealthScore,
              }
            : prev,
        );
        setLastUpdated(new Date());
      });

      es.addEventListener("belief_update", (ev) => {
        const payload = JSON.parse((ev as MessageEvent).data) as Extract<
          RealtimeServerEvent,
          { type: "belief_update" }
        >;
        setOrchestratorResult((prev) =>
          prev
            ? {
                ...prev,
                cascadeRisk: payload.cascadeRisk,
                systemConfidence: payload.systemConfidence,
                latentNodes: payload.latentNodes,
              }
            : prev,
        );
        setLastUpdated(new Date());
      });

      es.addEventListener("agent_cycle_complete", (ev) => {
        const payload = JSON.parse((ev as MessageEvent).data) as Extract<
          RealtimeServerEvent,
          { type: "agent_cycle_complete" }
        >;
        setAgentStatus(payload.agentStatus);
        setLastUpdated(new Date());
      });

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        if (esRef.current === es) esRef.current = null;
        const delay = Math.min(retryRef.current, 30000);
        retryTimerRef.current = setTimeout(() => {
          retryRef.current = Math.min(retryRef.current * 2, 30000);
          connect();
        }, delay);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      cancelled = true;
      if (esRef.current) esRef.current.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const triggerRun = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await fetch("/api/orchestrator/run", { method: "POST" });
      const data = (await res.json()) as { orchestratorResult: OrchestratorResult };
      setOrchestratorResult(data.orchestratorResult);
      setLastUpdated(new Date());
    } finally {
      setIsRunning(false);
    }
  }, []);

  const dismissFinding = useCallback((id: string) => {
    setOrchestratorResult((prev) =>
      prev
        ? {
            ...prev,
            findings: prev.findings.map((f) => (f.id === id ? { ...f, dismissed: true } : f)),
          }
        : prev,
    );
    fetch(`/api/findings/${id}`, { method: "PATCH" }).catch(() => {});
  }, []);

  const activeFindings = useMemo(
    () => (orchestratorResult ? orchestratorResult.findings.filter((f) => !f.dismissed) : []),
    [orchestratorResult],
  );
  const criticalCount = useMemo(() => activeFindings.filter((f) => f.severity >= 5).length, [activeFindings]);
  const urgentCount = useMemo(() => activeFindings.filter((f) => f.severity === 4).length, [activeFindings]);
  const domainHealthMap = orchestratorResult?.domainHealth ?? EMPTY_DOMAIN_MAP;
  const cascadeRisk = orchestratorResult?.cascadeRisk ?? 0;

  const commandPaletteData = useMemo(() => buildCommandPalette(orchestratorResult), [orchestratorResult]);

  return {
    orchestratorResult,
    agentStatus,
    lastUpdated,
    sseConnected,
    isRunning,
    criticalCount,
    urgentCount,
    domainHealthMap,
    cascadeRisk,
    triggerRun,
    dismissFinding,
    commandPaletteData,
  };
}
