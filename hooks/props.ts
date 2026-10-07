// The session's figures the Property block shows.

export type Tally = {
  // Input tokens: fresh, written to the cache, and read from it.
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
}

export const NO_TALLY: Tally = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

// One turn's usage (the main loop's or a subagent's) added to the session's.
export const addUsage = (t: Tally, u: Usage): Tally => ({
  input: t.input + u.input_tokens,
  cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
  cacheRead: t.cacheRead + u.cache_read_input_tokens,
  output: t.output + u.output_tokens,
})

// The share of input tokens served from the prompt cache; undefined before any.
export function cacheHitRate(t: Tally): number | undefined {
  const all = t.input + t.cacheWrite + t.cacheRead
  return all === 0 ? undefined : (t.cacheRead / all) * 100
}

export const totalTokens = (t: Tally) => t.input + t.cacheWrite + t.cacheRead + t.output

// 950, 12.3k, 4.56M.
export function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export const secondsText = (ms: number) => `${(ms / 1000).toFixed(1)}s`
