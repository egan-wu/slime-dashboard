import { expect, test } from 'claude-code/testing'

import { colorsFrom, DEFAULT_COLORS, frame, modelInfo, PALETTES, POTION_COLORS, ROWS, setColors, UNLOAD_COLORS, WARM_COLORS, CAMPFIRE_W, EMBER_COLORS, LIGHT, MOUTH } from './scene'
import { faceOf, filledOf, isDown, vitalsOf } from './vitals'

test('a subscription: HP is the seven-day limit left, MP the five-hour one', async () => {
  const v = vitalsOf([{ kind: 'five_hour', percentUsed: 30 }, { kind: 'seven_day', percentUsed: 77 }], 42)
  expect(v).toEqual({ plan: 'subscription', hp: 23, mp: 70, cp: 42 })
})

test('an API key or enterprise seat: no windows, HP always full', async () => {
  expect(vitalsOf([], 12)).toEqual({ plan: 'api', hp: 100, mp: 100, cp: 12 })
  expect(vitalsOf([{ kind: 'spend_limit', percentUsed: 100 }], undefined)).toEqual({ plan: 'api', hp: 100, mp: 100, cp: -1 })
})

test('down when a subscription runs out of HP or MP', async () => {
  expect(isDown(vitalsOf([{ kind: 'five_hour', percentUsed: 100 }, { kind: 'seven_day', percentUsed: 10 }], 5))).toBe(true)
  expect(isDown(vitalsOf([{ kind: 'seven_day', percentUsed: 100 }], 5))).toBe(true)
  expect(isDown(vitalsOf([], 99))).toBe(false)
})

test('the face follows CP while walking, x when down', async () => {
  const at = (cp: number) => ({ plan: 'api' as const, hp: 100, mp: 100, cp })
  expect(faceOf(at(40), true)).toEqual({})
  expect(faceOf(at(50), true)).toEqual({ eyes: '><', vein: false })
  expect(faceOf(at(70), true)).toEqual({ eyes: '><', vein: true })
  expect(faceOf(at(90), true)).toEqual({ eyes: 'TT', vein: true })
  expect(faceOf(at(95), false)).toEqual({})
  expect(faceOf({ plan: 'subscription', hp: 0, mp: 50, cp: 95 }, true)).toEqual({ eyes: 'x', down: true, potions: ['hp'] })
})

test('bars fill by cells', async () => {
  expect(filledOf(23, 5)).toBe(1)
  expect(filledOf(70, 5)).toBe(4)
  expect(filledOf(100, 10)).toBe(10)
  expect(filledOf(-1, 10)).toBe(0)
})

// The characters the scene drew, row by row.
const chars = (cells: string, columns: number) => {
  const bytes = Uint8Array.from(atob(cells), c => c.charCodeAt(0))
  const words = new Uint32Array(bytes.buffer)
  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: columns }, (_, x) => String.fromCharCode(words[(r * columns + x) * 3]!)).join(''),
  ).join('\n')
}
const off = () => ({ cloud: 0, bird: 0, tree: 0, rock: 0, ground: 0 })

