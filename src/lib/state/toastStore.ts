"use client";

import { useSyncExternalStore } from "react";

export interface Toast {
  id: string;
  message: string;
  tone: "info" | "error" | "success";
}

type Listener = () => void;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.toasts;

  private emit() {
    for (const l of this.listeners) l();
  }

  push(message: string, tone: Toast["tone"] = "info") {
    const id = crypto.randomUUID();
    this.toasts = [...this.toasts, { id, message, tone }];
    this.emit();
    setTimeout(() => this.dismiss(id), 5000);
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }
}

export const toastStore = new ToastStore();

export function useToasts() {
  return useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, () => []);
}
