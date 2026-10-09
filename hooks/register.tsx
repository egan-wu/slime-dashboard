import { atom, read, update } from 'claude-code'
import type { AgentSpawnResult, AgentStatus, EngineInterface, Register } from 'claude-code'

import { ASK, bubbleCell, CAMPFIRE_W, bubbleFill, colorsFrom, DEFAULT_COLORS, EMERGE_TICKS, FAMILIES, frame, hex, homeCx, modelInfo, PALETTE_IDS, PALETTES, partyLength, partyScrolling, PERF_LEVELS, perfFrom, respawnLength, ROWS, setColors, setPerformance, slotOf, step } from './scene'
import type { Family, Perf, SlimeColors } from './scene'
import type { Offsets } from './scene'
import { addEvent, offsetOf, SHOWN_EVENTS, stamp } from './events'
import type { SlimeEvent } from './events'
import { addUsage, cacheEndText, cacheHitRate, cacheTtlOf, clockText, compact, NO_TALLY, secondsText, totalTokens, ttlMs } from './props'
import type { CacheTtl, Tally } from './props'
import { arranged as inOrder, grouped, namesFrom, orderMapFrom, parseAdd, skillsFrom, swapNames } from './skills'
import type { Skill } from './skills'
import { addLayer, addStep, agentLabel, COMBO_CATEGORY, COMBO_MODELS, comboPrompt, comboSummary, combosFrom, cycleAgent, cycleModel, DEFAULT_AGENTS, forSteps, LEADER_MODEL, leaderTag, moveLayer, newComboName, removeLayer, removeStep, renameOk, setCondition } from './combos'
import type { Combo } from './combos'
import { agentsToFollow, anyLive, attachRun, beginMission, combosOf, dateTimeText, elapsed, endLed, endMissions, reviveRun, settleLed, watching, newMission, nextMissionId, resultLines, runsOf, runTokens, statusOfAgent, tokensOf, tokensText, coinText, updateRun, usageTokens } from './squad'
import type { Mission, RunStatus, SquadRun } from './squad'
import { agoText, cleanSummary, recentFrom, titleFrom, wrapSummary } from './summary'
import { installedSha, manifestVersion, remoteSha, REMOTE_MANIFEST_URL, REMOTE_SHA_URL } from './freshness'
import { faceOf, filledOf, FULL, isDown, vitalsOf } from './vitals'
import type { Vitals } from './vitals'
import { DEFAULT_ORDER, moveSection, orderFrom, SECTIONS } from './layout'
import type { SectionId } from './layout'
import { VERSION } from './version'
import { cacheKept, returnVerdict, WARM_PROMPT, warmStep } from './warming'
import { addToDay, dayKey, journalFrom, pingPays, READ_COST, rewriteCost, summaryOf } from './journal'
import type { Day } from './journal'
import { DEFAULT_WEATHER, localWeather, parseWeather, WEATHER_URL, weatherNow } from './weather'
import type { SlimeMinion, SlimeRecentSession, SlimeWeather } from '../types'

const PANE = 'slime-dashboard'
// Dungeon: a tab of its own, opened by a Party Combo's press.
const SQUAD = 'dungeon'
const SQUAD_TITLE = 'Dungeon'
const SCENE = 'scene'
const TICK_MS = 100
// The sky is read every hour; day turns to night at sunset in between, from
// the sunrise and sunset the last read gave. A read that fails is tried
// again two minutes later.
const WEATHER_MS = 60 * 60 * 1000
const WEATHER_RETRY_MS = 2 * 60 * 1000
// Docked beside the fullscreen transcript, the sidebar asks for this width.
const OPEN = { id: PANE, title: 'Slime', columns: 33 }
// Setting's Width moves the docked pane's width a column at a time, between these.
const MIN_COLUMNS = 24
const MAX_COLUMNS = 80
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

// The red of Party's [x], which stops a subagent. A Button's label takes no
// color at rest, so the brackets around it carry the red, and the x turns red
// under the pointer.
const STOP_RED = 0xe63946

const busyAtom = atom({ plugin: 'slime-dashboard', key: 'busy' } as const, false)
const modelAtom = atom({ plugin: 'slime-dashboard', key: 'model' } as const, '')
const minionsAtom = atom({ plugin: 'slime-dashboard', key: 'minions' } as const, [] as SlimeMinion[])
const weatherAtom = atom({ plugin: 'slime-dashboard', key: 'weather' } as const, DEFAULT_WEATHER as SlimeWeather)
// HP, MP and CP: what is left of the usage limits, and the context window's fill.
// The session's name as /resume lists it: the one /rename gave, else the one
// Claude Code made up.
const SIGN = { edge: '#5c3a1e', board: '#8b5a2b', text: '#f5e6c8' }
// The red ! either side of a session not yet named, bright on the board.
const UNNAMED_MARK = '#ff5a4f'
const sessionTitleAtom = atom({ plugin: 'slime-dashboard', key: 'sessionTitle' } as const, '')
// Pressing the sign opens a field under it for a new name (renameDraft).
const renameOpenAtom = atom({ plugin: 'slime-dashboard', key: 'renameOpen' } as const, false)
const renameDraftAtom = atom({ plugin: 'slime-dashboard', key: 'renameDraft' } as const, '')
// The sign's [≡] opens a list of the project's recent sessions, to resume one.
const sessionsOpenAtom = atom({ plugin: 'slime-dashboard', key: 'sessionsOpen' } as const, false)
const recentSessionsAtom = atom({ plugin: 'slime-dashboard', key: 'recentSessions' } as const, [] as SlimeRecentSession[])
const RECENT_SESSIONS = 8
// The Skill Box's Respawn asks first: its row turns into [Y]/[N].
const respawnConfirmAtom = atom({ plugin: 'slime-dashboard', key: 'respawnConfirm' } as const, false)
// The tick Respawn cleared the session on, while its scene plays.
let respawnAt: number | undefined
const respawnTick = () => (respawnAt === undefined ? undefined : tick - respawnAt)
const RESPAWN_RED = '#d62828'
// The Party Combo section's combo: its name on a purple banner (and the box's edge),
// and the green of [Save].
const COMBO = { banner: '#5a189a', text: '#ffffff', save: '#38b000' }
// How Dungeon marks a step: waiting (dim), running, done, failed,
// stopped, or never reached once its mission ended.
const BORDER_DIM = '#5a5a66'
const RUN_LOOK: Record<RunStatus | 'waiting' | 'skipped', { mark: string; word: string; color?: string }> = {
  waiting: { mark: '○', word: 'waiting' },
  running: { mark: '◐', word: 'running', color: '#ffd23f' },
  completed: { mark: '✔', word: 'done', color: '#38b000' },
  failed: { mark: '✖', word: 'failed', color: '#ff5c5c' },
  stopped: { mark: '■', word: 'stopped', color: '#ff8c42' },
  skipped: { mark: '–', word: 'not run' },
}
// The coin before a mission's tokens: gold, turning while the mission runs.
const COIN = { color: '#ffd23f', frames: ['●', '◐', '○', '◑'], ms: 250 }

// A leader, while its mission goes on (between its turns as well).
const LEADING_LOOK = { mark: '◆', word: 'leading', color: '#c77dff' }
// A step's model as Dungeon names it: `sonnet` to `Sonnet`.
const modelName = (m: string) => m.charAt(0).toUpperCase() + m.slice(1)
const vitalsAtom = atom({ plugin: 'slime-dashboard', key: 'vitals' } as const, FULL as Vitals)
// True while the session waits on the person: a permission prompt or a question.
const waitingAtom = atom({ plugin: 'slime-dashboard', key: 'waiting' } as const, false)
// The Skill Box: the skills registered with /slime-dashboard add (kept
// in the store across sessions), whether it is open, the prompt typed for
// them, and the first of the five rows shown.
const skillsAtom = atom({ plugin: 'slime-dashboard', key: 'skills' } as const, [] as Skill[])
const skillsOpenAtom = atom({ plugin: 'slime-dashboard', key: 'skillsOpen' } as const, false)
const skillPromptAtom = atom({ plugin: 'slime-dashboard', key: 'skillPrompt' } as const, '')
// Each Enter in the prompt field keeps what it held as a piece of its own, in
// a frame with an [x]; a skill pressed sends them all, in order, as its prompt.
const skillPiecesAtom = atom({ plugin: 'slime-dashboard', key: 'skillPieces' } as const, [] as string[])
// Per category: the first of its five rows shown, and whether it is closed
// (a category is open until closed).
const skillTopsAtom = atom({ plugin: 'slime-dashboard', key: 'skillTops' } as const, {} as Record<string, number>)
const skillCatsClosedAtom = atom({ plugin: 'slime-dashboard', key: 'skillCatsClosed' } as const, [] as string[])
// The person's arrangement of the Skill Box (kept in the store): the skills of
// each category in order, and the categories in order.
const skillOrderAtom = atom({ plugin: 'slime-dashboard', key: 'skillOrder' } as const, {} as Record<string, string[]>)
const catOrderAtom = atom({ plugin: 'slime-dashboard', key: 'catOrder' } as const, [] as string[])
// The Party Combo section: the combos as saved (kept in the store across
// sessions), whether it is open, the combo being edited (its tab: the name it
// was saved under, or a new one's), its box folded to its name, the wave
// whose + skill lists the skills to add (-1: none), the wave whose condition
// field is open (-1: none), the rename field, and the subagent types the
// session offers.
const combosAtom = atom({ plugin: 'slime-dashboard', key: 'combos' } as const, [] as Combo[])
const treeOpenAtom = atom({ plugin: 'slime-dashboard', key: 'treeOpen' } as const, false)
const comboSelAtom = atom({ plugin: 'slime-dashboard', key: 'comboSel' } as const, '')
const comboFoldAtom = atom({ plugin: 'slime-dashboard', key: 'comboFold' } as const, false)
const comboPickAtom = atom({ plugin: 'slime-dashboard', key: 'comboPick' } as const, -1)
const comboCondAtom = atom({ plugin: 'slime-dashboard', key: 'comboCond' } as const, -1)
const comboRenameAtom = atom({ plugin: 'slime-dashboard', key: 'comboRename' } as const, false)
const comboNameAtom = atom({ plugin: 'slime-dashboard', key: 'comboName' } as const, '')
// Edits wait in a draft per tab until [Save] keeps them, so trying something
// out never spoils a combo that works; a new combo is a tab of its own (fresh)
// until its first save.
const comboEditsAtom = atom({ plugin: 'slime-dashboard', key: 'comboEdits' } as const, {} as Record<string, Combo>)
const comboFreshAtom = atom({ plugin: 'slime-dashboard', key: 'comboFresh' } as const, [] as string[])
// Delete asks first: [Delete [Y]/[N]].
const comboDeleteAtom = atom({ plugin: 'slime-dashboard', key: 'comboDelete' } as const, false)
const agentsAtom = atom({ plugin: 'slime-dashboard', key: 'agents' } as const, [] as string[])
// The Property block: open or not, and the session's figures it shows.
const propsOpenAtom = atom({ plugin: 'slime-dashboard', key: 'propsOpen' } as const, false)
// The Passive block (Cache Warming's switch): open or not.
const passiveOpenAtom = atom({ plugin: 'slime-dashboard', key: 'passiveOpen' } as const, false)
// The Setting block: open or not.
const settingsOpenAtom = atom({ plugin: 'slime-dashboard', key: 'settingsOpen' } as const, false)
// Setting's Display: whether its box is open, and the sections hidden from the
// pane (kept in the store across sessions).
const displayOpenAtom = atom({ plugin: 'slime-dashboard', key: 'displayOpen' } as const, false)
const hiddenAtom = atom({ plugin: 'slime-dashboard', key: 'hidden' } as const, [] as string[])
// Setting's Color: whether its box is open, and the slime color each model
// family wears (kept in the store across sessions).
const colorOpenAtom = atom({ plugin: 'slime-dashboard', key: 'colorOpen' } as const, false)
const colorsAtom = atom({ plugin: 'slime-dashboard', key: 'colors' } as const, DEFAULT_COLORS as SlimeColors)
// True while the main conversation's context compacts (Unload, /compact, auto).
// Setting's Order: whether its box is open, and the sections' order from the
// top (kept in the store across sessions).
const orderOpenAtom = atom({ plugin: 'slime-dashboard', key: 'orderOpen' } as const, false)
const orderAtom = atom({ plugin: 'slime-dashboard', key: 'order' } as const, DEFAULT_ORDER as SectionId[])
// Setting's Width: the columns the docked pane asks for (kept in the store).
const widthAtom = atom({ plugin: 'slime-dashboard', key: 'width' } as const, OPEN.columns)
const unloadingAtom = atom({ plugin: 'slime-dashboard', key: 'unloading' } as const, false)
// True once GitHub's main is ahead of what this copy runs: a red ! before [Update].
const behindAtom = atom({ plugin: 'slime-dashboard', key: 'behind' } as const, false)
const tallyAtom = atom({ plugin: 'slime-dashboard', key: 'tally' } as const, NO_TALLY as Tally)
// The prompt cache's TTL, and when the main thread last sent a request (its
// cache then runs until cacheAt + TTL).
const cacheTtlAtom = atom({ plugin: 'slime-dashboard', key: 'cacheTtl' } as const, { ttl: '1h', from: 'auto' } as CacheTtl)
const cacheAtAtom = atom({ plugin: 'slime-dashboard', key: 'cacheAt' } as const, 0)
// The Journal: thirty days of records (kept in the store), and whether it is open.
const journalAtom = atom({ plugin: 'slime-dashboard', key: 'journal' } as const, [] as Day[])
const journalOpenAtom = atom({ plugin: 'slime-dashboard', key: 'journalOpen' } as const, false)
// The Journal's Cache Warming block, opened and closed on its own.
const journalWarmOpenAtom = atom({ plugin: 'slime-dashboard', key: 'journalWarmOpen' } as const, false)
const JOURNAL_KEY = 'journal'
// Cache Warming's switch while on: a deep amber ground, which the
// terminal's light text reads well on; bold and brighter under the pointer.
const WARM_LIT = { ground: '#9c5d12', text: '#ffe7b0' } as const
// Cache Warming: on or off. On, it rests (sends nothing) once keeping
// the cache stops paying, until the next turn starts a new idle stretch.
// Off until the person turns it on: its pings spend their tokens, which no
// one should find out about afterwards.
const warmAutoAtom = atom({ plugin: 'slime-dashboard', key: 'warmAuto' } as const, false)
// What a cold return still read from the cache (the system prompt and tools,
// kept warm apart), which a rescue does not save; the last one seen.
const WARM_SHARED_KEY = 'warmShared'
let warmAuto = false
let warmRest = false
let warmBusy = false
let warmShared = 0
let warmTtl: '5m' | '1h' = '5m'
// The main thread's last prefix, kept through a reload of the plugin so the
// fire is lit again without waiting for another turn.
const warmPrefixAtom = atom({ plugin: 'slime-dashboard', key: 'warmPrefix' } as const, 0)
// For the Journal and warming's break-even: when the main thread's last
// request ended, its prefix's size, and the pings sent since (what they read).
let lastRealAt = 0
let lastPrefix = 0
let streakPings = 0
let streakSpent = 0
// Whether warming is keeping the cache now: on Auto, not resting, and worth a
// ping for what the last turn left (the campfire burns while it is).
const warmingNow = () => warmAuto && !warmRest && lastPrefix > 0 && pingPays(streakSpent, lastPrefix, warmTtl, warmShared)
// Where the campfire stands, in the ground's own coordinates (off.rock, which
// goo and rocks scroll by): lit beside the slime once the troop rests with warming
// on; it stays while they rest, slides off to the left when they set out,
// and is lit anew beside them when they rest again.
let campAt: number | undefined
// The column the last animation frame drew the fire at, so a redraw of the
// whole pane between frames draws it in the same place.
let campShown: number | undefined
// The tick the fire was set on, for the lighting (a log, then a flame).
let campLit = 0
const CAMP_GAP = 2
// Once warming rests (keeping the cache no longer pays), a fire already lit
// burns down to embers, still on Auto; none is lit for it.
const embersNow = () => warmAuto && warmRest && campAt !== undefined
function campColumn(w: number, resting: boolean): number | undefined {
  if (!warmingNow() && !embersNow()) return (campAt = undefined)
  // Lit just in front of the resting slime: two pixels clear of its left side.
  // A fire left behind (the troop traveled on, or the pane changed width) is
  // lit anew there once it rests; embers are only moved.
  const spot = Math.floor(off.rock) + homeCx(w) - 3 - CAMP_GAP - CAMPFIRE_W
  if (resting && campAt !== spot) {
    if (warmingNow()) {
      campAt = spot
      campLit = tick
    } else if (campAt !== undefined) {
      campAt = spot
    }
  }
  if (campAt === undefined) return undefined
  const x = campAt - Math.floor(off.rock)
  if (x + CAMPFIRE_W <= 0) return (campAt = undefined)
  return x
}
// The warming loop's own timer, a beat every 15 seconds while it is on.
let warmTimer: { cancel: () => void } | undefined
const WARM_BEAT_MS = 15_000
const startWarmTimer = ($: EngineInterface) => {
  warmTimer?.cancel()
  warmTimer = $.clock.every(WARM_BEAT_MS, () => void warmBeat($))
}
// The model requests of the main loop's current (or last) turn.
const iterationAtom = atom({ plugin: 'slime-dashboard', key: 'iteration' } as const, 0)
// The main loop's reasoning effort as its last model request was sent ('' before one).
const effortAtom = atom({ plugin: 'slime-dashboard', key: 'effort' } as const, '')
// The Event Message block's events, newest first.
const eventsAtom = atom({ plugin: 'slime-dashboard', key: 'events' } as const, [] as SlimeEvent[])
// Whether Party and Event Message are open; like every block, both start closed.
const monitorOpenAtom = atom({ plugin: 'slime-dashboard', key: 'monitorOpen' } as const, false)
const eventsOpenAtom = atom({ plugin: 'slime-dashboard', key: 'eventsOpen' } as const, false)
// Whether the row of effort levels under Property's Effort is open.
const modelOpenAtom = atom({ plugin: 'slime-dashboard', key: 'modelOpen' } as const, false)
const effortOpenAtom = atom({ plugin: 'slime-dashboard', key: 'effortOpen' } as const, false)
// The last turn's length, and when the running one started (0: none runs).
const lastTurnMsAtom = atom({ plugin: 'slime-dashboard', key: 'lastTurnMs' } as const, 0)
const turnStartedAtAtom = atom({ plugin: 'slime-dashboard', key: 'turnStartedAt' } as const, 0)

