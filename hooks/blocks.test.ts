import { expect, mock, test } from 'claude-code/testing'

import { addUsage, cacheHitRate, compact, NO_TALLY, secondsText, totalTokens } from './props'
import { frame, ROWS } from './scene'

const PLUGIN = 'slime-subagent-dashboard'
const PANE = {
  plugin: PLUGIN,
  component: 'Pane' as const,
  requestId: PLUGIN,
  props: {
    title: 'Slime',
    isFocused: true,
    bodyColumns: 33,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

test('cache hit rate and accumulated tokens add up over turns', async () => {
  const one = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 700 }
  const t = addUsage(addUsage(NO_TALLY, one), one)
  expect(cacheHitRate(t)).toBe(70)
  expect(totalTokens(t)).toBe(2100)
  expect(cacheHitRate(NO_TALLY)).toBeUndefined()
  expect(compact(950)).toBe('950')
  expect(compact(12_345)).toBe('12.3k')
  expect(compact(4_560_000)).toBe('4.56M')
  expect(secondsText(12_440)).toBe('12.4s')
})

test('waiting on the person: a blinking (?) over the main slime', async () => {
  const draw = (tick: number) => {
    const cells = frame(30, { cloud: 0, bird: 0, tree: 0, rock: 0, ground: 0 }, tick, true, 'claude-opus-5-5', [], { day: true, sky: 'cloudy' }, undefined, { ask: true })
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    return Array.from({ length: 30 * ROWS }, (_, i) => String.fromCharCode(words[i * 3]!)).join('')
  }
  expect(draw(0)).toContain('(?)')
  expect(draw(8)).not.toContain('(?)')
})

test('the Skill Box sends a skill with the typed prompt, the Property block opens', async ($, on) => {
  mock.store(on)
  const ran: string[] = []
  on('command.run', { command: 'run-unit-test' }, async (_$, e) => {
    ran.push(e.args)
    return { text: '' }
  })
  const manage = (args: string) =>
    $.command.run({ command: PLUGIN, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect((await manage('add run-unit-test')).text).toContain('added /run-unit-test')
  expect((await manage('add /lint')).text).toContain('added /lint (2 registered)')

  for (const surface of ['terminal', 'desktop'] as const) {
    ran.length = 0
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'skill-run-unit-test' })).toBeUndefined()
    await ui.press({ key: 'skills-toggle' })
    expect((await ui.find({ key: 'skill-run-unit-test' }))?.text).toBe('[run-unit-test]')
    await ui.input({ key: 'skill-prompt', text: 'only the vitals tests', kind: 'change' })
    await ui.press({ key: 'skill-run-unit-test' })
    expect(ran).toEqual(['"only the vitals tests"'])

    await ui.press({ key: 'props-toggle' })
    expect(await ui.find({ type: 'Text', text: /Cache Hit Rate/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Iteration Rate: 0\/∞/ })).toBeDefined()
    await ui.press({ key: 'props-toggle' })
    await ui.press({ key: 'skills-toggle' })
    await ui.unmount()
  }
})

test('the CP bar is the Unload button: either half runs /compact', async ($, on) => {
  mock.store(on)
  let compacts = 0
  on('command.run', { command: 'compact' }, async () => {
    compacts++
    return { text: '' }
  })
  on('session.measure', async (_$, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { window: 200_000, tokens: 124_000, percent: 62 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30 }, { kind: 'seven_day', percentUsed: 77 }],
    changed: ['context', 'rateLimits'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const key of ['unload', 'unload-rest']) {
      const half = await ui.find({ key })
      expect(half).toBeDefined()
    }
    const text = `${(await ui.find({ key: 'unload' }))?.text}${(await ui.find({ key: 'unload-rest' }))?.text}`
    expect(text).toContain('UNLOAD')
    // CP's bracket stands under MP's: both bars end in the same column.
    if (surface === 'terminal') expect(text.length).toBe(21)
    await ui.press({ key: 'unload-rest' })
    await ui.unmount()
  }
  expect(compacts).toBe(2)
})

test('Property lists Model and Effort first; Effort opens a row of levels to pick from', async ($, on) => {
  mock.store(on)
  const efforts: string[] = []
  on('command.run', { command: 'effort' }, async (_$, e) => {
    efforts.push(e.args)
    return { text: '' }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'props-toggle' })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const at = (pattern: RegExp) => texts.findIndex(t => pattern.test(t ?? ''))
    expect(at(/Model: /)).toBeLessThan(at(/Effort: /))
    expect(await ui.find({ type: 'Text', text: /^\[.+\]$/ })).toBeDefined()
    expect(at(/Effort: /)).toBeLessThan(at(/Cache Hit Rate/))

    expect(await ui.find({ key: 'effort-high' })).toBeUndefined()
    await ui.press({ key: 'effort' })
    expect((await ui.find({ key: 'effort-xhigh' }))?.text).toBe('[xHigh]')
    await ui.press({ key: 'effort-high' })
    expect(await ui.find({ key: 'effort-high' })).toBeUndefined()
    expect((await ui.find({ key: 'effort' }))?.text).toBe('[High]')
    await ui.press({ key: 'props-toggle' })
    await ui.unmount()
  }
  expect(efforts).toEqual(['high', 'high'])

  // /effort typed at the prompt moves the button too.
  await $.command.run({ command: 'effort', args: 'xhigh', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'props-toggle' })
  expect((await ui.find({ key: 'effort' }))?.text).toBe('[xHigh]')
  await ui.unmount()
})

test('/slime-subagent-dashboard weather reads the sky now, and says why when it cannot', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  let reply: { status: number; ok: boolean; text: string } | Error = { status: 200, ok: true, text: 'mmm|05:50:42|17:38:27|00:39:17+0800' }
  const agents: string[] = []
  on('http.fetch', async (_$, e) => {
    agents.push(String(e.init?.headers?.['User-Agent']))
    if (reply instanceof Error) return { deny: reply.message }
    return { value: { ...reply, headers: {} } }
  })
  const weather = () =>
    $.command.run({ command: PLUGIN, args: 'weather', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

  expect((await weather()).text).toBe('Weather: night, cloudy (wttr.in said "mmm|05:50:42|17:38:27|00:39:17+0800").')
  expect(agents).toEqual(['curl/8'])

  reply = { status: 503, ok: false, text: 'busy' }
  expect((await weather()).text).toContain('could not read wttr.in (HTTP 503)')
  reply = new Error('offline')
  expect((await weather()).text).toMatch(/could not read wttr.in \(.*offline\)/)
})

test('the effort levels fit on one row of the pane', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'props-toggle' })
  await ui.press({ key: 'effort' })
  const labels = await Promise.all(['low', 'medium', 'high', 'xhigh', 'max'].map(async l => (await ui.find({ key: `effort-${l}` }))?.text))
  expect(labels).toEqual(['[Low]', '[Mid]', '[High]', '[xHigh]', '[Max]'])
  // One space of indent, then the five labels: inside the pane's 32 columns.
  expect(1 + labels.join('').length).toBeLessThanOrEqual(32)
  await ui.unmount()
})
