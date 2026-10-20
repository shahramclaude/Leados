// Platform primitive: the only place application code should mint
// identifiers. Domain engines never call `crypto.randomUUID()` directly —
// they receive ids as arguments — which keeps them pure and testable.
export interface IdGenerator {
  newId(): string;
}

export const systemIdGenerator: IdGenerator = {
  newId: () => crypto.randomUUID(),
};
