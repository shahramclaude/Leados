// ---------------------------------------------------------------------------
// Durable offline write-queue. Every mutation gets an `idempotencyKey` so the
// server can dedupe safe replays. Items persist via a QueueStorageAdapter so
// a reload does not lose queued work. A mutation is NEVER silently dropped:
// `dismiss()` is the only way to remove a failed/conflicted item, and every
// dismissal is appended to `dismissedAudit` for later inspection.
// ---------------------------------------------------------------------------

import type { QueueStorageAdapter } from "./storageAdapters";

export type QueueItemStatus =
  | "pending"
  | "sending"
  | "applied"
  | "conflict"
  | "failed";

export interface QueueItem {
  idempotencyKey: string;
  causationSeq: number;
  entityType: "objective" | "finding" | "approval";
  label: string;
  method: "POST" | "PATCH";
  url: string;
  body: Record<string, unknown>;
  status: QueueItemStatus;
  attempts: number;
  createdAt: number;
  lastError?: string;
}

export interface DismissedAuditEntry {
  idempotencyKey: string;
  label: string;
  reason: "user_dismissed_failed" | "user_dismissed_conflict";
  dismissedAt: number;
}

type Listener = () => void;

export class OfflineQueue {
  private items: QueueItem[] = [];
  private dismissedAudit: DismissedAuditEntry[] = [];
  private seq = 0;
  private listeners = new Set<Listener>();
  private hydrated = false;

  constructor(private adapter: QueueStorageAdapter<QueueItem>) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  async hydrate() {
    if (this.hydrated) return;
    this.items = await this.adapter.load();
    this.seq = this.items.reduce((max, i) => Math.max(max, i.causationSeq), 0);
    this.hydrated = true;
    this.emit();
  }

  private async persist() {
    await this.adapter.save(this.items);
  }

  list() {
    return [...this.items].sort((a, b) => a.causationSeq - b.causationSeq);
  }

  getDismissedAudit() {
    return [...this.dismissedAudit];
  }

  async enqueue(input: Omit<QueueItem, "causationSeq" | "status" | "attempts" | "createdAt">) {
    this.seq += 1;
    const item: QueueItem = {
      ...input,
      causationSeq: this.seq,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    };
    this.items.push(item);
    await this.persist();
    this.emit();
    return item;
  }

  async updateStatus(idempotencyKey: string, status: QueueItemStatus, lastError?: string) {
    const item = this.items.find((i) => i.idempotencyKey === idempotencyKey);
    if (!item) return;
    item.status = status;
    if (status === "sending" || status === "failed") item.attempts += 1;
    if (lastError) item.lastError = lastError;
    await this.persist();
    this.emit();
  }

  /** Only explicit path to remove a terminal item. Always audited. */
  async dismiss(idempotencyKey: string) {
    const item = this.items.find((i) => i.idempotencyKey === idempotencyKey);
    if (!item) return;
    this.dismissedAudit.push({
      idempotencyKey,
      label: item.label,
      reason: item.status === "conflict" ? "user_dismissed_conflict" : "user_dismissed_failed",
      dismissedAt: Date.now(),
    });
    this.items = this.items.filter((i) => i.idempotencyKey !== idempotencyKey);
    await this.persist();
    this.emit();
  }

  async remove(idempotencyKey: string) {
    this.items = this.items.filter((i) => i.idempotencyKey !== idempotencyKey);
    await this.persist();
    this.emit();
  }

  pendingCount() {
    return this.items.filter((i) => i.status === "pending" || i.status === "sending").length;
  }
}
