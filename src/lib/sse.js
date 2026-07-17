// Shared client-side SSE reader for the `/api/relay` + `/api/sandbox` streams.
//
// The correct, buffered pattern: a `data:` line can be split across two TCP
// reads, so we carry a cross-read buffer and only parse whole `\n`-terminated
// lines; `decode(value, { stream: true })` keeps a partial multibyte UTF-8
// sequence intact across a read boundary (no mojibake). This matches the loop
// already used in ChatHome.runSolo / Sandbox — extracted here so the three
// client loops (Invoke included) can't drift back into the unbuffered bug that
// truncates output and drops the final usage frame (A1).
//
// onEvent receives each parsed `data:` JSON object. Malformed frames are
// skipped silently (SSE keep-alive comments / partial frames). Aborting the
// fetch (its AbortController) rejects reader.read(), which propagates out of
// this helper — the caller distinguishes AbortError from a real failure.
export async function readSSE(res, onEvent) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
        let data
        try { data = JSON.parse(line.slice(6)) } catch { continue }
        onEvent(data)
      }
    }
  } finally {
    // reader.cancel() returns a Promise; on the abort path the body stream is
    // already errored, so cancel() REJECTS. Await inside the try so that
    // rejection is caught here instead of escaping as an unhandled rejection.
    try { await reader.cancel() } catch { /* already closed / errored */ }
  }
}
