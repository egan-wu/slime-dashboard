// Dungeon's scene, over its missions: on the left a wooden board keeping how
// many missions this session cleared; in the middle the main slime with its
// sword; on the right the dungeon's keep. While missions go on, the slime
// fights (a bubble at its upper left shows the fight, and how many are going)
// and the keep's portcullis is up, eyes glowing in the dark; with none, the
// slime rests on guard, its sword planted beside it and its eyes on the keep,
// whose portcullis is down.

import { modelInfo, pack, SKY } from './scene'
import type { Overlay } from './scene'

export const DUNGEON_ROWS = 8
const H = DUNGEON_ROWS * 2
const FLOOR_Y = H - 1

const FLOOR = { base: 0x3d3d4a, speck: 0x4a4a58 }
const BOARD = { edge: 0x6b4226, fill: 0x9c6b3f, text: 0xffe8c2, count: 0xffd23f }
const BUBBLE = { fill: 0xf5f5f5, text: 0x101018 }
const MONSTER = { body: 0x7b2cbf, eye: 0xff4d6d, hit: 0xff4d6d }
const SPARK = 0xffd23f
const SWORD = { blade: 0xdfe6ee, tip: 0xffffff, guard: 0xd4a017, grip: 0x6b4226 }
const KEEP = {
  stone: 0x6c757d,
  mortar: 0x495057,
  dark: 0x0b0b14,
  bars: 0x8d8d99,
  eyes: 0xff4d6d,
  bone: 0xe9e4d4,
  banner: 0xa4161a,
  trim: 0xd4a017,
  handle: 0x6b4226,
  flames: [0xff9f1c, 0xffd23f],
}
const EYE = 0x101018

// The main slime, larger than the world's: B body, H its gloss, D its rim, E
// eyes; on guard, settled a little lower, its eyes turned to the keep.
const SLIME = {
  awake: ['..BBBB..', '.BHHBBB.', 'BHBEBBEB', 'DBBBBBBD', 'DBBBBBBD', '.DDDDDD.'],
  guard: ['..BBBB..', '.BHHBBB.', 'BHBBEBEB', 'DBBBBBBD', '.DDDDDD.'],
}
// The board's count, in pixels: 3x5 digits.
const DIGITS = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['.#.', '##.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'],
  ['###', '..#', '.#.', '.#.', '.#.'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
]

// Where the board stands, and the widths of the board, the keep and the
// bubble; the slime with its sword.
const BOARD_X = 1
const BOARD_W = 11
const KEEP_W = 11
const BUBBLE_W = 8
const HERO_W = SLIME.awake[0]!.length + 2

// The scene's frame of the fight: one of four, turning every few ticks.
export const fightFrame = (tick: number) => Math.floor(tick / 3) % 4