test('the scene draws each face on the main slime', async () => {
  const draw = (face: Parameters<typeof frame>[8]) => chars(frame(30, off(), 0, true, 'claude-opus-5-5', [], { day: true, sky: 'cloudy' }, undefined, face), 30)
  expect(draw({ eyes: 'x', down: true })).toMatch(/x.*x/)
  expect(draw({ eyes: '><' })).toMatch(/>.*</)
  expect(draw({ eyes: 'TT', vein: true })).toMatch(/T.*T/)
  expect(draw({ eyes: 'TT', vein: true })).toContain('#')
  expect(draw({})).not.toMatch(/[x#<>T]/)
})

test('out of MP, HP or both: which potions the slime shows', async () => {
  expect(faceOf({ plan: 'subscription', hp: 40, mp: 0, cp: 10 }, true).potions).toEqual(['mp'])
  expect(faceOf({ plan: 'subscription', hp: 0, mp: 0, cp: 10 }, true).potions).toEqual(['mp', 'hp'])
  expect(faceOf({ plan: 'api', hp: 100, mp: 0, cp: 10 }, true).potions).toBeUndefined()
})

test('a thought bubble with the potion rises at the main slime\'s upper left', async () => {
  const pixels = (tick: number, potions: ('hp' | 'mp')[]) => {
    // A yellow Haiku slime, whose colors neither potion shares.
    const cells = frame(30, off(), tick, true, 'claude-haiku-4-5', [], { day: true, sky: 'cloudy' }, undefined, { eyes: 'x', down: true, potions })
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const colors = new Set<number>()
    const spray = (c: Set<number>) => UNLOAD_COLORS.pixels.some(p => c.has(p))
    for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1]!).add(words[i + 2]!)
    return colors
  }
  // The dots rise first; the cloud with the potion follows.
  expect(pixels(0, ['mp']).has(POTION_COLORS.mp.O)).toBe(true)
  expect(pixels(0, ['mp']).has(POTION_COLORS.mp.p)).toBe(false)
  expect(pixels(8, ['mp']).has(POTION_COLORS.mp.p)).toBe(true)
  expect(pixels(8, ['mp']).has(POTION_COLORS.hp.p)).toBe(false)
  expect(pixels(8, ['mp', 'hp']).has(POTION_COLORS.hp.p)).toBe(true)
  expect(pixels(16, ['mp']).has(POTION_COLORS.mp.p)).toBe(false)
})

test('Cache Warming: the idle slime stays awake by a campfire that burns where it is set', async () => {
  const look = (tick: number, face: { warming?: boolean; camp?: number }) => {
    const cells = frame(30, off(), tick, false, 'claude-haiku-4-5', [], { day: true, sky: 'cloudy' }, undefined, face)
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const chars = new Set<number>()
    // The columns any flame color shows in.
    const fire = new Set<number>()
    for (let i = 0; i < words.length; i += 3) {
      chars.add(words[i]!)
      if (WARM_COLORS.some(c => c === words[i + 1] || c === words[i + 2])) fire.add((i / 3) % 30)
    }
    return { fire: [...fire].sort((a, b) => a - b), asleep: chars.has('z'.codePointAt(0)!), cells }
  }
  // Warming keeps it awake; the slime itself carries no flame.
  expect(look(0, {}).asleep).toBe(true)
  expect(look(0, { warming: true }).asleep).toBe(false)
  expect(look(0, { warming: true }).fire).toEqual([])
  // The fire burns at its column, flickering from beat to beat.
  const lit = look(0, { warming: true, camp: 10 })
  expect(lit.fire.length).toBeGreaterThan(0)
  expect(Math.min(...lit.fire)).toBeGreaterThanOrEqual(10)
  expect(Math.max(...lit.fire)).toBeLessThan(10 + CAMPFIRE_W)
  expect(look(2, { warming: true, camp: 10 }).cells).not.toBe(lit.cells)
  // Set further left, it is drawn further left, and off the edge, not at all.
  expect(Math.min(...look(0, { warming: true, camp: 4 }).fire)).toBeLessThan(10)
  expect(look(0, { warming: true, camp: -CAMPFIRE_W }).fire).toEqual([])
})

test('Cache Warming resting: the fire burns down to embers and the slime sleeps beside them', async () => {
  const look = (tick: number) => {
    const cells = frame(30, off(), tick, false, 'claude-haiku-4-5', [], { day: true, sky: 'cloudy' }, undefined, { embers: true, camp: 10 })
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const chars = new Set<number>()
    const colors = new Set<number>()
    const glow = new Set<number>()
    for (let i = 0; i < words.length; i += 3) {
      chars.add(words[i]!)
      colors.add(words[i + 1]!).add(words[i + 2]!)
      if (EMBER_COLORS.some(c => c === words[i + 1] || c === words[i + 2])) glow.add((i / 3) % 30)
    }
    return { asleep: chars.has('z'.codePointAt(0)!), flame: WARM_COLORS.some(c => colors.has(c)), log: colors.has(0x8b5a2b), glow: [...glow], cells }
  }
  const now = look(0)
  expect(now.asleep).toBe(true)
  expect(now.flame).toBe(false)
  expect(now.log).toBe(true)
  expect(Math.min(...now.glow)).toBeGreaterThanOrEqual(10)
  expect(Math.max(...now.glow)).toBeLessThan(10 + CAMPFIRE_W)
  // They glow on slowly, changing every few beats.
  expect(look(6).cells).not.toBe(now.cells)
})

