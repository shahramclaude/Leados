"use client";

// Client hook wiring the lazily-loaded realtime SSE client into the batched
// notification store. Mount this once near the app root (see
// `src/components/RealtimeProvider.tsx`). The realtime client module itself
// is only fetched via dynamic `import()` once this hook mounts in the
// browser — it is never part of the initial server-rendered bundle.

import { useEffect, useRef, useState } from "react";
import {
  getNotificationSnapshot,
  setConnectionStatus,
  setLastEventId,
  subscribeNotificationStore,
  upsertNotification,
  patchNotificationStatus,
  type ConnectionStatus,
} from "@/lib/store/notificationStore";
import type { RealtimeClientController } from "@/lib/realtime/client";

const STORAGE_KEY = "leados.lastEventId";

function readStoredLastEventId(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? Number(raw) || 0 : 0;
}

function writeStoredLastEventId(id: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(id));
}

interface RealtimeEnvelope {
  id: number;
  userId: string;
  type: string;
  domain: string;
  severity: number;
  entityType: string | null;
  entityId: string | null;
  dedupKey: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function useRealtimeIntelligence() {
  const [connectionStatus, setLocalStatus] = useState<ConnectionStatus>(() => getNotificationSnapshot().connectionStatus);
  const controllerRef = useRef<RealtimeClientController | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeNotificationStore(() => {
      setLocalStatus(getNotificationSnapshot().connectionStatus);
    });

    let cancelled = false;

    (async () => {
      const { connectRealtimeStream } = await import("@/lib/realtime/client");
      if (cancelled) return;

      controllerRef.current = connectRealtimeStream(
        "/api/events/stream",
        () => readStoredLastEventId(),
        {
          onStatusChange: (status) => setConnectionStatus(status),
          onEvent: (frame) => {
            setLastEventId(frame.id);
            writeStoredLastEventId(frame.id);
            const envelope = frame.raw as RealtimeEnvelope;
            handleEnvelope(envelope);
          },
        },
      );
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      controllerRef.current?.close();
    };
  }, []);

  return { connectionStatus };
}

function handleEnvelope(envelope: RealtimeEnvelope) {
  if (envelope.type === "notification.created") {
    const payload = envelope.payload as {
      notificationId: string;
      title: string;
      body: string;
      delivery: string;
      reason: string;
      occurrenceCount: number;
    };
    upsertNotification({
      id: payload.notificationId,
      type: envelope.type,
      domain: envelope.domain,
      severity: envelope.severity,
      title: payload.title,
      body: payload.body,
      entityType: envelope.entityType,
      entityId: envelope.entityId,
      status: "unread",
      delivery: payload.delivery,
      reason: payload.reason,
      occurrenceCount: payload.occurrenceCount,
      createdAt: envelope.createdAt,
      updatedAt: envelope.createdAt,
    });
    return;
  }

  if (envelope.type === "notification.updated") {
    const payload = envelope.payload as { notificationId: string; status: "unread" | "read" | "archived" };
    patchNotificationStatus(payload.notificationId, payload.status);
  }
}
