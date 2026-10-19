"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Shell } from "@/components/Shell";
import { OrgProfileWizard } from "@/components/OrgProfileWizard";
import { CockpitView } from "@/views/CockpitView";
import { IntelligenceView } from "@/views/IntelligenceView";
import { PeopleView } from "@/views/PeopleView";
import { StrategyView } from "@/views/StrategyView";
import { FinancialView } from "@/views/FinancialView";
import { ExecutionView } from "@/views/ExecutionView";
import { SignalBoardView } from "@/views/SignalBoardView";
import { KnowledgeView } from "@/views/KnowledgeView";
import { DataView } from "@/views/DataView";
import { HealthView } from "@/views/HealthView";
import { AboutView } from "@/views/AboutView";

const VALID_ROUTES = ["today", "intelligence", "people", "strategy", "finance", "execution", "signals", "knowledge", "data", "health", "about"];

function getHashRoute(): string {
  if (typeof window === "undefined") return "today";
  const h = window.location.hash.replace("#", "");
  return VALID_ROUTES.includes(h) ? h : "today";
}

export default function App() {
  const [route, setRoute] = useState("today");
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    setRoute(getHashRoute());
    function onHashChange() {
      setRoute(getHashRoute());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => setNeedsOnboarding(Boolean(d.needsOnboarding)))
      .finally(() => setChecking(false));
  }, []);

  const navigate = useCallback((v: string) => {
    window.location.hash = `#${v}`;
    setRoute(v);
  }, []);

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">Loading Leados…</div>;
  }

  if (needsOnboarding) {
    return (
      <div className="min-h-screen bg-slate-950">
        <OrgProfileWizard onComplete={() => setNeedsOnboarding(false)} />
      </div>
    );
  }

  return (
    <Shell active={route} onNavigate={navigate}>
      {route === "today" && <CockpitView onNavigate={navigate} />}
      {route === "intelligence" && <IntelligenceView />}
      {route === "people" && <PeopleView />}
      {route === "strategy" && <StrategyView />}
      {route === "finance" && <FinancialView />}
      {route === "execution" && <ExecutionView />}
      {route === "signals" && <SignalBoardView />}
      {route === "knowledge" && <KnowledgeView />}
      {route === "data" && <DataView />}
      {route === "health" && <HealthView />}
      {route === "about" && <AboutView />}
    </Shell>
  );
}