const SKILL_ROWS = 5
const SKILLS_KEY = 'skills'
const COMBOS_KEY = 'combos'
const SKILL_ORDER_KEY = 'skillOrder'
const CAT_ORDER_KEY = 'catOrder'
const HIDDEN_KEY = 'hidden'
const COLORS_KEY = 'colors'
const ORDER_KEY = 'order'
const WIDTH_KEY = 'width'
// Dungeon's missions, one per Party Combo pressed, newest last; this
// session's only.
const squadAtom = atom({ plugin: 'slime-dashboard', key: 'squad' } as const, [] as Mission[])
// The number the last press's mission took: never handed out twice.
const squadSeqAtom = atom({ plugin: 'slime-dashboard', key: 'squadSeq' } as const, 0)

// Dungeon's clock: moved once a second while a mission is going, so its
// times and states are drawn afresh.
const squadNowAtom = atom({ plugin: 'slime-dashboard', key: 'squadNow' } as const, 0)
// The step cards opened in Dungeon (each closed until pressed), by key.
const squadOpenAtom = atom({ plugin: 'slime-dashboard', key: 'squadOpen' } as const, [] as string[])

// A change to the missions; one that finds nothing to change keeps them.
async function setSquad($: EngineInterface, fn: (missions: Mission[]) => Mission[] | undefined) {
  await update($, squadAtom, missions => fn(missions) ?? missions)
}

// A subagent of a mission moved on: one that is no mission's is left alone.
const editRun = ($: EngineInterface, id: string, fn: (r: SquadRun) => SquadRun) => setSquad($, missions => updateRun(missions, id, fn))

// The engine's agent list settles the runs still running (a background
// subagent's end comes no other way).
async function checkSquad($: EngineInterface) {
  const missions = await read($, squadAtom)
  const running = runsOf(missions).filter(r => r.status === 'running')
  const at = await $.clock.now()
  if (running.length === 0 && !watching(missions, at, LEADER_WAKE_MS)) return
  const agents = await $.agent.list()
  // The subagents a leader (or a step) spawns run under this plugin's own
  // spawn, whose agent.spawn hooks skip this one: the agent list names them.
  for (const a of agentsToFollow(missions, agents, LEADER_MODEL)) await started($, a.id, a.model, a.description, a.parentId)
  for (const r of running) {
    const status = statusOfAgent(agents.find(a => a.id === r.id)?.status ?? '')
    if (!status) continue
    await editRun($, r.id, x => ({ ...x, status, endedAt: x.endedAt ?? at }))
    // A leader's end is its mission's, once nothing it sent out still runs.
    const busy = agents.some(a => a.parentId === r.id && !statusOfAgent(a.status))
    await setSquad($, missions => endLed(missions, r.id, status === 'completed' ? 'done' : status === 'stopped' ? 'stopped' : 'error', at, busy))
  }
  // A run the engine no longer lists has long ended, its end unseen.
  for (const r of running) {
    if (!agents.some(a => a.id === r.id) && at - r.startedAt > GONE_MS) await editRun($, r.id, x => (x.status === 'running' ? { ...x, status: 'completed', endedAt: x.endedAt ?? at } : x))
  }
  // A mission whose leader ended before what it waited on did ends now.
  await setSquad($, missions => settleLed(missions, at))
}

// How long a run may go unlisted by the engine before Dungeon takes it as ended.
const GONE_MS = 10_000

// How long after its mission ended a leader may still be woken by a report.
const LEADER_WAKE_MS = 120_000

// Dungeon's tab, at the width Setting's Width chose.
async function openSquad($: EngineInterface) {
  return $.ui.open({ id: SQUAD, title: SQUAD_TITLE, columns: await read($, widthAtom) })
}

// Setting's Weather: whether the sky is read from wttr.in, which places the
// machine by its IP address. Off unless chosen, kept across sessions; off, the
// sky follows this computer's clock and draws its weather by the hour.
const LIVE_WEATHER_KEY = 'liveWeather'
const liveWeatherAtom = atom({ plugin: 'slime-dashboard', key: 'liveWeather' } as const, false)
let liveWeather = false

// Setting's Performance, kept across sessions.
const PERF_KEY = 'performance'
const perfAtom = atom({ plugin: 'slime-dashboard', key: 'performance' } as const, 'high' as Perf)
// Whether Performance's row of levels is open; picking one closes it.
const perfOpenAtom = atom({ plugin: 'slime-dashboard', key: 'perfOpen' } as const, false)
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
let unloading = false
// This computer's UTC offset in minutes, read from `date +%z` when the
// session starts; until then (or where it cannot run) event stamps use the
// plugin environment's own zone.
let tzOffset: number | undefined

// The name from the session's transcript, for a load that has not seen a
// prompt carry it yet: the last /rename, else the last name made up for it.
async function readSessionTitle($: EngineInterface) {
  const file = `${await projectDir($)}/${await $.session.id()}.jsonl`
  const run = await $.process.run(['grep', '-o', '"\\(customTitle\\|aiTitle\\)":"[^"]*"', file]).catch(() => undefined)
  if (run?.exitCode !== 0) return
  const named = titleFrom(run.stdout)
  if (named) await setSessionTitle($, named)
}

// The cache TTL as Claude Code settles it: the environment, then the
// settings files nearest first (local, project, user), then the plan.
async function refreshCacheTtl($: EngineInterface) {
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  const cwd = await $.session.cwd()
  const files = [`${cwd}/.claude/settings.local.json`, `${cwd}/.claude/settings.json`, `${configDir}/settings.json`]
  const settings = await Promise.all(
    files.map(async f => {
      try {
        return JSON.parse(await $.fs.read(f)) as unknown
      } catch {
        return undefined
      }
    }),
  )
  const v = await read($, vitalsAtom)
  const ttl = cacheTtlOf(await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'), settings, v.plan, isDown(v))
  await update($, cacheTtlAtom, () => ttl)
  warmTtl = ttl.ttl
}

// Today's Journal record with `delta` added, made to what the store holds
// now so windows open at once each add their own.
async function addJournal($: EngineInterface, delta: Partial<Omit<Day, 'day'>>) {
  const day = dayKey(await $.clock.now(), tzOffset ?? 0)
  const list = addToDay(journalFrom(await $.store.get(JOURNAL_KEY)), day, delta)
  await $.store.set(JOURNAL_KEY, list)
  await update($, journalAtom, () => list)
}

// The first request of a main-thread turn: a return after the cache would
// have lapsed is a rescue when warming kept it (a large read), else a cold
// start (it wrote the prefix afresh). Either way the warming streak ends.
async function firstStep($: EngineInterface, usage: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }) {
  const now = await $.clock.now()
  const ttl = (await read($, cacheTtlAtom)).ttl
  if (lastRealAt > 0) {
    const gap = now - lastRealAt
    const readTokens = usage.cache_read_input_tokens
    const verdict = returnVerdict(gap, ttlMs(ttl), readTokens, lastPrefix, streakPings)
    const idle = `${Math.round(gap / 60_000)}m idle`
    if (verdict === 'rescued') {
      await addJournal($, { rescues: 1, rescued: readTokens, saved: readTokens * (rewriteCost(ttl) - READ_COST) })
      await logEvent($, `♨ Cache rescued: ${compact(readTokens)} still warm after ${idle}`)
    } else if (gap > ttlMs(ttl) && !cacheKept(readTokens, lastPrefix)) {
      warmShared = readTokens
      await $.store.set(WARM_SHARED_KEY, readTokens)
      await addJournal($, { cold: 1, coldTokens: usage.cache_creation_input_tokens })
      const why = verdict === 'lapsed' ? `lapsed despite ${streakPings} ping${streakPings === 1 ? '' : 's'}` : 'cold'
      await logEvent($, `♨ Cache ${why}: rewrote ${compact(usage.cache_creation_input_tokens)} after ${idle}`)
    }
  }
  streakPings = 0
  streakSpent = 0
  warmRest = false
}

// Cache Warming's switch: on or off.
async function toggleWarm($: EngineInterface) {
  warmAuto = !warmAuto
  await update($, warmAutoAtom, () => warmAuto)
  if (warmAuto) {
    warmRest = false
    startWarmTimer($)
  } else {
    warmTimer?.cancel()
    warmTimer = undefined
  }
  await logEvent($, `♨ Cache Warming ${warmAuto ? 'on' : 'off'}`)
}

// Warming rests until the next turn: keeping this cache no longer pays, or
// there is none to keep.
async function restWarm($: EngineInterface, why: string) {
  if (warmRest) return
  warmRest = true
  if (streakPings > 0) await logEvent($, `♨ Cache Warming rests: ${why}`)
}

