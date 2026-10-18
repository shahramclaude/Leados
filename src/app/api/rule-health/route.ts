import { getRuleHealthMap } from "@/lib/engine";
import { cachedJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const map = await getRuleHealthMap();
  return cachedJson(map);
}
