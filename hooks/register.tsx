import { atom, read, update } from 'claude-code'
import type { AgentStatus, EngineInterface, Register } from 'claude-code'

import { EMERGE_TICKS, frame, hex, homeCx, modelInfo, partyLength, partyScrolling, ROWS, slotOf, step } from './scene'
import type { Offsets } from './scene'
import { addUsage, cacheHitRate, compact, NO_TALLY, secondsText, totalTokens } from './props'
import type { Tally } from './props'
import { cleanSummary, wrapSummary } from './summary'
import { faceOf, filledOf, FULL, isDown, vitalsOf } from './vitals'
import type { Vitals } from './vitals'
import { DEFAULT_WEATHER, parseWeather, WEATHER_URL } from './weather'
import type { SlimeMinion, SlimeWeather } from '../types'

const PANE = 'slime-subagent-dashboard'
const SCENE = 'scene'
const TICK_MS = 100
// The sky is read every quarter hour, so day turns to night close to sunset;
// a read that fails is tried again two minutes later.
const WEATHER_MS = 15 * 60 * 1000
const WEATHER_RETRY_MS = 2 * 60 * 1000
// Docked beside the fullscreen transcript, the sidebar asks for this width.
const OPEN = { id: PANE, title: 'Slime', columns: 33 }
// The model buttons under the scene: each switches the session with /model
// and the family's alias, which always resolves to that family's newest model.
// A Button's label takes no color of its own, so a square in the model's
// color stands before each.
const PICKS = [
  { label: 'Haiku', id: 'haiku' },
  { label: 'Sonnet', id: 'sonnet' },
  { label: 'Opus', id: 'opus' },
  { label: 'Fable', id: 'fable' },
]

const busyAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'busy' } as const, false)
const modelAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'model' } as const, '')
const minionsAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'minions' } as const, [] as SlimeMinion[])
const weatherAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'weather' } as const, DEFAULT_WEATHER as SlimeWeather)
// HP, MP and CP: what is left of the usage limits, and the context window's fill.
const vitalsAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'vitals' } as const, FULL as Vitals)
// True while the session waits on the person: a permission prompt or a question.
const waitingAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'waiting' } as const, false)
// The Skill Box: the skills registered with /slime-subagent-dashboard add (kept
// in the store across sessions), whether it is open, the prompt typed for
// them, and the first of the five rows shown.
const skillsAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'skills' } as const, [] as string[])
const skillsOpenAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'skillsOpen' } as const, false)
const skillPromptAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'skillPrompt' } as const, '')
const skillTopAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'skillTop' } as const, 0)
// The Property block: open or not, and the session's figures it shows.
const propsOpenAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'propsOpen' } as const, false)
const tallyAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'tally' } as const, NO_TALLY as Tally)
// The model requests of the main loop's current (or last) turn.
const iterationAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'iteration' } as const, 0)
// The main loop's reasoning effort as its last model request was sent ('' before one).
const effortAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'effort' } as const, '')
// Whether the row of effort levels under Property's Effort is open.
const modelOpenAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'modelOpen' } as const, false)
const effortOpenAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'effortOpen' } as const, false)
// The last turn's length, and when the running one started (0: none runs).
const lastTurnMsAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'lastTurnMs' } as const, 0)
const turnStartedAtAtom = atom({ plugin: 'slime-subagent-dashboard', key: 'turnStartedAt' } as const, 0)

const SKILL_ROWS = 5
const SKILLS_KEY = 'skills'
// Tools whose call itself waits on the person.
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])
// Notifications that mean the person is asked: a permission dialog, an MCP elicitation.
const ASKING_NOTICES = new Set(['permission_prompt', 'elicitation_dialog'])