// Each beat of the warming loop: while on and idle (no turn running, no
// subagent at work, no question waiting), a fork goes out a little before the
// cache would lapse. Its prefix is read from the cache, which starts the
// cache's time over; nothing joins the conversation. It stops once its span
// is over, when a limit runs out, and when the cache turns out gone already.
async function warmBeat($: EngineInterface) {
  if (!warmAuto || warmRest || warmBusy) return
  if (isDown(vitals)) return restWarm($, 'out of HP/MP')
  const now = await $.clock.now()
  const idle = !moving(busy, minions) && !waiting && !unloading
  const ttl = ttlMs((await read($, cacheTtlAtom)).ttl)
  const next = warmStep(now, idle, await read($, cacheAtAtom), ttl)
  if (next.kind !== 'warm') return
  // Too little to keep, or past break-even: another ping would cost more
  // than coming back could save.
  if (!pingPays(streakSpent, lastPrefix, warmTtl, warmShared)) {
    return restWarm($, streakPings === 0 ? 'too little to keep warm' : 'more pings would cost more than they save')
  }
  warmBusy = true
  try {
    const r = await $.model.fork({ prompt: WARM_PROMPT })
    if (!r.isAnswered && r.reason === 'nothing-to-fork') return await restWarm($, 'no conversation to keep warm')
    const readTokens = r.usage?.cache_read_input_tokens ?? 0
    const writeTokens = r.usage?.cache_creation_input_tokens ?? 0
    const at = await $.clock.now()
    if (!r.isAnswered && readTokens === 0) {
      await logEvent($, `♨ Cache Warming: no reply (${r.reason}), trying again`)
      return
    }
    if (!cacheKept(readTokens, lastPrefix)) return await restWarm($, 'the cache had already lapsed')
    await update($, cacheAtAtom, () => at)
    await update($, tallyAtom, t => addUsage(t, r.usage!))
    streakPings++
    streakSpent += readTokens
    lastPrefix = Math.max(lastPrefix, readTokens)
    const w = rewriteCost((await read($, cacheTtlAtom)).ttl)
    await addJournal($, { pings: 1, pingRead: readTokens, saved: -(readTokens * READ_COST + writeTokens * w) })
    const nextAt = clockText(at + ttl, tzOffset ?? 0)
    await logEvent($, `♨ Cache warmed: ${compact(readTokens)} read, next by ${nextAt}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logEvent($, `♨ Cache Warming: ${message}`)
  } finally {
    warmBusy = false
  }
}

// The project's transcripts, where readSessionTitle reads this session's.
async function projectDir($: EngineInterface) {
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  return `${configDir}/projects/${(await $.session.cwd()).replace(/[^A-Za-z0-9]/g, '-')}`
}

// [≡] pressed: closed, it lists the recent sessions (read afresh each time:
// the newest transcripts' names, grep'd as readSessionTitle does); open, it
// closes.
async function pressSessions($: EngineInterface) {
  if (await read($, sessionsOpenAtom)) {
    await update($, sessionsOpenAtom, () => false)
    return
  }
  await update($, sessionsOpenAtom, () => true)
  const dir = await projectDir($)
  const entries = await $.fs.list(dir).catch(() => [])
  // A few more than are shown, as some turn out never typed into.
  const newest = entries
    .filter(f => f.kind === 'file' && f.name.endsWith('.jsonl'))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, RECENT_SESSIONS * 2 + 1)
  const found = await Promise.all(
    newest.map(async f => {
      const run = await $.process.run(['grep', '-o', '"\\(customTitle\\|aiTitle\\)":"[^"]*"\\|"type":"user"', `${dir}/${f.name}`]).catch(() => undefined)
      return { id: f.name.slice(0, -'.jsonl'.length), at: f.mtimeMs, lines: run?.stdout ?? '' }
    }),
  )
  const offset = tzOffset ?? 0
  const untitled = (at: number) => {
    const d = new Date(at + offset)
    const two = (n: number) => String(n).padStart(2, '0')
    return `${two(d.getUTCMonth() + 1)}/${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
  }
  const list = recentFrom(found, await $.session.id(), RECENT_SESSIONS, untitled)
  await update($, recentSessionsAtom, () => list)
}

// A recent session picked: /resume takes the panel to it.
async function resumeSession($: EngineInterface, s: SlimeRecentSession) {
  await update($, sessionsOpenAtom, () => false)
  await logEvent($, `Resume: ${s.title}`)
  try {
    await $.command.run({ command: 'resume', args: s.id })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    $.ui.toast(`Session: /resume did not run: ${why}`)
  }
}

// The sign pressed: closed, it opens the field holding the current name;
// open, it renames with what the field holds, as Enter in the field does.
async function pressSign($: EngineInterface) {
  if (!(await read($, renameOpenAtom))) {
    await update($, renameDraftAtom, () => '')
    await update($, renameOpenAtom, () => true)
    return
  }
  await renameTo($, await read($, renameDraftAtom))
}

// Renames the session with /rename and closes the field. A name left empty
// or unchanged just closes, renaming nothing, and Event Message keeps the old
// name, should a rename need undoing.
async function renameTo($: EngineInterface, value: string) {
  const old = await read($, sessionTitleAtom)
  const next = value.trim()
  await update($, renameOpenAtom, () => false)
  if (!next || next === old) return
  await $.command.run({ command: 'rename', args: next })
  await update($, sessionTitleAtom, () => next)
  await logEvent($, `Renamed: ${old || '—'} → ${next}`)
}

// Respawn confirmed: /clear starts a new session, and the scene plays the old
// slime leaping away and a new one coming down in a beam of light.
async function respawn($: EngineInterface) {
  await update($, respawnConfirmAtom, () => false)
  await restWarm($, 'a new session')
  $.ui.toast('Skill Box: sending /clear')
  try {
    await $.command.run({ command: 'clear', args: '' })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    $.ui.toast(`Skill Box: /clear did not run: ${why}`)
    await logEvent($, 'Skill did not run: /clear')
    return
  }
  respawnAt = tick
  await update($, sessionTitleAtom, () => '')
  await logEvent($, 'Respawned: a new session')
}

async function setSessionTitle($: EngineInterface, title: string | undefined) {
  const next = title?.trim()
  if (next) await update($, sessionTitleAtom, () => next)
}

async function readLocalZone($: EngineInterface) {
  const run = await $.process.run(['date', '+%z']).catch(() => undefined)
  if (run?.exitCode === 0) tzOffset = offsetOf(run.stdout) ?? tzOffset
}
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

// Writing down an event never gets in the way of what it describes.
async function toggleSection($: EngineInterface, id: string) {
  const hidden = await read($, hiddenAtom)
  const next = hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id]
  await update($, hiddenAtom, () => next)
  await $.store.set(HIDDEN_KEY, next)
}

// Open the pane, asking for the width Setting's Width chose.
async function openPane($: EngineInterface) {
  return $.ui.open({ ...OPEN, columns: await read($, widthAtom) })
}

// Setting's Performance: how much the scene draws, kept.
async function setPerf($: EngineInterface, level: Perf) {
  setPerformance(level)
  await update($, perfAtom, () => level)
  await update($, perfOpenAtom, () => false)
  await $.store.set(PERF_KEY, level)
}

// Setting's Width: a column narrower or wider, kept, and the pane reopened at it.
async function nudgeWidth($: EngineInterface, by: -1 | 1) {
  const next = Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, (await read($, widthAtom)) + by))
  await update($, widthAtom, () => next)
  await $.store.set(WIDTH_KEY, next)
  await openPane($)
}

// Setting's Order: the section a place up or down (from the order as it is
// when pressed), or the default order.
async function moveOrder($: EngineInterface, id: SectionId, by: -1 | 1) {
  await setOrder($, moveSection(await read($, orderAtom), id, by))
}

async function setOrder($: EngineInterface, order: SectionId[]) {
  await update($, orderAtom, () => order)
  await $.store.set(ORDER_KEY, order)
}

// Setting's Color: the family's next color, round the palettes.
async function cycleColor($: EngineInterface, family: Family) {
  const colors = await read($, colorsAtom)
  const at = PALETTE_IDS.indexOf(colors[family])
  await setSlimeColors($, { ...colors, [family]: PALETTE_IDS[(at + 1) % PALETTE_IDS.length]! })
}

async function setSlimeColors($: EngineInterface, colors: SlimeColors) {
  setColors(colors)
  await update($, colorsAtom, () => colors)
  await $.store.set(COLORS_KEY, colors)
}

async function setUnloading($: EngineInterface, value: boolean) {
  unloading = value
  await update($, unloadingAtom, () => value)
  $.ui.invalidate('ui.render')
}

// Setting's Reload: load the dashboard afresh, as a save to its files would.
async function reloadDashboard($: EngineInterface) {
  await logEvent($, 'Reloaded the dashboard')
  await $.command.run({ command: 'reload-plugins' })
}

async function logEvent($: EngineInterface, text: string) {
  try {
    const at = await $.clock.now()
    await update($, eventsAtom, list => addEvent(list, { at, text }))
  } catch {
    // The event goes unrecorded.
  }
}

const agentLine = (m: { model: string; description?: string }) =>
  `${modelInfo(m.model).name}: ${cleanSummary(m.description || 'subagent')}`

async function checkMinions($: EngineInterface) {
  if (!minions.some(m => !m.done)) return
  const agents = await $.agent.list()
  const out = new Set(agents.filter(a => OUT.has(a.status)).map(a => a.id))
  const killed = new Set(agents.filter(a => a.status === 'killed').map(a => a.id))
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
  for (const m of finished) await logEvent($, `${killed.has(m.id) ? '✖ Stopped' : '✔ Finished'} ${agentLine(m)}`)
  if (!minions.some(m => !m.done) && partyAt === undefined) partyAt = tick
}

// Party's [x]: stop that subagent with TaskStop, under the same permission
// check as the model's own call; its slime then drops out as any finished one.
async function stopMinion($: EngineInterface, id: string) {
  try {
    await $.tool.call({ tool: 'TaskStop', task_id: id })
  } catch {
    // Already gone, or the stop was refused: nothing more to do.
  }
  await checkMinions($).catch(() => {})
}

// Dungeon's [X] on a step's card: that subagent is called back (TaskStop, as
// Party's [x]); its leader hears it was stopped.
async function recallRun($: EngineInterface, id: string) {
  await stopMinion($, id)
  await checkSquad($).catch(() => {})
}

