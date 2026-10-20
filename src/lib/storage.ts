// LEADOS Part 01 — minimal local blob storage abstraction.
//
// Scope note (honesty rule): Part 01 does not need file/blob storage for any
// of the 8 domain event types defined in eventCatalog.ts. This module exists
// because a future part (knowledge-base attachments, import file uploads)
// will need somewhere to put bytes that isn't a JSONB payload column, and we
// want one seam to swap for S3/R2/etc. later rather than scattering
// `fs.writeFile` calls through API routes.
//
// Current implementation: local filesystem under `.data/storage/` (gitignored
// in spirit — do not commit real uploads). This is NOT durable across
// container rebuilds and is NOT what production should use; it is a
// development-mode stand-in only. Swapping the implementation (e.g. to S3)
// should only require changing this file, since callers only see the
// `BlobStorage` interface below.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface BlobStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const ROOT = join(process.cwd(), ".data", "storage");

function keyToPath(key: string): string {
  if (key.includes("..")) throw new Error("Invalid storage key");
  return join(ROOT, key);
}

class LocalFsStorage implements BlobStorage {
  async put(key: string, data: Buffer): Promise<void> {
    const path = keyToPath(key);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(keyToPath(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(keyToPath(key), { force: true });
  }
}

export const storage: BlobStorage = new LocalFsStorage();
