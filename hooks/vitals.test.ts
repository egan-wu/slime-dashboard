import { expect, test } from 'claude-code/testing'

import { frame, ROWS } from './scene'
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
  expect(faceOf({ plan: 'subscription', hp: 0, mp: 50, cp: 95 }, true)).toEqual({ eyes: 'x', down: true })
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
