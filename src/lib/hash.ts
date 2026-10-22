import { createHash } from "node:crypto";

/** Stable short hash of a JSON-serializable object, used as the forecast
 * cache/projection identity key component ("inputsHash"). */
export function hashInputs(obj: unknown): string {
  const json = JSON.stringify(obj, Object.keys(obj as object).sort());
  return createHash("sha1").update(json).digest("hex").slice(0, 16);
}
