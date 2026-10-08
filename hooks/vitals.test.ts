import { expect, test } from 'claude-code/testing'

import { colorsFrom, DEFAULT_COLORS, frame, modelInfo, PALETTES, POTION_COLORS, ROWS, setColors, UNLOAD_COLORS } from './scene'
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

test('a potion ring flashes at the main slime\'s upper left', async () => {
  const pixels = (tick: number, potions: ('hp' | 'mp')[]) => {
    // A yellow Haiku slime, whose colors neither potion shares.
    const cells = frame(30, off(), tick, true, 'claude-haiku-4-5', [], { day: true, sky: 'cloudy' }, undefined, { eyes: 'x', down: true, potions })
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const colors = new Set<number>()
    const spray = (c: Set<number>) => UNLOAD_COLORS.pixels.some(p => c.has(p))
    for (let i = 0; i < words.length; i += 3) colors.add(words[i + 1]!).add(words[i + 2]!)
    return colors
  }
  expect(pixels(0, ['mp']).has(POTION_COLORS.mp.p)).toBe(true)
  expect(pixels(0, ['mp']).has(POTION_COLORS.hp.p)).toBe(false)
  expect(pixels(0, ['mp', 'hp']).has(POTION_COLORS.hp.p)).toBe(true)
  expect(pixels(8, ['mp']).has(POTION_COLORS.mp.p)).toBe(false)
})

test('unloading wakes a sleeping slime, which flashes green, spits colored pixels under falling arrows', async () => {
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
