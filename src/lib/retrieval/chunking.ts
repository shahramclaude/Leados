// src/lib/retrieval/chunking.ts
//
// Plain word-count chunker used when exporting/indexing long doc bodies for
// display (e.g. truncating a living-doc export preview). Not used for
// scoring — scoring in retrieval/index.ts operates on whole rows, which at
// LEADOS's current corpus size keeps every retrieved result traceable to
// exactly one source row (see retrieval/index.ts header comment on why
// pgvector/embedding-chunk retrieval is deliberately not used yet).
export type TextChunk = { index: number; text: string; wordStart: number; wordEnd: number };

export function chunkText(text: string, wordsPerChunk = 120, overlapWords = 20): TextChunk[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = Math.max(1, wordsPerChunk - overlapWords);
  const chunks: TextChunk[] = [];
  let index = 0;
  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(words.length, start + wordsPerChunk);
    chunks.push({ index, text: words.slice(start, end).join(" "), wordStart: start, wordEnd: end });
    index += 1;
    if (end === words.length) break;
  }
  return chunks;
}
