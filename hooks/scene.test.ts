import { expect, test } from 'claude-code/testing'

import { EMERGE_TICKS, frame, modelInfo, partyFrame, partyLength, rockLift, ROWS, scattered, step, treeKind } from './scene'
import type { Offsets } from './scene'
import { parseWeather } from './weather'

const fresh = (): Offsets => ({ cloud: 0, bird: 0, tree: 0, rock: 0, ground: 0 })

test('idle: clouds and birds drift, trees and rocks stay', async () => {
  const off = fresh()
  for (let i = 0; i < 10; i++) step(off, false)
  expect(off.cloud).toBeGreaterThan(0)
  expect(off.bird).toBeGreaterThan(0)
  expect(off.tree).toBe(0)
  expect(off.rock).toBe(0)
  expect(off.ground).toBe(0)
})

test('busy: trees and rocks pass with the ground, clouds and birds at their own pace', async () => {
  const off = fresh()
  for (let i = 0; i < 10; i++) step(off, true)
  expect(off.tree).toBe(off.ground)
  expect(off.rock).toBe(off.ground)
  expect(off.cloud).toBeGreaterThan(0)
  expect(off.bird).toBeGreaterThan(0)
  expect(new Set([off.cloud, off.bird, off.ground]).size).toBe(3)
})

test('slime color follows the model', async () => {
  expect(modelInfo('claude-fable-5-1')).toMatchObject({ name: 'Fable 5.1', body: 0x9b5de5 })
  expect(modelInfo('claude-opus-5-5')).toMatchObject({ name: 'Opus 5.5', body: 0xe5383b })
  expect(modelInfo('claude-sonnet-5-5')).toMatchObject({ name: 'Sonnet 5.5', body: 0x3a86ff })
  expect(modelInfo('claude-haiku-4-5-20251001')).toMatchObject({ name: 'Haiku 4.5', body: 0xffc300 })
})

test('a frame holds columns × rows cells', async () => {
  for (const busy of [true, false]) {
    const cells = frame(40, fresh(), 3, busy, 'claude-opus-5-5')
    expect(atob(cells).length).toBe(40 * ROWS * 12)
  }
})

test('each subagent adds a little slime behind the main one', async () => {
  const cells = (minions: string[]) => atob(frame(40, fresh(), 3, true, 'claude-opus-5-5', minions))
  expect(cells(['claude-haiku-4-5-20251001'])).not.toBe(cells([]))
  expect(cells(['claude-haiku-4-5-20251001', 'claude-sonnet-5-5'])).not.toBe(cells(['claude-haiku-4-5-20251001']))
})

test('slimes leap over rocks with one pixel to spare', async () => {
  // A 6-wide slime over x 10..15 and a 4-wide, 2-tall rock.
  expect(rockLift(10, 6, [12])).toBe(3) // rock under it: 1 px gap above the rock
  expect(rockLift(10, 6, [15])).toBe(3) // overlapping the right edge
  expect(rockLift(10, 6, [7])).toBe(3) // overlapping the left edge
  expect(rockLift(10, 6, [16])).toBe(2) // one column ahead: lifting off
  expect(rockLift(10, 6, [17])).toBe(1)
  expect(rockLift(10, 6, [6])).toBe(2) // one column behind: landing
  expect(rockLift(10, 6, [5])).toBe(1)
  expect(rockLift(10, 6, [20])).toBe(0) // far away: normal hop
})

test('weather: wttr.in reply to day or night and a sky', async () => {
  const reply = (symbol: string, now: string) => `${symbol}|05:50:42|17:38:27|${now}+0800\n`
  expect(parseWeather(reply('o', '10:00:00'))).toEqual({ day: true, sky: 'clear' })
  expect(parseWeather(reply('m', '19:58:04'))).toEqual({ day: false, sky: 'partly' })
  expect(parseWeather(reply('mmm', '13:00:00'))).toEqual({ day: true, sky: 'cloudy' })
  expect(parseWeather(reply('//', '12:15:00'))).toEqual({ day: true, sky: 'rain' })
  expect(parseWeather(reply('*/*', '05:00:00'))).toEqual({ day: false, sky: 'snow' })
  expect(parseWeather('Unknown location; please try ~40.7,-74.0')).toBe(undefined)
})

test('day and night skies draw differently', async () => {
  const at = (day: boolean) => atob(frame(32, fresh(), 3, false, 'claude-opus-5-5', [], { day, sky: 'clear' }))
  expect(at(true)).not.toBe(at(false))
})

