"use client";

// Single QueryClientProvider for the whole app. react-query gives us request
// de-duplication per render and a cache we invalidate explicitly (never
// mirrored into a global context) — see docs/FRONTEND.md "Server state".
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiRequestError } from "./httpClient";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) => {
          // Never retry 4xx — those are correctness errors, not transient.
          if (error instanceof ApiRequestError && error.status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false, // mutations manage their own retry via apiMutate/idempotency
      },
    },
  });
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
