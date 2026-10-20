"use client";

import { useEffect, useMemo } from "react";
import { ErrorState } from "@/components/leados/ui/States";

export default function UnderstandError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const errorId = useMemo(() => error.digest ?? `understand-${Date.now().toString(36)}`, [error.digest]);
  useEffect(() => {
    console.error("[understand]", errorId, error);
  }, [error, errorId]);
  return <ErrorState title="Understand couldn't load" errorId={errorId} onRetry={reset} />;
}
