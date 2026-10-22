"use client";

// Minimal hand-rolled IndexedDB wrapper (no dependency) for the offline
// write queue. Kept deliberately tiny: one object store, one index.

const DB_NAME = "leados-offline";
const DB_VERSION = 1;
export const STORE_NAME = "writeQueue";

export type QueuedWrite = {
  id: string;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body: unknown;
  description: string; // human-readable label for the sync drawer
  createdAt: number;
  status: "queued" | "syncing" | "conflict" | "failed" | "done";
  conflict?: { serverRecord: Record<string, unknown>; attemptedParams: Record<string, unknown> };
  error?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbPut(item: QueuedWrite): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function dbAll(): Promise<QueuedWrite[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as QueuedWrite[]);
    request.onerror = () => reject(request.error);
  });
}
