"use client";

const API_KEY_STORAGE = "leados.apiKey";
const TENANT_NAME_STORAGE = "leados.tenantName";
export const OFFLINE_QUEUE_STORAGE = "leados.offlineQueue";

export function getStoredSession(): { apiKey: string | null; tenantName: string | null } {
  if (typeof window === "undefined") return { apiKey: null, tenantName: null };
  return {
    apiKey: window.localStorage.getItem(API_KEY_STORAGE),
    tenantName: window.localStorage.getItem(TENANT_NAME_STORAGE),
  };
}

export function setStoredSession(apiKey: string, tenantName: string) {
  window.localStorage.setItem(API_KEY_STORAGE, apiKey);
  window.localStorage.setItem(TENANT_NAME_STORAGE, tenantName);
}

export function clearStoredSession() {
  window.localStorage.removeItem(API_KEY_STORAGE);
  window.localStorage.removeItem(TENANT_NAME_STORAGE);
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { apiKey } = getStoredSession();
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (apiKey) headers.set("authorization", `Bearer ${apiKey}`);
  return fetch(path, { ...options, headers });
}

export const ROUTES: { href: string; label: string; keywords: string }[] = [
  { href: "/", label: "Dashboard", keywords: "home dashboard" },
  { href: "/onboarding", label: "Onboarding", keywords: "tenant signup create org" },
  { href: "/capture", label: "Capture a lead", keywords: "lead capture signal" },
  { href: "/findings", label: "Findings", keywords: "finding confidence score" },
  { href: "/decisions", label: "Decisions", keywords: "decision action pursue" },
  { href: "/approvals", label: "Approvals", keywords: "approve reject" },
  { href: "/automation", label: "Automation run", keywords: "monte carlo forecast" },
  { href: "/board-pack", label: "Board pack", keywords: "export report" },
  { href: "/styleguide", label: "Styleguide", keywords: "design tokens colors" },
  { href: "/about", label: "About / self-test", keywords: "status health ci" },
];