// Dungeon's [Recall] on a leader's card: the whole mission is called back, its
// leader first (so it sends out no more), then all it sent out that runs.
async function recallMission($: EngineInterface, missionId: number) {
  const mission = (await read($, squadAtom)).find(m => m.id === missionId)
  if (!mission) return
  const mine = new Set(runsOf([mission]).map(r => r.id))
  const agents = await $.agent.list().catch(() => [])
  // What it sent out that Dungeon has not seen yet, at any depth.
  for (let grew = true; grew; ) {
    grew = false
    for (const a of agents) if (a.parentId !== undefined && mine.has(a.parentId) && !mine.has(a.id)) (mine.add(a.id), (grew = true))
  }
  const live = (id: string) => {
    const status = agents.find(a => a.id === id)?.status
    return status === undefined ? runsOf([mission]).some(r => r.id === id && r.status === 'running') : !statusOfAgent(status)
  }
  const order = [...(mission.leader ? [mission.leader.id] : []), ...[...mine].filter(id => id !== mission.leader?.id)]
  for (const id of order) if (live(id)) await stopMinion($, id)
  const at = await $.clock.now()
  await setSquad($, missions =>
    missions.map(m => {
      if (m.id !== missionId) return m
      const stop = (r: SquadRun): SquadRun => (r.status === 'running' ? { ...r, status: 'stopped', endedAt: at } : r)
      return {
        ...m,
        waves: m.waves.map(w => ({ ...w, steps: w.steps.map(st => (st.run ? { ...st, run: stop(st.run) } : st)) })),
        others: m.others.map(stop),
        ...(m.leader ? { leader: stop(m.leader) } : {}),
        endedAt: m.endedAt ?? at,
        outcome: 'stopped',
      }
    }),
  )
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
// Answers what it read, or why it read nothing, for `/slime-dashboard weather`.
let retryPending = false
async function refreshWeather($: EngineInterface): Promise<string> {
  if (!liveWeather) {
    const next = await localSky($)
    return `Weather: ${next.day ? 'day' : 'night'}, ${next.sky} (from this computer's clock; Setting's Weather is Off).`
  }
  let why: string
  try {
    // wttr.in answers a browser with a page; asked as curl, with the line alone.
    const reply = await $.http.fetch(WEATHER_URL, { headers: { 'User-Agent': 'curl/8' } })
    const read = reply.ok ? parseWeather(reply.text) : undefined
    const next = read && { ...read, readAt: await $.clock.now() }
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

// The sky without wttr.in, kept when it changed: day or night by this
// computer's clock, the hour's weather drawn.
async function localSky($: EngineInterface) {
  const next = localWeather(await $.clock.now(), tzOffset ?? 0)
  if (next.day !== weather.day || next.sky !== weather.sky || weather.rise !== undefined) {
    weather = next
    await update($, weatherAtom, () => next)
  }
  return weather
}

// Setting's Weather: on, the sky is read from it at once; off, the clock's.
async function setLiveWeather($: EngineInterface, on: boolean) {
  liveWeather = on
  await update($, liveWeatherAtom, () => on)
  await $.store.set(LIVE_WEATHER_KEY, on)
  await refreshWeather($)
}

// A session between models (as /clear passes) names none for a moment: the
// slime keeps the last one rather than flash the unknown model's green, and
// keeps it through Respawn's scene.
async function refreshModel($: EngineInterface) {
  if (respawnAt !== undefined) return
  const current = await $.session.model()
  if (!current || current === model) return
  if (model !== '') await logEvent($, `Model: ${modelInfo(model).name} → ${modelInfo(current).name}`)
  // Another model has a cache of its own: nothing left to keep warm.
  if (model !== '') await restWarm($, 'the model changed')
  model = current
  await update($, modelAtom, () => current)
}

async function setVitals($: EngineInterface, next: Vitals) {
  if (next.plan === vitals.plan && next.hp === vitals.hp && next.mp === vitals.mp && next.cp === vitals.cp) return
  const wasDown = isDown(vitals)
  vitals = next
  await update($, vitalsAtom, () => next)
  if (!wasDown && isDown(next)) await logEvent($, `x Out of ${next.hp <= 0 ? 'HP' : 'MP'}: resting until the limit resets`)
  if (wasDown && !isDown(next)) await logEvent($, 'Back on its feet: a limit has reset')
}

// The status line's figures. A failed read keeps the bars as they were.
async function refreshVitals($: EngineInterface) {
  const usage = await $.session.usage().catch(() => undefined)
  if (usage) await setVitals($, vitalsOf(usage.rateLimits, usage.context.percent))
}

// The bars' colors: HP a bright red, MP a bright blue; CP shades from a
// lighter to a darker grey along its length.
const BAR = { hp: '#ff5c5c', mp: '#4db8ff' }
// The Skill Box prompt's title banner: the MP blue deepened, so white reads on it.
const PROMPT_BANNER = '#1f6fb8'
const CP_FROM = 0x9e9e9e
const CP_TO = 0x4a4a4a
function cpColor(i: number, cells: number) {
  const mix = (shift: number) => {
    const a = (CP_FROM >> shift) & 0xff
    const b = (CP_TO >> shift) & 0xff
    return Math.round(a + ((b - a) * i) / Math.max(1, cells - 1)) << shift
  }
  return hex(mix(16) | mix(8) | mix(0))
}

async function setWaiting($: EngineInterface, value: boolean) {
  if (value === waiting) return
  waiting = value
  await update($, waitingAtom, () => value)
  await logEvent($, value ? '? Waiting for your answer' : 'Answered: the troop moves on')
}

// The Skill Box's skills, their order and the Party Combos are one store
// for every window open at once: each change is made to what the store holds
// now, not to this window's copy, so one window never writes another's
// changes away; and the copy is read afresh as the Skill Box or Party Combo section
// opens.
async function readShared($: EngineInterface) {
  const skills = skillsFrom(await $.store.get(SKILLS_KEY))
  const skillOrder = orderMapFrom(await $.store.get(SKILL_ORDER_KEY))
  const catOrder = namesFrom(await $.store.get(CAT_ORDER_KEY))
  const combos = combosFrom(await $.store.get(COMBOS_KEY))
  await update($, skillsAtom, () => skills)
  await update($, skillOrderAtom, () => skillOrder)
  await update($, catOrderAtom, () => catOrder)
  await update($, combosAtom, () => combos)
}

async function setSkills($: EngineInterface, fn: (list: Skill[]) => Skill[]) {
  const list = fn(skillsFrom(await $.store.get(SKILLS_KEY)))
  await $.store.set(SKILLS_KEY, list)
  await update($, skillsAtom, () => list)
  return list
}

// A skill's [▼]: it trades places with the one under it, in its category's
// order as the store now holds it; the arrangement is kept.
async function skillDown($: EngineInterface, category: string, names: string[], at: number) {
  const name = names[at]
  const kept = orderMapFrom(await $.store.get(SKILL_ORDER_KEY))
  const now = inOrder(names, kept[category], n => n)
  const next = { ...kept, [category]: name === undefined ? now : swapNames(now, now.indexOf(name)) }
  await $.store.set(SKILL_ORDER_KEY, next)
  await update($, skillOrderAtom, () => next)
}

// A category's [▼] or [▲]: it trades places with the next or the one before,
// in the order the store now holds.
async function moveCategory($: EngineInterface, categories: string[], at: number, by: -1 | 1) {
  const name = categories[at]
  const now = inOrder(categories, namesFrom(await $.store.get(CAT_ORDER_KEY)), n => n)
  const next = name === undefined ? now : swapNames(now, now.indexOf(name), by)
  await $.store.set(CAT_ORDER_KEY, next)
  await update($, catOrderAtom, () => next)
}

// The Skill Box's prompt: the pieces kept with Enter, then anything still in
// the field, a blank line between.
async function skillInput($: EngineInterface): Promise<string> {
  const parts = [...(await read($, skillPiecesAtom)), await read($, skillPromptAtom)]
  return parts.map(p => p.trim()).filter(p => p !== '').join('\n\n')
}

// Sent: the pieces go and the field clears.
async function clearSkillInput($: EngineInterface) {
  await update($, skillPiecesAtom, () => [])
  await update($, skillPromptAtom, () => '')
}

// The prompt field's key, new with each piece: the focus ring holds a place
// in the pane, not an element, so the piece's [x] drawn before the field would
// take it. Under a new key, the focus below waits for the field drawn after.
const skillPromptKey = (pieces: number) => `skill-prompt-${pieces}`

// Enter in the prompt field: what it holds becomes a piece, the field clears
// and keeps the keys, ready for the next piece.
async function keepPiece($: EngineInterface, value: string) {
  if (value.trim() === '') return
  await update($, skillPiecesAtom, pieces => [...pieces, value.trim()])
  await update($, skillPromptAtom, () => '')
  const pieces = await read($, skillPiecesAtom)
  await $.ui.focus({ requestId: PANE, key: skillPromptKey(pieces.length) }).catch(() => undefined)
}

// A piece's ▲ or ▼: it trades places with the one before or after (none past
// either end), and the focus goes along with it, so it can be pressed again.
async function movePiece($: EngineInterface, at: number, by: -1 | 1) {
  const pieces = await read($, skillPiecesAtom)
  const to = at + by
  if (to < 0 || to >= pieces.length) return
  await update($, skillPiecesAtom, ps => {
    const next = [...ps]
    ;[next[at], next[to]] = [next[to]!, next[at]!]
    return next
  })
  await $.ui.focus({ requestId: PANE, key: `skill-piece-${by < 0 ? 'up' : 'down'}-${to}` }).catch(() => undefined)
}

// A skill's button: run it as the person would type it, with the Skill Box's
// prompt after it in quotes when one is typed; the pieces then clear.
async function runSkill($: EngineInterface, skill: Skill) {
  const name = skill.command ?? skill.name
  const prompt = await skillInput($)
  const args = prompt === '' ? '' : `"${prompt.replace(/"/g, '\\"')}"`
  const typed = `/${name}${args === '' ? '' : ` ${args}`}`
  // Said at once, since the run itself waits until the session is idle.
  $.ui.toast(`Skill Box: sending ${typed}`)
  try {
    await $.command.run({ command: name, args })
    await clearSkillInput($)
    await logEvent($, `Skill sent: ${typed}`)
  } catch (error) {
    // An unknown skill (not in this session's slash commands) lands here; the
    // prompt stays in the field to try again.
    const why = error instanceof Error ? error.message : String(error)
    $.ui.toast(`Skill Box: ${typed} did not run: ${why}`)
    await logEvent($, `Skill did not run: ${typed}`)
  }
}

async function setCombos($: EngineInterface, fn: (list: Combo[]) => Combo[]) {
  const list = fn(combosFrom(await $.store.get(COMBOS_KEY)))
  await $.store.set(COMBOS_KEY, list)
  await update($, combosAtom, () => list)
  return list
}

// The combo a tab shows: its draft, else as saved.
async function comboOf($: EngineInterface, tab: string): Promise<Combo | undefined> {
  return (await read($, comboEditsAtom))[tab] ?? (await read($, combosAtom)).find(c => c.name === tab)
}

// An edit to a tab's combo, into its draft.
async function editCombo($: EngineInterface, tab: string, fn: (c: Combo) => Combo) {
  const combo = await comboOf($, tab)
  if (combo) await update($, comboEditsAtom, d => ({ ...d, [tab]: fn(combo) }))
}

// Every name taken, saved or new, but the tab's own.
async function namesBesides($: EngineInterface, tab: string) {
  const saved = (await read($, combosAtom)).map(c => c.name)
  const drafts = Object.entries(await read($, comboEditsAtom)).filter(([t]) => t !== tab).map(([, c]) => c.name)
  return [...new Set([...saved, ...(await read($, comboFreshAtom)), ...drafts])].filter(n => n !== tab).map(name => ({ name, layers: [] }))
}

// Party Combo's [+New]: a new combo with one empty wave, kept once saved.
async function newCombo($: EngineInterface) {
  const name = newComboName(await namesBesides($, ''))
  await update($, comboFreshAtom, f => [...f, name])
  await update($, comboEditsAtom, d => ({ ...d, [name]: addLayer({ name, layers: [] }) }))
  await selectCombo($, name)
  await update($, comboFoldAtom, () => false)
}

async function selectCombo($: EngineInterface, tab: string) {
  await update($, comboSelAtom, () => tab)
  await update($, comboPickAtom, () => -1)
  await update($, comboCondAtom, () => -1)
  await update($, comboRenameAtom, () => false)
  await update($, comboDeleteAtom, () => false)
}

// [Rename] pressed: closed, it opens a field holding the name; open, the
// draft takes what it holds, unless that is empty or another's.
async function pressRename($: EngineInterface, tab: string) {
  const combo = await comboOf($, tab)
  if (!combo) return
  if (!(await read($, comboRenameAtom))) {
    await update($, comboNameAtom, () => combo.name)
    await update($, comboRenameAtom, () => true)
    return
  }
  await update($, comboRenameAtom, () => false)
  const to = renameOk(await namesBesides($, tab), combo.name, await read($, comboNameAtom))
  if (to && to !== combo.name) await editCombo($, tab, c => ({ ...c, name: to }))
}

// [Save]: the draft is kept, under its (new) name, in place of the saved one.
async function saveCombo($: EngineInterface, tab: string) {
  const edited = (await read($, comboEditsAtom))[tab]
  if (!edited) return
  // A wave left with no skill has nothing to run: it goes, its condition too.
  const draft = { ...edited, layers: edited.layers.filter(l => l.steps.length > 0) }
  const fresh = (await read($, comboFreshAtom)).includes(tab)
  await setCombos($, list => (fresh ? [...list, draft] : list.map(c => (c.name === tab ? draft : c))))
  await update($, comboFreshAtom, f => f.filter(t => t !== tab))
  await update($, comboEditsAtom, ({ [tab]: _, ...rest }) => rest)
  await update($, comboSelAtom, () => draft.name)
  await update($, comboRenameAtom, () => false)
  $.ui.toast(`Party Combo: saved ${draft.name}`)
  await logEvent($, `Combo saved: ${draft.name}`)
}

// [Delete] then [Y]: gone, saved or not.
async function deleteCombo($: EngineInterface, tab: string) {
  await setCombos($, l => l.filter(c => c.name !== tab))
  await update($, comboFreshAtom, f => f.filter(t => t !== tab))
  await update($, comboEditsAtom, ({ [tab]: _, ...rest }) => rest)
  const left = [...(await read($, combosAtom)).map(c => c.name), ...(await read($, comboFreshAtom))]
  await selectCombo($, left[0] ?? '')
}

// A subagent started: its little slime, its line in Event Message, and its
// place in Dungeon when it is a mission's.
async function started($: EngineInterface, id: string, model: string, description: string, parent?: string) {
  lastBud = Math.max(tick, lastBud + EMERGE_GAP)
  budAt.set(id, lastBud)
  const minion = { id, model, description }
  await setMinions($, list => [...list, minion]).catch(() => {})
  await logEvent($, `▶ Started ${agentLine(minion)}`)
  const at = await $.clock.now().catch(() => 0)
  const run: SquadRun = { id, description, model, status: 'running', steps: 0, startedAt: at }
  await setSquad($, missions => attachRun(missions, run, parent)).catch(() => {})
}

// A combo's button: a leader subagent of its own is sent to lead it, with the
// Skill Box's prompt as its input, so the person's conversation goes on
// untouched; the pieces then clear. Where no subagent can be started, the main
// model is asked to lead it instead.
async function runCombo($: EngineInterface, combo: Combo) {
  const input = await skillInput($)
  // Its mission's number, in the prompt and in each step's tag.
  const id = nextMissionId(await read($, squadAtom), await read($, squadSeqAtom))
  const text = comboPrompt(combo, input, id, true)
  if (text === undefined) {
    $.ui.toast(`Party Combo: ${combo.name} has no skill yet`)
    return
  }
  $.ui.toast(`Party Combo: sending ${combo.name}`)
  try {
    await update($, squadSeqAtom, () => id)
    // A mission for Dungeon, which opens on it; its leader, once started,
    // begins it.
    const at = await $.clock.now()
    await setSquad($, missions => [...missions, newMission(id, combo, at)])
    // This plugin's own spawn runs every agent.spawn hook but its own: the
    // leader is put on its mission here.
    const description = `${leaderTag(combo.name, id)} the Party Combo`
    const led = await $.agent.spawn({ prompt: text, description, subagentType: 'general-purpose', model: LEADER_MODEL }).catch((err): AgentSpawnResult => ({ deny: String(err) }))
    if (led.deny === undefined) {
      // Its id, else as the agent list names it.
      const leader = led.agentId ?? (await $.agent.list().catch(() => [])).find(a => a.description === description)?.id
      if (leader !== undefined) await started($, leader, led.model, description)
      else await setSquad($, missions => beginMission(missions, combo.name, at, id))
    } else await $.prompt.submit({ text: comboPrompt(combo, input, id)! })
    await clearSkillInput($)
    await logEvent($, `Combo sent: ${combo.name}`)
    await openSquad($).catch(() => undefined)
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    $.ui.toast(`Party Combo: ${combo.name} did not run: ${why}`)
    await logEvent($, `Combo did not run: ${combo.name}`)
  }
}

// Setting's Update: refresh this plugin's marketplace from GitHub, update the
// installed plugin to its latest commit, then reload plugins so this session
// runs it. It updates an install (`/plugin install`); a copy loaded from a
// folder (--plugin-dir, a mods folder) is not one, and says so.
const PLUGIN_ID = 'slime-dashboard@slime-dashboard'
const MARKETPLACE = 'slime-dashboard'
const lastLine = (text: string) => text.trim().split('\n').filter(Boolean).pop() ?? ''

// Compare the installed commit (or, for a copy loaded from a folder, the
// version) with GitHub's main. A failed read leaves the mark as it was.
async function checkFreshness($: EngineInterface) {
  try {
    const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const record = await $.fs.read(`${configDir}/plugins/installed_plugins.json`).catch(() => undefined)
    const sha = typeof record === 'string' ? installedSha(record, PLUGIN_ID) : undefined
    const headers = { 'User-Agent': 'slime-dashboard', Accept: 'application/vnd.github.sha' }
    if (sha !== undefined) {
      const reply = await $.http.fetch(REMOTE_SHA_URL, { headers })
      const latest = reply.ok ? remoteSha(reply.text) : undefined
      if (latest !== undefined) await update($, behindAtom, () => latest !== sha)
      return
    }
    const reply = await $.http.fetch(REMOTE_MANIFEST_URL, { headers: { 'User-Agent': 'slime-dashboard' } })
    const latest = reply.ok ? manifestVersion(reply.text) : undefined
    if (latest !== undefined) await update($, behindAtom, () => latest !== VERSION)
  } catch {
    // Offline or refused: try again at the next check.
  }
}

// Update tells how it went in a toast and in Event Message, never in a line
// under the button.
async function updatePlugin($: EngineInterface) {
  const tell = async (text: string) => {
    $.ui.toast(text)
    await logEvent($, text)
  }
  $.ui.toast('Updating: fetching the latest from GitHub…')
  try {
    const steps: [string, string[]][] = [
      ['refresh the marketplace', ['claude', 'plugin', 'marketplace', 'update', MARKETPLACE]],
      ['update the plugin', ['claude', 'plugin', 'update', PLUGIN_ID]],
    ]
    for (const [what, argv] of steps) {
      const run = await $.process.run(argv, { timeoutMs: 120_000 })
      if (run.exitCode !== 0) {
        const why = lastLine(run.stderr) || lastLine(run.stdout) || `exit ${run.exitCode}`
        await tell(`Update failed to ${what}: ${why}`)
        return
      }
    }
    await update($, behindAtom, () => false)
    await tell('Updated from GitHub: reloading plugins')
    await $.command.run({ command: 'reload-plugins' })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    await tell(`Update failed: ${why}`)
  }
}

const USAGE =
  'Usage: /slime-dashboard [add <skill> [--category <name>] [--desc <words>] | remove <skill> | list | weather | dungeon]'

// `add <skill> [--category <name>] [--desc <words>]`, `remove <skill>`,
// `list`, `weather`, or nothing to open the pane. Adding a skill again files
// it anew (its category and description replaced).
async function manageSkills($: EngineInterface, args: string): Promise<string | undefined> {
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const name = (rest[0] ?? '').replace(/^\//, '')
  if (verb === 'add') {
    const skill = parseAdd(rest.join(' '))
    if (!skill) return USAGE
    const list = await setSkills($, l => [...l.filter(s => s.name !== skill.name), skill])
    return `Skill Box: added /${skill.name} under ${skill.category} (${list.length} registered).`
  }
  if (verb === 'remove' && name) {
    const list = await setSkills($, l => l.filter(s => s.name !== name))
    return `Skill Box: removed /${name} (${list.length} registered).`
  }
  if (verb === 'list') {
    return grouped(await read($, skillsAtom))
      .map(g => `${g.category}: ${g.skills.map(s => `/${s.command ?? s.name}${s.command ? ` (${s.name})` : ''}`).join(' ')}`)
      .join('\n')
  }
  if (verb === 'weather') return refreshWeather($)
  if (verb === 'dungeon') {
    await openSquad($)
    return `${SQUAD_TITLE}: ${(await read($, squadAtom)).length} mission(s) this session.`
  }
  if (verb) return USAGE
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
      name: 'slime-dashboard',
      description: 'Open the slime dashboard pane, or manage its Skill Box',
      argumentHint: '[add <skill> [--category <name>] [--desc <words>] | remove <skill> | list | weather | dungeon]',
    })
    const colors = colorsFrom(await $.store.get(COLORS_KEY))
    setColors(colors)
    await update($, colorsAtom, () => colors)
    const perfKept = perfFrom(await $.store.get(PERF_KEY))
    setPerformance(perfKept)
    await update($, perfAtom, () => perfKept)
    // A compaction cut short by a reload is not still running.
    await update($, unloadingAtom, () => false)
    const orderKept = orderFrom(await $.store.get(ORDER_KEY))
    await update($, orderAtom, () => orderKept)
    const hiddenKept = await $.store.get(HIDDEN_KEY)
    if (Array.isArray(hiddenKept)) await update($, hiddenAtom, () => hiddenKept.filter((h): h is string => typeof h === 'string'))
    // Names kept before categories come back filed under General.
    await readShared($)
    waiting = await read($, waitingAtom)
    busy = await read($, busyAtom)
    // Slimes that were dropping out when the module reloaded are simply gone.
    minions = (await read($, minionsAtom)).filter(m => !m.done)
    await update($, minionsAtom, () => minions)
    weather = await read($, weatherAtom)
    liveWeather = (await $.store.get(LIVE_WEATHER_KEY)) === true
    await update($, liveWeatherAtom, () => liveWeather)
    vitals = await read($, vitalsAtom)
    await refreshModel($)
    await refreshVitals($)
    await refreshCacheTtl($).catch(() => {})
    warmAuto = await read($, warmAutoAtom)
    lastPrefix = await read($, warmPrefixAtom)
    const sharedKept = await $.store.get(WARM_SHARED_KEY)
    if (typeof sharedKept === 'number' && sharedKept >= 0) warmShared = sharedKept
    const journalKept = journalFrom(await $.store.get(JOURNAL_KEY))
    await update($, journalAtom, () => journalKept)
    if (warmAuto) startWarmTimer($)
    const widthKept = await $.store.get(WIDTH_KEY)
    if (typeof widthKept === 'number' && Number.isInteger(widthKept)) {
      await update($, widthAtom, () => Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, widthKept)))
    }
    void openPane($)
    // The zone first: the clock's sky reads the hour in it.
    void readLocalZone($).then(() => refreshWeather($))
    void readSessionTitle($)
    $.clock.every(WEATHER_MS, () => refreshWeather($))
    // GitHub is asked for a newer dashboard once a load: at session start and
    // at each reload.
    void checkFreshness($)

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
      // Once a minute, day or night moves on from the last read's sunrise and
      // sunset; without wttr.in, the clock's sky (a new hour, a new draw).
      if (tick % 600 === 0 && !liveWeather) await localSky($)
      else if (tick % 600 === 0) {
        const moved = weatherNow(weather, await $.clock.now())
        if (moved !== weather) {
          weather = moved
          await update($, weatherAtom, () => moved)
        }
      }
      if (tick % 10 === 5) await checkMinions($)
      if (tick % 10 === 5) await checkSquad($).catch(() => {})
      // Dungeon redraws while a mission runs: its coin turns, its clocks tick.
      if (tick % 2 === 0 && anyLive(await read($, squadAtom))) await update($, squadNowAtom, () => tick).catch(() => {})
      if (columns > 0) {
        const walking = moving(busy, minions)
        if ((respawnTick() ?? 0) >= respawnLength(columns)) respawnAt = undefined
        const camp = (campShown = campColumn(columns, !walking && respawnAt === undefined))
        const face = { ...faceOf(vitals, walking && !waiting), ask: waiting, unloading, respawn: respawnTick(), warming: warmingNow(), embers: embersNow(), camp, campAge: tick - campLit }
        const cells = frame(columns, off, tick, walking, model, followersOf(minions), weather, t, face)
        await $.ui.blit({ requestId: PANE, key: SCENE, cells })
      }
      // The latest-command timer counts while a turn runs.
      // So does the bubble's question mark, which flashes with the bubble.
      if ((busy || waiting) && tick % 5 === 0) $.ui.invalidate('ui.render')
    })

    return next(e)
  })

  on('command.run', { command: 'slime-dashboard' }, async ($, e) => {
    const said = await manageSkills($, e.args)
    if (said !== undefined) return { text: said }
    await openPane($)

    return { text: 'Slime dashboard opened.' }
  })

  // /effort typed at the prompt (or run by the row of levels): the button follows.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const ran = await next(e)
    const level = e.args.trim().toLowerCase()
    const known = EFFORTS.find(x => x.level === level)
    if (known) {
      await update($, effortAtom, () => level).catch(() => {})
      await logEvent($, `Effort: ${known.name}`)
    }

    return ran
  }).catch(($, e, next) => next(e))

  // /compact, from the Skill Box's Unload or typed: the context has been unloaded.
  on('command.run', { command: 'compact' }, async ($, e, next) => {
    const ran = await next(e)
    await logEvent($, 'Unloaded: the context was compacted')

    return ran
  }).catch(($, e, next) => next(e))

  // A compaction of the main conversation, however it was asked for: the
  // slime wakes and shows the unload ring until it ends. One computed ahead
  // of time in the background is not the person's and shows nothing.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined || e.trigger === 'precompute') return next(e)
    await setUnloading($, true)
    try {
      return await next(e)
    } finally {
      await setUnloading($, false)
    }
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

  // The person's own subagent types the model is offered can be picked for a
  // combo's step too, after the three built-ins.
  on('agent.offer', async ($, e, next) => {
    const offer = await next(e)
    if (offer.isOffered && forSteps(e.agent, e.source)) await update($, agentsAtom, list => (list.includes(e.agent) ? list : [...list, e.agent])).catch(() => {})

    return offer
  }).catch(($, e, next) => next(e))

  // Each subagent that starts gets a little slime, colored by its model.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    // A drawing hiccup must never get in the way of the spawn itself.
    if (result.agentId !== undefined) await started($, result.agentId, result.model ?? e.parentModel, e.description, e.parentAgentId).catch(() => {})

    return result
  }).catch(($, e, next) => next(e))

  // Each model request of the main loop's turn is one iteration; a new one
  // also means the person has answered whatever was asked.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      // A run that ended its turn and is at work again (a leader woken by a
      // report) runs once more.
      await setSquad($, missions => reviveRun(missions, e.agentId!)).catch(() => {})
      await editRun($, e.agentId, r => ({ ...r, steps: r.steps + 1 })).catch(() => {})
    }
    if (e.agentId === undefined) {
      await update($, iterationAtom, () => e.index + 1).catch(() => {})
      if (e.effort !== undefined) await update($, effortAtom, () => String(e.effort)).catch(() => {})
      await setWaiting($, false).catch(() => {})
    }

    const result = yield* next(e)
    // A subagent's request counts toward its run's tokens in Dungeon.
    if (e.agentId !== undefined && result.usage) {
      const n = usageTokens(result.usage)
      await editRun($, e.agentId, r => ({ ...r, tokens: (r.tokens ?? 0) + n })).catch(() => {})
    }
    // Each main-thread request leaves the cache fresh until now + TTL.
    if (e.agentId === undefined && result.usage) {
      const u = result.usage
      try {
        if (e.index === 0) await firstStep($, u)
        const at = await $.clock.now()
        lastRealAt = at
        lastPrefix = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
        await update($, warmPrefixAtom, () => lastPrefix)
        await update($, cacheAtAtom, () => at)
      } catch {}
    }
    return result
  })

  // A question put to the person, or a plan to approve: waiting until answered.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) await editRun($, e.agentId, r => ({ ...r, tool: String(e.tool) })).catch(() => {})
    const asks = ASKING_TOOLS.has(String(e.tool))
    if (asks) await setWaiting($, true).catch(() => {})
    const ran = await next(e)
    // A permission prompt was answered once its call has run (or been refused).
    await setWaiting($, false).catch(() => {})

    return ran
  }).catch(($, e, next) => next(e))

  // Each prompt carries the session's current name, /rename's included.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    await setSessionTitle($, e.session_title).catch(() => {})
    // A combo's prompt taken up: its mission begins (each one's, for several).
    const combos = combosOf(e.prompt)
    if (combos.length > 0) {
      const at = await $.clock.now().catch(() => 0)
      await setSquad($, missions => combos.reduce((ms, c) => beginMission(ms, c.combo, at, c.mission), missions)).catch(() => {})
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (ASKING_NOTICES.has(e.notification_type)) await setWaiting($, true).catch(() => {})

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    // A subagent's turn ends with its answer; the leader's ends its missions.
    {
      const at = await $.clock.now().catch(() => 0)
      const answer = e.reason === 'refusal' ? undefined : e.answer
      if (e.agentId !== undefined) {
        const status: RunStatus = e.reason === 'answer' ? 'completed' : e.reason === 'aborted' ? 'stopped' : 'failed'
        const spent = e.usage ? usageTokens(e.usage) : 0
        await editRun($, e.agentId, r => ({ ...r, status, endedAt: at, ...(answer?.trim() ? { result: answer.trim() } : {}), ...(spent ? { turnTokens: (r.turnTokens ?? 0) + spent } : {}) })).catch(() => {})
        // A leader's end is its mission's, once nothing it sent out still runs.
        const outcome = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'error'
        const agents = await $.agent.list().catch(() => [])
        const busy = agents.some(a => a.parentId === e.agentId && !statusOfAgent(a.status))
        await setSquad($, missions => endLed(missions, e.agentId!, outcome, at, busy)).catch(() => {})
      } else {
        const outcome = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'error'
        await setSquad($, missions => endMissions(missions, outcome, at)).catch(() => {})
      }
    }
    if (e.usage) await update($, tallyAtom, t => addUsage(t, e.usage!)).catch(() => {})
    if (e.usage) {
      const u = e.usage
      await addJournal($, {
        turns: e.agentId === undefined ? 1 : 0,
        input: u.input_tokens,
        cacheWrite: u.cache_creation_input_tokens,
        cacheRead: u.cache_read_input_tokens,
        output: u.output_tokens,
      }).catch(() => {})
    }
    if (e.agentId === undefined) {
      void readSessionTitle($).catch(() => {})
      await setBusy($, false)
      await setWaiting($, false)
      await update($, lastTurnMsAtom, () => e.durationMs)
      await update($, turnStartedAtAtom, () => 0)
      const at = await $.clock.now()
      await update($, cacheAtAtom, () => at)
      await refreshVitals($)
      await refreshCacheTtl($).catch(() => {})
      // A new idle stretch: on Auto the loop runs, from the first turn on,
      // and keeps this turn's cache if that pays.
      warmRest = false
      if (warmAuto && !warmTimer) startWarmTimer($)
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
    const isUnloading = await read($, unloadingAtom)
    const colors = await read($, colorsAtom)
    setColors(colors)
    const perfLevel = await read($, perfAtom)
    const liveWeatherOn = await read($, liveWeatherAtom)
    setPerformance(perfLevel)
    const perfOpen = await read($, perfOpenAtom)
    const colorOpen = await read($, colorOpenAtom)
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
    const rule = <Text dimColor>{'─'.repeat(Math.max(1, (columns || OPEN.columns) - 1))}</Text>
    // A block's title and the button that opens or closes it.
    const header = (title: string, key: string, isOpen: boolean, toggle: () => unknown) => (
      <Box flexDirection="row">
        <Text dimColor>{`${title} `}</Text>
        <Button key={key} label={isOpen ? '▼' : '▲'} onPress={toggle} />
      </Box>
    )

    // Closed, a block's title says how many it holds.
    const monitorOpen = await read($, monitorOpenAtom)
    const monitor = (
      <Box flexDirection="column">
        {rule}
        {header(
          monitorOpen ? 'Party' : `Party (${running.length})`,
          'monitor-toggle',
          monitorOpen,
          () => update($, monitorOpenAtom, o => !o),
        )}
        {!monitorOpen ? null : running.length === 0 ? (
          <Text dimColor> - none</Text>
        ) : (
          running.map(m => {
            const who = modelInfo(m.model)
            return (
              <Box key={`agent-${m.id}`} flexDirection="column">
                <Box flexDirection="row">
                  <Text>
                    {' - '}
                    <Text color={hex(who.body)}>{who.name}</Text>{' '}
                    <Text color={hex(STOP_RED)}>[</Text>
                  </Text>
                  <Button
                    key={`stop-${m.id}`}
                    label="x"
                    plain
                    hover={{ scope: `stop-${m.id}`, color: hex(STOP_RED), bold: true }}
                    onPress={() => stopMinion($, m.id)}
                  />
                  <Text color={hex(STOP_RED)}>]</Text>
                </Box>
                {wrapSummary(cleanSummary(m.description || 'subagent'), width).map((line, i) => (
                  <Text dimColor wrap="truncate-end">{`${i === 0 ? INDENT : HANG}${line}`}</Text>
                ))}
              </Box>
            )
          })
        )}
      </Box>
    )

    // Event Message: the newest three events, each in a rounded frame, its
    // stamp (YYYYMMDD-hhmm) on the first row and its summary from the second.
    // Setting, at the very bottom: Update fetches the latest from GitHub.
    const settingsOpen = await read($, settingsOpenAtom)
    const behind = await read($, behindAtom)
    const displayOpen = await read($, displayOpenAtom)
    const hidden = await read($, hiddenAtom)
    const shown = (id: string) => !hidden.includes(id)
    const orderOpen = await read($, orderOpenAtom)
    const paneColumns = await read($, widthAtom)
    const order = await read($, orderAtom)
    const setting = (
      <Box flexDirection="column">
        {rule}
        {header('Setting', 'settings-toggle', settingsOpen, () => update($, settingsOpenAtom, o => !o))}
        {settingsOpen && (
          <Box flexDirection="column">
            <Box flexDirection="row" marginLeft={1}>
              {/* A newer dashboard is on GitHub: a red ! in the indent before [Update]. */}
              {behind ? <Text color="#e5383b" bold>!</Text> : <Text> </Text>}
              <Button key="update" label="[Update]" plain onPress={() => updatePlugin($)} />
              <Text dimColor>: update dashboard</Text>
            </Box>
            {displayOpen ? (
              // Open, Display is a rounded box with its button at the top left
              // (pressed again, it closes) over a checkbox for each section.
              <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginLeft={1} width={Math.max(8, (columns || OPEN.columns) - 2)}>
                <Button key="display" label="[Display]" plain onPress={() => update($, displayOpenAtom, o => !o)} />
                {SECTIONS.map(section => (
                  <Button
                    key={`display-${section.id}`}
                    label={`${hidden.includes(section.id) ? '[ ]' : '[x]'} ${section.label}`}
                    plain
                    onPress={() => toggleSection($, section.id)}
                  />
                ))}
              </Box>
            ) : (
              <Box flexDirection="row" marginLeft={2}>
                <Button key="display" label="[Display]" plain onPress={() => update($, displayOpenAtom, o => !o)} />
                <Text dimColor>: choose sections</Text>
              </Box>
            )}
            {colorOpen ? (
              // Open, Color is a rounded box like Display's: each family's
              // swatch and name, and its color's button, pressed for the next.
              <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginLeft={1} width={Math.max(8, (columns || OPEN.columns) - 2)}>
                <Button key="color" label="[Color]" plain onPress={() => update($, colorOpenAtom, o => !o)} />
                {FAMILIES.map(family => (
                  <Box key={`color-row-${family}`} flexDirection="row">
                    <Text color={hex(PALETTES[colors[family]].body)}>■ </Text>
                    <Text>{family.padEnd(7)}</Text>
                    <Button key={`color-${family}`} label={`[${PALETTES[colors[family]].name}]`} plain onPress={() => cycleColor($, family)} />
                  </Box>
                ))}
                {/* In the colors' column, past the swatch and the padded name. */}
                <Box flexDirection="row" marginLeft={9}>
                  <Button key="color-default" label="[Default]" plain onPress={() => setSlimeColors($, DEFAULT_COLORS)} />
                </Box>
              </Box>
            ) : (
              <Box flexDirection="row" marginLeft={2}>
                <Button key="color" label="[Color]" plain onPress={() => update($, colorOpenAtom, o => !o)} />
                <Text dimColor>: slime colors</Text>
              </Box>
            )}
            {orderOpen ? (
              // Open, Order is a rounded box like Display's: each section, top
              // to bottom, with buttons that move it a place up or down.
              <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginLeft={1} width={Math.max(8, (columns || OPEN.columns) - 2)}>
                <Button key="order" label="[Order]" plain onPress={() => update($, orderOpenAtom, o => !o)} />
                {order.map((id, i) => (
                  <Box key={`order-row-${id}`} flexDirection="row">
                    <Button key={`order-up-${id}`} label="[▲]" plain dimColor={i === 0} onPress={() => moveOrder($, id, -1)} />
                    <Button key={`order-down-${id}`} label="[▼]" plain dimColor={i === order.length - 1} onPress={() => moveOrder($, id, 1)} />
                    <Text dimColor={!shown(id)}>{` ${SECTIONS.find(s => s.id === id)!.label}`}</Text>
                  </Box>
                ))}
                {/* Under the section names, past the two buttons. */}
                <Box flexDirection="row" marginLeft={7}>
                  <Button key="order-default" label="[Default]" plain onPress={() => setOrder($, DEFAULT_ORDER)} />
                </Box>
              </Box>
            ) : (
              <Box flexDirection="row" marginLeft={2}>
                <Button key="order" label="[Order]" plain onPress={() => update($, orderOpenAtom, o => !o)} />
                <Text dimColor>: arrange sections</Text>
              </Box>
            )}
            <Box flexDirection="row" marginLeft={2}>
              <Text>{'[Width] '}</Text>
              <Button key="width-down" label="[-]" plain dimColor={paneColumns <= MIN_COLUMNS} onPress={() => nudgeWidth($, -1)} />
              <Text>{` ${paneColumns} `}</Text>
              <Button key="width-up" label="[+]" plain dimColor={paneColumns >= MAX_COLUMNS} onPress={() => nudgeWidth($, 1)} />
              <Text dimColor>: panel width</Text>
            </Box>
            {/* Performance: closed, what it is; open, a rounded box with its
                levels on the second row, the current one bright. */}
            {perfOpen ? (
              <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginLeft={1} width={Math.max(8, (columns || OPEN.columns) - 2)}>
                <Button key="perf" label="[Performance]" plain onPress={() => update($, perfOpenAtom, o => !o)} />
                <Box key="perf-levels" flexDirection="row" flexShrink={0}>
                  {PERF_LEVELS.map(level => (
                    <Button
                      key={`perf-${level}`}
                      label={`[${level[0]!.toUpperCase()}${level.slice(1)}]`}
                      plain
                      dimColor={level !== perfLevel}
                      onPress={() => setPerf($, level)}
                    />
                  ))}
                </Box>
              </Box>
            ) : (
              <Box flexDirection="row" marginLeft={2}>
                <Button key="perf" label="[Performance]" plain onPress={() => update($, perfOpenAtom, o => !o)} />
                <Text dimColor>: animation effect</Text>
              </Box>
            )}
            <Box flexDirection="row" marginLeft={2}>
              <Text>{'[Weather] '}</Text>
              <Button key="weather-live" label={liveWeatherOn ? '[On]' : '[Off]'} plain onPress={() => setLiveWeather($, !liveWeatherOn)} />
              <Text dimColor>{liveWeatherOn ? ': real weather from wttr.in' : ': weather by clock'}</Text>
            </Box>
            <Box flexDirection="row" marginLeft={2}>
              <Button key="reload" label="[Reload]" plain onPress={() => reloadDashboard($)} />
              <Text dimColor>: reload dashboard</Text>
            </Box>
          </Box>
        )}
        {/* The version, at the pane's foot to the right, in a muted slate blue. */}
        <Box flexDirection="row" justifyContent="flex-end" width={Math.max(8, (columns || OPEN.columns) - 1)}>
          <Text color="#5f7186">{`v${VERSION}`}</Text>
        </Box>
      </Box>
    )

    const allEvents = await read($, eventsAtom)
    const events = allEvents.slice(0, SHOWN_EVENTS)
    const eventsOpen = await read($, eventsOpenAtom)
    const paneWidth = Math.max(8, (columns || OPEN.columns) - 1)
    const eventMessage = (
      <Box flexDirection="column">
        {rule}
        {header(
          eventsOpen ? 'Event Message' : `Event Message (${allEvents.length})`,
          'events-toggle',
          eventsOpen,
          () => update($, eventsOpenAtom, o => !o),
        )}
        {!eventsOpen ? null : events.length === 0 ? (
          <Text dimColor> - none</Text>
        ) : (
          events.map((ev, i) => (
            <Box key={`event-${ev.at}-${i}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} width={paneWidth}>
              <Text bold>{stamp(ev.at, tzOffset)}</Text>
              {/* Inside the frame: the pane's width less two borders and two spaces. */}
              {wrapSummary(ev.text, paneWidth - 4, 2).map(line => (
                <Text>{line}</Text>
              ))}
            </Box>
          ))
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
    // CP shades from a lighter grey to a darker one along its length. Its
    // closing bracket lines up with the one above it: HP's on an API key (both
    // ten cells), MP's on a subscription, past HP's 5-cell bar and percentage
    // (`HP [` 4 + 5 + `] ` 2 + 4, a space, `MP [` 4 + 5, less `CP [`).
    const CP_CELLS = v.plan === 'subscription' ? 4 + 5 + 2 + 4 + 1 + 4 + 5 - 4 : 10
    const cpFilled = filledOf(v.cp, CP_CELLS)
    const cpRow = (
      <Text>
        <Text bold>CP</Text>
        {' ['}
        {Array.from({ length: cpFilled }, (_, i) => (
          <Text color={cpColor(i, CP_CELLS)}>█</Text>
        ))}
        <Text dimColor>{'░'.repeat(CP_CELLS - cpFilled)}</Text>
        {amount(v.cp)}
      </Text>
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
    const cacheTtl = await read($, cacheTtlAtom)
    const cacheAt = await read($, cacheAtAtom)
    const warmOn = await read($, warmAutoAtom)
    // Passive: Cache Warming's switch, in a block that opens and closes; lit
    // on an amber ground while on and dim while off; a dim word after it says
    // what warming is doing now.
    const warmNow = warmingNow()
    const warmWord = !warmOn ? 'off' : warmNow ? `${compact(lastPrefix)} warm` : embersNow() ? 'resting' : 'waiting'
    const passiveOpen = await read($, passiveOpenAtom)
    const passive = (
      <Box flexDirection="column">
        {rule}
        {header('Passive', 'passive-toggle', passiveOpen, () => update($, passiveOpenAtom, o => !o))}
        {passiveOpen && (
          <Box flexDirection="row" columnGap={1} marginLeft={1}>
            {/* `[ Cache Warming ]`: the brackets stay as they are; inside, lit
                on an amber ground while on, dim while off. */}
            <Box key="warm-switch" flexDirection="row" flexShrink={0}>
              <Text>[</Text>
              <Box flexDirection="row" {...(warmOn ? { backgroundColor: WARM_LIT.ground } : {})}>
                <Button key="warm" label=" Cache Warming " plain dimColor={!warmOn} {...(warmOn ? { hover: { scope: 'warm', color: WARM_LIT.text, bold: true } } : {})} onPress={() => toggleWarm($)} />
              </Box>
              <Text>]</Text>
            </Box>
            <Text dimColor wrap="truncate-end">{warmWord}</Text>
          </Box>
        )}
      </Box>
    )
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
            <Text>{` Cache TTL: ${cacheTtl.ttl}${cacheTtl.from === 'auto' ? ' (auto)' : cacheTtl.from === 'env' ? ' (env)' : ''}`}</Text>
            <Text>{` Token Usage: ${compact(totalTokens(tally))}`}</Text>
            <Text>{` Iteration Rate: ${iteration}/∞`}</Text>
            <Text>{` Latest Command: ${secondsText(timerMs)}`}</Text>
          </Box>
        )}
      </Box>
    )

    // Skill Box: a prompt field over the skills, filed by category. Each
    // category opens and closes and shows five rows at a time; each skill's
    // button runs it with the prompt, its description dim after it.
    // The Party Combos come last, under a category of their own.
    const ownSkills = await read($, skillsAtom)
    const combos = await read($, combosAtom)
    const comboRows: Skill[] = combos.map(c => ({ name: c.name, category: COMBO_CATEGORY, description: comboSummary(c) }))
    const skillOrder = await read($, skillOrderAtom)
    const groups = inOrder(
      [...grouped(ownSkills), ...(comboRows.length > 0 ? [{ category: COMBO_CATEGORY, skills: comboRows }] : [])],
      await read($, catOrderAtom),
      g => g.category,
    ).map(g => ({ ...g, skills: inOrder(g.skills, skillOrder[g.category], sk => sk.name) }))
    const categoryNames = groups.map(g => g.category)
    const skillsOpen = await read($, skillsOpenAtom)
    const skillPrompt = await read($, skillPromptAtom)
    const skillPieces = await read($, skillPiecesAtom)
    const tops = await read($, skillTopsAtom)
    const closed = await read($, skillCatsClosedAtom)
    const topOf = (g: { category: string; skills: Skill[] }) =>
      Math.max(0, Math.min(tops[g.category] ?? 0, Math.max(0, g.skills.length - SKILL_ROWS)))
    const scroll = (g: { category: string; skills: Skill[] }, by: number) =>
      update($, skillTopsAtom, t => ({
        ...t,
        [g.category]: Math.max(0, Math.min((t[g.category] ?? 0) + by, Math.max(0, g.skills.length - SKILL_ROWS))),
      }))
    const toggleCategory = (category: string) =>
      update($, skillCatsClosedAtom, c => (c.includes(category) ? c.filter(x => x !== category) : [...c, category]))
    const respawnAsking = await read($, respawnConfirmAtom)
    const categories = groups.map((g, gi) => {
      const isOpen = !closed.includes(g.category)
      const top = topOf(g)
      const names = g.skills.map(sk => sk.name)
      // The category's name opens and closes it; [▼][▲] at the right move it.
      const toggle = (
        <Box flexDirection="row" justifyContent="space-between" flexGrow={1}>
          <Button
            key={`skillcat-${g.category}`}
            label={`${isOpen ? '▼' : '▸'} ${isOpen ? g.category : `${g.category} (${g.skills.length})`}`}
            plain
            onPress={() => toggleCategory(g.category)}
          />
          <Box flexDirection="row" flexShrink={0}>
            <Button key={`skillcat-down-${g.category}`} label="[▼]" plain dimColor={gi === groups.length - 1} onPress={() => moveCategory($, categoryNames, gi, 1)} />
            <Button key={`skillcat-up-${g.category}`} label="[▲]" plain dimColor={gi === 0} onPress={() => moveCategory($, categoryNames, gi, -1)} />
          </Box>
        </Box>
      )
      // Each skill's [▼] trades places with the one under it.
      const down = (at: number) => (
        <Button key={`skill-down-${g.category}-${names[at]}`} label="[▼]" plain dimColor={at === names.length - 1} onPress={() => skillDown($, g.category, names, at)} />
      )
      // Closed, a category is its button alone; open, a rounded box like
      // Setting's Display, its button at the top over its skills.
      // Closed, it sits where an open box's insides do, past the border and
      // padding on both sides, so its [▼][▲] line up with an open one's.
      if (!isOpen) {
        return (
          <Box key={`skillcat-box-${g.category}`} flexDirection="row" marginLeft={2} width={Math.max(8, (columns || OPEN.columns) - 1 - 4)}>
            {toggle}
          </Box>
        )
      }
      return (
        <Box key={`skillcat-box-${g.category}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} width={Math.max(8, (columns || OPEN.columns) - 1)}>
          {toggle}
          {g.skills.slice(top, top + SKILL_ROWS).map((skill, k) =>
            skill.name === 'Respawn' && respawnAsking ? (
              // Respawn asks first: [Y] turns red under the pointer, [N] grey.
              // The question keeps its width; only the description gives way.
              <Box key={`skill-row-${skill.name}`} flexDirection="row">
                <Box flexDirection="row" flexShrink={0}>
                  {down(top + k)}
                  <Text>{`[${skill.name}]: `}</Text>
                  <Button key="respawn-no" label="[N]" plain hover={{ scope: 'respawn-no', color: '#8a8a8a' }} onPress={() => update($, respawnConfirmAtom, () => false)} />
                  <Text>/</Text>
                  <Button key="respawn-yes" label="[Y]" plain hover={{ scope: 'respawn-yes', color: RESPAWN_RED, bold: true }} onPress={() => respawn($)} />
                </Box>
                {skill.description && (
                  <Box flexShrink={1} minWidth={0} overflow="hidden">
                    <Text dimColor wrap="truncate-end">{` ${skill.description}`}</Text>
                  </Box>
                )}
              </Box>
            ) : (
              <Box key={`skill-row-${skill.name}`} flexDirection="row">
                {down(top + k)}
                {g.category === COMBO_CATEGORY ? (
                  <Button
                    key={`combo-${skill.name}`}
                    label={`[${skill.name}]`}
                    plain
                    onPress={() => {
                      const combo = combos.find(c => c.name === skill.name)
                      return combo && runCombo($, combo)
                    }}
                  />
                ) : (
                  <Button
                    key={`skill-${skill.name}`}
                    label={`[${skill.name}]`}
                    plain
                    onPress={() => (skill.name === 'Respawn' ? update($, respawnConfirmAtom, () => true) : runSkill($, skill))}
                  />
                )}
                {skill.description && <Text dimColor wrap="truncate-end">{`: ${skill.description}`}</Text>}
              </Box>
            ),
          )}
          {g.skills.length > SKILL_ROWS && (
            <Box flexDirection="row" gap={1} marginLeft={2}>
              <Button key={`skills-up-${g.category}`} label="▲" plain onPress={() => scroll(g, -1)} />
              <Button key={`skills-down-${g.category}`} label="▼" plain onPress={() => scroll(g, 1)} />
              <Text dimColor>{`${top + 1}-${Math.min(top + SKILL_ROWS, g.skills.length)}/${g.skills.length}`}</Text>
            </Box>
          )}
        </Box>
      )
    })
    const skillBox = (
      <Box flexDirection="column">
        {rule}
        {header('Skill Box', 'skills-toggle', skillsOpen, async () => {
          if (!skillsOpen) await readShared($)
          await update($, skillsOpenAtom, o => !o)
        })}
        {skillsOpen && (
          <Box flexDirection="column">
            {Input && (
              // The prompt: a bold title, the pieces kept so far each in a
              // bright frame, and the field under them, unframed. The field
              // wraps its text at the pane's whole width, whatever holds it, so
              // it stands at that width: inside a frame, its second row spills
              // past a box that does not grow for it.
              <Box flexDirection="column">
                {/* [Clear] at the title's right takes every piece out at once. */}
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" width={Math.max(8, (columns || OPEN.columns) - 1)}>
                  <Box flexDirection="row" borderStyle="round" borderColor={BAR.mp}>
                    <Box flexDirection="row" backgroundColor={PROMPT_BANNER} paddingX={1}>
                      <Text bold color="#ffffff">
                        Prompt for skill
                      </Text>
                    </Box>
                  </Box>
                  {skillPieces.length > 0 && <Button key="skill-pieces-clear" label="[Clear]" plain onPress={() => update($, skillPiecesAtom, () => [])} />}
                </Box>
                {/* Each piece kept with Enter, whole and wrapped in a frame of
                    its own, ▲ ▼ at its top right moving it, x taking it out. */}
                {skillPieces.map((piece, i) => (
                  <Box key={`skill-piece-${i}`} flexDirection="row" alignItems="flex-start" columnGap={1} borderStyle="round" borderColor={BAR.mp} paddingX={1} width={Math.max(8, (columns || OPEN.columns) - 1)}>
                    <Box flexGrow={1} flexShrink={1} minWidth={0}>
                      <Text wrap="wrap">{piece}</Text>
                    </Box>
                    <Button key={`skill-piece-up-${i}`} label="▲" plain dimColor onPress={() => movePiece($, i, -1)} />
                    <Button key={`skill-piece-down-${i}`} label="▼" plain dimColor onPress={() => movePiece($, i, 1)} />
                    <Button key={`skill-piece-x-${i}`} label="x" plain dimColor onPress={() => update($, skillPiecesAtom, ps => ps.filter((_, k) => k !== i))} />
                  </Box>
                ))}
                <Input
                  key={skillPromptKey(skillPieces.length)}
                  // A space before the mark, in the label: a margin would push
                  // the field, as wide as the pane, past its edge.
                  label=" ›"
                  placeholder="type, Enter; then press a skill"
                  // What Enter does shows only while the field is empty.
                  submitLabel={skillPrompt === '' ? 'add' : ''}
                  value={skillPrompt}
                  onInput={(value: string) => update($, skillPromptAtom, () => value)}
                  onSubmit={(value: string) => keepPiece($, value)}
                />
              </Box>
            )}
            {categories}
          </Box>
        )}
      </Box>
    )

    // Party Combo: the combos, one edited at a time in a rounded box
    // under its name. Its waves, each in a box of its own, run in order, the
    // skills of a wave all at once, a row each; a wave moves, goes, takes
    // another skill (+ skill lists the Skill Box's) and a condition (◆, between
    // it and the next) the leader judges after it. Each skill's model and
    // subagent type change a press at a time. Edits stay in a draft until [Save].
    const treeOpen = await read($, treeOpenAtom)
    const edits = await read($, comboEditsAtom)
    const fresh = await read($, comboFreshAtom)
    const tabs = [...combos.map(c => c.name), ...fresh.filter(t => !combos.some(c => c.name === t))]
    const selTab = tabs.includes(await read($, comboSelAtom)) ? await read($, comboSelAtom) : tabs[0]
    const shownOf = (tab: string) => edits[tab] ?? combos.find(c => c.name === tab)
    const folded = await read($, comboFoldAtom)
    const pickAt = await read($, comboPickAtom)
    const condAt = await read($, comboCondAtom)
    const renamingCombo = await read($, comboRenameAtom)
    const comboName = await read($, comboNameAtom)
    const deleteAsking = await read($, comboDeleteAtom)
    const offered = await read($, agentsAtom)
    // What an earlier load kept may hold the built-ins left out since.
    const agents = [...DEFAULT_AGENTS, ...offered.filter(a => forSteps(a, ''))]
    const boxWidth = Math.max(8, (columns || OPEN.columns) - 1)
    const waveWidth = Math.max(8, boxWidth - 4)
    // A step is a row in its wave's box: swatch, skill, model, subagent type,
    // ✕. Where the pane is too narrow for that, the model and subagent type go
    // under the skill instead, which leaves the subagent type the most room.
    const waveInner = waveWidth - 4
    const modelRoom = Math.max(...COMBO_MODELS.map(m => modelInfo(m).name.length))
    const agentRoom = Math.max(4, waveInner - 2 - modelRoom - 1)
    const shortAgent = (agent: string) => {
      const name = agentLabel(agent)
      return name.length <= agentRoom ? name : `${name.slice(0, agentRoom - 1)}…`
    }
    const skillNames = ownSkills.map(sk => sk.command ?? sk.name)
    const editor = (tab: string, combo: Combo) => {
      const edit = (fn: (c: Combo) => Combo) => editCombo($, tab, fn)
      const dirty = edits[tab] !== undefined
      // The name on a purple banner, bold: pressed, the box folds to it and opens again.
      const banner = (
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="row" backgroundColor={COMBO.banner} paddingX={1} flexShrink={1} minWidth={0}>
            <Button key="combo-fold" label={`${folded ? '▸' : '▾'} ${combo.name}${dirty ? ' *' : ''}`} plain hover={{ scope: 'combo-fold', color: COMBO.text, bold: true }} onPress={() => update($, comboFoldAtom, f => !f)} />
          </Box>
          {!folded && <Button key="combo-rename" label="[Rename]" plain onPress={() => pressRename($, tab)} />}
        </Box>
      )
      if (folded) {
        return (
          <Box flexDirection="column" borderStyle="round" borderColor={COMBO.banner} paddingX={1} width={boxWidth}>
            {banner}
          </Box>
        )
      }
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={COMBO.banner} paddingX={1} width={boxWidth}>
          {banner}
          {renamingCombo && Input && (
            <Input
              key="combo-name"
              label="›"
              placeholder="new name, then [Rename]"
              submitLabel="keep"
              value={comboName}
              onInput={(value: string) => update($, comboNameAtom, () => value)}
              onSubmit={(value: string) => update($, comboNameAtom, () => value)}
            />
          )}
          {combo.layers.map((layer, i) => {
            const shownAgents = layer.steps.map(st => shortAgent(st.agent))
            const agentWidth = Math.max(0, ...shownAgents.map(a => a.length))
            // One wave lays its steps out alike, all a row each or all two.
            const longestSkill = Math.max(0, ...layer.steps.map(st => st.skill.length + 1))
            const left = skillNames.filter(name => !layer.steps.some(st => st.skill === name))
            const condLines = layer.condition ? wrapSummary(layer.condition, waveWidth - 4, 3) : []
            return (
              <Box key={`wave-${i}`} flexDirection="column">
                <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} width={waveWidth}>
                  <Box flexDirection="row" columnGap={1}>
                    <Box flexGrow={1}>
                      <Text bold>{`Wave ${i + 1}`}</Text>
                    </Box>
                    <Button key={`wave-up-${i}`} label="▲" plain dimColor onPress={() => edit(c => moveLayer(c, i, -1))} />
                    <Button key={`wave-down-${i}`} label="▼" plain dimColor onPress={() => edit(c => moveLayer(c, i, 1))} />
                    <Button
                      key={`wave-remove-${i}`}
                      label="✕"
                      plain
                      dimColor
                      hover={{ scope: `wave-remove-${i}`, color: hex(STOP_RED), bold: true }}
                      onPress={async () => {
                        await update($, comboPickAtom, () => -1)
                        await update($, comboCondAtom, () => -1)
                        await edit(c => removeLayer(c, i))
                      }}
                    />
                  </Box>
                  {layer.steps.map((st, j) => {
                    const model = <Button key={`step-model-${i}-${j}`} label={modelInfo(st.model).name.padEnd(modelRoom)} plain dimColor onPress={() => edit(c => cycleModel(c, i, j))} />
                    const agent = <Button key={`step-agent-${i}-${j}`} label={shownAgents[j]!.padEnd(agentWidth)} plain dimColor onPress={() => edit(c => cycleAgent(c, i, j, agents))} />
                    const remove = <Button key={`step-remove-${i}-${j}`} label="✕" plain dimColor hover={{ scope: `step-remove-${i}-${j}`, color: hex(STOP_RED), bold: true }} onPress={() => edit(c => removeStep(c, i, j))} />
                    const skill = (
                      <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
                        <Text color={hex(modelInfo(st.model).body)}>■ </Text>
                        <Text wrap="truncate-end">{`/${st.skill}`}</Text>
                      </Box>
                    )
                    const oneRow = 2 + longestSkill + 1 + modelRoom + 1 + agentWidth + 1 + 1 <= waveInner
                    return oneRow ? (
                      <Box key={`step-${i}-${j}`} flexDirection="row" columnGap={1}>
                        {skill}
                        {model}
                        {agent}
                        {remove}
                      </Box>
                    ) : (
                      <Box key={`step-${i}-${j}`} flexDirection="column">
                        <Box flexDirection="row" columnGap={1}>
                          {skill}
                          {remove}
                        </Box>
                        <Box flexDirection="row" columnGap={1} marginLeft={2}>
                          {model}
                          {agent}
                        </Box>
                      </Box>
                    )
                  })}
                  <Button key={`wave-add-${i}`} label="+ skill" plain dimColor onPress={() => update($, comboPickAtom, p => (p === i ? -1 : i))} />
                  {pickAt === i && (
                    // The Skill Box's skills not yet in this wave, side by side;
                    // each press adds one, and the list stays until + skill again.
                    <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginLeft={2}>
                      {skillNames.length === 0 ? (
                        <Text dimColor wrap="truncate-end">no skills: /slime-dashboard add</Text>
                      ) : left.length === 0 ? (
                        <Text dimColor>all in this wave</Text>
                      ) : (
                        left.map(name => <Button key={`pick-${i}-${name}`} label={`/${name}`} plain onPress={() => edit(c => addStep(c, i, name))} />)
                      )}
                    </Box>
                  )}
                </Box>
                {/* Between this wave and the next: the condition judged after it, then ↓. */}
                <Box flexDirection="column" marginLeft={3}>
                  {condAt === i && Input ? (
                    <Input
                      key={`cond-${i}`}
                      label="◆"
                      placeholder="e.g. if Fail, go on; if Pass, stop"
                      submitLabel="done"
                      value={layer.condition ?? ''}
                      onInput={(value: string) => edit(c => setCondition(c, i, value))}
                      onSubmit={async (value: string) => {
                        await edit(c => setCondition(c, i, value))
                        await update($, comboCondAtom, () => -1)
                      }}
                    />
                  ) : (
                    <Box flexDirection="column">
                      <Button key={`wave-cond-${i}`} label={`◆ ${condLines[0] ?? '+ condition'}`} plain dimColor onPress={() => update($, comboCondAtom, p => (p === i ? -1 : i))} />
                      {condLines.slice(1).map((line, k) => (
                        <Text key={`cond-text-${i}-${k}`} dimColor>{`  ${line}`}</Text>
                      ))}
                    </Box>
                  )}
                  {i < combo.layers.length - 1 && <Text dimColor>↓</Text>}
                </Box>
              </Box>
            )
          })}
          <Button key="wave-new" label="+ Wave" plain dimColor onPress={() => edit(addLayer)} />
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {/* Plain at rest: [Save] turns green under the pointer, [Delete] red. */}
            <Button key="combo-save" label="[Save]" plain hover={{ scope: 'combo-save', color: COMBO.save, bold: true }} onPress={() => saveCombo($, tab)} />
            {deleteAsking ? (
              <Box flexDirection="row" flexShrink={0}>
                <Text>[Delete </Text>
                <Button key="combo-delete-yes" label="[Y]" plain hover={{ scope: 'combo-delete-yes', color: RESPAWN_RED, bold: true }} onPress={() => deleteCombo($, tab)} />
                <Text>/</Text>
                <Button key="combo-delete-no" label="[N]" plain hover={{ scope: 'combo-delete-no', color: '#8a8a8a' }} onPress={() => update($, comboDeleteAtom, () => false)} />
                <Text>]</Text>
              </Box>
            ) : (
              <Button key="combo-delete" label="[Delete]" plain hover={{ scope: 'combo-delete', color: RESPAWN_RED, bold: true }} onPress={() => update($, comboDeleteAtom, () => true)} />
            )}
          </Box>
        </Box>
      )
    }
    const selCombo = selTab === undefined ? undefined : shownOf(selTab)
    const tree = (
      <Box flexDirection="column">
        {rule}
        {header(treeOpen ? 'Party Combo' : `Party Combo (${combos.length})`, 'tree-toggle', treeOpen, async () => {
          if (!treeOpen) await readShared($)
          await update($, treeOpenAtom, o => !o)
        })}
        {treeOpen && (
          <Box flexDirection="column">
            <Box flexDirection="row" flexWrap="wrap" marginLeft={1}>
              {tabs.map(tab => (
                <Button key={`combo-tab-${tab}`} label={`[${shownOf(tab)?.name ?? tab}${edits[tab] ? '*' : ''}]`} plain dimColor={tab !== selTab} onPress={() => selectCombo($, tab)} />
              ))}
              <Button key="combo-new" label="[+New]" plain onPress={() => newCombo($)} />
            </Box>
            {selTab !== undefined && selCombo && editor(selTab, selCombo)}
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

    // The sections in Order's order, each left out while Display hides it;
    // Setting always last.
    const arranged = (blocks: Record<SectionId, typeof stats>) => (
      <Box flexDirection="column">
        {order.filter(shown).map(id => (
          <Box key={`section-${id}`} flexDirection="column">
            {blocks[id]}
          </Box>
        ))}
        {setting}
      </Box>
    )
    const title = await read($, sessionTitleAtom)
    const renaming = await read($, renameOpenAtom)
    const draft = await read($, renameDraftAtom)
    const sessionsOpen = await read($, sessionsOpenAtom)
    const recent = await read($, recentSessionsAtom)
    const now = sessionsOpen ? await $.clock.now() : 0
    // The session's name on a wooden sign: a rounded brown frame; the name is
    // a button that opens a field to rename it, then renames on a second press.
    // [≡] at its left lists the recent sessions under it, a press resuming one.
    const signWidth = Math.max(8, (columns || OPEN.columns) - 1)
    const session = (
      <Box flexDirection="column">
        <Box flexDirection="row" borderStyle="round" borderColor={SIGN.edge} backgroundColor={SIGN.board} paddingX={1} width={signWidth}>
          <Button key="sessions" label="[≡]" plain hover={{ scope: 'sessions', color: SIGN.text, bold: true }} onPress={() => pressSessions($)} />
          {/* The name stays centered: the [≡]'s width again on the right. */}
          <Box flexDirection="row" justifyContent="center" flexGrow={1} flexShrink={1} minWidth={0}>
            {/* A new session has no name yet: a journey still to be named. */}
            {!title && <Text color={UNNAMED_MARK}>{' ! '}</Text>}
            <Button key="sign" label={title || 'Mystic Journey'} plain hover={{ scope: 'sign', color: SIGN.text, bold: true }} onPress={() => pressSign($)} />
            {!title && <Text color={UNNAMED_MARK}>{' ! '}</Text>}
          </Box>
          <Box width={3} flexShrink={0} />
        </Box>
        {sessionsOpen && (
          <Box flexDirection="column" borderStyle="round" borderColor={SIGN.edge} paddingX={1} width={signWidth}>
            {recent.length === 0 ? (
              <Text dimColor>no other sessions here</Text>
            ) : (
              recent.map(s => (
                <Box key={`session-row-${s.id}`} flexDirection="row" columnGap={1}>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Button key={`session-${s.id}`} label={s.title} plain hover={{ scope: `session-${s.id}`, color: SIGN.text, bold: true }} onPress={() => resumeSession($, s)} />
                  </Box>
                  <Text dimColor>{agoText(s.at, now)}</Text>
                </Box>
              ))
            )}
          </Box>
        )}
        {renaming && Input && (
          <Box flexDirection="row">
            <Input
              key="rename"
              label="›"
              placeholder="new name, then Enter"
              submitLabel="rename"
              autoFocus
              value={draft}
              onInput={(value: string) => update($, renameDraftAtom, () => value)}
              onSubmit={(value: string) => renameTo($, value)}
            />
            <Button key="rename-cancel" label="[x]" plain onPress={() => update($, renameOpenAtom, () => false)} />
          </Box>
        )}
      </Box>
    )
    // Journal: the last thirty days, from the records the store keeps.
    const journalOpen = await read($, journalOpenAtom)
    const journal = await read($, journalAtom)
    const today = dayKey(journalOpen ? await $.clock.now().catch(() => 0) : 0, tzOffset ?? 0)
    const sum = summaryOf(journal, today)
    const warmBlockOpen = await read($, journalWarmOpenAtom)
    // Inside the block's border and padding.
    const spark = sum.spark.slice(-Math.max(12, (columns || OPEN.columns) - 1 - 4))
    const cacheEnd = journalOpen && warmBlockOpen ? cacheEndText(cacheAt, cacheTtl.ttl, cacheAt > 0 ? await $.clock.now() : 0, tzOffset ?? 0) : ''
    const warmToggle = (
      <Button
        key="journal-warm"
        label={warmBlockOpen ? '▼ Cache Warming' : '▸ Cache Warming'}
        plain
        onPress={() => update($, journalWarmOpenAtom, o => !o)}
      />
    )
    // A block of its own, as the Skill Box's categories: closed, its button
    // alone; open, a rounded box with the button at its top. Other blocks
    // can follow it.
    const warmBlock = warmBlockOpen ? (
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} width={Math.max(8, (columns || OPEN.columns) - 1)}>
        {warmToggle}
        {/* This session's cache, then the thirty days'. */}
        <Text>{`Cache Read: ${compact(tally.cacheRead)}`}</Text>
        <Text>{`Cache Write: ${compact(tally.cacheWrite)}`}</Text>
        <Text>{`Cache Expires: ${cacheEnd}`}</Text>
        <Text>{`Cache Hit Rate: ${sum.hitRate === undefined ? '—' : `${sum.hitRate.toFixed(1)}%`}`}</Text>
        {/* A day a bar, up to thirty as the box has room for, today last; a
            dot where there is no record. */}
        <Text dimColor wrap="truncate-end">{spark}</Text>
        <Text dimColor wrap="truncate-end">{`${spark.length}d ago${' '.repeat(Math.max(1, spark.length - `${spark.length}d ago`.length - 'today'.length))}today`}</Text>
        <Text>{`Cold Starts: ${sum.cold}${sum.cold > 0 ? ` (${compact(sum.coldTokens)})` : ''}`}</Text>
        <Text>{`Pings: ${sum.pings} · Rescues: ${sum.rescues}`}</Text>
        <Text>{`Saved: ${sum.saved < 0 ? '-' : ''}${compact(Math.round(Math.abs(sum.saved)))}`}</Text>
      </Box>
    ) : (
      <Box flexDirection="row" marginLeft={2}>
        {warmToggle}
      </Box>
    )
    const journalBlock = (
      <Box flexDirection="column">
        {rule}
        {header('Journal', 'journal-toggle', journalOpen, () => update($, journalOpenAtom, o => !o))}
        {journalOpen && (
          <Box flexDirection="column">
            {warmBlock}
          </Box>
        )}
      </Box>
    )
    const rest = { session, stats, models: picker, passive, property, skills: skillBox, tree, monitor, events: eventMessage, journal: journalBlock }

    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      columns = Math.max(1, Math.min(512, e.props.bodyColumns))
      const scene = (
        <Box flexDirection="column">
          <Raster key={SCENE} columns={columns} rows={ROWS} cells={frame(columns, off, tick, isBusy, current, followersOf(followers), sky, partyTick(), { ...faceOf(v, isBusy && !isWaiting), ask: isWaiting, unloading: isUnloading, respawn: respawnTick(), warming: warmingNow(), embers: embersNow(), camp: warmingNow() || embersNow() ? campShown : undefined, campAge: tick - campLit })} />
          {isWaiting && (
            // The bubble's question mark, bold, laid over its middle cell.
            <Box key="ask" position="absolute" top={bubbleCell(columns).row} left={bubbleCell(columns).col}>
              <Text bold color={hex(ASK.mark)} backgroundColor={hex(bubbleFill(tick))}>
                ?
              </Text>
            </Box>
          )}
        </Box>
      )

      return arranged({ ...rest, scene })
    }

    return arranged({ ...rest, scene: line })
  })

  // Dungeon: every Party Combo pressed this session, newest first, each a
  // purple rounded block of its waves; each step a block of its own with the
  // subagent that took it: how it stands, its model and type, how far it has
  // got, and the start of its answer.
  on('ui.render', { component: 'Pane', requestId: SQUAD }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const missions = await read($, squadAtom)
    const open = await read($, squadOpenAtom)
    await read($, squadNowAtom)
    const now = await $.clock.now()
    const paneColumns = e.surface === 'terminal' ? Math.max(12, Math.min(512, e.props.bodyColumns)) : OPEN.columns
    const outer = Math.max(8, paneColumns - 1)
    if (missions.length === 0) {
      return (
        <Box flexDirection="column" width={outer}>
          <Text dimColor wrap="wrap">
            No Party Combo sent yet. Press one in the Skill Box: each of its subagents shows here as it runs.
          </Text>
        </Box>
      )
    }

    // A step's card: its mark and skill, and how it stands; opened (▸ / ▾),
    // its model and type, what it is doing, and its answer. A leader's card is
    // always open, and leading while its mission goes on.
    const runBlock = (key: string, title: string, model: string, agent: string, run: SquadRun | undefined, ended: boolean, width: number, leads = false, missionId?: number) => {
      const leading = leads && !ended && run !== undefined
      const look = leading ? LEADING_LOOK : run ? RUN_LOOK[run.status] : ended ? RUN_LOOK.skipped : RUN_LOOK.waiting
      // A leader's tokens are its mission's coin's, not its card's.
      const tokens = run && !leads && runTokens(run) ? tokensText(runTokens(run)) : ''
      const doing = !run
        ? ''
        : run.status === 'running'
          ? [`step ${run.steps}`, run.tool, elapsed(now - run.startedAt), tokens].filter(Boolean).join(' · ')
          : [elapsed((leading ? now : (run.endedAt ?? now)) - run.startedAt), tokens].filter(Boolean).join(' · ')
      const isOpen = leads || open.includes(key)
      return (
        <Box key={key} flexDirection="column" borderStyle="round" borderColor={look.color ?? BORDER_DIM} paddingX={1} width={width}>
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row" flexShrink={1} minWidth={0}>
              {!leads && (
                <Button
                  key={`${key}-fold`}
                  label={isOpen ? '▾' : '▸'}
                  plain
                  onPress={() => update($, squadOpenAtom, l => (l.includes(key) ? l.filter(k => k !== key) : [...l, key]))}
                />
              )}
              <Text color={look.color} dimColor={look.color === undefined}>{`${leads ? '' : ' '}${look.mark} `}</Text>
              <Text bold wrap="truncate-end">{title}</Text>
            </Box>
            <Box flexDirection="row" flexShrink={0}>
              <Text color={look.color} dimColor={look.color === undefined}>{` ${look.word}`}</Text>
              {/* A running step's [X] calls its subagent back; a leading
                  leader's [Recall], the whole mission. Red under the pointer. */}
              {leading && missionId !== undefined && (
                <Box flexDirection="row">
                  <Text dimColor>{' ['}</Text>
                  <Button key={`${key}-recall`} label="Recall" plain hover={{ scope: `${key}-recall`, color: hex(STOP_RED), bold: true }} onPress={() => recallMission($, missionId)} />
                  <Text dimColor>]</Text>
                </Box>
              )}
              {!leads && run?.status === 'running' && (
                <Box flexDirection="row">
                  <Text dimColor>{' ['}</Text>
                  <Button key={`${key}-stop`} label="X" plain hover={{ scope: `${key}-stop`, color: hex(STOP_RED), bold: true }} onPress={() => recallRun($, run.id)} />
                  <Text dimColor>]</Text>
                </Box>
              )}
            </Box>
          </Box>
          {isOpen && (
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor wrap="truncate-end">{`  ${[model, agent].filter(Boolean).join(' · ')}`}</Text>
              {doing !== '' && <Text dimColor>{` ${doing}`}</Text>}
            </Box>
          )}
          {isOpen &&
            run?.result &&
            resultLines(run.result, 3).map((line, i) => (
              <Text key={`${key}-r${i}`} dimColor wrap="wrap">{`  ${line}`}</Text>
            ))}
        </Box>
      )
    }

    const blocks = [...missions].reverse().map(m => {
      const ended = m.endedAt !== undefined
      const took = m.begunAt !== undefined && ended ? elapsed(m.endedAt! - m.begunAt) : ''
      const spent = tokensOf([m])
      const wavesKey = `mission-${m.id}-waves`
      const wavesOpen = open.includes(wavesKey)
      const steps = m.waves.flatMap(w => w.steps)
      const count = (st: RunStatus) => steps.filter(x => x.run?.status === st).length
      const progress = [
        `${m.waves.length} wave${m.waves.length === 1 ? '' : 's'}`,
        `${count('completed')}/${steps.length} done`,
        count('running') ? `${count('running')} running` : '',
        count('failed') ? `${count('failed')} failed` : '',
        count('stopped') ? `${count('stopped')} stopped` : '',
        m.begunAt === undefined ? 'queued' : '',
        ended && m.outcome !== 'done' && !(m.outcome === 'stopped' && count('stopped')) ? (m.outcome ?? '') : '',
        took,
      ]
        .filter(Boolean)
        .join(' · ')
      const inner = outer - 4
      return (
        <Box key={`mission-${m.id}`} flexDirection="column" borderStyle="round" borderColor={COMBO.banner} paddingX={1} width={outer}>
          {/* The combo's name, [x] at the right taking the mission off the
              tab; under it its number (as its tags carry it), when it was
              sent, how it stands, how long, and its subagents' tokens. */}
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row" backgroundColor={COMBO.banner} paddingX={1} flexShrink={1} minWidth={0}>
              <Text bold color={COMBO.text} wrap="truncate-end">{m.combo}</Text>
            </Box>
            <Box flexDirection="row" flexShrink={0}>
              <Text color={hex(STOP_RED)}>[</Text>
              <Button key={`mission-x-${m.id}`} label="x" plain hover={{ scope: `mission-x-${m.id}`, color: hex(STOP_RED), bold: true }} onPress={() => update($, squadAtom, ms => ms.filter(x => x.id !== m.id))} />
              <Text color={hex(STOP_RED)}>]</Text>
            </Box>
          </Box>
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor wrap="truncate-end">{`#${m.id} · ${dateTimeText(m.sentAt, tzOffset ?? 0)}`}</Text>
            {/* What the whole combo has spent: a gold coin, spinning while it runs. */}
            <Text>
              <Text color={COIN.color} bold>{`${!ended && m.begunAt !== undefined ? COIN.frames[Math.floor(now / COIN.ms) % COIN.frames.length] : COIN.frames[0]} `}</Text>
              <Text color={COIN.color}>{coinText(spent)}</Text>
            </Text>
          </Box>
          {/* The subagent leading it, and in the end its report. */}
          {m.leader && runBlock(`mission-${m.id}-lead`, 'Leader', modelInfo(m.leader.model ?? '').name, '', m.leader, ended, inner, true, m.id)}
          {/* Waves, closed to one line (how far its steps have got) until
              pressed open: each wave, its step cards and its condition, and
              the subagents no step names. */}
          <Box flexDirection="row">
            <Button
              key={`mission-${m.id}-waves`}
              label={`${wavesOpen ? '▾' : '▸'} Waves`}
              plain
              onPress={() => update($, squadOpenAtom, l => (l.includes(wavesKey) ? l.filter(k => k !== wavesKey) : [...l, wavesKey]))}
            />
            <Text dimColor wrap="truncate-end">{` · ${progress}`}</Text>
          </Box>
          {wavesOpen && (
            <Box flexDirection="column" paddingLeft={2}>
              {m.waves.map((w, wi) => (
                <Box key={`mission-${m.id}-w${w.n}`} flexDirection="column">
                  {wi > 0 && <Text dimColor>{'  ↓'}</Text>}
                  <Text bold>
                    {`Wave ${w.n}`}
                    {w.steps.length > 1 && <Text dimColor>{' · all at once'}</Text>}
                  </Text>
                  {w.steps.map((st, si) =>
                    runBlock(`mission-${m.id}-${w.n}-${si}`, `/${st.skill}`, modelName(st.model), agentLabel(st.agent), st.run, ended, inner - 2),
                  )}
                  {w.condition && <Text dimColor wrap="wrap">{`◆ ${w.condition}`}</Text>}
                </Box>
              ))}
              {m.others.length > 0 && (
                <Box flexDirection="column">
                  <Text bold>Other subagents</Text>
                  {m.others.map((r, i) => runBlock(`mission-${m.id}-o${i}`, cleanSummary(r.description || 'subagent'), r.model ? modelInfo(r.model).name : '', '', r, ended, inner - 2))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      )
    })
    return (
      <Box flexDirection="column">
        {/* [Clear All] at the top right takes every mission off the tab. */}
        <Box flexDirection="row" justifyContent="flex-end" width={outer}>
          <Button key="squad-clear" label="[Clear All]" plain onPress={() => update($, squadAtom, () => [])} />
        </Box>
        {blocks}
      </Box>
    )
  })
}