test('treasure chest: troop slides to center, chest opens, cheer, back home', async () => {
  const w = 32
  const total = partyLength(w)
  const first = partyFrame(w, 0)
  expect(first.cx).toBe(w - 8)
  expect(first.chestX).toBeGreaterThan(w - 1)
  expect(first.scrolling).toBe(true)

  const frames = Array.from({ length: total }, (_, t) => partyFrame(w, t))
  const opened = frames.findIndex(f => f.chestOpen)
  expect(opened).toBeGreaterThan(0)
  expect(frames[opened]!.cx).toBe(w >> 1)
  expect(frames[opened]!.scrolling).toBe(false)
  expect(frames.some(f => (f.cheer ?? 0) > 0)).toBe(true)

  const last = frames[total - 1]!
  expect(last.cx).toBe(w - 8)
  expect(last.chestX).toBeLessThan(-4)
  expect(atob(frame(w, fresh(), 0, false, 'claude-opus-5-5', ['claude-haiku-4-5'], undefined, opened + 15)).length).toBe(w * ROWS * 12)

  // With three followers the main slime stops far enough right to keep all of them on screen.
  const crowd = Array.from({ length: partyLength(w, 3) }, (_, t) => partyFrame(w, t, 3)).find(f => f.chestOpen)!
  expect(crowd.cx - 9 - 2 * 6).toBeGreaterThan(-1)
})

test('trees and rocks come at uneven distances, never crowding a jump', async () => {
  for (const layer of ['tree', 'rock'] as const) {
    const xs = scattered(layer, 0, 2000)
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!)
    expect(xs.length).toBeGreaterThan(20)
    expect(new Set(gaps).size).toBeGreaterThan(5)
    expect(Math.min(...gaps)).toBeGreaterThan(9)
  }
  // The same stretch of ground always holds the same things.
  expect(scattered('rock', 100, 400)).toEqual(scattered('rock', 100, 400))
})

test('a new little slime buds off the main one instead of popping in', async () => {
  const at = (age: number | undefined) => atob(frame(32, fresh(), 3, true, 'claude-opus-5-5', [{ model: 'claude-haiku-4-5', age }]))
  const none = atob(frame(32, fresh(), 3, true, 'claude-opus-5-5', []))
  const words = (s: string) => new Uint32Array(Uint8Array.from(s, c => c.charCodeAt(0)).buffer)
  expect(words(at(-4)).some((v, i) => i % 3 !== 0 && v === 0xffc300)).toBe(false) // waiting its turn: not drawn yet
  expect(at(EMERGE_TICKS / 2)).not.toBe(at(undefined)) // halfway out, not yet in place
  expect(at(EMERGE_TICKS / 2)).not.toBe(none)
})

test('a finished little slime drops out of line and falls back out of sight', async () => {
  const scene = (followers: Parameters<typeof frame>[5]) => atob(frame(32, fresh(), 3, true, 'claude-opus-5-5', followers))
  const alone = scene([])
  const leaving = (age: number) => scene([{ model: 'claude-haiku-4-5', leave: { age, x: 15 } }])
  expect(leaving(0)).not.toBe(alone)
  expect(leaving(5)).not.toBe(leaving(0)) // it moves back
  expect(leaving(40)).toBe(alone) // and is gone off the left edge
  // The one behind it closes the gap smoothly: halfway between two places.
  expect(scene([{ model: 'claude-haiku-4-5', pos: 0.5 }])).not.toBe(scene([{ model: 'claude-haiku-4-5', pos: 0 }]))
})

test('the last little slime opens the chest with the main one, then merges into it', async () => {
  const w = 32
  const stay = [{ model: 'claude-haiku-4-5', pos: 0, stay: true as const }]
  const frames = Array.from({ length: partyLength(w, 1) }, (_, t) => partyFrame(w, t, 1))
  const cheering = frames.findIndex(f => f.cheer !== undefined)
  const merging = frames.findIndex(f => f.mergeAge !== undefined)
  expect(merging).toBeGreaterThan(cheering) // it merges only after the cheer
  // The main slime holds still by the chest until the little one is inside.
  for (const f of frames.filter(f => f.mergeAge !== undefined && f.mergeAge < 10)) {
    expect(f.scrolling).toBe(false)
    expect(f.cx).toBe(w >> 1)
  }
  // Is the little (Haiku-yellow) slime anywhere in the picture at tick t?
  const shows = (t: number) => {
    const words = new Uint32Array(Uint8Array.from(atob(frame(w, fresh(), t, true, 'claude-opus-5-5', stay, undefined, t)), c => c.charCodeAt(0)).buffer)
    return words.some((v, i) => i % 3 !== 0 && v === 0xffc300)
  }
  expect(shows(cheering)).toBe(true) // there for the cheer
  expect(shows(merging + 3)).toBe(true) // mid-hop into the main slime
  expect(shows(merging + 12)).toBe(false) // merged: gone
})

test('trees come in three kinds, picked at random but steady per spot', async () => {
  const kinds = scattered('tree', 0, 4000).map(treeKind)
  expect(new Set(kinds)).toEqual(new Set([0, 1, 2]))
  expect(scattered('tree', 0, 4000).map(treeKind)).toEqual(kinds)
})
