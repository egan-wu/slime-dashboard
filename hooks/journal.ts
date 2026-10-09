// The Journal: thirty days of how the sessions went, one small record a day,
// kept in the store and shared by every window and project.
//
// Warming is weighed in tokens at the plain input price: a cache read costs
// 0.1 of it and writing the cache afresh `w` (1.25 for a five-minute cache,
// 2 for an hour's). A rescue, coming back after the cache would have lapsed
// and finding it kept warm, saves its prefix P at w - 0.1; each ping costs
// what it read at 0.1.

export type Day = {
  day: string // YYYY-MM-DD, this computer's date
  turns: number
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  cold: number // came back to a cache that had lapsed
  coldTokens: number // and wrote this much afresh
  pings: number
  pingRead: number
  rescues: number
  rescued: number
  saved: number // what warming saved, net of its pings, in input tokens
}

export const DAYS = 30
export const READ_COST = 0.1
export const rewriteCost = (ttl: '5m' | '1h') => (ttl === '1h' ? 2 : 1.25)

const blank = (day: string): Day => ({
  day, turns: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0,
  cold: 0, coldTokens: 0, pings: 0, pingRead: 0, rescues: 0, rescued: 0, saved: 0,
})

export function dayKey(at: number, offset: number): string {
  const d = new Date(at + offset)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// The days before `today`, oldest first: the thirty that end with it.
export function lastDays(today: string, n = DAYS): string[] {
  const t = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => new Date(t - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

// What the store kept, cleaned up: one record a day, newest last.
export function journalFrom(kept: unknown): Day[] {
  if (!Array.isArray(kept)) return []
  const days = new Map<string, Day>()
  for (const d of kept) {
    if (!d || typeof d !== 'object' || typeof (d as Day).day !== 'string' || !/^\d{4}-\d\d-\d\d$/.test((d as Day).day)) continue
    const r = d as Record<string, unknown>
    const day = blank(r.day as string)
    for (const k of Object.keys(day) as (keyof Day)[]) if (k !== 'day') (day[k] as number) = num(r[k])
    days.set(day.day, day)
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day))
}

// `delta` added to `day`'s record; days older than thirty before it dropped.
export function addToDay(list: readonly Day[], day: string, delta: Partial<Omit<Day, 'day'>>): Day[] {
  const keep = new Set(lastDays(day))
  const today = { ...(list.find(d => d.day === day) ?? blank(day)) }
  for (const [k, v] of Object.entries(delta)) (today as Record<string, unknown>)[k] = num((today as Record<string, unknown>)[k]) + num(v)
  return [...list.filter(d => d.day !== day && keep.has(d.day)), today].sort((a, b) => a.day.localeCompare(b.day))
}

export type Summary = {
  active: number
  turns: number
  tokens: number
  hitRate: number | undefined
  cold: number
  coldTokens: number
  pings: number
  rescues: number
  saved: number
  spark: string // a day a character, oldest first: its cache hit rate, '·' for no data
}

const BARS = '▁▂▃▄▅▆▇█'

export function summaryOf(list: readonly Day[], today: string): Summary {
  const days = lastDays(today)
  const by = new Map(list.map(d => [d.day, d]))
  const shown = days.map(d => by.get(d)).filter((d): d is Day => d !== undefined)
  const sum = (k: keyof Omit<Day, 'day'>) => shown.reduce((n, d) => n + d[k], 0)
  const allIn = sum('input') + sum('cacheWrite') + sum('cacheRead')
  const rate = (d: Day | undefined) => {
    const all = d ? d.input + d.cacheWrite + d.cacheRead : 0
    return d && all > 0 ? d.cacheRead / all : undefined
  }
  return {
    active: shown.filter(d => d.turns > 0 || d.pings > 0).length,
    turns: sum('turns'),
    tokens: allIn + sum('output'),
    hitRate: allIn > 0 ? (sum('cacheRead') / allIn) * 100 : undefined,
    cold: sum('cold'),
    coldTokens: sum('coldTokens'),
    pings: sum('pings'),
    rescues: sum('rescues'),
    saved: sum('saved'),
    spark: days.map(d => {
      const r = rate(by.get(d))
      return r === undefined ? '·' : BARS[Math.min(BARS.length - 1, Math.floor(r * BARS.length))]!
    }).join(''),
  }
}

// Whether one more ping still pays: a streak of pings since the person last
// sent anything has cost `spent` read tokens; it pays while all it would
// have cost, this ping included, stays under what a rescue of `prefix`
// would save. `shared` is what a cold return still reads (the system prompt
// and tools, kept warm apart), which a rescue does not save: with little
// beyond it, not even the first ping pays. With an hour's cache and nothing
// shared that is about nineteen pings, with five minutes about eleven.
export const pingPays = (spent: number, prefix: number, ttl: '5m' | '1h', shared = 0) =>
  (spent + prefix) * READ_COST <= Math.max(0, prefix - shared) * (rewriteCost(ttl) - READ_COST)
