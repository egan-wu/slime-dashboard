// The slime's world: tiny flat pixel sprites, parallax layers, and the
// packing of a frame into Raster cells (two pixels per cell with half blocks).

export const ROWS = 6
const PX_H = ROWS * 2
const GROUND_Y = PX_H - 1
const SKY = 0x01000000

import { DEFAULT_WEATHER } from './weather'
import type { Weather } from './weather'
import type { Face } from './vitals'

export type Layer = 'cloud' | 'bird' | 'tree' | 'rock' | 'ground'
export type Offsets = Record<Layer, number>

// Pixels per 100 ms tick. Clouds and birds drift even while the slime
// sleeps; trees, rocks and the ground only move while it travels.
const GROUND_SPEED = 0.8
const SPEED: Record<'idle' | 'busy', Offsets> = {
  idle: { cloud: 0.1, bird: 0.3, tree: 0, rock: 0, ground: 0 },
  // Trees and rocks stand on the ground, so they pass with it; only the sky drifts at its own pace.
  busy: { cloud: 0.2, bird: 0.5, tree: GROUND_SPEED, rock: GROUND_SPEED, ground: GROUND_SPEED },
}

export function step(off: Offsets, busy: boolean): void {
  const speed = SPEED[busy ? 'busy' : 'idle']
  for (const layer of Object.keys(off) as Layer[]) off[layer] += speed[layer]
}

export type ModelInfo = { name: string; body: number; light: number; dark: number }

const MODELS: Array<[RegExp, Omit<ModelInfo, 'name'>, string]> = [
  [/fable/i, { body: 0x9b5de5, light: 0xe0cdfb, dark: 0x6a3fb0 }, 'Fable'],
  [/opus/i, { body: 0xe5383b, light: 0xffc2c3, dark: 0xa4161a }, 'Opus'],
  [/sonnet/i, { body: 0x3a86ff, light: 0xc6ddff, dark: 0x1f4fb3 }, 'Sonnet'],
  [/haiku/i, { body: 0xffc300, light: 0xfff3c2, dark: 0xb38600 }, 'Haiku'],
]
const UNKNOWN = { body: 0x52b788, light: 0xc7ebd6, dark: 0x2d6a4f }

export function modelInfo(model: string): ModelInfo {
  for (const [pattern, colors, family] of MODELS) {
    if (!pattern.test(model)) continue
    const version = model.match(new RegExp(`${family}[-\\s]?(\\d+)(?:[-.](\\d{1,2})(?!\\d))?`, 'i'))
    const name = version ? `${family} ${version[1]}${version[2] ? `.${version[2]}` : ''}` : family
    return { name, ...colors }
  }
  return { name: model || '…', ...UNKNOWN }
}

export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

type Sprite = { rows: string[]; colors: Record<string, number> }

// H is the glossy highlight, E the eyes, D the shaded rim. Asleep, the eyes
// are drawn over the body as '-' characters (see SLEEP_EYES).
const SLIME = {
  awake: ['.BHBB.', 'DEBBED', 'DBBBBD'],
  // The crawl's other frame: a 2px tuft pops up on the crown, so the head
  // flickers as it goes.
  crawl: ['..BB..', '.BHBB.', 'DEBBED', 'DBBBBD'],
  // Off the ground the tuft stays up and the underside rounds out; both
  // settle again on landing.
  air: ['..BB..', '.BHBB.', 'DEBBED', 'DBBBBD', '.DDDD.'],
  sleep: ['.BHBB.', 'DBBBBD', 'DBBBBD'],
}
// A subagent's little slime, trailing the main one: a 2x2 ball in the air
// that flattens on landing and springs back.
const MINI = { ball: ['BB', 'BB'], flat: ['BBBB'] }
const MINI_HOP = [
  { rows: MINI.flat, lift: 0 },
  { rows: MINI.ball, lift: 0 },
  { rows: MINI.ball, lift: 1 },
  { rows: MINI.ball, lift: 2 },
  { rows: MINI.ball, lift: 3 },
  { rows: MINI.ball, lift: 2 },
  { rows: MINI.ball, lift: 1 },
  { rows: MINI.ball, lift: 0 },
]
const MINI_GAP = 6
// Ticks each follower lags the one ahead of it, so a hop rolls down the line
// as a wave instead of alternating.
const WAVE_LAG = 1


