// Dungeon: what each Party Combo sent has done. A mission is one press of
// a combo: its waves and steps as they stood then, and for each step the
// subagent that took it, known by the tag its Agent call's description starts
// with (combos.ts' stepTag). A subagent of the combo's turn whose tag names no
// step (the leader left it out, or added a task of its own) is kept apart.
// Kept in this session's memory only.

import type { Combo, ComboModel } from './combos'

export type RunStatus = 'running' | 'completed' | 'failed' | 'stopped'

// One subagent: what it was asked, and how far it has got.
export type SquadRun = {
  id: string
  description: string
  model?: string
  status: RunStatus
  // Its model requests so far, and the tool it called last.
  steps: number
  tool?: string
  // Its final answer, once it gave one.
  result?: string
  startedAt: number
  endedAt?: number
}

export type SquadStep = { skill: string; model: ComboModel; agent: string; run?: SquadRun }
// `n` is the wave's number in the combo, as its steps' tags count it.
export type SquadWave = { n: number; condition?: string; steps: SquadStep[] }

export type Mission = {
  id: number
  combo: string
  sentAt: number
  // When the leader's turn took up the combo, and when that turn ended (and how).
  begunAt?: number
  endedAt?: number
  outcome?: 'done' | 'stopped' | 'error'
  waves: SquadWave[]
  others: SquadRun[]
}

// A press of `combo`: its waves with a step in them, none of them run yet.
export function newMission(id: number, combo: Combo, at: number): Mission {
  const waves = combo.layers.flatMap((layer, i): SquadWave[] =>
    layer.steps.length === 0
      ? []
      : [{ n: i + 1, ...(layer.condition?.trim() ? { condition: layer.condition.trim() } : {}), steps: layer.steps.map(s => ({ ...s })) }],
  )
  return { id, combo: combo.name, sentAt: at, waves, others: [] }
}

export type Tag = { combo: string; mission?: number; wave: number; step: number }

