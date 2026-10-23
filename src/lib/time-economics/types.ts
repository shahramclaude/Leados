// LEADOS — Part 45: shared types for the Time & Meeting Economics engine.
import type { Chronotype } from "./circadian";

export type Role = "member" | "manager" | "admin" | "finance";

export interface Actor {
  id: string;
  role: Role;
}

export interface AttendeeInput {
  userId: string;
  loadedHourlyRate: number;
  required: boolean;
  /** true if this meeting falls inside what would otherwise be this attendee's deep-work time */
  interruptsDeepWork: boolean;
  chronotype: Chronotype;
}

export interface MeetingCostInput {
  orgId: string;
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  attendees: AttendeeInput[];
  deepWorkPremiumMultiplier: number;
  recoveryMinutesPerInterruption: number;
}

export interface MeetingCostBreakdownLine {
  userId: string;
  hourlyRate: number;
  durationHours: number;
  directCost: number;
  interruptedDeepWork: boolean;
  opportunityCost: number;
}

export interface MeetingCostResult {
  eventId: string;
  durationHours: number;
  directCost: number;
  opportunityCost: number;
  totalCost: number;
  currency: string;
  perAttendee: MeetingCostBreakdownLine[];
  method: string[]; // human-readable method notes, always shown in the UI
}

export type StrategyCategory = "strategic" | "operational" | "reactive";

export interface ClassificationResult {
  eventId: string;
  category: StrategyCategory;
  confidence: number; // 0..1 — MUST be rendered wherever category is shown
  pillarId: string | null;
  matchedKeywords: string[];
  method: string;
}
