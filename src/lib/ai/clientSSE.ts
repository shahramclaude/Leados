// =============================================================================
// LEADOS — Part 11: client-side SSE reader (works for GET and POST streams)
// =============================================================================

export async function streamSSE(
  input: RequestInfo,
  init: RequestInit,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const res = await fetch(input, init);
  if (!res.body) throw new Error("No response body for stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const lines = block.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) {
        try {
          onEvent(event, JSON.parse(data));
        } catch {
          onEvent(event, data);
        }
      }
    }
  }
}
