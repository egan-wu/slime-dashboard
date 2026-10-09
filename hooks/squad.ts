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
  // The tokens its model requests have taken in and given out so far; and as
  // its turns' ends reported them, where its requests carried none.
  tokens?: number
  turnTokens?: number
  // Its final answer, once it gave one.
  result?: string
  startedAt: number
  endedAt?: number
  // It sent work to the background this turn (a shell, a monitor): its turn's
  // end then leaves it `awaiting` that work, still running, not done.
  background?: boolean
  awaiting?: boolean
  // A question it put to the person (the ask_person tool), until answered.
  asking?: Ask
}

export type Ask = { question: string; options?: string[] }

// `helpers`: the subagents the step's own sent out (its skill dispatching
// them), or that took its tag again: the same step's work.
export type SquadStep = { skill: string; model: ComboModel; agent: string; run?: SquadRun; helpers?: SquadRun[] }
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
  // Called back whole by the person (Dungeon's [Recall]).
  recalled?: boolean
  // The Skill Box's prompt it was sent with, for a run again.
  input?: string
  waves: SquadWave[]
  others: SquadRun[]
  // The subagent leading it, when one does (else the person's own model did).
  leader?: SquadRun
}

// A press of `combo` (with `input`): its waves with a step in them, none of
// them run yet.
export function newMission(id: number, combo: Combo, at: number, input?: string): Mission {
  const waves = combo.layers.flatMap((layer, i): SquadWave[] =>
    layer.steps.length === 0
      ? []
      : [{ n: i + 1, ...(layer.condition?.trim() ? { condition: layer.condition.trim() } : {}), steps: layer.steps.map(s => ({ ...s })) }],
  )
  return { id, combo: combo.name, sentAt: at, waves, others: [], ...(input?.trim() ? { input } : {}) }
}