// Animation lives in the module: a reload restarts the walk, the state stays.
let busy = false
let model = ''
let tick = 0
let columns = 0
let minions: SlimeMinion[] = []
let weather: SlimeWeather = DEFAULT_WEATHER
let vitals: Vitals = FULL
let waiting = false
// The tick the troop found its treasure chest on, while that scene plays.
let partyAt: number | undefined
// When each new little slime starts budding off the main one. They come out
// one at a time, EMERGE_GAP ticks apart, however many subagents start at once.
// Module-only: after a reload the troop is simply all out already.
const EMERGE_GAP = 8
const budAt = new Map<string, number>()
let lastBud = -Infinity
// Each little slime's place in line as drawn, easing toward its real place
// when one ahead of it drops out, so the gap closes instead of jumping.
const CLOSE_SPEED = 0.15
const pos = new Map<string, number>()
// When each finished slime dropped out of line, and the x it stood at.
// Long enough to fall back off any pane, then it is gone for good.
const LEAVE_TICKS = 70
const leftAt = new Map<string, { tick: number; x: number }>()
// The last slime home, which stays for the treasure chest and then merges
// into the main slime instead of falling back.
let stayer: string | undefined
const off: Offsets = { cloud: 0, bird: 0, tree: 0, rock: 0, ground: 0 }

async function setBusy($: EngineInterface, value: boolean) {
  busy = value
  await update($, busyAtom, () => value)
}

async function setMinions($: EngineInterface, fn: (list: SlimeMinion[]) => SlimeMinion[]) {
  minions = fn(minions)
  await update($, minionsAtom, () => minions)
}

const followersOf = (list: SlimeMinion[]) =>
  list.map(m => {
    const left = leftAt.get(m.id)
    if (left) return { model: m.model, leave: { age: tick - left.tick, x: left.x } }
    if (m.id === stayer) return { model: m.model, pos: pos.get(m.id), stay: true as const }
    const start = budAt.get(m.id)
    const age = start === undefined ? undefined : tick - start
    return { model: m.model, age: age !== undefined && age < EMERGE_TICKS ? age : undefined, pos: pos.get(m.id) }
  })

// Ease every slime still in line one step toward its place.
function closeRanks() {
  minions
    .filter(m => !m.done || m.id === stayer)
    .forEach((m, i) => {
      const at = pos.get(m.id) ?? i
      pos.set(m.id, Math.abs(i - at) <= CLOSE_SPEED ? i : at + Math.sign(i - at) * CLOSE_SPEED)
    })
}
// The troop keeps travelling while any subagent is still out working.
const moving = (main: boolean, list: SlimeMinion[]) => main || list.some(m => !m.done)
const partyTick = () => (partyAt === undefined ? undefined : tick - partyAt)

// A subagent still owes its answer while it runs, waits on background work of
// its own, or (a teammate) waits for a message. Once it has handed back,
// failed or been stopped, or the engine has dropped it, its slime drops out
// of line and falls behind; the last one stays, the main slime finds a
// treasure chest, and the two open it together before the little one merges
// back into the main slime.
const OUT: ReadonlySet<AgentStatus> = new Set(['pending', 'running', 'waiting', 'idle'])

async function checkMinions($: EngineInterface) {
  if (!minions.some(m => !m.done)) return
  const out = new Set((await $.agent.list()).filter(a => OUT.has(a.status)).map(a => a.id))
  const finished = minions.filter(m => !m.done && !out.has(m.id))
  if (finished.length === 0) return
  const cx = homeCx(columns || OPEN.columns)
  const lastHome = finished.length === minions.filter(m => !m.done).length && partyAt === undefined
  if (lastHome) stayer = finished[finished.length - 1]!.id
  for (const m of finished) {
    if (m.id === stayer) continue
    leftAt.set(m.id, { tick, x: slotOf(cx, pos.get(m.id) ?? minions.filter(o => !o.done).indexOf(m)) })
    pos.delete(m.id)
  }
  await setMinions($, list => list.map(m => (finished.includes(m) ? { ...m, done: true } : m)))
  if (!minions.some(m => !m.done) && partyAt === undefined) partyAt = tick
}

// The chest is behind them and the little one has merged: it is gone.
async function endParty($: EngineInterface) {
  partyAt = undefined
  const merged = stayer
  stayer = undefined
  if (merged === undefined) return
  pos.delete(merged)
  budAt.delete(merged)
  await setMinions($, list => list.filter(m => m.id !== merged))
}

