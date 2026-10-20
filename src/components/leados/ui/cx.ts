import clsx, { type ClassValue } from "clsx";

/** Single className composer used across the kit so class merging logic
 * lives in exactly one place. */
export function cx(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
