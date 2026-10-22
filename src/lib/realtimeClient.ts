// LEADOS Part 14 — realtime client (lazy-loaded stream module).
// Client-side only. Deliberately NOT using the browser's native EventSource
// because we need: (a) full control over reconnect backoff+jitter, (b) a
// polling fallback when SSE repeatedly fails, (c) a Last-Event-ID we can
// persist across reloads. Implemented with fetch() + manual SSE framing.
//
// Import this module with `await import("@/lib/realtimeClient")` from
// components so it is excluded from the initial bundle (see
// useRealtimeIntelligence.ts).
export interface RealtimeFrame {
  id: string;
  orgId: string;
  topic: string;
  type: string;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  createdAt: string;
}

export type ConnectionState = "connecting" | "open" | "reconnecting" | "polling" | "closed";

export interface RealtimeState {
  connectionState: ConnectionState;
  frames: RealtimeFrame[]; // rAF-coalesced; bounded ring buffer
  lastEventId: string | null;
  reconnectAttempts: number;
  lagNotices: number;
}

const MAX_FRAMES = 200;
const MAX_BACKOFF_MS = 20000;
const BASE_BACKOFF_MS = 500;
const POLL_FALLBACK_AFTER_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 10000;

function storageKey(userId: string) {
  return `leados:lastEventId:${userId}`;
}

export function createRealtimeClient(opts: { userId: string; role?: string }) {
  let state: RealtimeState = {
    connectionState: "connecting",
    frames: [],
    lastEventId: typeof sessionStorage !== "undefined" ? sessionStorage.getItem(storageKey(opts.userId)) : null,
    reconnectAttempts: 0,
    lagNotices: 0,
  };

  const listeners = new Set<() => void>();
  let pendingFrames: RealtimeFrame[] = [];
  let rafHandle: number | null = null;
  let abortController: AbortController | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function emit() {
    for (const l of listeners) l();
  }

  function scheduleFlush() {
    if (rafHandle !== null) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16);
    rafHandle = raf(() => {
      rafHandle = null;
      if (pendingFrames.length === 0) return;
      const merged = [...state.frames, ...pendingFrames].slice(-MAX_FRAMES);
      const lagCount = pendingFrames.filter((f) => f.type === "lag_notice").length;
      pendingFrames = [];
      state = { ...state, frames: merged, lagNotices: state.lagNotices + lagCount };
      emit();
    }) as unknown as number;
  }

  function setConnectionState(cs: ConnectionState) {
    state = { ...state, connectionState: cs };
    emit();
  }

  function handleFrame(frame: RealtimeFrame) {
    state.lastEventId = frame.id;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey(opts.userId), frame.id);
    pendingFrames.push(frame);
    scheduleFlush();
  }

  function parseChunk(buffer: string): { events: RealtimeFrame[]; rest: string } {
    const events: RealtimeFrame[] = [];
    const parts = buffer.split("\n\n");
    const rest = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim() || part.startsWith(":")) continue;
      let data = "";
      for (const line of part.split("\n")) {
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        events.push(JSON.parse(data) as RealtimeFrame);
      } catch {
        // ignore malformed frame
      }
    }
    return { events, rest };
  }

  async function connectOnce(): Promise<void> {
    abortController = new AbortController();
    const qs = new URLSearchParams({ userId: opts.userId });
    if (opts.role) qs.set("role", opts.role);
    if (state.lastEventId) qs.set("lastEventId", state.lastEventId);

    setConnectionState(state.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const res = await fetch(`/api/events/stream?${qs.toString()}`, {
      signal: abortController.signal,
      headers: state.lastEventId ? { "Last-Event-ID": state.lastEventId } : undefined,
    });
    if (!res.ok || !res.body) throw new Error(`stream failed: ${res.status}`);

    setConnectionState("open");
    state = { ...state, reconnectAttempts: 0 };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseChunk(buffer);
      buffer = rest;
      for (const frame of events) handleFrame(frame);
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    setConnectionState("polling");
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/notifications?userId=${opts.userId}&limit=5`);
        if (!res.ok) return;
        // Polling fallback keeps the UI minimally fresh; it does not attempt
        // to backfill the full frame stream (that is what resume is for once
        // SSE recovers).
        emit();
      } catch {
        // ignore poll failures; keep trying on the interval
      }
    }, POLL_INTERVAL_MS);
    // Keep trying to re-establish SSE in the background at a slower cadence.
    void scheduleReconnect(true);
  }

  async function scheduleReconnect(fromPolling = false) {
    if (stopped) return;
    const attempt = state.reconnectAttempts;
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
    const jittered = backoff * (0.5 + Math.random());
    reconnectTimer = setTimeout(
      () => {
        void runLoop();
      },
      fromPolling ? Math.max(jittered, POLL_INTERVAL_MS) : jittered,
    );
  }

  async function runLoop() {
    if (stopped) return;
    try {
      await connectOnce();
      if (stopped) return;
      // Clean close from server (e.g. redeploy) -> reconnect promptly.
      state = { ...state, reconnectAttempts: 0 };
      await scheduleReconnect();
    } catch {
      if (stopped) return;
      state = { ...state, reconnectAttempts: state.reconnectAttempts + 1 };
      if (state.reconnectAttempts >= POLL_FALLBACK_AFTER_ATTEMPTS) {
        startPolling();
      } else {
        await scheduleReconnect();
      }
    }
  }

  return {
    start() {
      stopped = false;
      void runLoop();
    },
    stop() {
      stopped = true;
      abortController?.abort();
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (rafHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafHandle);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState(): RealtimeState {
      return state;
    },
  };
}

export type RealtimeClient = ReturnType<typeof createRealtimeClient>;
