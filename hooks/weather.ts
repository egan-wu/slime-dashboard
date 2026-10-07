// The sky over the slime: day or night and what is falling, read from
// wttr.in (which places the machine by its IP address).

export type Sky = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow'
export type Weather = { day: boolean; sky: Sky }

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
  const day = rise === undefined || set === undefined || at === undefined ? true : at >= rise && at < set
  return { day, sky: skyOf(symbol) }
}
