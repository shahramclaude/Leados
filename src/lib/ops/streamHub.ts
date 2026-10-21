// In-memory registry of active SSE connections for this process. Powers the
// `stream_connections_active` metric and the `stream_hub` health check.
// Per-instance by design (no cross-replica aggregation attempted here —
// documented limitation, see AI-SESSION-LOG.md).
import { setGauge } from "@/lib/obs/metrics";

let active = 0;

export function registerStreamConnection(): () => void {
  active += 1;
  setGauge("stream_connections_active", active);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    active = Math.max(0, active - 1);
    setGauge("stream_connections_active", active);
  };
}

export function activeStreamConnections(): number {
  return active;
}
