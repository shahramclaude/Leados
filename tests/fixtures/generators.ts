import fc from "fast-check";

/**
 * fast-check arbitraries (generators) for domain shapes, shared across all
 * property-based unit tests so the "what counts as a valid input" definition
 * lives in exactly one place.
 */

export const arbBetaOutcomes = fc.array(fc.boolean(), {
  minLength: 0,
  maxLength: 200,
});

export const arbPositiveFloat = fc.double({
  min: 0,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Ordered PERT triple: optimistic <= mostLikely <= pessimistic. */
export const arbPertInputs = fc
  .tuple(arbPositiveFloat, arbPositiveFloat, arbPositiveFloat)
  .map(([a, b, c]) => [a, b, c].sort((x, y) => x - y))
  .map(([optimistic, mostLikely, pessimistic]) => ({
    optimistic,
    mostLikely,
    pessimistic,
  }));

export const arbGroupOutcomes = fc
  .array(
    fc.record({
      group: fc.constantFrom("A", "B", "C", "D"),
      total: fc.integer({ min: 0, max: 1000 }),
    }),
    { minLength: 1, maxLength: 6 },
  )
  .chain((groups) =>
    fc.tuple(
      ...groups.map((g) =>
        fc.integer({ min: 0, max: g.total }).map((positives) => ({
          group: g.group,
          total: g.total,
          positives,
        })),
      ),
    ),
  );

export const arbSeed = fc.integer({ min: 0, max: 2 ** 31 - 1 });

export const arbHysteresisSeries = fc.array(
  fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  { minLength: 0, maxLength: 300 },
);

export const arbScmConfig = fc.record({
  trueEffect: fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
  confounderOutcomeWeight: fc.double({
    min: -5,
    max: 5,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  confounderTreatmentWeight: fc.double({
    min: -3,
    max: 3,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  noiseStdDev: fc.double({ min: 0.1, max: 2, noNaN: true, noDefaultInfinity: true }),
  sampleSize: fc.integer({ min: 500, max: 2000 }),
});
