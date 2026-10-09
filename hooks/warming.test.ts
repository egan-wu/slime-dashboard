import { expect, mock, test } from 'claude-code/testing'

import { leadMs, returnVerdict, warmStep } from './warming'

const PLUGIN = 'slime-dashboard'
const PANE = {
  plugin: PLUGIN,
  component: 'Pane' as const,
  requestId: PLUGIN,
  props: {
    title: 'Slime',
    isFocused: true,
    bodyColumns: 33,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 80 },
    view: {},
  },
}
const HOUR = 3_600_000

test('warming waits while busy or not yet due, and warms a little before the cache lapses', () => {
  const at = Date.UTC(2026, 9, 9, 12)
  expect(warmStep(at + 10_000, true, at, HOUR).kind).toBe('wait')
  expect(warmStep(at + HOUR - 60_000, false, at, HOUR).kind).toBe('wait')
  expect(warmStep(at + HOUR - 60_000, true, at, HOUR).kind).toBe('warm')
  expect(warmStep(at + HOUR - 60_000, true, 0, HOUR).kind).toBe('wait')
})

const turn = (read: number, write: number) =>
  ({ reason: 'answer', answer: '', text: '', durationMs: 1000, usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: write, model: 'claude-opus-5-5' } }) as never

test('Cache Warming is Auto: a fork keeps the cache warm while idle, a lapsed cache rests it until the next turn, Off stops it', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  await clock.set(Date.UTC(2026, 9, 9, 12))
  on('turn.complete', async () => ({ text: '' }))
  const forks: string[] = []
  let read = 150_000
  on('model.fork', async (_$, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: 'OK', usage: { input_tokens: 20, output_tokens: 2, cache_read_input_tokens: read, cache_creation_input_tokens: 0 } } }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // A turn ends: the cache runs an hour (a subscription's TTL) from now.
  await $.turn.complete(turn(0, 150_000))
  // Its switch, off by default (the dim word after it says `off`): off,
  // nothing goes out, however long the cache sits.
  const off = async () => (await ui.findAll({ type: 'Text' })).some(t => t.text === 'off')
  await ui.press({ key: 'passive-toggle' })
  expect(await ui.find({ key: 'warm' })).toBeDefined()
  expect(await off()).toBe(true)
  await clock.advance(59 * 60_000)
  expect(forks).toHaveLength(0)
  // Turned on, it keeps this turn's cache from here.
  await ui.press({ key: 'warm' })
  expect(await off()).toBe(false)
  await $.turn.complete(turn(0, 150_000))
  // Not due yet: nothing goes out.
  await clock.advance(10 * 60_000)
  expect(forks).toHaveLength(0)
  // Within the last minute and a half: one fork, which starts the hour over.
  await clock.advance(50 * 60_000)
  expect(forks).toHaveLength(1)
  await clock.advance(5 * 60_000)
  expect(forks).toHaveLength(1)
  // The next finds the cache gone (next to nothing read): warming rests, still on Auto.
  read = 0
  await clock.advance(55 * 60_000)
  expect(forks).toHaveLength(2)
  expect(await off()).toBe(false)
  await ui.press({ key: 'events-toggle' })
  const logged = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(logged).toContain('♨ Cache warmed: 150.0k read,')
  expect(logged).toContain('♨ Cache Warming rests: the')
  await clock.advance(HOUR)
  expect(forks).toHaveLength(2)
  // A new turn: warming keeps this one's cache in turn.
  read = 150_000
  await $.turn.complete(turn(0, 150_000))
  await clock.advance(HOUR)
  expect(forks).toHaveLength(3)
  // Off: nothing more goes out.
  await ui.press({ key: 'warm' })
  expect(await off()).toBe(true)
  await clock.advance(2 * HOUR)
  expect(forks).toHaveLength(3)
  await ui.unmount()
})

test('a return is warm within the TTL, else rescued, lapsed or cold', () => {
  expect(returnVerdict(4 * 60_000, 5 * 60_000, 0, 90_000, 0)).toBe('warm')
  expect(returnVerdict(20 * 60_000, 5 * 60_000, 80_000, 90_000, 3)).toBe('rescued')
  // Only the system prompt still cached: lapsed all the same.
  expect(returnVerdict(20 * 60_000, 5 * 60_000, 18_000, 90_000, 3)).toBe('lapsed')
  expect(returnVerdict(20 * 60_000, 5 * 60_000, 0, 90_000, 0)).toBe('cold')
})
