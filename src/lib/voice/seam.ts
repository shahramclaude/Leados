// Voice seam (Part 32 speech-ready contract).
//
// Implementation of live ASR capture / TTS playback is deliberately
// deferred in this build — ledgered honestly here rather than silently
// stubbed behind a UI that implies it works. What IS real:
//   1. `toSpeechReadyText` strips markdown/citation-bracket noise so any
//      assistant turn can be handed to a TTS engine today without rewriting
//      the dialogue engine.
//   2. The transcript-ingestion seam (`ingestTranscriptSegment`) accepts
//      discrete, timestamped text segments — exactly the shape a streaming
//      ASR provider would push — so wiring a real ASR vendor later is an
//      adapter, not a redesign.
export function toSpeechReadyText(assistantText: string): string {
  return assistantText
    .replace(/\[\d+\]/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const VOICE_SEAM_STATUS = {
  asrIngestion: "seam-ready (ingestTranscriptSegment accepts timestamped text today)",
  liveAsrProvider: "deferred — no vendor wired in this build",
  ttsOutput: "seam-ready (toSpeechReadyText) — no audio synthesis wired in this build",
} as const;
