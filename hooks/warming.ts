// Cache Warming: while it is on and the session sits idle, a fork of the main
// thread's last request ($.model.fork) is sent a little before the prompt
// cache would lapse. The fork's prefix is read from the cache, which starts
// its time over, and nothing is added to the conversation.

// Cache Warming is Auto or Off. On Auto, each time the session goes idle it
// keeps the cache warm only while that pays (see pingPays): with a small
// context it does not start, and past break-even it rests until the next turn.

// Sent this long before the cache would lapse, so a slow reply still lands
// in time: a minute and a half, or a fifth of a short TTL.
export const leadMs = (ttlMs: number) => Math.min(90_000, Math.floor(ttlMs / 5))

// What the fork is asked: the shortest answer, as only its prefix matters.
export const WARM_PROMPT = 'Cache keep-alive. Reply with just: OK'

// A fork that read less than this from the cache found it already gone.
export const COLD_READ = 1024

export type WarmStep = { kind: 'wait' } | { kind: 'warm' }

// What the warming loop does now: waits while a turn runs or the cache is not
// yet due, and warms once it is within its lead of lapsing.
export function warmStep(now: number, idle: boolean, cacheAt: number, ttlMs: number): WarmStep {
  if (!idle || cacheAt <= 0) return { kind: 'wait' }
  return now >= cacheAt + ttlMs - leadMs(ttlMs) ? { kind: 'warm' } : { kind: 'wait' }
}

// How a return (the first request of a main-thread turn, the one that shows
// whether the cache was still there) went: `warm` came back within the TTL,
// `rescued` came back after it with the cache kept by pings, `lapsed` after
// it with pings that did not keep it, `cold` after it with no ping at all.
// Kept means most of the prefix was read: the system prompt and tools are
// cached apart and other sessions keep theirs warm too, so a read above
// COLD_READ alone does not tell.
export type WarmVerdict = 'warm' | 'rescued' | 'lapsed' | 'cold'

export const KEPT_SHARE = 0.75

export const cacheKept = (read: number, prefix: number) => read >= Math.max(COLD_READ, prefix * KEPT_SHARE)

export function returnVerdict(gapMs: number, ttlMs: number, read: number, prefix: number, pings: number): WarmVerdict {
  if (gapMs <= ttlMs) return 'warm'
  if (pings === 0) return 'cold'
  return cacheKept(read, prefix) ? 'rescued' : 'lapsed'
}