// `[Run-Test #3 2.1] run the tests` to the combo, mission, wave and step it
// names (`[Run-Test 2.1]`, a tag without the mission, as well).
export function tagOf(description: string): Tag | undefined {
  const m = description.match(/^\s*\[(.+?)(?: #(\d+))? (\d+)\.(\d+)\]/)
  return m ? { combo: m[1]!, ...(m[2] ? { mission: Number(m[2]) } : {}), wave: Number(m[3]), step: Number(m[4]) } : undefined
}

// The prompt a combo sends starts with its name and its mission's number
// (combos.ts' comboPrompt). Prompts sent while the leader was busy reach it as
// one, each on a line of its own: every one named so.
export function combosOf(prompt: string): { combo: string; mission?: number }[] {
  return [...prompt.matchAll(/^Run the Party Combo "(.+?)"(?: \(mission #(\d+)\))?\./gm)].map(m => ({
    combo: m[1]!,
    ...(m[2] ? { mission: Number(m[2]) } : {}),
  }))
}

// The number the next press's mission takes: past every one so far, and past
// `last`, the last one handed out (a mission taken off keeps its number used).
export const nextMissionId = (missions: readonly Mission[], last: number): number =>
  Math.max(last, ...missions.map(m => m.id)) + 1

const isLive = (m: Mission) => m.begunAt !== undefined && m.endedAt === undefined

// The leader's turn took up `combo`: the mission its prompt numbers, else its
// oldest mission not yet begun, begins.
export function beginMission(missions: readonly Mission[], combo: string, at: number, mission?: number): Mission[] {
  const i = missions.findIndex(m => m.combo === combo && m.begunAt === undefined && (mission === undefined || m.id === mission))
  return i < 0 ? [...missions] : missions.map((m, k) => (k === i ? { ...m, begunAt: at } : m))
}

// The leader's turn ended: its missions end with it, but for one with a
// subagent still running. A step run in the background lets the leader's turn
// end at once, and the leader takes the mission up again when it reports.
export function endMissions(missions: readonly Mission[], outcome: Mission['outcome'], at: number): Mission[] {
  return missions.map(m => (isLive(m) && !runsOf([m]).some(r => r.status === 'running') ? { ...m, endedAt: at, outcome } : m))
}

// Whether any mission is still going: Dungeon's clock then keeps ticking.
export const anyLive = (missions: readonly Mission[]): boolean => missions.some(isLive)

// A step's run to its mission: to the step if still free, else among its
// others. The mission goes on (begun, or taken up again) while it runs.
function attachTo(missions: readonly Mission[], i: number, tag: Tag, run: SquadRun): Mission[] {
  return missions.map((m, k) => {
    if (k !== i) return m
    const { endedAt: _, outcome: __, ...rest } = m
    const going = { ...rest, begunAt: m.begunAt ?? run.startedAt }
    const wave = m.waves.find(w => w.n === tag.wave)
    const step = wave?.steps[tag.step - 1]
    if (!wave || !step || step.run) return { ...going, others: [...m.others, run] }
    return { ...going, waves: m.waves.map(w => (w !== wave ? w : { ...w, steps: w.steps.map(s => (s !== step ? s : { ...s, run })) })) }
  })
}

// A subagent started. A tag with a mission's number goes to that mission, and
// only there. One without: to the step it names in the newest live mission of
// that combo whose step is still free (a press never seen taken up begins
// first); else, while a mission is live, among the newest one's others.
// Undefined when it is no mission's: not the squad's.
export function attachRun(missions: readonly Mission[], run: SquadRun): Mission[] | undefined {
  const tag = tagOf(run.description)
  if (tag?.mission !== undefined) {
    const i = missions.findIndex(m => m.id === tag.mission && m.combo === tag.combo)
    if (i >= 0) return attachTo(missions, i, tag, run)
  }
  if (tag && !missions.some(m => isLive(m) && m.combo === tag.combo) && missions.some(m => m.combo === tag.combo && m.begunAt === undefined))
    missions = beginMission(missions, tag.combo, run.startedAt)
  for (let i = missions.length - 1; tag && i >= 0; i--) {
    const m = missions[i]!
    if (!isLive(m) || m.combo !== tag.combo) continue
    const wave = m.waves.find(w => w.n === tag.wave)
    const step = wave?.steps[tag.step - 1]
    if (!wave || !step || step.run) continue
    return missions.map((x, k) =>
      k !== i ? x : { ...x, waves: x.waves.map(w => (w !== wave ? w : { ...w, steps: w.steps.map(s => (s !== step ? s : { ...s, run })) })) },
    )
  }
  for (let i = missions.length - 1; i >= 0; i--) {
    if (isLive(missions[i]!)) return missions.map((x, k) => (k === i ? { ...x, others: [...x.others, run] } : x))
  }
  return undefined
}

// The run under `id` changed; undefined when no mission holds it.
export function updateRun(missions: readonly Mission[], id: string, fn: (r: SquadRun) => SquadRun): Mission[] | undefined {
  let found = false
  const edit = (r: SquadRun) => {
    if (r.id !== id) return r
    found = true
    return fn(r)
  }
  const next = missions.map(m => ({
    ...m,
    waves: m.waves.map(w => ({ ...w, steps: w.steps.map(s => (s.run ? { ...s, run: edit(s.run) } : s)) })),
    others: m.others.map(edit),
  }))
  return found ? next : undefined
}

// Every run in the missions, steps and others alike.
export const runsOf = (missions: readonly Mission[]): SquadRun[] =>
  missions.flatMap(m => [...m.waves.flatMap(w => w.steps.flatMap(s => (s.run ? [s.run] : []))), ...m.others])

// What the engine's agent list says of a run: undefined while it still runs.
export function statusOfAgent(status: string): RunStatus | undefined {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'killed') return 'stopped'
  return undefined
}

// `1m 05s`, `42s`, `1h 03m`.
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// A run's answer in a few lines: blank lines and markdown marks gone.
export function resultLines(text: string, lines: number): string[] {
  const kept = text
    .split('\n')
    .map(l => l.replace(/^\s*(#+|[-*>]|\d+\.)\s+/, '').replace(/[*`_]{1,3}/g, '').trim())
    .filter(l => l !== '')
  return kept.length > lines ? [...kept.slice(0, lines - 1), `${kept[lines - 1]} …`] : kept
}

// When a mission was sent, as this computer's clock read it: `2026-10-09 14:54`
// (`offset` minutes from UTC).
export function dateTimeText(at: number, offset: number): string {
  const d = new Date(at + offset * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