test('lighting the fire: the slime gapes and spits a log, then a flame, and the fire catches', async () => {
  const at = (campAge: number) => {
    const cells = frame(30, off(), 100 + campAge, false, 'claude-haiku-4-5', [], { day: true, sky: 'cloudy' }, undefined, { warming: true, camp: 10, campAge })
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const colors = new Set<number>()
    for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1]!).add(words[i + 2]!)
    return { gape: colors.has(MOUTH.K), log: colors.has(0x8b5a2b), flame: WARM_COLORS.some(c => colors.has(c)) }
  }
  expect(at(1)).toEqual({ gape: true, log: false, flame: false })
  expect(at(LIGHT.logFly + 2).log).toBe(true)
  expect(at(LIGHT.logLand + 1)).toEqual({ gape: false, log: true, flame: false })
  expect(at(LIGHT.flameOpen).gape).toBe(true)
  expect(at(LIGHT.flameFly + 3).flame).toBe(true)
  expect(at(LIGHT.grown + 5)).toEqual({ gape: false, log: true, flame: true })
})

test('unloading wakes a sleeping slime, which flashes, opens its mouth and spits colored pixels under falling arrows', async () => {
  const look = (tick: number, face: { unloading?: boolean }) => {
    const cells = frame(30, off(), tick, false, 'claude-haiku-4-5', [], { day: true, sky: 'cloudy' }, undefined, face)
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const colors = new Set<number>()
    const spray = (c: Set<number>) => UNLOAD_COLORS.pixels.some(p => c.has(p))
    const chars = new Set<number>()
    for (let i = 0; i < words.length; i += 3) {
      chars.add(words[i]!)
      colors.add(words[i + 1]!).add(words[i + 2]!)
    }
    return { colors, pixels: spray(colors), asleep: chars.has('z'.codePointAt(0)!), arrows: chars.has('↓'.codePointAt(0)!) }
  }
  expect(look(0, {}).asleep).toBe(true)
  expect(look(0, {}).pixels).toBe(false)
  expect(look(0, {}).arrows).toBe(false)
  expect(look(2, { unloading: true }).asleep).toBe(false)
  expect(look(2, { unloading: true }).pixels).toBe(true)
  expect(look(2, { unloading: true }).arrows).toBe(true)
  // Green as each spray leaves, every four ticks.
  expect(look(2, { unloading: true }).colors.has(UNLOAD_COLORS.glow.B)).toBe(false)
  expect(look(4, { unloading: true }).colors.has(UNLOAD_COLORS.glow.B)).toBe(true)
  // Its mouth opens only as it spits.
  expect(look(2, { unloading: true }).colors.has(UNLOAD_COLORS.mouth)).toBe(false)
  expect(look(4, { unloading: true }).colors.has(UNLOAD_COLORS.mouth)).toBe(true)
})

test('slime colors: each family wears the palette picked for it, shared or not', async () => {
  expect(modelInfo('claude-opus-5-5').body).toBe(PALETTES.red.body)
  setColors({ ...DEFAULT_COLORS, Opus: 'pink', Haiku: 'pink' })
  expect(modelInfo('claude-opus-5-5')).toEqual({ name: 'Opus 5.5', ...(({ name: _, ...c }) => c)(PALETTES.pink) })
  expect(modelInfo('claude-haiku-4-5').body).toBe(PALETTES.pink.body)
  expect(modelInfo('claude-sonnet-5-5').body).toBe(PALETTES.blue.body)
  setColors(DEFAULT_COLORS)
  expect(colorsFrom({ Opus: 'green', Fable: 'plaid', Other: 'red' })).toEqual({ ...DEFAULT_COLORS, Opus: 'green' })
  expect(colorsFrom(undefined)).toEqual(DEFAULT_COLORS)
})
