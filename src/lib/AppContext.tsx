"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  IntelligenceReport,
  Notification,
  OrgNetworkReport,
  DecisionHealthIndex,
  RuleHealth,
  MetricHealth,
  GraphSubgraph,
  WeeklyBriefing,
  PriorityItem,
  UpcomingItem,
  Severity,
} from "@/lib/types";

const EMPTY_INTELLIGENCE: IntelligenceReport = {
  orgHealthScore: 0,
  domainHealth: [],
  findings: [],
  criticalFindingsCount: 0,
  generatedAt: new Date(0).toISOString(),
};

const EMPTY_ORG_NETWORK: OrgNetworkReport = {
  nodes: [],
  edges: [],
  bottleneckPersonId: null,
  avgSpanOfControl: 0,
  isolatedCount: 0,
  generatedAt: new Date(0).toISOString(),
};

const EMPTY_DECISION_HEALTH: DecisionHealthIndex = {
  score: 0,
  totalDecisions: 0,
  overdueCount: 0,
  avgCycleTimeDays: 0,
  brierScore: null,
  decidedWithOutcomeCount: 0,
  generatedAt: new Date(0).toISOString(),
};

const EMPTY_GRAPH: GraphSubgraph = { nodes: [], edges: [], generatedAt: new Date(0).toISOString() };

const EMPTY_BRIEFING: WeeklyBriefing = {
  executiveSummary: "Gathering intelligence...",
  highlights: [],
  risks: [],
  generatedAt: new Date(0).toISOString(),
};

export interface ToastMessage {
  id: number;
  message: string;
  severity: Severity;
}

interface AppState {
  intelligence: IntelligenceReport;
  notifications: Notification[];
  orgNetwork: OrgNetworkReport;
  decisionHealth: DecisionHealthIndex;
  ruleHealthMap: Record<string, RuleHealth>;
  metricsHealth: Record<string, MetricHealth>;
  graph: GraphSubgraph;
  weeklyBriefing: WeeklyBriefing;
  priorityQueue: PriorityItem[];
  upcoming: UpcomingItem[];
  loading: boolean;
  lastUpdated: Date;
}

type AppAction =
  | { type: "LOADING" }
  | {
      type: "LOADED";
      payload: Omit<AppState, "loading" | "lastUpdated" | "notifications">;
    }
  | { type: "SET_NOTIFICATIONS"; payload: Notification[] }
  | { type: "APPEND_NOTIFICATION"; payload: Notification }
  | { type: "MARK_NOTIFICATION_READ"; payload: { id: number; read: boolean } };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOADING":
      return state;
    case "LOADED":
      return { ...state, ...action.payload, lastUpdated: new Date() };
    case "SET_NOTIFICATIONS":
      return { ...state, notifications: action.payload };
    case "APPEND_NOTIFICATION":
      if (state.notifications.some((n) => n.id === action.payload.id)) return state;
      return { ...state, notifications: [action.payload, ...state.notifications].slice(0, 100) };
    case "MARK_NOTIFICATION_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.payload.id ? { ...n, read: action.payload.read } : n
        ),
      };
    default:
      return state;
  }
}

export interface AppContextValue {
  intelligence: IntelligenceReport;
  notifications: Notification[];
  unreadCount: number;
  orgNetwork: OrgNetworkReport;
  decisionHealth: DecisionHealthIndex;
  ruleHealthMap: Record<string, RuleHealth>;
  metricsHealth: Record<string, MetricHealth>;
  graph: GraphSubgraph;
  weeklyBriefing: WeeklyBriefing;
  priorityQueue: PriorityItem[];
  upcoming: UpcomingItem[];
  loading: boolean;
  toast: (msg: string, sev?: Severity) => void;
  refetch: () => void;
  markNotificationRead: (id: number, read?: boolean) => void;
  lastUpdated: Date;
}

