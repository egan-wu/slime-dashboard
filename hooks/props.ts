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

// The prompt cache's time to live, and where it came from: Claude Code's
// CLAUDE_CODE_PROMPT_CACHE_TTL first, then the settings' `promptCacheTtl`
// (the nearest file that sets it), else automatic: an hour on a subscription
// within its limits, five minutes on an API key or once a limit runs out.
export type CacheTtl = { ttl: '5m' | '1h'; from: 'env' | 'setting' | 'auto' }
const isTtl = (v: unknown): v is '5m' | '1h' => v === '5m' || v === '1h'
export function cacheTtlOf(env: string | undefined, settings: readonly unknown[], plan: 'subscription' | 'api', isOut: boolean): CacheTtl {
  if (isTtl(env)) return { ttl: env, from: 'env' }
  for (const s of settings) {
    const ttl = s && typeof s === 'object' ? (s as { promptCacheTtl?: unknown }).promptCacheTtl : undefined
    if (isTtl(ttl)) return { ttl, from: 'setting' }
  }
  return { ttl: plan === 'subscription' && !isOut ? '1h' : '5m', from: 'auto' }
}

// A moment as this computer's clock reads it: `14:32`.
export function clockText(at: number, offset: number): string {
  const d = new Date(at + offset)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export const ttlMs = (ttl: '5m' | '1h') => (ttl === '1h' ? 3_600_000 : 300_000)

// When the cache the last request left runs out, in this computer's time,
// and how long until then: `14:32 · 52m`, `14:32 · 40s`, `expired`.
export function cacheEndText(lastAt: number, ttl: '5m' | '1h', now: number, offset: number): string {
  if (lastAt <= 0) return '—'
  const end = lastAt + ttlMs(ttl)
  const left = end - now
  if (left <= 0) return 'expired'
  return `${clockText(end, offset)} · ${left >= 60_000 ? `${Math.floor(left / 60_000)}m` : `${Math.ceil(left / 1000)}s`}`
}
