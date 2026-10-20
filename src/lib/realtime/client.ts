// Manual SSE client (fetch + ReadableStream) instead of the native
// `EventSource`. We need this because `EventSource` only supports a single
// fixed reconnect delay (the `retry:` field) with no exponential backoff and
// no way to observe/cap attempts — both required by this part. We still
// speak the exact SSE wire format (`id:`, `event:`, `data:`, comments) so the
// server implementation is a drop-in for either client.
//
// Loaded lazily (dynamic import) by `useRealtimeIntelligence` so the
// streaming code never ships in the initial page bundle.

export interface ParsedSseFrame {
  id?: string;
  event?: string;
  data?: string;
}

export interface RealtimeClientHandlers {
  onEvent: (frame: { id: number; type: string; raw: unknown }) => void;
  onStatusChange: (status: "connecting" | "open" | "reconnecting" | "closed") => void;
}

export interface RealtimeClientController {
  close: () => void;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 45_000; // > server heartbeat interval (15s) with margin

function parseFrames(buffer: string): { frames: ParsedSseFrame[]; rest: string } {
  const frames: ParsedSseFrame[] = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim() || block.startsWith(":")) continue; // pure comment/heartbeat block
    const frame: ParsedSseFrame = {};
    for (const line of block.split("\n")) {
      if (line.startsWith("id:")) frame.id = line.slice(3).trim();
      else if (line.startsWith("event:")) frame.event = line.slice(6).trim();
      else if (line.startsWith("data:")) frame.data = (frame.data ? frame.data + "\n" : "") + line.slice(5).trim();
    }
    if (frame.event || frame.data) frames.push(frame);
  }
  return { frames, rest };
}

export function connectRealtimeStream(
  url: string,
  getLastEventId: () => number,
  handlers: RealtimeClientHandlers,
): RealtimeClientController {
  let closed = false;
  let attempt = 0;
  let abortController: AbortController | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const resetHeartbeatTimer = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      // No frame (including heartbeat comments) for too long — treat as a
      // silent drop and force a reconnect.
      abortController?.abort();
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const scheduleReconnect = () => {
    if (closed) return;
    handlers.onStatusChange("reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * 2 ** attempt) + Math.random() * 250;
    attempt += 1;
    reconnectTimer = setTimeout(run, delay);
  };

  async function run() {
    if (closed) return;
    handlers.onStatusChange(attempt === 0 ? "connecting" : "reconnecting");
    abortController = new AbortController();
    resetHeartbeatTimer();

    try {
      const lastEventId = getLastEventId();
      const response = await fetch(url, {
        headers: lastEventId > 0 ? { "Last-Event-ID": String(lastEventId) } : undefined,
        signal: abortController.signal,
        cache: "no-store",
      });

      if (!response.ok || !response.body) throw new Error(`stream failed: ${response.status}`);

      attempt = 0; // reset backoff on a successful connection
      handlers.onStatusChange("open");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        resetHeartbeatTimer();
        buffer += decoder.decode(value, { stream: true });
        const { frames, rest } = parseFrames(buffer);
        buffer = rest;

        for (const frame of frames) {
          if (frame.event === "connected") continue;
          if (!frame.data) continue;
          try {
            const raw = JSON.parse(frame.data);
            handlers.onEvent({ id: frame.id ? Number(frame.id) : 0, type: frame.event ?? "message", raw });
          } catch {
            // ignore malformed frame
          }
        }
      }
      throw new Error("stream closed by server");
    } catch {
      if (!closed) scheduleReconnect();
    } finally {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
    }
  }

  run();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      abortController?.abort();
      handlers.onStatusChange("closed");
    },
  };
}