const TREE: Sprite = {
  rows: ['.GGG.', 'GGGGG', 'GGgGG', 'GgGGG', '.GGG.', '..T..', '..T..'],
  colors: { G: 0x2d9a4e, g: 0x1f6f38, T: 0x7a5230 },
}
const ROCK: Sprite = { rows: ['.rR.', 'RRRR'], colors: { R: 0x8d8d99, r: 0xb8b8c4 } }
const CLOUD: Sprite = { rows: ['..CCC...', 'CCCCCCCC'], colors: { C: 0xd9dce3 } }
const BIRDS: Sprite[] = [
  { rows: ['K.K', '.K.'], colors: { K: 0x8a8a8a } },
  { rows: ['.K.', 'K.K'], colors: { K: 0x8a8a8a } },
]

// `sparse` items stay away on a clear day; `overcast` ones only come with
// cloud, rain or snow.
type Item = { x: number; y?: number; sparse?: true; overcast?: true }
type Band = { layer: Layer; span: number; items: Item[]; sprite: Sprite }

// Trees and rocks are scattered rather than repeating: the ground is cut into
// `span`-pixel stretches, and each stretch holds one at a spot of its own
// (`jitter` pixels of play), or, one time in `skip`, none at all. The same
// stretch always comes out the same, so a scene scrolls back and forth stably.
type Scatter = { layer: 'tree' | 'rock'; sprite: Sprite; span: number; jitter: number; skip: number; seed: number }
const SCATTER: Scatter[] = [
  { layer: 'tree', sprite: TREE, span: 40, jitter: 30, skip: 4, seed: 0x7ee },
  { layer: 'rock', sprite: ROCK, span: 48, jitter: 34, skip: 3, seed: 0x60c },
]
const unit = (n: number, seed: number) => (Math.imul((n ^ seed) | 0, 2654435761) >>> 0) / 2 ** 32

// World x of every tree or rock whose left edge lies in [from, to).
export function scattered(layer: 'tree' | 'rock', from: number, to: number): number[] {
  const sc = SCATTER.find(s => s.layer === layer)!
  const found: number[] = []
  for (let k = Math.floor(from / sc.span) - 1; k * sc.span < to; k++) {
    if (Math.floor(unit(k, sc.seed) * sc.skip) === 0) continue
    const x = k * sc.span + Math.floor(unit(k, sc.seed * 3 + 1) * sc.jitter)
    if (x >= from && x < to) found.push(x)
  }
  return found
}

// Each band repeats every `span` pixels so scrolling wraps seamlessly.
const BANDS: Band[] = [
  { layer: 'cloud', span: 40, sprite: CLOUD, items: [{ x: 3, y: 0 }, { x: 22, y: 2, sparse: true }, { x: 13, y: 1, overcast: true }] },
  { layer: 'bird', span: 60, sprite: BIRDS[0]!, items: [{ x: 14, y: 5 }, { x: 44, y: 6 }] },
]

// Rocks are obstacles: a slime whose columns a rock is passing under clears
// it with one empty pixel between them, rising a pixel per column on the way
// up and down. Zero means no rock is near and the slime hops as usual.
const ROCK_W = ROCK.rows[0]!.length
const ROCK_CLEAR = ROCK.rows.length + 1

export function rockLift(left: number, width: number, rocks: number[]): number {
  let lift = 0
  for (const rx of rocks) {
    const gap = rx > left + width - 1 ? rx - (left + width - 1) : rx + ROCK_W - 1 < left ? left - (rx + ROCK_W - 1) : 0
    lift = Math.max(lift, ROCK_CLEAR - gap)
  }
  return lift
}

