// The Event Message block: what the dashboard saw happen (a subagent started
// or finished, a question asked or answered, the slime down or back up, the
// model or effort switched, a skill sent, the context compacted), newest first.

export type SlimeEvent = { at: number; text: string }

// How many the session keeps; the block shows the newest three.
export const KEEP_EVENTS = 20
export const SHOWN_EVENTS = 3

export const addEvent = (list: readonly SlimeEvent[], event: SlimeEvent): SlimeEvent[] =>
  [event, ...list].slice(0, KEEP_EVENTS)

// The UTC offset in minutes at the end of `+0800` (what `date +%z` prints),
// so stamps read in this computer's own time whatever zone the plugin runs in.
export function offsetOf(time: string): number | undefined {
  const m = time.trim().match(/([+-])(\d{2})(\d{2})$/)
  if (!m) return undefined
  const minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === '-' ? -minutes : minutes
}

// YYYYMMDD-hhmm: at `offset` minutes from UTC when known, else the
// environment's own zone.
export function stamp(at: number, offset?: number): string {
  const d = new Date(offset === undefined ? at : at + offset * 60_000)
  const utc = offset !== undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = utc ? d.getUTCFullYear() : d.getFullYear()
  const month = (utc ? d.getUTCMonth() : d.getMonth()) + 1
  const day = utc ? d.getUTCDate() : d.getDate()
  const hour = utc ? d.getUTCHours() : d.getHours()
  const minute = utc ? d.getUTCMinutes() : d.getMinutes()
  return `${year}${pad(month)}${pad(day)}-${pad(hour)}${pad(minute)}`
}
