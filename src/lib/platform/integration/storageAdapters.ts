// ---------------------------------------------------------------------------
// Pluggable durable storage for the offline mutation queue. Browser uses
// IndexedDB (survives reload/close). A pure-memory adapter is used for SSR
// safety and, crucially, the Node-based offline round-trip test can supply
// its own file-backed adapter that implements the exact same interface —
// so the queue/sync logic under test is identical to production code.
// ---------------------------------------------------------------------------

export interface QueueStorageAdapter<T> {
  load(): Promise<T[]>;
  save(items: T[]): Promise<void>;
}

const DB_NAME = "leados-offline-queue";
const STORE_NAME = "mutations";

export function createIndexedDbAdapter<T extends { idempotencyKey: string }>(): QueueStorageAdapter<T> {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "idempotencyKey" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async load() {
      const db = await openDb();
      return new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    },
    async save(items) {
      const db = await openDb();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        for (const item of items) store.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

export function createMemoryAdapter<T>(): QueueStorageAdapter<T> {
  let items: T[] = [];
  return {
    async load() {
      return items;
    },
    async save(next) {
      items = next;
    },
  };
}

export function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}
