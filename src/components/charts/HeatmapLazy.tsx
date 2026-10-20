"use client";

import type { DailyBucket } from "@/lib/stats";
import Heatmap from "./Heatmap";

export function HeatmapLazy({ buckets }: { buckets: DailyBucket[] }) {
  return <Heatmap buckets={buckets} />;
}

export default HeatmapLazy;