// Forget the slimes that have fallen back out of sight.
async function dropGone($: EngineInterface) {
  const gone = minions.filter(m => {
    const left = leftAt.get(m.id)
    return left !== undefined && tick - left.tick >= LEAVE_TICKS
  })
  if (gone.length === 0) return
  for (const m of gone) {
    leftAt.delete(m.id)
    budAt.delete(m.id)
  }
  await setMinions($, list => list.filter(m => !gone.includes(m)))
}

// Is it day or night where this machine is, and what is the sky doing. A
// failed or unreadable reply keeps the sky as it was and tries again soon.
// Answers what it read, or why it read nothing, for `/slime-subagent-dashboard weather`.
let retryPending = false
async function refreshWeather($: EngineInterface): Promise<string> {
  let why: string
  try {
    // wttr.in answers a browser with a page; asked as curl, with the line alone.
    const reply = await $.http.fetch(WEATHER_URL, { headers: { 'User-Agent': 'curl/8' } })
    const next = reply.ok ? parseWeather(reply.text) : undefined
    if (next) {
      weather = next
      await update($, weatherAtom, () => next)
      return `Weather: ${next.day ? 'day' : 'night'}, ${next.sky} (wttr.in said "${reply.text.trim()}").`
    }
    why = reply.ok ? `an unreadable reply "${reply.text.trim().slice(0, 60)}"` : `HTTP ${reply.status}`
  } catch (error) {
    why = error instanceof Error ? error.message : String(error)
  }
  if (!retryPending) {
    retryPending = true
    $.clock.after(WEATHER_RETRY_MS, () => {
      retryPending = false
      void refreshWeather($)
    })
  }
  return `Weather: could not read wttr.in (${why}); the sky stays as it was and tries again in two minutes.`
}

async function refreshModel($: EngineInterface) {
  const current = await $.session.model()
  if (current === model) return
  model = current
  await update($, modelAtom, () => current)
}

async function setVitals($: EngineInterface, next: Vitals) {
  if (next.plan === vitals.plan && next.hp === vitals.hp && next.mp === vitals.mp && next.cp === vitals.cp) return
  vitals = next
  await update($, vitalsAtom, () => next)
}

// The status line's figures. A failed read keeps the bars as they were.
async function refreshVitals($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  if (usage) await setVitals($, vitalsOf(usage.rateLimits, usage.context.percent))
}

// The bars' colors: HP a bright red, MP a bright blue. CP is drawn in the
// terminal's own text color, since it is a button and a button's label takes
// no color of its own.
const BAR = { hp: '#ff5c5c', mp: '#4db8ff' }
// The word written across the middle of the CP bar: pressing the bar compacts.
const UNLOAD = 'UNLOAD'

async function setWaiting($: EngineInterface, value: boolean) {
  if (value === waiting) return
  waiting = value
  await update($, waitingAtom, () => value)
}

async function setSkills($: EngineInterface, fn: (list: string[]) => string[]) {
  const list = fn(await read($, skillsAtom))
  await update($, skillsAtom, () => list)
  await $.store.set(SKILLS_KEY, list)
  return list
}

// A skill's button: run it as the person would type it, with the Skill Box's
// prompt after it in quotes when one is typed; the field then clears.
async function runSkill($: EngineInterface, name: string) {
  const prompt = (await read($, skillPromptAtom)).trim()
  const args = prompt === '' ? '' : `"${prompt.replace(/"/g, '\\"')}"`
  await update($, skillPromptAtom, () => '')
  await $.command.run({ command: name, args })
}

