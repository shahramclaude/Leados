"use client";

import { useSyncExternalStore } from "react";
import { getNotificationSnapshot, subscribeNotificationStore, type NotificationStoreState } from "@/lib/store/notificationStore";

export function useNotificationStoreState(): NotificationStoreState {
  return useSyncExternalStore(subscribeNotificationStore, getNotificationSnapshot, getNotificationSnapshot);
}