// `going`: the missions not yet ended (0: none, the slime rests on guard); `cleared`:
// those done this session; `model`: the main slime's, for its color.
export function dungeonFrame(columns: number, tick: number, model: string, going: number, cleared: number): string {
  const w = Math.max(1, Math.min(512, columns))
  const px = new Uint32Array(w * H).fill(SKY)
  const overlays: Overlay[] = []
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && x < w && y >= 0 && y < H) px[y * w + x] = color
  }
  const text = (x: number, row: number, s: string, fg: number, bg: number) => [...s].forEach((ch, i) => overlays.push({ col: x + i, row, ch, fg, bg }))
  const fighting = going > 0
  const f = fighting ? fightFrame(tick) : 0
  const hit = f % 2 === 1
  // The board at the left, the keep at the right edge (pushed past it when
  // the pane is too narrow for all), the slime midway between them.
  const boardR = BOARD_X + BOARD_W - 1
  const g = Math.max(w - KEEP_W, boardR + HERO_W)
  const sx = boardR + 1 + Math.max(0, Math.floor((g - boardR - 1 - HERO_W) / 2))
  const sr = sx + SLIME.awake[0]!.length - 1

  // The floor, all the pane's width.
  for (let x = 0; x < w; x++) put(x, FLOOR_Y, x % 5 === 0 ? FLOOR.speck : FLOOR.base)

  // The board: a plank on two posts, CLEARED over the count.
  for (let y = 1; y <= 11; y++)
    for (let x = BOARD_X; x <= boardR; x++) put(x, y, y === 1 || y === 11 || x === BOARD_X || x === boardR ? BOARD.edge : BOARD.fill)
  for (let y = 12; y < FLOOR_Y; y++) (put(BOARD_X + 2, y, BOARD.edge), put(boardR - 2, y, BOARD.edge))
  text(BOARD_X + 2, 1, 'CLEARED', BOARD.text, BOARD.fill)
  // The count under it in two pixel digits (`03`; 99 past that), a pixel
  // clear of the words above and of the board's edge all round.
  const count = String(Math.min(cleared, 99)).padStart(2, '0')
  const cx = BOARD_X + 2
  ;[...count].forEach((d, i) =>
    DIGITS[Number(d)]!.forEach((row, dy) => [...row].forEach((c, dx) => c === '#' && put(cx + i * 4 + dx, 5 + dy, BOARD.count))),
  )

  // The keep: a battlemented wall of bricks, a skull over its arched door, a
  // banner and a torch each side, and a portcullis, up while missions go on.
  const door = (x: number, y: number) => y >= 8 && x >= g + 3 && x <= g + 7 && !(y === 8 && (x === g + 3 || x === g + 7))
  for (let y = 1; y < FLOOR_Y; y++) {
    for (let x = g; x < g + KEEP_W; x++) {
      const dx = x - g
      if (y === 1 && (dx === 2 || dx === 3 || dx === 7 || dx === 8)) continue
      const mortar = y === 2 || y % 3 === 0 || (dx + (Math.floor(y / 3) % 2) * 2) % 4 === 0
      put(x, y, door(x, y) ? KEEP.dark : mortar ? KEEP.mortar : KEEP.stone)
    }
  }
  // The portcullis: its bars down to the floor, or drawn up to the arch.
  for (const bx of [g + 4, g + 6]) for (let y = 9; y < (fighting ? 11 : FLOOR_Y); y++) put(bx, y, KEEP.bars)
  if (!fighting) for (let x = g + 3; x <= g + 7; x++) put(x, 11, KEEP.bars)
  // Something waits in the dark while missions go on.
  if (fighting && f !== 3) (put(g + 4, 12, KEEP.eyes), put(g + 6, 12, KEEP.eyes))
  // The skull over the door.
  for (let x = g + 4; x <= g + 6; x++) put(x, 4, KEEP.bone)
  put(g + 4, 5, KEEP.dark)
  put(g + 5, 5, KEEP.bone)
  put(g + 6, 5, KEEP.dark)
  put(g + 4, 6, KEEP.bone)
  put(g + 6, 6, KEEP.bone)
  // Banners, swallow-tailed, and torches under them.
  for (const bx of [g + 1, g + 8]) {
    put(bx, 3, KEEP.trim)
    put(bx + 1, 3, KEEP.trim)
    for (let y = 4; y <= 6; y++) (put(bx, y, KEEP.banner), put(bx + 1, y, KEEP.banner))
    put(bx, 7, KEEP.banner)
  }
  for (const tx of [g + 1, g + 9]) {
    put(tx, 11, KEEP.handle)
    put(tx, 10, KEEP.flames[(Math.floor(tick / 2) + tx) % 2]!)
    if (fighting && f !== 3) put(tx, 9, KEEP.flames[1]!)
  }

  // The slime: hopping as it fights, else resting on guard.
  const info = modelInfo(model)
  const colors: Record<string, number> = { B: info.body, H: info.light, D: info.dark, E: EYE }
  const lift = hit ? 1 : 0
  const sprite = fighting ? SLIME.awake : SLIME.guard
  const top = FLOOR_Y - sprite.length - lift
  sprite.forEach((row, dy) => [...row].forEach((c, dx) => colors[c] !== undefined && put(sx + dx, top + dy, colors[c]!)))

  // The sword: in its right hand, upright or swung toward the keep; at rest,
  // planted in the ground at its side, its hilt to hand.
  const hx = sr + 1
  if (!fighting) {
    put(hx, FLOOR_Y - 8, SWORD.guard)
    put(hx, FLOOR_Y - 7, SWORD.grip)
    for (let x = hx - 1; x <= hx + 1; x++) put(x, FLOOR_Y - 6, SWORD.guard)
    for (let y = FLOOR_Y - 5; y < FLOOR_Y; y++) put(hx, y, SWORD.blade)
  } else {
    const hand = FLOOR_Y - 3 - lift
    put(hx, hand, SWORD.grip)
    if (hit) {
      put(hx - 1, hand - 1, SWORD.guard)
      put(hx + 1, hand + 1, SWORD.guard)
      for (let i = 1; i <= 5; i++) put(hx + i, hand - i, i === 5 ? SWORD.tip : SWORD.blade)
    } else {
      put(hx, hand + 1, SWORD.guard)
      for (let x = hx - 1; x <= hx + 1; x++) put(x, hand - 1, SWORD.guard)
      for (let y = hand - 7; y < hand - 1; y++) put(hx, y, y === hand - 7 ? SWORD.tip : SWORD.blade)
    }
  }

  // The bubble at its upper left: the fight, and how many are going.
  if (fighting) {
    const bx = Math.max(boardR + 2, sx - BUBBLE_W + 3)
    for (let y = 0; y <= 7; y++) {
      for (let x = bx; x < bx + BUBBLE_W; x++) {
        if ((y === 0 || y === 7) && (x === bx || x === bx + BUBBLE_W - 1)) continue
        put(x, y, BUBBLE.fill)
      }
    }
    put(bx + BUBBLE_W - 2, 8, BUBBLE.fill)
    // A little slime lunges at a little monster; a spark where they meet.
    const ms = bx + 1 + (hit ? 1 : 0)
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) put(ms + dx, 3 + dy, info.body)
    const mx = bx + 4
    for (let y = 2; y <= 4; y++) for (let x = mx; x <= mx + 2; x++) put(x, y, hit ? MONSTER.hit : MONSTER.body)
    put(mx + 1, 3, hit ? BUBBLE.fill : MONSTER.eye)
    if (hit) for (const [x, y] of [[mx, 2], [mx - 1, 3], [mx, 3], [mx + 1, 3], [mx, 4]] as const) put(x, y, SPARK)
    const n = `×${Math.min(going, 99)}`
    text(bx + Math.floor((BUBBLE_W - n.length) / 2), 3, n, BUBBLE.text, BUBBLE.fill)
  }

  return pack(px, w, overlays, DUNGEON_ROWS)
}
