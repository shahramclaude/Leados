// src/lib/platform/quality/assertions.ts
//
// Great-expectations-style assertion objects: declarative, named, and
// independently testable. Each assertion inspects one normalized row (plus
// batch context where needed) and returns a pass/fail + reason. The engine
// (engine.ts) aggregates these into dimension scores.
import type { NormalizedLead } from "../types";
import { isValidEmailFormat, isPlaceholderEmailDomain, normalizePhone } from "../normalize";
import { STALENESS_DAYS } from "./thresholds";

export interface AssertionResult {
  name: string;
  passed: boolean;
  reason?: string;
}

export interface Assertion {
  name: string;
  dimension: "completeness" | "validity" | "consistency" | "timeliness";
  description: string;
  hardQuarantineOnFail: boolean;
  check(row: NormalizedLead): AssertionResult;
}

export const hasContactIdentifier: Assertion = {
  name: "has_contact_identifier",
  dimension: "completeness",
  description: "Row must have at least one of email or phone so the lead is reachable.",
  hardQuarantineOnFail: true,
  check: (row) => {
    const passed = !!row.email || !!row.phone;
    return { name: "has_contact_identifier", passed, reason: passed ? undefined : "missing_contact_identifiers" };
  },
};

export const hasName: Assertion = {
  name: "has_name",
  dimension: "completeness",
  description: "Row must have a non-empty full name.",
  hardQuarantineOnFail: false,
  check: (row) => {
    const passed = !!row.fullName;
    return { name: "has_name", passed, reason: passed ? undefined : "missing_name" };
  },
};

export const emailFormatValid: Assertion = {
  name: "email_format_valid",
  dimension: "validity",
  description: "When present, email must match a basic RFC-5322-ish pattern.",
  hardQuarantineOnFail: true,
  check: (row) => {
    if (!row.email) return { name: "email_format_valid", passed: true };
    const passed = isValidEmailFormat(row.email);
    return { name: "email_format_valid", passed, reason: passed ? undefined : "invalid_email_format" };
  },
};

export const phoneFormatValid: Assertion = {
  name: "phone_format_valid",
  dimension: "validity",
  description: "When present, phone must normalize to 7-15 digits.",
  hardQuarantineOnFail: false,
  check: (row) => {
    if (!row.phone) return { name: "phone_format_valid", passed: true };
    const passed = normalizePhone(row.phone) !== null;
    return { name: "phone_format_valid", passed, reason: passed ? undefined : "invalid_phone_format" };
  },
};

export const emailDomainNotPlaceholder: Assertion = {
  name: "email_domain_not_placeholder",
  dimension: "consistency",
  description: "Email domain should not be a known placeholder/example domain.",
  hardQuarantineOnFail: false,
  check: (row) => {
    if (!row.email || !isValidEmailFormat(row.email)) return { name: "email_domain_not_placeholder", passed: true };
    const passed = !isPlaceholderEmailDomain(row.email);
    return { name: "email_domain_not_placeholder", passed, reason: passed ? undefined : "placeholder_email_domain" };
  },
};

export const sourceTimestampFresh: Assertion = {
  name: "source_timestamp_fresh",
  dimension: "timeliness",
  description: `Source-reported updatedAt should be within ${STALENESS_DAYS} days and not in the future.`,
  hardQuarantineOnFail: false,
  check: (row) => {
    if (!row.sourceUpdatedAt) {
      return { name: "source_timestamp_fresh", passed: false, reason: "no_freshness_metadata" };
    }
    const ts = Date.parse(row.sourceUpdatedAt);
    if (Number.isNaN(ts)) {
      return { name: "source_timestamp_fresh", passed: false, reason: "unparseable_timestamp" };
    }
    const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    const passed = ageDays >= -1 && ageDays <= STALENESS_DAYS;
    return { name: "source_timestamp_fresh", passed, reason: passed ? undefined : "stale_or_future_timestamp" };
  },
};

export const ROW_ASSERTIONS: Assertion[] = [
  hasContactIdentifier,
  hasName,
  emailFormatValid,
  phoneFormatValid,
  emailDomainNotPlaceholder,
  sourceTimestampFresh,
];