// `add <skill>`, `remove <skill>`, `list`, or nothing to open the pane.
async function manageSkills($: EngineInterface, args: string): Promise<string | undefined> {
  const [verb, ...rest] = args.trim().split(/\s+/)
  const name = rest.join(' ').replace(/^\//, '')
  if (verb === 'add' && name) {
    const list = await setSkills($, l => (l.includes(name) ? l : [...l, name]))
    return `Skill Box: added /${name} (${list.length} registered).`
  }
  if (verb === 'remove' && name) {
    const list = await setSkills($, l => l.filter(s => s !== name))
    return `Skill Box: removed /${name} (${list.length} registered).`
  }
  if (verb === 'list') {
    const list = await read($, skillsAtom)
    return list.length === 0 ? 'Skill Box: no skills registered.' : `Skill Box: ${list.map(s => `/${s}`).join(' ')}`
  }
  if (verb === 'weather') return refreshWeather($)
  if (verb) return 'Usage: /slime-subagent-dashboard [add <skill> | remove <skill> | list | weather]'
  return undefined
}

// Property's Effort button opens a row of the levels, `[Low][Mid][High][xHigh][Max]`
// (28 columns, one row of the pane); picking one runs /effort with it and closes the row.
const EFFORTS = [
  { level: 'low', name: 'Low', short: 'Low' },
  { level: 'medium', name: 'Medium', short: 'Mid' },
  { level: 'high', name: 'High', short: 'High' },
  { level: 'xhigh', name: 'xHigh', short: 'xHigh' },
  { level: 'max', name: 'Max', short: 'Max' },
]
const effortName = (effort: string) =>
  effort === '' ? '—' : (EFFORTS.find(e => e.level === effort)?.name ?? effort)

async function pickEffort($: EngineInterface, level: string) {
  await update($, effortOpenAtom, () => false)
  await $.command.run({ command: 'effort', args: level })
  await update($, effortAtom, () => level)
}

async function pickModel($: EngineInterface, id: string) {
  await $.command.run({ command: 'model', args: id })
  await refreshModel($)
}

// The hooks that only watch (a spawn, a tool call, /effort, a notification)
// end in `.catch(($, e, next) => next(e))`: should one fail, what it watched
// goes on as if it were not there, and runs once (`next(e)` replays a call
// the hook had already made).

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'slime-subagent-dashboard',
      description: 'Open the slime subagent dashboard pane, or manage its Skill Box',
      argumentHint: '[add <skill> | remove <skill> | list | weather]',
    })
    const kept = await $.store.get(SKILLS_KEY)
    if (Array.isArray(kept)) await update($, skillsAtom, () => kept.filter((s): s is string => typeof s === 'string'))
    waiting = await read($, waitingAtom)
    busy = await read($, busyAtom)
    // Slimes that were dropping out when the module reloaded are simply gone.
    minions = (await read($, minionsAtom)).filter(m => !m.done)
    await update($, minionsAtom, () => minions)
    weather = await read($, weatherAtom)
    vitals = await read($, vitalsAtom)
    await refreshModel($)
    await refreshVitals($)
    void $.ui.open(OPEN)
    void refreshWeather($)
    $.clock.every(WEATHER_MS, () => refreshWeather($))

    $.clock.every(TICK_MS, async () => {
      tick++
      const party = partyTick()
      const inLine = minions.filter(m => !m.done || m.id === stayer).length
      if (party !== undefined && party >= partyLength(columns || OPEN.columns, inLine)) await endParty($)
      const t = partyTick()
      // Down, or waiting on the person, the troop holds still.
      const going = moving(busy, minions) && !isDown(vitals) && !waiting
      step(off, t === undefined ? going : partyScrolling(columns || OPEN.columns, t, inLine))
      closeRanks()
      await dropGone($)
      if (tick % 20 === 0) {
        await refreshModel($)
        await refreshVitals($)
      }
      if (tick % 10 === 5) await checkMinions($)
      if (columns > 0) {
        const walking = moving(busy, minions)
        const face = { ...faceOf(vitals, walking && !waiting), ask: waiting }
        const cells = frame(columns, off, tick, walking, model, followersOf(minions), weather, t, face)
        await $.ui.blit({ requestId: PANE, key: SCENE, cells })
      }
      // The latest-command timer counts while a turn runs.
      if (busy && tick % 5 === 0) $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('command.run', { command: 'slime-subagent-dashboard' }, async ($, e) => {
    const said = await manageSkills($, e.args)
    if (said !== undefined) return { text: said }
    await $.ui.open(OPEN)

    return { text: 'Slime subagent dashboard opened.' }
  })

  // /effort typed at the prompt (or run by the row of levels): the button follows.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const ran = await next(e)
    const level = e.args.trim().toLowerCase()
    if (EFFORTS.some(x => x.level === level)) await update($, effortAtom, () => level).catch(() => {})

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await setBusy($, true)
    await setWaiting($, false)
    await update($, iterationAtom, () => 0)
    const now = await $.clock.now()
    await update($, turnStartedAtAtom, () => now)
    await refreshModel($)

    return next(e)
  })

  // Each subagent that starts gets a little slime, colored by its model.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    // A drawing hiccup must never get in the way of the spawn itself.
    if (id !== undefined) {
      lastBud = Math.max(tick, lastBud + EMERGE_GAP)
      budAt.set(id, lastBud)
      await setMinions($, list => [...list, { id, model: result.model ?? e.parentModel, description: e.description }]).catch(() => {})
    }

    return result
  }).catch(($, e, next) => next(e))

  // Each model request of the main loop's turn is one iteration; a new one
  // also means the person has answered whatever was asked.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await update($, iterationAtom, () => e.index + 1).catch(() => {})
      if (e.effort !== undefined) await update($, effortAtom, () => String(e.effort)).catch(() => {})
      await setWaiting($, false).catch(() => {})
    }

    return yield* next(e)
  })

  // A question put to the person, or a plan to approve: waiting until answered.
  on('tool.call', async ($, e, next) => {
    const asks = ASKING_TOOLS.has(String(e.tool))
    if (asks) await setWaiting($, true).catch(() => {})
    const ran = await next(e)
    // A permission prompt was answered once its call has run (or been refused).
    await setWaiting($, false).catch(() => {})

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (ASKING_NOTICES.has(e.notification_type)) await setWaiting($, true).catch(() => {})

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.usage) await update($, tallyAtom, t => addUsage(t, e.usage!)).catch(() => {})
    if (e.agentId === undefined) {
      await setBusy($, false)
      await setWaiting($, false)
      await update($, lastTurnMsAtom, () => e.durationMs)
      await update($, turnStartedAtAtom, () => 0)
      await refreshVitals($)
    }

    return next(e)
  })

  // The usage figures moved: the bars follow at once.
  on('session.measure', async ($, e, next) => {
    await setVitals($, vitalsOf(e.rateLimits, e.context.percent)).catch(() => {})

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const current = await read($, modelAtom)
    const followers = await read($, minionsAtom)
    const sky = await read($, weatherAtom)
    const isBusy = moving(await read($, busyAtom), followers)
    const v = await read($, vitalsAtom)
    const isWaiting = await read($, waitingAtom)
    const info = modelInfo(current)
    const status = isBusy ? '▸' : 'z'

    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    // Every surface but mobile has a text field.
    const Input = 'Input' in table ? table.Input : undefined
    const picker = (
      <Box flexDirection="row" gap={1}>
        {PICKS.map(pick => (
          <Box key={`pick-${pick.label}`} flexDirection="row">
            <Text>
              <Text color={hex(modelInfo(pick.id).body)}>■</Text>:
            </Text>
            <Button
              key={`model-${pick.label}`}
              label={pick.label}
              plain
              onPress={() => pickModel($, pick.id)}
            />
          </Box>
        ))}
      </Box>
    )
    // The subagents still out working, each its model and the few words its
    // Agent call gave the task, wrapped over up to three lines: the lines
    // after the first hang under the first's text, and the indent and the
    // text together stay a column short of the pane's width.
    const running = followers.filter(m => !m.done)
    const INDENT = '    - '
    const HANG = ' '.repeat(INDENT.length)
    const width = Math.max(4, (columns || OPEN.columns) - INDENT.length - 1)
    const monitor = (
      <Box flexDirection="column">
        <Text dimColor>{'─'.repeat(Math.max(1, (columns || OPEN.columns) - 1))}</Text>
        <Text dimColor>Sub-agent Monitor</Text>
        {running.length === 0 ? (
          <Text dimColor> - none</Text>
        ) : (
          running.map(m => {
            const who = modelInfo(m.model)
            return (
              <Box key={`agent-${m.id}`} flexDirection="column">
                <Text>
                  {' - '}
                  <Text color={hex(who.body)}>{who.name}</Text>
                </Text>
                {wrapSummary(cleanSummary(m.description || 'subagent'), width).map((line, i) => (
                  <Text dimColor wrap="truncate-end">{`${i === 0 ? INDENT : HANG}${line}`}</Text>
                ))}
              </Box>
            )
          })
        )}
      </Box>
    )

    // HP and MP (a subscription) or HP alone (an API key or enterprise seat)
    // on the first row; CP and the button that compacts the context on the second.
    // The percentage always takes four columns (`5%  `, `100%`), so the bars'
    // closing brackets stand in the same columns whatever the numbers.
    const amount = (percent: number) => `] ${(percent < 0 ? '—' : `${percent}%`).padEnd(4)}`
    const bar = (label: string, percent: number, cells: number, color: string) => {
      const filled = filledOf(percent, cells)
      return (
        <Text>
          <Text bold>{label}</Text>
          {' ['}
          <Text color={color}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(cells - filled)}</Text>
          {amount(percent)}
        </Text>
      )
    }
    // CP: the bar is the Unload button. UNLOAD is written across its middle;
    // the filled part is one button drawn bright and the rest another drawn
    // dim, so the word shows how full the window is, and pressing either half
    // runs /compact.
    const unload = () => $.command.run({ command: 'compact' })
    // CP's closing bracket lines up with the one above it: HP's on an API key
    // (both ten cells), MP's on a subscription, past HP's 5-cell bar and
    // percentage (`HP [` 4 + 5 + `] ` 2 + 4, a space, `MP [` 4 + 5, less `CP [`).
    const CP_CELLS = v.plan === 'subscription' ? 4 + 5 + 2 + 4 + 1 + 4 + 5 - 4 : 10
    const cpFilled = filledOf(v.cp, CP_CELLS)
    const from = (CP_CELLS - UNLOAD.length) >> 1
    const cpCells = Array.from({ length: CP_CELLS }, (_, i) =>
      i >= from && i < from + UNLOAD.length ? UNLOAD[i - from]! : i < cpFilled ? '█' : '░',
    )
    const cpRow = (
      <Box flexDirection="row">
        <Text>
          <Text bold>CP</Text>
          {' ['}
        </Text>
        {cpFilled > 0 && <Button key="unload" label={cpCells.slice(0, cpFilled).join('')} plain onPress={unload} />}
        {cpFilled < CP_CELLS && (
          <Button key="unload-rest" label={cpCells.slice(cpFilled).join('')} plain dimColor onPress={unload} />
        )}
        <Text>{amount(v.cp)}</Text>
      </Box>
    )
    const stats = (
      <Box flexDirection="column">
        {v.plan === 'subscription' ? (
          <Box flexDirection="row" gap={1}>
            {bar('HP', v.hp, 5, BAR.hp)}
            {bar('MP', v.mp, 5, BAR.mp)}
          </Box>
        ) : (
          bar('HP', v.hp, 10, BAR.hp)
        )}
        {cpRow}
      </Box>
    )

    const rule = <Text dimColor>{'─'.repeat(Math.max(1, (columns || OPEN.columns) - 1))}</Text>
    // A block's title and the button that opens or closes it.
    const header = (title: string, key: string, isOpen: boolean, toggle: () => unknown) => (
      <Box flexDirection="row">
        <Text dimColor>{`${title} `}</Text>
        <Button key={key} label={isOpen ? '▲' : '▼'} onPress={toggle} />
      </Box>
    )

    // Property: the session's figures, shown once opened.
    const propsOpen = await read($, propsOpenAtom)
    const effort = await read($, effortAtom)
    const effortOpen = await read($, effortOpenAtom)
    const modelOpen = await read($, modelOpenAtom)
    const tally = await read($, tallyAtom)
    const iteration = await read($, iterationAtom)
    const startedAt = await read($, turnStartedAtAtom)
    const lastMs = await read($, lastTurnMsAtom)
    const hit = cacheHitRate(tally)
    const timerMs = startedAt > 0 ? (await $.clock.now()) - startedAt : lastMs
    const property = (
      <Box flexDirection="column">
        {rule}
        {header('Property', 'props-toggle', propsOpen, () => update($, propsOpenAtom, o => !o))}
        {propsOpen && (
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Text>{' Model: '}</Text>
              <Button
                key="model"
                label={`[${info.name}]`}
                plain
                onPress={() => update($, modelOpenAtom, o => !o)}
              />
            </Box>
            {modelOpen && (
              // The families, the current one bright and the rest dim; each
              // runs /model with its alias, the family's newest model.
              <Box flexDirection="row" marginLeft={1}>
                {PICKS.map(pick => (
                  <Button
                    key={`model-pick-${pick.id}`}
                    label={`[${pick.label}]`}
                    plain
                    dimColor={!new RegExp(pick.id, 'i').test(current)}
                    onPress={async () => {
                      await update($, modelOpenAtom, () => false)
                      await pickModel($, pick.id)
                    }}
                  />
                ))}
              </Box>
            )}
            <Box flexDirection="row">
              <Text>{' Effort: '}</Text>
              <Button
                key="effort"
                label={`[${effortName(effort)}]`}
                plain
                onPress={() => update($, effortOpenAtom, o => !o)}
              />
            </Box>
            {effortOpen && (
              // The levels, the current one bright and the rest dim.
              <Box flexDirection="row" marginLeft={1}>
                {EFFORTS.map(x => (
                  <Button
                    key={`effort-${x.level}`}
                    label={`[${x.short}]`}
                    plain
                    dimColor={x.level !== effort}
                    onPress={() => pickEffort($, x.level)}
                  />
                ))}
              </Box>
            )}
            <Text>{` Cache Hit Rate: ${hit === undefined ? '—' : `${hit.toFixed(1)}%`}`}</Text>
            <Text>{` Token Usage: ${compact(totalTokens(tally))}`}</Text>
            <Text>{` Iteration Rate: ${iteration}/∞`}</Text>
            <Text>{` Latest Command: ${secondsText(timerMs)}`}</Text>
          </Box>
        )}
      </Box>
    )

    // Skill Box: a prompt field over the registered skills, five rows at a
    // time; each skill's button runs it with the prompt.
    const skills = await read($, skillsAtom)
    const skillsOpen = await read($, skillsOpenAtom)
    const skillPrompt = await read($, skillPromptAtom)
    const top = Math.max(0, Math.min(await read($, skillTopAtom), Math.max(0, skills.length - SKILL_ROWS)))
    const scroll = (by: number) =>
      update($, skillTopAtom, n => Math.max(0, Math.min(n + by, Math.max(0, skills.length - SKILL_ROWS))))
    const skillBox = (
      <Box flexDirection="column">
        {rule}
        {header('Skill Box', 'skills-toggle', skillsOpen, () => update($, skillsOpenAtom, o => !o))}
        {skillsOpen && (
          <Box flexDirection="column">
            {Input && (
              <Input
                key="skill-prompt"
                placeholder="prompt for the skill…"
                value={skillPrompt}
                onInput={(value: string) => update($, skillPromptAtom, () => value)}
                onSubmit={(value: string) => update($, skillPromptAtom, () => value)}
              />
            )}
            {skills.length === 0 ? (
              <Text dimColor>{' - none: /slime-subagent-dashboard\n   add <skill>'}</Text>
            ) : (
              skills.slice(top, top + SKILL_ROWS).map(name => (
                <Button key={`skill-${name}`} label={`[${name}]`} plain onPress={() => runSkill($, name)} />
              ))
            )}
            {skills.length > SKILL_ROWS && (
              <Box flexDirection="row" gap={1}>
                <Button key="skills-up" label="▲" plain onPress={() => scroll(-1)} />
                <Button key="skills-down" label="▼" plain onPress={() => scroll(1)} />
                <Text dimColor>{`${top + 1}-${Math.min(top + SKILL_ROWS, skills.length)}/${skills.length}`}</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )

    // Only surfaces without the scene need the model and status spelled out.
    const line = (
      <Text>
        <Text color={hex(info.body)}>■ {info.name}</Text>
        <Text dimColor> {status}</Text>
      </Text>
    )

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      columns = Math.max(1, Math.min(512, e.props.bodyColumns))

      return (
        <Box flexDirection="column">
          {stats}
          <Raster key={SCENE} columns={columns} rows={ROWS} cells={frame(columns, off, tick, isBusy, current, followersOf(followers), sky, partyTick(), { ...faceOf(v, isBusy && !isWaiting), ask: isWaiting })} />
          {picker}
          {property}
          {skillBox}
          {monitor}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {stats}
        {line}
        {picker}
        {property}
        {skillBox}
        {monitor}
      </Box>
    )
  })
}
