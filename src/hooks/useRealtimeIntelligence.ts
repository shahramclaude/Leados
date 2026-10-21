"use client";

// Client side of the realtime protocol documented in docs/REALTIME.md.
//
// Implementation choice: a manual `fetch` + `ReadableStream` SSE reader
// instead of the browser's native `EventSource`. Native EventSource cannot
// set custom request headers (needed here for the dev-auth `x-user-id`
// header used by automated tests) and gives us no control over reconnect
// backoff/jitter (it reconnects on a fixed `retry:` interval with no
// jitter, which synchronizes reconnect storms after a shared outage). A
// hand-rolled reader costs a bit more code but buys back both. The server
// still honors the standard `Last-Event-ID` SSE reconnect convention, so a
// real `EventSource` client (or curl) works against the same endpoint.
//
// Performance floor: all frames arriving within the same animation frame
// are coalesced into a single React state update (see `flush`), satisfying
// "store updates batched (<= 1 render per frame)".

import { useEffect, useRef, useState } from "react";

export interface RealtimeFrame {
  id: number;
  type: string;
  domain: string;
  entityRef: string | null;
  payload: unknown;
  createdAt: string;
}

export type ConnectionState = "connecting" | "open" | "reconnecting" | "polling" | "closed";

const MAX_BUFFER = 200;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const POLL_AFTER_FAILURES = 3;
const POLL_INTERVAL_MS = 10_000;

export function useRealtimeIntelligence(opts?: { onFrame?: (frame: RealtimeFrame) => void }) {
  const [status, setStatus] = useState<ConnectionState>("connecting");
  const [frames, setFrames] = useState<RealtimeFrame[]>([]);
  const lastEventIdRef = useRef(0);
  const pendingRef = useRef<RealtimeFrame[]>([]);
  const rafRef = useRef<number | null>(null);
  const failureCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);
  const onFrameRef = useRef(opts?.onFrame);
  onFrameRef.current = opts?.onFrame;

  useEffect(() => {
    stoppedRef.current = false;

    function flush() {
      rafRef.current = null;
      if (pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      setFrames((prev) => {
        const next = [...prev, ...batch];
        return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
      });
    }

    function scheduleFlush() {
      if (rafRef.current !== null) return;
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
      rafRef.current = raf(flush);
    }

    function enqueue(frame: RealtimeFrame) {
      lastEventIdRef.current = Math.max(lastEventIdRef.current, frame.id);
      pendingRef.current.push(frame);
      onFrameRef.current?.(frame);
      scheduleFlush();
    }

    async function pollOnce() {
      try {
        const res = await fetch(`/api/events/poll?lastEventId=${lastEventIdRef.current}`, { cache: "no-store" });
        if (!res.ok) return;
        const data: { frames: RealtimeFrame[] } = await res.json();
        for (const frame of data.frames) enqueue(frame);
      } catch {
        // swallow; next poll tick tries again
      }
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      setStatus("polling");
      if (pollTimer) return;
      pollOnce();
      pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    async function connect() {
      if (stoppedRef.current) return;
      setStatus((s) => (s === "polling" ? "reconnecting" : "connecting"));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/events/stream?lastEventId=${lastEventIdRef.current}`, {
          headers: { accept: "text/event-stream" },
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok || !res.body) throw new Error(`stream unavailable: ${res.status}`);

        stopPolling();
        setStatus("open");
        failureCountRef.current = 0;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stoppedRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            if (!chunk.trim() || chunk.startsWith(":")) continue; // heartbeat/comment
            const lines = chunk.split("\n");
            let id: number | null = null;
            let event = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("id:")) id = Number.parseInt(line.slice(3).trim(), 10);
              else if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (id === null || !data) continue;
            try {
              const parsed = JSON.parse(data);
              enqueue({ id, type: event, domain: parsed.domain, entityRef: parsed.entityRef, payload: parsed.payload, createdAt: parsed.createdAt });
            } catch {
              // malformed frame, skip rather than crash the connection
            }
          }
        }

        throw new Error("stream closed");
      } catch {
        if (stoppedRef.current) return;
        failureCountRef.current += 1;

        if (failureCountRef.current >= POLL_AFTER_FAILURES) {
          startPolling();
        }

        const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failureCountRef.current - 1));
        const jitter = Math.random() * backoff * 0.3;
        setStatus(failureCountRef.current >= POLL_AFTER_FAILURES ? "polling" : "reconnecting");
        setTimeout(() => {
          if (!stoppedRef.current) connect();
        }, backoff + jitter);
      }
    }

    connect();

    return () => {
      stoppedRef.current = true;
      abortRef.current?.abort();
      stopPolling();
      if (rafRef.current !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { status, frames, lastEventId: lastEventIdRef.current };
}