const AppContext = createContext<AppContextValue | null>(null);

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    intelligence: EMPTY_INTELLIGENCE,
    notifications: [],
    orgNetwork: EMPTY_ORG_NETWORK,
    decisionHealth: EMPTY_DECISION_HEALTH,
    ruleHealthMap: {},
    metricsHealth: {},
    graph: EMPTY_GRAPH,
    weeklyBriefing: EMPTY_BRIEFING,
    priorityQueue: [],
    upcoming: [],
    loading: true,
    lastUpdated: new Date(),
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const toast = useCallback((message: string, sev: Severity = 2) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, severity: sev }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const refetch = useCallback(() => {
    dispatch({ type: "LOADING" });
    void (async () => {
      const [intelligence, notifications, orgNetwork, decisionHealth, ruleHealthMap, metricsHealth, graph, weeklyBriefing, today] =
        await Promise.all([
          fetchJson<IntelligenceReport>("/api/intelligence"),
          fetchJson<Notification[]>("/api/notifications"),
          fetchJson<OrgNetworkReport>("/api/org-network"),
          fetchJson<DecisionHealthIndex>("/api/decision-health"),
          fetchJson<Record<string, RuleHealth>>("/api/rule-health"),
          fetchJson<Record<string, MetricHealth>>("/api/metric-health"),
          fetchJson<GraphSubgraph>("/api/graph"),
          fetchJson<WeeklyBriefing>("/api/briefing"),
          fetchJson<{ priorityQueue: PriorityItem[]; upcoming: UpcomingItem[] }>("/api/today"),
        ]);

      dispatch({
        type: "LOADED",
        payload: {
          intelligence: intelligence ?? EMPTY_INTELLIGENCE,
          orgNetwork: orgNetwork ?? EMPTY_ORG_NETWORK,
          decisionHealth: decisionHealth ?? EMPTY_DECISION_HEALTH,
          ruleHealthMap: ruleHealthMap ?? {},
          metricsHealth: metricsHealth ?? {},
          graph: graph ?? EMPTY_GRAPH,
          weeklyBriefing: weeklyBriefing ?? EMPTY_BRIEFING,
          priorityQueue: today?.priorityQueue ?? [],
          upcoming: today?.upcoming ?? [],
        },
      });
      if (notifications) dispatch({ type: "SET_NOTIFICATIONS", payload: notifications });
    })();
  }, []);

  const markNotificationRead = useCallback((id: number, read = true) => {
    dispatch({ type: "MARK_NOTIFICATION_READ", payload: { id, read } });
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read }),
    }).catch(() => {
      dispatch({ type: "MARK_NOTIFICATION_READ", payload: { id, read: !read } });
    });
  }, []);

  useEffect(() => {
    refetch();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    source.addEventListener("notification", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as Notification;
        dispatch({ type: "APPEND_NOTIFICATION", payload: data });
        toast(`${data.title}`, data.severity);
        if (data.severity >= 4) refetch();
      } catch {
        // ignore malformed event
      }
    });
    source.onerror = () => {
      // EventSource auto-reconnects; nothing to do here.
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = useMemo(() => state.notifications.filter((n) => !n.read).length, [state.notifications]);

  const value: AppContextValue = useMemo(
    () => ({
      intelligence: state.intelligence,
      notifications: state.notifications,
      unreadCount,
      orgNetwork: state.orgNetwork,
      decisionHealth: state.decisionHealth,
      ruleHealthMap: state.ruleHealthMap,
      metricsHealth: state.metricsHealth,
      graph: state.graph,
      weeklyBriefing: state.weeklyBriefing,
      priorityQueue: state.priorityQueue,
      upcoming: state.upcoming,
      loading: state.loading,
      toast,
      refetch,
      markNotificationRead,
      lastUpdated: state.lastUpdated,
    }),
    [state, unreadCount, toast, refetch, markNotificationRead]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto min-w-[260px] rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur ${
              t.severity >= 4
                ? "border-red-500/40 bg-red-950/90 text-red-100"
                : t.severity === 3
                ? "border-amber-500/40 bg-amber-950/90 text-amber-100"
                : "border-slate-700 bg-slate-900/95 text-slate-100"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}