const SUN: Sprite = { rows: ['.Y.', 'YYY', '.Y.'], colors: { Y: 0xffd166 } }
const MOON: Sprite = { rows: ['MM.', 'M..', 'MM.'], colors: { M: 0xf1f1d0 } }
// Stars are yellow '*' characters in the top two cell rows, each blinking on
// its own beat; a partly cloudy night shows every other one.
const STARS = [
  { col: 3, row: 0 },
  { col: 11, row: 1 },
  { col: 18, row: 0 },
  { col: 24, row: 1 },
]
const STAR = { bright: 0xffd166, dim: 0x9a7d2e }
const RAIN = 0x6fa8dc
const SNOWFLAKE = 0xf5f5f5

// Cloud color by time of day and how heavy the sky is.
const CLOUD_TONE = {
  day: { light: 0xd9dce3, heavy: 0x9ea3ad },
  night: { light: 0x5c6170, heavy: 0x464a55 },
}

const hash = (n: number) => (Math.imul(n | 0, 2654435761) >>> 0) % 97

// The treasure chest the troop finds once every subagent has come home.
const WOOD = { L: 0xb07b4f, B: 0x8b5a2b, G: 0xd4a017, Y: 0xffe066 }
const CHEST = {
  shut: { rows: ['.LLL.', 'LLLLL', 'GGYGG', 'BBBBB'], colors: WOOD },
  // Lid thrown back, treasure heaped up and glowing inside.
  open: { rows: ['LLLLL', '.YYY.', 'GGYGG', 'BBBBB'], colors: WOOD },
}
const FLASH = { white: 0xffffff, gold: 0xffe066 }
// The burst as the lid flies open: rays shoot out from the chest's mouth
// one pixel a tick, white at the tip, gold behind it.
const RAYS = [
  [0, -1],
  [-1, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
] as const
const RAY_TICKS = 6
const CHEST_W = 5

// The find, tick by tick: the chest rolls in from the right while the troop
// slides left until the main slime stands mid-pane; the chest shakes and pops
// open; everyone hops for joy; then the troop slides back to its place on the
// right as the chest scrolls away behind it.
const PARTY_OPEN = 12
const PARTY_CHEER = 24
const PARTY_RETURN = 15
const CHEER_LIFT = [0, 1, 2, 3, 3, 2, 1, 0]

type PartyFrame = {
  cx: number
  chestX: number
  chestOpen: boolean
  scrolling: boolean
  // Set while cheering: how high the main slime is off the ground.
  cheer?: number
  // Ticks since the lid opened, once it has.
  sinceOpen?: number
  // Ticks since the staying slime set off to hop into the main one.
  mergeAge?: number
}

// `troop` is how many little slimes follow; the main slime stops mid-pane, or
// further right when that would push the last of them off the left edge.
// With a little slime along, the main one waits for it to hop in before it
// sets off home: the merge, then a beat.
const mergePhase = (troop: number) => (troop > 0 ? MERGE_TICKS + 3 : 0)

function partyTimes(w: number, troop: number) {
  const home = Math.max(6, w - 8)
  const room = troop > 0 ? 9 + (troop - 1) * MINI_GAP : 6
  const center = Math.min(home, Math.max(w >> 1, room))
  const target = center + 5
  const approach = Math.max(1, Math.ceil((w + 1 - target) / GROUND_SPEED))
  const leave = Math.ceil((target + CHEST_W + 1) / GROUND_SPEED)
  return { home, center, target, approach, leave }
}

export function partyLength(columns: number, troop = 0): number {
  const { approach, leave } = partyTimes(Math.max(1, Math.min(512, columns)), troop)
  return approach + PARTY_OPEN + PARTY_CHEER + mergePhase(troop) + leave
}

export function partyFrame(columns: number, t: number, troop = 0): PartyFrame {
  const w = Math.max(1, Math.min(512, columns))
  const { home, center, target, approach, leave } = partyTimes(w, troop)
  const toward = (from: number, to: number, k: number) => Math.round(from + (to - from) * Math.min(1, k))
  if (t < approach) {
    return { cx: toward(home, center, t / approach), chestX: Math.round(w + 1 - GROUND_SPEED * t), chestOpen: false, scrolling: true }
  }
  t -= approach
  if (t < PARTY_OPEN) {
    const opened = t >= PARTY_OPEN / 2
    return {
      cx: center,
      chestX: target + (!opened && t % 2 === 1 ? 1 : 0),
      chestOpen: opened,
      scrolling: false,
      sinceOpen: opened ? t - PARTY_OPEN / 2 : undefined,
    }
  }
  t -= PARTY_OPEN
  if (t < PARTY_CHEER) {
    return {
      cx: center,
      chestX: target,
      chestOpen: true,
      scrolling: false,
      cheer: CHEER_LIFT[t % CHEER_LIFT.length]!,
      sinceOpen: PARTY_OPEN / 2 + t,
    }
  }
  t -= PARTY_CHEER
  const merge = mergePhase(troop)
  if (t < merge) {
    return { cx: center, chestX: target, chestOpen: true, scrolling: false, sinceOpen: PARTY_OPEN / 2 + PARTY_CHEER + t, mergeAge: t }
  }
  t -= merge
  return {
    cx: toward(center, home, t / Math.min(PARTY_RETURN, leave)),
    chestX: Math.round(target - GROUND_SPEED * t),
    chestOpen: true,
    scrolling: true,
    sinceOpen: PARTY_OPEN / 2 + PARTY_CHEER + merge + t,
    mergeAge: merge + t,
  }
}

export const partyScrolling = (columns: number, t: number, troop = 0) => partyFrame(columns, t, troop).scrolling

type Overlay = { col: number; row: number; ch: string; fg: number; bg?: number }

// Columns of the eyes from the sleeping sprite's left edge. Each closed eye
// is a character on a body-colored cell holding its middle row: '-' when that
// row is the cell's top half, '_' (drawn at the cell's foot) when it is the
// bottom, so the line always sits just under the middle row.
const SLEEP_EYES = [1, 4]
// The awake face's two eye characters, left then right, and the vein's color.
const FACE_EYES = { x: ['x', 'x'], '><': ['>', '<'], TT: ['T', 'T'] } as const
const VEIN = 0xff6b6b
const ZZZ = [
  { dx: 2, ch: 'z' },
  { dx: 3, ch: 'Z' },
  { dx: 4, ch: 'z' },
]

const tintOf = (model: string) => {
  const info = modelInfo(model)
  return { B: info.body, H: info.light, D: info.dark, E: 0x101018 }
}

// A little slime in the troop: its subagent's model; while it is still
// budding off the main slime, the ticks since it began (negative: its turn
// to come out has not arrived yet); its place in line, which may be between
// two places while it closes a gap; and, once its subagent has handed back,
// how it is dropping out: the ticks since, and the x it stood at then.
export type Follower =
  | string
  | { model: string; age?: number; pos?: number; leave?: { age: number; x: number }; stay?: true }

// The last little slime home stays (`stay`) to open the chest with the main
// slime, then hops into its body and is gone: MERGE_TICKS from leaving its
// place to vanishing inside.
const MERGE_TICKS = 10

// Pixels a tick a little slime falls back once it has dropped out of line.
const LEAVE_SPEED = GROUND_SPEED

// Where a little slime stands in line `pos` behind a main slime centred at `cx`.
export const slotOf = (cx: number, pos: number) => Math.round(cx - 9 - pos * MINI_GAP)
export const homeCx = (columns: number) => Math.max(6, Math.max(1, Math.min(512, columns)) - 8)

// Ticks a little slime takes to bud off the main slime's back and roll to its place.
export const EMERGE_TICKS = 12

// `minions` holds each subagent's slime, oldest first.
export function frame(
  columns: number,
  off: Offsets,
  tick: number,
  busy: boolean,
  model: string,
  minions: readonly Follower[] = [],
  weather: Weather = DEFAULT_WEATHER,
  // Ticks since the troop found its treasure chest; undefined on a normal day.
  party?: number,
  // How the main slime is holding up (vitals.ts): down, or straining under a full context.
  face: Face = {},
): string {
  const w = Math.max(1, Math.min(512, columns))
  const inLine = minions.filter(f => typeof f === 'string' || f.leave === undefined).length
  const fete = party === undefined ? undefined : partyFrame(w, party, inLine)
  // The main slime keeps to the right so its followers have room behind it.
  const cx = fete?.cx ?? Math.max(6, w - 8)
  // During the find the troop is wide awake whatever the session is doing.
  // Down, it stands still and wide awake: nothing passes until a limit resets.
  const awake = busy || fete !== undefined || face.down === true
  const travelling = fete ? fete.scrolling : busy && !face.down
  const px = new Uint32Array(w * PX_H).fill(SKY)
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && x < w && y >= 0 && y < PX_H) px[y * w + x] = color
  }
  const draw = (sprite: Sprite, x: number, bottom: number) => {
    const top = bottom - sprite.rows.length + 1
    sprite.rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const color = sprite.colors[row[dx]!]
        if (color !== undefined) put(x + dx, top + dy, color)
      }
    })
  }

  const overcast = weather.sky === 'cloudy' || weather.sky === 'rain' || weather.sky === 'snow'

  // Sun by day, moon and twinkling stars by night, unless cloud hides them.
  if (!overcast) {
    if (weather.day) draw(SUN, w - 5, 2)
    else {
      draw(MOON, w - 5, 2)
    }
  }

  const tone = CLOUD_TONE[weather.day ? 'day' : 'night'][overcast ? 'heavy' : 'light']
  const cloud: Sprite = { rows: CLOUD.rows, colors: { C: tone } }
  // Birds are out only on a dry day.
  const birds = weather.day && weather.sky !== 'rain' && weather.sky !== 'snow'

  const rocks: number[] = []
  for (const band of BANDS) {
    if (band.layer === 'bird' && !birds) continue
    const shift = Math.floor(off[band.layer]) % band.span
    for (const item of band.items) {
      if (item.sparse && weather.sky === 'clear') continue
      if (item.overcast && !overcast) continue
      for (let t = 0; item.x + t * band.span - shift < w; t++) {
        const x = item.x + t * band.span - shift
        if (band.layer === 'bird') draw(BIRDS[Math.floor(tick / 4 + item.x) % 2]!, x, item.y ?? 0)
        else if (band.layer === 'cloud') draw(cloud, x, (item.y ?? 0) + 1)
        else draw(band.sprite, x, GROUND_Y - 1)
      }
    }
  }
  for (const sc of SCATTER) {
    const at = Math.floor(off[sc.layer])
    const width = sc.sprite.rows[0]!.length
    for (const worldX of scattered(sc.layer, at - width + 1, at + w)) {
      draw(sc.sprite, worldX - at, GROUND_Y - 1)
      if (sc.layer === 'rock') rocks.push(worldX - at)
    }
  }

  // Rain falls straight and fast; snow drifts down slowly, swaying a pixel.
  if (weather.sky === 'rain' || weather.sky === 'snow') {
    const snow = weather.sky === 'snow'
    for (let x = 0; x < w; x++) {
      if (hash(x + 11) % (snow ? 5 : 4) !== 0) continue
      const fall = (snow ? Math.floor(tick / 3) : tick) + hash(x + 7)
      const sway = snow && Math.floor(fall / 4) % 2 === 1 ? 1 : 0
      put(x + sway, fall % GROUND_Y, snow ? SNOWFLAKE : RAIN)
    }
  }

  // A strip of grass; every eighth pixel is darker so motion shows.
  const ground = Math.floor(off.ground)
  for (let x = 0; x < w; x++) put(x, GROUND_Y, (x + ground) % 8 === 0 ? 0x4f772d : 0x6a994e)

  const overlays: Overlay[] = []
  if (fete) {
    const since = fete.sinceOpen
    if (since === undefined) draw(CHEST.shut, fete.chestX, GROUND_Y - 1)
    else {
      // The heap of treasure glints white every other beat while the troop is near.
      const glint = !fete.scrolling && Math.floor(since / 2) % 2 === 0
      draw({ rows: CHEST.open.rows, colors: { ...WOOD, Y: glint ? FLASH.white : WOOD.Y } }, fete.chestX, GROUND_Y - 1)
      if (since < RAY_TICKS) {
        const mouthX = fete.chestX + 2
        const mouthY = GROUND_Y - 3
        for (const [dx, dy] of RAYS) {
          const reach = since + 2
          put(mouthX + dx * reach, mouthY + dy * reach, FLASH.white)
          put(mouthX + dx * (reach - 1), mouthY + dy * (reach - 1), FLASH.gold)
        }
      }
    }
    // Sparkles over the open chest while the troop cheers.
    if (fete.cheer !== undefined) {
      const beat = Math.floor((party ?? 0) / 3) % 2
      const sparkles = beat === 0 ? [{ dx: 1, row: 2 }, { dx: 4, row: 1 }] : [{ dx: 3, row: 2 }, { dx: 0, row: 1 }]
      for (const sp of sparkles) overlays.push({ col: fete.chestX + sp.dx, row: sp.row, ch: '*', fg: STAR.bright })
    }
  }

  const mainLeft = cx - (SLIME.awake[0]!.length >> 1)
  let line = 0
  minions.forEach(f => {
    const m = typeof f === 'string' ? f : f.model
    const leave = typeof f === 'string' ? undefined : f.leave
    if (leave) {
      // Dropped out: it stops following and falls back off the left edge,
      // still bobbing, while the troop goes on without it.
      const x = Math.round(leave.x - LEAVE_SPEED * leave.age)
      if (x + 4 <= 0) return
      const hop = MINI_HOP[leave.age % MINI_HOP.length]!
      draw({ rows: hop.rows, colors: tintOf(m) }, x + ((4 - hop.rows[0]!.length) >> 1), GROUND_Y - 1 - hop.lift)
      return
    }
    const i = line++
    const age = typeof f === 'string' ? undefined : f.age
    const slot = slotOf(cx, (typeof f === 'string' ? undefined : f.pos) ?? i)
    const merge = typeof f !== 'string' && f.stay ? fete?.mergeAge : undefined
    if (merge !== undefined) {
      // Hopping home: a high arc from its place into the main slime's back,
      // shrinking as it sinks in (drawn under the main slime, so it vanishes).
      if (merge >= MERGE_TICKS) return
      const k = merge / MERGE_TICKS
      const rows = merge >= MERGE_TICKS - 2 ? ['B'] : merge >= MERGE_TICKS - 4 ? ['BB'] : MINI.ball
      const fromX = slot + 1
      const toX = mainLeft + 2
      const lift = Math.round(Math.sin(k * Math.PI) * 4)
      draw({ rows, colors: tintOf(m) }, Math.round(fromX + (toX - fromX) * k), GROUND_Y - 1 - lift)
      return
    }
    if (age !== undefined && age < EMERGE_TICKS) {
      // Budding: a speck inside the main slime's body (drawn under it) swells
      // to a ball as it rolls out of its back in a little arc to its place.
      if (age < 0) return
      const k = age / EMERGE_TICKS
      const rows = age < 3 ? ['B'] : age < 5 ? ['BB'] : MINI.ball
      const fromX = mainLeft + 2
      const toX = slot + ((4 - rows[0]!.length) >> 1)
      const lift = Math.round(Math.sin(k * Math.PI) * 2)
      draw({ rows, colors: tintOf(m) }, Math.round(fromX + (toX - fromX) * k), GROUND_Y - 1 - lift)
      return
    }
    if (slot + 4 <= 0) return
    const phase = (((tick - (i + 1) * WAVE_LAG) % MINI_HOP.length) + MINI_HOP.length) % MINI_HOP.length
    let hop = awake ? MINI_HOP[phase]! : { rows: MINI.ball, lift: 0 }
    const over = travelling ? rockLift(slot + 1, MINI.ball[0]!.length, rocks) : 0
    if (over > 0) hop = { rows: MINI.ball, lift: over }
    const left = slot + ((4 - hop.rows[0]!.length) >> 1)
    draw({ rows: hop.rows, colors: tintOf(m) }, left, GROUND_Y - 1 - hop.lift)
  })

  const info = modelInfo(model)
  const tint = tintOf(model)
  if (fete && !fete.scrolling) {
    // Standing by the chest: still while it opens, then hopping for joy; the
    // tuft pops up for a gulp as the little one sinks in.
    const lift = fete.cheer ?? 0
    const gulp = fete.mergeAge !== undefined && Math.abs(fete.mergeAge - MERGE_TICKS) <= 1
    const rows = lift > 0 ? SLIME.air : gulp ? SLIME.crawl : SLIME.awake
    draw({ rows, colors: tint }, cx - (rows[0]!.length >> 1), GROUND_Y - 1 - lift)
  } else if (awake) {
    // The main slime crawls along the ground and only leaves it to clear a rock.
    const width = SLIME.awake[0]!.length
    const left = cx - (width >> 1)
    const lift = rockLift(left, width, rocks)
    const rows = face.down
      ? SLIME.awake
      : lift > 0
        ? SLIME.air
        : Math.floor(tick / 2) % 2 === 0
          ? SLIME.awake
          : SLIME.crawl
    const bottom = GROUND_Y - 1 - lift
    draw({ rows, colors: tint }, left, bottom)
    // The face goes over the eyes as characters, as the sleeping eyes do: a
    // cell holds the eye pixel and the body pixel beside it, so the
    // character sits on the body's color.
    const top = bottom - rows.length + 1
    if (face.eyes) {
      const eyeY = top + rows.findIndex(row => row.includes('E'))
      const eyeRow = rows.find(row => row.includes('E'))!
      const [l, r] = FACE_EYES[face.eyes]
      const cols = [...eyeRow].flatMap((ch, dx) => (ch === 'E' ? [dx] : []))
      cols.forEach((dx, i) =>
        overlays.push({ col: left + dx, row: eyeY >> 1, ch: i === 0 ? l : r, fg: 0x101018, bg: info.body }),
      )
    }
    if (face.vein) overlays.push({ col: left - 1, row: top >> 1, ch: '#', fg: VEIN })
  } else {
    const rows = SLIME.sleep
    const left = cx - (rows[0]!.length >> 1)
    draw({ rows, colors: tint }, left, GROUND_Y - 1)
    const eyeY = GROUND_Y - 2
    const eyeRow = eyeY >> 1
    const eye = eyeY % 2 === 0 ? '-' : '_'
    for (const dx of SLEEP_EYES) overlays.push({ col: left + dx, row: eyeRow, ch: eye, fg: 0x101018, bg: info.body })
    // z, zZ, zZz, then nothing, and around again.
    const shown = (Math.floor(tick / 5) + 1) % 4
    for (const z of ZZZ.slice(0, shown)) overlays.push({ col: cx + z.dx, row: eyeRow - 1, ch: z.ch, fg: 0x9a9ab0 })
  }

  // Stars go last, and only into cells of open sky, so cloud and moon hide them.
  if (!weather.day && !overcast) {
    STARS.forEach((star, i) => {
      if (weather.sky === 'partly' && i % 2 === 1) return
      if (star.col >= w - 6) return
      const open = px[2 * star.row * w + star.col] === SKY && px[(2 * star.row + 1) * w + star.col] === SKY
      const beat = (Math.floor(tick / 5) + i * 3) % 4
      if (!open || beat === 0) return
      overlays.push({ ...star, ch: '*', fg: beat === 1 ? STAR.dim : STAR.bright })
    })
  }

  return pack(px, w, overlays)
}

function pack(px: Uint32Array, w: number, overlays: Overlay[]): string {
  const words = new Uint32Array(w * ROWS * 3)
  for (let row = 0; row < ROWS; row++) {
    for (let x = 0; x < w; x++) {
      const top = px[2 * row * w + x]!
      const bottom = px[(2 * row + 1) * w + x]!
      const i = (row * w + x) * 3
      if (top === SKY && bottom === SKY) words.set([0x20, SKY, SKY], i)
      else if (top === SKY) words.set([0x2584, bottom, SKY], i)
      else words.set([0x2580, top, bottom], i)
    }
  }
  for (const o of overlays) {
    if (o.col < 0 || o.col >= w || o.row < 0 || o.row >= ROWS) continue
    words.set([o.ch.charCodeAt(0), o.fg, o.bg ?? SKY], (o.row * w + o.col) * 3)
  }
  return base64(new Uint8Array(words.buffer))
}

function base64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (native) return native.call(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
