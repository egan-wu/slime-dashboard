// The slime's vitals, read from the session's usage figures.
//
// On a Pro or Max subscription HP is what is left of the seven-day limit and
// MP what is left of the five-hour one. Anywhere else (an API key, an
// enterprise seat) there is no such window to read, and HP stays full. CP is
// how full the context window is, its capacity.

export type Plan = 'subscription' | 'api'
export type Vitals = {
  plan: Plan
  // Whole percentages left, 0 to 100.
  hp: number
  mp: number
  // The context window's fill as a whole percentage; -1 before the first reading.
  cp: number
}

export const FULL: Vitals = { plan: 'api', hp: 100, mp: 100, cp: -1 }

type Window = { kind: string; percentUsed: number }

const left = (used: number | undefined) =>
  used === undefined ? 100 : Math.max(0, Math.min(100, Math.round(100 - used)))

// A subscription reports its five-hour and seven-day windows; an API key or
// an enterprise seat reports neither.
export function vitalsOf(rateLimits: readonly Window[], contextPercent: number | undefined): Vitals {
  const used = (kind: string) => rateLimits.find(w => w.kind === kind)?.percentUsed
  const isSubscription = used('five_hour') !== undefined || used('seven_day') !== undefined
  const cp = contextPercent === undefined ? -1 : Math.max(0, Math.min(100, Math.round(contextPercent)))
  return isSubscription
    ? { plan: 'subscription', hp: left(used('seven_day')), mp: left(used('five_hour')), cp }
    : { plan: 'api', hp: 100, mp: 100, cp }
}

// Out of HP, or on a subscription out of MP: the slime is down until a limit resets.
export const isDown = (v: Vitals) => v.hp <= 0 || (v.plan === 'subscription' && v.mp <= 0)

export type Eyes = 'x' | '><' | 'TT'
export type Face = { eyes?: Eyes; vein?: boolean; down?: boolean }

// Down: it stops with crossed-out eyes. Walking with a full head: squinting
// from 50%, a vein beside its head from 70%, in tears from 90%.
export function faceOf(v: Vitals, walking: boolean): Face {
  if (isDown(v)) return { eyes: 'x', down: true }
  if (!walking || v.cp < 50) return {}
  return { eyes: v.cp >= 90 ? 'TT' : '><', vein: v.cp >= 70 }
}

// How many of `cells` a bar fills for a percentage.
export const filledOf = (percent: number, cells: number) =>
  percent < 0 ? 0 : Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))
