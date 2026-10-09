import { expect, mock, test } from 'claude-code/testing'

import { addToDay, dayKey, journalFrom, lastDays, pingPays, summaryOf } from './journal'

const PLUGIN = 'slime-dashboard'
const PANE = {
  plugin: PLUGIN,
  component: 'Pane' as const,
  requestId: PLUGIN,
  props: { title: 'Slime', isFocused: true, bodyColumns: 33, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 120 }, view: {} },
}

test('a day a record, by this computer\'s date; thirty kept', () => {
  expect(dayKey(Date.UTC(2026, 9, 9, 20), 8 * 3_600_000)).toBe('2026-10-10')
  expect(lastDays('2026-10-09', 3)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
  let list = addToDay([], '2026-09-01', { turns: 2 })
  list = addToDay(list, '2026-10-09', { turns: 1, cacheRead: 90, input: 10 })
  list = addToDay(list, '2026-10-09', { turns: 1 })
  // September 1st is more than thirty days before October 9th: dropped.
  expect(list.map(d => [d.day, d.turns])).toEqual([['2026-10-09', 2]])
  expect(journalFrom([{ day: 'bad' }, { day: '2026-10-08', turns: 'x', pings: 3 }, ...list]).map(d => [d.day, d.turns, d.pings])).toEqual([
    ['2026-10-08', 0, 3],
    ['2026-10-09', 2, 0],
  ])
})

test('the summary: totals over thirty days, the hit rate, warming net of its pings, a bar a day', () => {
  let list = addToDay([], '2026-10-08', { turns: 3, input: 100, cacheWrite: 100, cacheRead: 800, output: 50 })
  list = addToDay(list, '2026-10-09', { turns: 1, input: 0, cacheWrite: 0, cacheRead: 100, cold: 1, coldTokens: 120_000 })
  list = addToDay(list, '2026-10-09', { pings: 2, saved: -30_000 })
  list = addToDay(list, '2026-10-09', { rescues: 1, rescued: 150_000, saved: 285_000 })
  const s = summaryOf(list, '2026-10-09')
  expect(s.active).toBe(2)
  expect(s.turns).toBe(4)
  expect(s.tokens).toBe(1150)
  expect(s.hitRate?.toFixed(1)).toBe('81.8')
  expect([s.cold, s.coldTokens, s.pings, s.rescues, s.saved]).toEqual([1, 120_000, 2, 1, 255_000])
  expect(s.spark).toHaveLength(30)
  expect(s.spark.slice(-2)).toBe('▇█')
  expect(s.spark.slice(0, 28)).toBe('·'.repeat(28))
})

test('warming pays while its pings cost less than a rescue saves: about 19 with an hour, 11 with five minutes', () => {
  const P = 100_000
  expect(pingPays(18 * P, P, '1h')).toBe(true)
  expect(pingPays(19 * P, P, '1h')).toBe(false)
  expect(pingPays(10 * P, P, '5m')).toBe(true)
  expect(pingPays(11 * P, P, '5m')).toBe(false)
})

test('what a cold return still reads is not saved: fewer pings pay, and with little beyond it none do', () => {
  // The 74.3k context of the warming log, 25.5k of it read even when cold: seven pings.
  expect(pingPays(6 * 74_300, 74_300, '5m', 25_500)).toBe(true)
  expect(pingPays(7 * 74_300, 74_300, '5m', 25_500)).toBe(false)
  expect(pingPays(0, 30_000, '5m', 25_500)).toBe(true)
  expect(pingPays(0, 27_000, '5m', 25_500)).toBe(false)
  expect(pingPays(0, 20_000, '5m', 25_500)).toBe(false)
})

test('the Journal records each turn; Cache Warming opens as a block with the day\'s hit rate', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  await clock.set(Date.UTC(2026, 9, 9, 12))
  on('turn.complete', async () => ({ text: '' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (let i = 0; i < 2; i++) {
    await $.turn.complete({ reason: 'answer', answer: '', text: '', durationMs: 1000, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, model: 'claude-opus-5-5' } } as never)
  }
  expect((await ui.find({ key: 'journal-toggle' }))).toBeDefined()
  await ui.press({ key: 'journal-toggle' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(texts.some(t => t.includes('Turns:'))).toBe(false)
  // Cache Warming is a block of its own, closed until pressed.
  expect((await ui.find({ key: 'journal-warm' }))?.text).toBe('▸ Cache Warming')
  expect(texts).not.toContain('Cache Hit Rate: 80.0%')
  await ui.press({ key: 'journal-warm' })
  expect((await ui.find({ key: 'journal-warm' }))?.text).toBe('▼ Cache Warming')
  const opened = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(opened).toContain('Cache Hit Rate: 80.0%')
  expect(opened).toContain('Pings: 0 · Rescues: 0')
  await ui.unmount()
})
