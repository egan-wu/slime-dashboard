// The sky over the slime: day or night and what is falling, read from
// wttr.in (which places the machine by its IP address).

export type Sky = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow'
// `rise`, `set` and `at` (minutes past midnight, the place's time) and
// `readAt` (this machine's clock) let day turn to night between reads.
export type Weather = { day: boolean; sky: Sky; rise?: number; set?: number; at?: number; readAt?: number }

// One line: weather symbol | sunrise | sunset | local time, all in the
// place's own time, e.g. "m|05:50:42|17:38:27|19:58:04+0800".
export const WEATHER_URL = 'https://wttr.in/?format=%x|%S|%s|%T'
export const DEFAULT_WEATHER: Weather = { day: true, sky: 'partly' }

// wttr.in's plain-text symbols: o sunny, m partly cloudy, mm / mmm cloudy,
// = fog, / // /// rain, . showers, x sleet, ! thunder, * snow.
export function skyOf(symbol: string): Sky {
  if (symbol.includes('*')) return 'snow'
  if (/[/.x!]/.test(symbol)) return 'rain'
  if (symbol === 'o') return 'clear'
  if (symbol === 'mm' || symbol === 'mmm' || symbol === '=') return 'cloudy'
  return 'partly'
}

// "19:58:04+0800" or "05:50:42" to minutes past midnight.
function minutes(text: string): number | undefined {
  const m = text.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

// Undefined when the reply is not one we can read; the caller keeps the sky it has.
export function parseWeather(text: string): Weather | undefined {
  const parts = text.trim().split('|')
  if (parts.length !== 4) return undefined
  const [symbol, sunrise, sunset, now] = parts.map(p => p.trim()) as [string, string, string, string]
  if (!symbol || symbol.length > 4) return undefined
  const rise = minutes(sunrise)
  const set = minutes(sunset)
  const at = minutes(now)
  if (rise === undefined || set === undefined || at === undefined) return { day: true, sky: skyOf(symbol) }
  return { day: at >= rise && at < set, sky: skyOf(symbol), rise, set, at }
}

// The sky read at `readAt`, with day or night moved on to `now`: the place's
// clock then, plus the minutes gone by since.
export function weatherNow(w: Weather, now: number): Weather {
  if (w.rise === undefined || w.set === undefined || w.at === undefined || w.readAt === undefined) return w
  const minute = (((w.at + Math.floor((now - w.readAt) / 60_000)) % 1440) + 1440) % 1440
  const day = minute >= w.rise && minute < w.set
  return day === w.day ? w : { ...w, day }
}

// Without wttr.in (Setting's default, so no address leaves the machine): day
// from this computer's clock, 06:00 to 18:00, and each hour a sky drawn at
// random, fair weather most often, the extremes now and then but never ruled out.
export const LOCAL_RISE = 6 * 60
export const LOCAL_SET = 18 * 60
export const SKY_ODDS: readonly (readonly [Sky, number])[] = [
  ['clear', 40],
  ['partly', 28],
  ['cloudy', 18],
  ['rain', 10],
  ['snow', 4],
]

// A number in [0, 1) for the hour, the same each time it is asked: every
// window, and every reload in that hour, draws the same sky.
function roll(hour: number): number {
  let h = Math.imul(hour ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 2 ** 32
}

// The sky for one hour (hours since the epoch, in this computer's own time).
export function skyForHour(hour: number): Sky {
  const total = SKY_ODDS.reduce((n, [, w]) => n + w, 0)
  let left = roll(hour) * total
  for (const [sky, w] of SKY_ODDS) {
    if (left < w) return sky
    left -= w
  }
  return 'clear'
}

// The sky at `now`, `offset` minutes from UTC (this computer's zone).
export function localWeather(now: number, offset: number): Weather {
  const local = now + offset * 60_000
  const minute = ((Math.floor(local / 60_000) % 1440) + 1440) % 1440
  return { day: minute >= LOCAL_RISE && minute < LOCAL_SET, sky: skyForHour(Math.floor(local / 3_600_000)) }
}
