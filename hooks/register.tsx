import { atom, read, update } from 'claude-code'
import type { AgentStatus, EngineInterface, Register } from 'claude-code'

import { EMERGE_TICKS, frame, hex, homeCx, modelInfo, partyLength, partyScrolling, ROWS, slotOf, step } from './scene'
import type { Offsets } from './scene'
import { cleanSummary, wrapSummary } from './summary'
import { faceOf, filledOf, FULL, isDown, vitalsOf } from './vitals'
import type { Vitals } from './vitals'
import { DEFAULT_WEATHER, parseWeather, WEATHER_URL } from './weather'
import type { SlimeMinion, SlimeWeather } from '../types'

const PANE = 'slime-subagent-dashboard'
const SCENE = 'scene'
const TICK_MS = 100
const WEATHER_MS = 60 * 60 * 1000
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

// Animation lives in the module: a reload restarts the walk, the state stays.
let busy = false
let model = ''
let tick = 0
let columns = 0
let minions: SlimeMinion[] = []
let weather: SlimeWeather = DEFAULT_WEATHER
let vitals: Vitals = FULL
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

// Once an hour: is it day or night where this machine is, and what is the
// sky doing. A failed or unreadable reply keeps the sky as it was.
async function refreshWeather($: EngineInterface) {
  const reply = await $.http.fetch(WEATHER_URL).catch(() => undefined)
  const next = reply?.ok ? parseWeather(reply.text) : undefined
  if (!next) return
  weather = next
  await update($, weatherAtom, () => next)
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

// The bars' colors: HP red, MP blue, CP white.
const BAR = { hp: '#e5383b', mp: '#3a86ff', cp: '#f0f0f0' }

async function pickModel($: EngineInterface, id: string) {
  await $.command.run({ command: 'model', args: id })
  await refreshModel($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'slime-subagent-dashboard', description: 'Open the slime subagent dashboard pane' })
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
      // Down, the troop holds still until a limit resets.
      const going = moving(busy, minions) && !isDown(vitals)
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
        const cells = frame(columns, off, tick, walking, model, followersOf(minions), weather, t, faceOf(vitals, walking))
        await $.ui.blit({ requestId: PANE, key: SCENE, cells })
      }
    })

    return next(e)
  })

  on('command.run', { command: 'slime-subagent-dashboard' }, async $ => {
    await $.ui.open(OPEN)

    return { text: 'Slime subagent dashboard opened.' }
  })

  on('turn.start', async ($, e, next) => {
    await setBusy($, true)
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
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await setBusy($, false)
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
    const info = modelInfo(current)
    const status = isBusy ? '▸' : 'z'

    const { Box, Button, Text } = $.ui.resolve(e)
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
    const bar = (label: string, percent: number, cells: number, color: string) => {
      const filled = filledOf(percent, cells)
      return (
        <Text>
          {`${label} [`}
          <Text color={color}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(cells - filled)}</Text>
          {`] ${percent < 0 ? '—' : `${percent}%`}`}
        </Text>
      )
    }
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
        <Box flexDirection="row" gap={1}>
          {bar('CP', v.cp, 10, BAR.cp)}
          <Button key="unload" label="Unload" onPress={() => $.command.run({ command: 'compact' })} />
        </Box>
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
          <Raster key={SCENE} columns={columns} rows={ROWS} cells={frame(columns, off, tick, isBusy, current, followersOf(followers), sky, partyTick(), faceOf(v, isBusy))} />
          {picker}
          {monitor}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {stats}
        {line}
        {picker}
        {monitor}
      </Box>
    )
  })
}
