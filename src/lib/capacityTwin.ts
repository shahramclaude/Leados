// Part 06 (stub — source file not present in this snapshot): Capacity Twin.
//
// Minimal shape used by the delegation capacity check: how many hours is a
// person already allocated this week, against their modelled capacity?

export type CapacitySnapshot = {
  personId: string;
  weekOf: string;
  allocatedHours: number;
  capacityHours: number;
};

export function remainingCapacity(snapshot: CapacitySnapshot): number {
  return snapshot.capacityHours - snapshot.allocatedHours;
}
