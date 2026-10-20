// Tiny external store (no extra dependency) for realtime notification state.
// Rapid SSE bursts (e.g. a connection storm replaying history) are coalesced
// into a single React re-render via a short batching window instead of one
// re-render per event — this is the "cap re-render frequency" requirement
// from the performance budget.

export type NotificationStatus = "unread" | "read" | "archived";

export interface StoreNotification {
  id: string;
  type: string;
  domain: string;
  severity: number;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  status: NotificationStatus;
  delivery: string;
  reason: string;
  occurrenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface NotificationStoreState {
  byId: Record<string, StoreNotification>;
  order: string[]; // most recent first
  unreadCount: number;
  connectionStatus: ConnectionStatus;
  lastEventId: number;
}

type Listener = () => void;

const BATCH_WINDOW_MS = 200;
const MAX_NOTIFICATIONS = 500;

let state: NotificationStoreState = {
  byId: {},
  order: [],
  unreadCount: 0,
  connectionStatus: "connecting",
  lastEventId: 0,
};

const listeners = new Set<Listener>();
let pendingFlush: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function recomputeUnread(): number {
  let count = 0;
  for (const id of state.order) {
    if (state.byId[id]?.status === "unread") count += 1;
  }
  return count;
}

function scheduleFlush() {
  dirty = true;
  if (pendingFlush) return;
  pendingFlush = setTimeout(() => {
    pendingFlush = null;
    if (!dirty) return;
    dirty = false;
    state = { ...state, unreadCount: recomputeUnread() };
    for (const listener of listeners) listener();
  }, BATCH_WINDOW_MS);
}

export function subscribeNotificationStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNotificationSnapshot(): NotificationStoreState {
  return state;
}

export function setConnectionStatus(status: ConnectionStatus) {
  state = { ...state, connectionStatus: status };
  scheduleFlush();
}

export function setLastEventId(id: number) {
  if (id > state.lastEventId) state.lastEventId = id;
}

export function hydrateNotifications(rows: StoreNotification[]) {
  const byId: Record<string, StoreNotification> = {};
  const order: string[] = [];
  for (const row of rows) {
    byId[row.id] = row;
    order.push(row.id);
  }
  state = { ...state, byId, order, unreadCount: rows.filter((r) => r.status === "unread").length };
  for (const listener of listeners) listener();
}

export function upsertNotification(notification: StoreNotification) {
  const isNew = !state.byId[notification.id];
  state.byId[notification.id] = notification;
  if (isNew) {
    state.order = [notification.id, ...state.order].slice(0, MAX_NOTIFICATIONS);
  }
  scheduleFlush();
}

export function patchNotificationStatus(id: string, status: NotificationStatus) {
  const existing = state.byId[id];
  if (!existing) return;
  state.byId[id] = { ...existing, status };
  scheduleFlush();
}

export function resetNotificationStore() {
  state = { byId: {}, order: [], unreadCount: 0, connectionStatus: "connecting", lastEventId: 0 };
  for (const listener of listeners) listener();
}
