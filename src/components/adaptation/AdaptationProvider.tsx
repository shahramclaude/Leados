"use client";

// src/components/adaptation/AdaptationProvider.tsx
//
// Client-side state layer (Part 03 surface) for the adaptive demo. Owns the
// anonymous demo user id, the current profile, and the "standard view"
// comparison toggle (always available, never persisted — it's a pure local
// A/B lens on top of whatever the server would otherwise adapt).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Domain, ExpertiseScore } from "@/lib/familiarity";
import type { CognitiveStyleProfile } from "@/lib/humanNeeds";
import type { DensityMode } from "@/lib/design/tokens";
import type { InteractionEventType } from "@/lib/aiLearning";

const USER_ID_KEY = "leados-adaptation-user-id";

function readOrCreateUserId(): string {
  if (typeof window === "undefined") return "ssr-placeholder";
  const existing = window.localStorage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const fresh = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `u-${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(USER_ID_KEY, fresh);
  return fresh;
}

export interface ProfileState {
  profile: {
    userId: string;
    declaredStyle: CognitiveStyleProfile | null;
    densityModeOverride: DensityMode | null;
    adaptationPaused: boolean;
    onboardingCompleted: boolean;
    onboardingSkipped: boolean;
  };
  expertise: Record<Domain, ExpertiseScore>;
  effectiveStyle: CognitiveStyleProfile;
  eventCount: number;
}

interface AdaptationContextValue {
  userId: string;
  ready: boolean;
  standardView: boolean;
  setStandardView: (v: boolean) => void;
  profile: ProfileState | null;
  loadingProfile: boolean;
  refreshProfile: () => Promise<void>;
  logEvent: (
    domain: Domain,
    eventType: InteractionEventType,
    magnitude?: number,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  setDensityOverride: (mode: DensityMode | null) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

const AdaptationContext = createContext<AdaptationContextValue | null>(null);

export function AdaptationProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string>("ssr-placeholder");
  const [ready, setReady] = useState(false);
  const [standardView, setStandardView] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    setUserId(readOrCreateUserId());
    setReady(true);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!ready) return;
    setLoadingProfile(true);
    try {
      const res = await fetch(`/api/adaptation/profile?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.ok) {
        setProfile({
          profile: data.profile,
          expertise: data.expertise,
          effectiveStyle: data.effectiveStyle,
          eventCount: data.eventCount,
        });
      }
    } finally {
      setLoadingProfile(false);
    }
  }, [ready, userId]);

  useEffect(() => {
    if (ready) void refreshProfile();
  }, [ready, refreshProfile]);

  const logEvent = useCallback(
    async (domain: Domain, eventType: InteractionEventType, magnitude = 0.7, metadata?: Record<string, unknown>) => {
      await fetch("/api/adaptation/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, domain, eventType, magnitude, metadata }),
      });
      await refreshProfile();
    },
    [userId, refreshProfile],
  );

  const setDensityOverride = useCallback(
    async (mode: DensityMode | null) => {
      await fetch("/api/adaptation/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, patch: { densityModeOverride: mode } }),
      });
      await refreshProfile();
    },
    [userId, refreshProfile],
  );

  const setPaused = useCallback(
    async (paused: boolean) => {
      await fetch("/api/adaptation/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, paused }),
      });
      await refreshProfile();
    },
    [userId, refreshProfile],
  );

  const resetToDefault = useCallback(async () => {
    await fetch("/api/adaptation/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setStandardView(false);
    await refreshProfile();
  }, [userId, refreshProfile]);

  const value = useMemo<AdaptationContextValue>(
    () => ({
      userId,
      ready,
      standardView,
      setStandardView,
      profile,
      loadingProfile,
      refreshProfile,
      logEvent,
      setDensityOverride,
      setPaused,
      resetToDefault,
    }),
    [userId, ready, standardView, profile, loadingProfile, refreshProfile, logEvent, setDensityOverride, setPaused, resetToDefault],
  );

  return <AdaptationContext.Provider value={value}>{children}</AdaptationContext.Provider>;
}

export function useAdaptation(): AdaptationContextValue {
  const ctx = useContext(AdaptationContext);
  if (!ctx) throw new Error("useAdaptation must be used within an AdaptationProvider");
  return ctx;
}
