import { clsx, type ClassValue } from "clsx";

/** Single class-name combinator used across every component in
 * src/components. Having exactly one of these is itself a Phase 0 fix:
 * the pre-existing scaffold had zero, which meant every future component
 * would have invented its own ad-hoc string-concat version. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