// The combo a mission was a press of, as it stood then: its waves at their
// numbers (the empty ones between them empty again), for a run again.
export function missionCombo(m: Mission): Combo {
  const last = Math.max(0, ...m.waves.map(w => w.n))
  const layers = Array.from({ length: last }, (_, i) => {
    const w = m.waves.find(x => x.n === i + 1)
    return w ? { steps: w.steps.map(({ skill, model, agent }) => ({ skill, model, agent })), ...(w.condition ? { condition: w.condition } : {}) } : { steps: [] }
  })
  return { name: m.combo, layers }
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

// `[Run-Test #3] lead` to the combo and mission it leads (combos.ts' leaderTag).
export function leaderOf(description: string): { combo: string; mission: number } | undefined {
  const m = description.match(/^\s*\[(.+?) #(\d+)\] lead\b/)
  return m ? { combo: m[1]!, mission: Number(m[2]) } : undefined
}

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
// A mission with a leader of its own is not the person's turn's: it ends with
// its leader (endLed).
export function endMissions(missions: readonly Mission[], outcome: Mission['outcome'], at: number): Mission[] {
  return missions.map(m => (isLive(m) && !m.leader && !runsOf([m]).some(r => r.status === 'running') ? { ...m, endedAt: at, outcome } : m))
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
    if (!wave || !step) return { ...going, others: [...m.others, run] }
    const took = (s: SquadStep): SquadStep => (s.run ? { ...s, helpers: [...(s.helpers ?? []), run] } : { ...s, run })
    return { ...going, waves: m.waves.map(w => (w !== wave ? w : { ...w, steps: w.steps.map(s => (s !== step ? s : took(s))) })) }
  })
}

// A subagent started. A leader's goes to the mission it leads, which begins.
// One a step's subagent (or its helper) spawned (`parent`) is that step's
// helper. A tag with a mission's number goes to that mission, and only there
// (a step already taken: its helper). A subagent one of a mission's own
// spawned otherwise is among its others.
// Else, a tag without a number: to the step it names in the newest live
// mission of that combo whose step is still free (a press never seen taken up
// begins first); else, while a mission is live, among the newest one's others.
// Undefined when it is no mission's: not the squad's.
export function attachRun(missions: readonly Mission[], run: SquadRun, parent?: string): Mission[] | undefined {
  const leads = leaderOf(run.description)
  if (leads) {
    const i = missions.findIndex(m => m.id === leads.mission && m.combo === leads.combo)
    if (i >= 0) {
      return missions.map((m, k) => {
        if (k !== i) return m
        const { endedAt: _, outcome: __, ...rest } = m
        return { ...rest, begunAt: m.begunAt ?? run.startedAt, leader: run }
      })
    }
  }
  if (parent !== undefined) {
    for (let i = 0; i < missions.length; i++) {
      const m = missions[i]!
      const step = m.waves.flatMap(w => w.steps).find(s => [...(s.run ? [s.run] : []), ...(s.helpers ?? [])].some(r => r.id === parent))
      if (!step) continue
      const { endedAt: _, outcome: __, ...rest } = m
      return missions.map((x, k) =>
        k !== i ? x : { ...rest, waves: m.waves.map(w => ({ ...w, steps: w.steps.map(s => (s !== step ? s : { ...s, helpers: [...(s.helpers ?? []), run] })) })) },
      )
    }
  }
  const tag = tagOf(run.description)
  if (tag?.mission !== undefined) {
    const i = missions.findIndex(m => m.id === tag.mission && m.combo === tag.combo)
    if (i >= 0) return attachTo(missions, i, tag, run)
  }
  if (parent !== undefined) {
    const i = missions.findIndex(m => runsOf([m]).some(r => r.id === parent))
    if (i >= 0) {
      return missions.map((m, k) => {
        if (k !== i) return m
        const { endedAt: _, outcome: __, ...rest } = m
        return { ...rest, others: [...m.others, run] }
      })
    }
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
  const next = missions.map(m => mapRuns(m, edit))
  return found ? next : undefined
}

// Every run in the missions: leaders, steps, their helpers and others alike.
export const runsOf = (missions: readonly Mission[]): SquadRun[] =>
  missions.flatMap(m => [...(m.leader ? [m.leader] : []), ...m.waves.flatMap(w => w.steps.flatMap(stepRuns)), ...m.others])

// A step's runs: its own subagent's, then its helpers'.
export const stepRuns = (s: SquadStep): SquadRun[] => [...(s.run ? [s.run] : []), ...(s.helpers ?? [])]

// How a step stands: running while its subagent or any helper it sent out
// still runs (or awaits its background work); else as its own subagent ended.
// Undefined until a subagent took it.
export function stepStatus(s: SquadStep): RunStatus | undefined {
  if (!s.run) return undefined
  return stepRuns(s).some(r => r.status === 'running') ? 'running' : s.run.status
}

// The run of a step (or any run) that waits on the person's answer.
export const askingRun = (runs: readonly SquadRun[]): SquadRun | undefined => runs.find(r => r.asking !== undefined && r.status === 'running')

export type MissionState = 'queued' | 'running' | 'asking' | 'done' | 'stopped' | 'recalled' | 'error'

// How a mission stands, as its folded card says it.
export function missionState(m: Mission): MissionState {
  if (m.endedAt !== undefined) return m.recalled ? 'recalled' : (m.outcome ?? 'done')
  if (askingRun(runsOf([m]))) return 'asking'
  return m.begunAt === undefined ? 'queued' : 'running'
}

// The missions cleared (ended done) this session, by number: `cleared` with
// any newly done added; undefined when none is new.
export function clearedOf(missions: readonly Mission[], cleared: readonly number[]): number[] | undefined {
  const fresh = missions.filter(m => m.endedAt !== undefined && m.outcome === 'done' && !cleared.includes(m.id)).map(m => m.id)
  return fresh.length > 0 ? [...cleared, ...fresh] : undefined
}

// The agents a mission's subagents spawned that Dungeon has not seen start
// (`agents` as the engine lists them), and the model each runs on as far as
// its step says, else `fallback`.
export function agentsToFollow(missions: readonly Mission[], agents: readonly { id: string; description: string; parentId?: string }[], fallback: string) {
  const known = new Set(runsOf(missions).map(r => r.id))
  return agents.flatMap(a => {
    if (known.has(a.id) || a.parentId === undefined || !known.has(a.parentId)) return []
    const tag = tagOf(a.description)
    const m = missions.find(x => runsOf([x]).some(r => r.id === a.parentId))
    const step = tag && m?.combo === tag.combo ? m.waves.find(w => w.n === tag.wave)?.steps[tag.step - 1] : undefined
    const parent = step ? undefined : runsOf(missions).find(r => r.id === a.parentId)
    return [{ id: a.id, description: a.description, parentId: a.parentId, model: step?.model ?? (parent && !leaderOf(parent.description) ? parent.model : undefined) ?? fallback }]
  })
}

// How long a mission whose leader ended its turn stays quiet (nothing running)
// before it counts as done: a leader waiting on its steps' reports ends its
// turn between waves, and is woken to send the next.
export const SETTLE_MS = 10_000

// When the last run of a mission ended.
const lastEnd = (m: Mission) => Math.max(0, ...runsOf([m]).map(r => r.endedAt ?? 0))

// Whether a mission that finished done has been quiet long enough to be done:
// a stop or a failure is not waited on.
const calm = (m: Mission, outcome: Mission['outcome'], at: number) => outcome !== 'done' || at - lastEnd(m) >= SETTLE_MS

// When a mission that ended is said to have: a done one, when its last run
// ended (the quiet it waited out is no work); else now.
const endOf = (m: Mission, outcome: Mission['outcome'], at: number) => (outcome === 'done' && lastEnd(m) > 0 ? lastEnd(m) : at)

// The subagent under `id` ended its turn: a mission it led ends with it, but
// not while a subagent of the mission still runs (`busy`: one the engine
// lists that Dungeon may not have seen yet), nor, if done, before it has been
// quiet for SETTLE_MS (settleLed ends it then). A leader whose steps run in
// the background ends its turn as it sends them, and is woken by their reports.
export function endLed(missions: readonly Mission[], id: string, outcome: Mission['outcome'], at: number, busy = false): Mission[] | undefined {
  const m = missions.find(x => x.leader?.id === id)
  if (!m || m.endedAt !== undefined || busy || runsOf([m]).some(r => r.id !== id && r.status === 'running' && !r.awaiting) || !calm(m, outcome, at)) return undefined
  const end = endOf(m, outcome, at)
  return missions.map(x => (x === m ? settled({ ...x, endedAt: end, outcome }, end) : x))
}

// Missions whose leader has ended its turn and that nothing else of runs any
// more end now, as their leader did, once quiet for SETTLE_MS: what kept one
// going (a step, a step's own helper) ended after the leader's last turn.
export function settleLed(missions: readonly Mission[], at: number): Mission[] | undefined {
  const outcome = (r: SquadRun): Mission['outcome'] => (r.status === 'completed' ? 'done' : r.status === 'stopped' ? 'stopped' : 'error')
  const due = (m: Mission) =>
    m.leader !== undefined &&
    m.endedAt === undefined &&
    m.leader.status !== 'running' &&
    !runsOf([m]).some(r => r.status === 'running' && !r.awaiting) &&
    calm(m, outcome(m.leader), at)
  if (!missions.some(due)) return undefined
  return missions.map(m => {
    if (!due(m)) return m
    const how = outcome(m.leader!)
    const end = endOf(m, how, at)
    return settled({ ...m, endedAt: end, outcome: how }, end)
  })
}

// A mission that ended: a run still awaiting its background work is done
// with it (its leader had its report and went on).
const settled = (m: Mission, at: number): Mission =>
  mapRuns(m, r => (r.awaiting && r.status === 'running' ? { ...r, status: 'completed', awaiting: false, endedAt: r.endedAt ?? at } : r))

// Each run of a mission (its leader's, its steps', their helpers', its
// others') through `fn`.
export function mapRuns(m: Mission, fn: (r: SquadRun) => SquadRun): Mission {
  return {
    ...m,
    waves: m.waves.map(w => ({ ...w, steps: w.steps.map(s => ({ ...s, ...(s.run ? { run: fn(s.run) } : {}), ...(s.helpers ? { helpers: s.helpers.map(fn) } : {}) })) })),
    others: m.others.map(fn),
    ...(m.leader ? { leader: fn(m.leader) } : {}),
  }
}

// The subagent under `id` is at work again (a leader woken by its steps'
// reports): running once more, and its mission with it.
export function reviveRun(missions: readonly Mission[], id: string): Mission[] | undefined {
  const i = missions.findIndex(m => runsOf([m]).some(r => r.id === id))
  if (i < 0) return undefined
  const m = missions[i]!
  const r = runsOf([m]).find(x => x.id === id)
  if (m.endedAt === undefined && r?.status === 'running' && !r.awaiting) return undefined
  const { endedAt: _, outcome: __, ...rest } = m
  const back = (r: SquadRun): SquadRun => {
    if (r.id !== id) return r
    const { endedAt: _e, awaiting: _a, ...live } = r
    return { ...live, status: 'running' }
  }
  return missions.map((x, k) => (k !== i ? x : mapRuns(rest as Mission, back)))
}

// Whether Dungeon should still look for subagents in the engine's list: a
// mission with a leader is going, or ended within `within` ms (its leader may
// yet be woken).
export const watching = (missions: readonly Mission[], now: number, within: number): boolean =>
  missions.some(m => m.leader !== undefined && (m.endedAt === undefined || now - m.endedAt < within))

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

// What a model request's usage counts toward a run's tokens: all it took in,
// cache read and written included, and all it gave out.
export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
export const usageTokens = (u: Usage): number =>
  u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

// Every run's tokens in the missions, summed.
export const tokensOf = (missions: readonly Mission[]): number => runsOf(missions).reduce((n, r) => n + runTokens(r), 0)

// A run's tokens: its requests', else its turns'.
export const runTokens = (r: SquadRun): number => r.tokens || r.turnTokens || 0

// `812 tok`, `9.4k tok`, `31k tok`, `1.2M tok`.
export function tokensText(n: number): string {
  if (n < 1000) return `${n} tok`
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k tok`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k tok`
  return `${(n / 1_000_000).toFixed(1)}M tok`
}

// A mission's tokens beside its coin: `812`, `9.4K`, `124K`, `1.2M`.
export function coinText(n: number): string {
  if (n < 1000) return `${n}`
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
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
