import { expect, mock, test } from 'claude-code/testing'

import { addUsage, cacheHitRate, compact, NO_TALLY, secondsText, totalTokens } from './props'
import { addEvent, offsetOf, stamp } from './events'
import { ASK, frame, ROWS } from './scene'
import { grouped, parseAdd, skillsFrom } from './skills'
import { DEFAULT_ORDER, moveSection, orderFrom } from './layout'
import { VERSION } from './version'

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

test('waiting on the person: a small flashing bubble, a bold question mark laid over it', async ($, on) => {
  // Every pixel color the scene drew, top and bottom half of each cell.
  const colors = (tick: number, ask: boolean) => {
    const cells = frame(30, { cloud: 0, bird: 0, tree: 0, rock: 0, ground: 0 }, tick, true, 'claude-opus-5-5', [], { day: false, sky: 'cloudy' }, undefined, { ask })
    const words = new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)
    const seen: number[] = []
    for (let i = 0; i < 30 * ROWS; i++) seen.push(words[i * 3 + 1]!, words[i * 3 + 2]!)
    return seen
  }
  const count = (seen: number[], color: number) => seen.filter(c => c === color).length
  // A small bubble: 5 by 5 less its corners, 17 pixels; white half a second later.
  expect(count(colors(0, true), ASK.yellow)).toBe(17)
  expect(count(colors(5, true), ASK.white)).toBe(17)
  expect(count(colors(0, false), ASK.yellow)).toBe(0)

  // In the pane, while a permission prompt waits: the bold ? over the bubble.
  mock.store(on)
  on('classic.Notification', async () => ({}))
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const mark = await ui.find({ type: 'Text', text: '?' })
  expect(mark?.props).toMatchObject({ bold: true })
  await ui.unmount()
})

test('the Skill Box sends a skill with the typed prompt, the Property block opens', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ran: string[] = []
  on('command.run', { command: 'run-unit-test' }, async (_$, e) => {
    ran.push(e.args)
    return { text: '' }
  })
  const manage = (args: string) =>
    $.command.run({ command: PLUGIN, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect((await manage('add run-unit-test')).text).toContain('added /run-unit-test')
  expect((await manage('add /lint')).text).toContain('added /lint under General (2 registered)')

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

test('General holds Unload, which runs /compact; the CP bar is no button', async ($, on) => {
  mock.store(on)
  mock.clock(on)
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
    expect(await ui.find({ key: 'unload' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /UNLOAD/ })).toBeUndefined()
    await ui.press({ key: 'skills-toggle' })
    expect((await ui.find({ key: 'skillcat-General' }))?.text).toBe('▼ General')
    expect((await ui.find({ key: 'skill-Unload' }))?.text).toBe('[Unload]')
    expect(await ui.find({ type: 'Text', text: ': compact context window' })).toBeDefined()
    await ui.press({ key: 'skill-Unload' })
    // A category closes to its title and count, and opens again.
    await ui.press({ key: 'skillcat-General' })
    expect(await ui.find({ key: 'skill-Unload' })).toBeUndefined()
    expect((await ui.find({ key: 'skillcat-General' }))?.text).toBe('▲ General (1)')
    await ui.press({ key: 'skillcat-General' })
    await ui.press({ key: 'skills-toggle' })
    await ui.unmount()
  }
  expect(compacts).toBe(2)
})

test('skills file under a category with a dim description; old plain names read as General', async ($, on) => {
  mock.store(on, { skills: ['timer'] })
  mock.clock(on)
  const manage = (args: string) =>
    $.command.run({ command: PLUGIN, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect((await manage('add lint --category Code --desc run the linter')).text).toBe('Skill Box: added /lint under Code (1 registered).')
  expect((await manage('list')).text).toBe('General: /compact (Unload)\nCode: /lint')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'skills-toggle' })
  expect((await ui.find({ key: 'skillcat-Code' }))?.text).toBe('▼ Code')
  expect(await ui.find({ type: 'Text', text: ': run the linter' })).toBeDefined()
  await ui.unmount()
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

test('/slime-dashboard weather reads the sky now, and says why when it cannot', async ($, on) => {
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

test('Model opens a row of the families; picking one runs /model', async ($, on) => {
  mock.store(on)
  const models: string[] = []
  on('command.run', { command: 'model' }, async (_$, e) => {
    models.push(e.args)
    return { text: '' }
  })
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'props-toggle' })
    expect((await ui.find({ key: 'model' }))?.text).toMatch(/^\[.+\]$/)
    expect(await ui.find({ key: 'model-pick-haiku' })).toBeUndefined()
    await ui.press({ key: 'model' })
    const labels = await Promise.all(['haiku', 'sonnet', 'opus', 'fable'].map(async m => (await ui.find({ key: `model-pick-${m}` }))?.text))
    expect(labels).toEqual(['[Haiku]', '[Sonnet]', '[Opus]', '[Fable]'])
    expect(1 + labels.join('').length).toBeLessThanOrEqual(32)
    await ui.press({ key: 'model-pick-sonnet' })
    expect(await ui.find({ key: 'model-pick-haiku' })).toBeUndefined()
    await ui.press({ key: 'props-toggle' })
    await ui.unmount()
  }
  expect(models).toEqual(['sonnet', 'sonnet'])
})

test('a skill that does not run says why and keeps the prompt', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(String((e as { text?: string }).text ?? e))
    return { value: undefined }
  })
  // Nothing answers /nope: as an unknown skill, its run rejects.
  const manage = (args: string) =>
    $.command.run({ command: PLUGIN, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  await manage('add nope')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'skills-toggle' })
  await ui.input({ key: 'skill-prompt', text: '30', kind: 'change' })
  await ui.press({ key: 'skill-nope' })
  expect(toasts.some(t => t.includes('sending /nope "30"'))).toBe(true)
  expect(toasts.some(t => t.includes('/nope "30" did not run'))).toBe(true)
  await ui.unmount()
})

test('event stamps read YYYYMMDD-hhmm in the machine\'s zone, newest first, twenty kept', async () => {
  expect(offsetOf('00:39:17+0800')).toBe(480)
  expect(offsetOf('19:58:04-0330')).toBe(-210)
  expect(offsetOf('05:50:42')).toBeUndefined()
  // 2026-10-07 16:56 UTC is 2026-10-08 00:56 at +08:00.
  expect(stamp(Date.UTC(2026, 9, 7, 16, 56), 480)).toBe('20261008-0056')
  let list = [] as { at: number; text: string }[]
  for (let i = 0; i < 25; i++) list = addEvent(list, { at: i, text: `e${i}` })
  expect(list).toHaveLength(20)
  expect(list[0]!.text).toBe('e24')
})

test('the Event Message block shows the newest three, each framed, stamp then summary', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 7, 16, 56) })
  on('command.run', { command: 'effort' }, async () => ({ text: '' }))
  on('command.run', { command: 'compact' }, async () => ({ text: '' }))
  const run = (command: string, args = '') =>
    $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  await run('effort', 'high')
  await run('compact')
  await run('effort', 'low')
  await run('effort', 'max')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'events-toggle' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
  const from = texts.indexOf('Event Message ')
  expect(from).toBeGreaterThan(-1)
  const after = texts.slice(from + 1)
  // Newest first, three of the four; each stamp row then its summary.
  expect(after.filter(t => /^\d{8}-\d{4}$/.test(t))).toHaveLength(3)
  expect(after.filter(t => /^(Effort|Unloaded)/.test(t))).toEqual(['Effort: Max', 'Effort: Low', 'Unloaded: the context was'])
  // A summary too long for the frame goes on to a second row.
  expect(after).toContain('compacted')
  await ui.unmount()
})

test('Party and Event Message open and close, closed titles counting what they hold', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('command.run', { command: 'effort' }, async () => ({ text: '' }))
  await $.command.run({ command: 'effort', args: 'high', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const shown = async (text: string) => (await ui.findAll({ type: 'Text' })).some(t => t.text === text)
    // Both start closed, their titles counting what they hold.
    expect(await shown('Party (0) ')).toBe(true)
    expect(await shown('Event Message (1) ')).toBe(true)
    expect(await shown(' - none')).toBe(false)
    expect(await shown('Effort: High')).toBe(false)
    await ui.press({ key: 'monitor-toggle' })
    await ui.press({ key: 'events-toggle' })
    expect(await shown(' - none')).toBe(true)
    expect(await shown('Effort: High')).toBe(true)
    await ui.press({ key: 'monitor-toggle' })
    await ui.press({ key: 'events-toggle' })
    expect(await shown('Effort: High')).toBe(false)
    await ui.unmount()
  }
})

test('parseAdd and grouped: categories in order, General first with Unload', async () => {
  expect(parseAdd('timer')).toEqual({ name: 'timer', category: 'General' })
  expect(parseAdd('/lint --category Code --desc run the linter')).toEqual({ name: 'lint', category: 'Code', description: 'run the linter' })
  expect(parseAdd('deploy --desc ship it')).toEqual({ name: 'deploy', category: 'General', description: 'ship it' })
  expect(parseAdd('')).toBeUndefined()
  expect(skillsFrom(['timer'])).toEqual([{ name: 'timer', category: 'General' }])
  const groups = grouped([{ name: 'lint', category: 'Code' }, { name: 'timer', category: 'General' }])
  expect(groups.map(g => [g.category, g.skills.map(s => s.name)])).toEqual([['General', ['Unload', 'timer']], ['Code', ['lint']]])
})

test('Setting: Update refreshes the marketplace, updates the plugin, reloads; a failure says why', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const ran: string[] = []
  let failOn = ''
  on('process.run', async (_$, e) => {
    const line = e.argv.join(' ')
    ran.push(line)
    return line.includes(failOn) && failOn !== ''
      ? { value: { exitCode: 1, stdout: '', stderr: 'Plugin "slime-dashboard" is not installed', isStdoutTruncated: false, isStderrTruncated: false } }
      : { value: { exitCode: 0, stdout: 'ok', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  let reloads = 0
  on('command.run', { command: 'reload-plugins' }, async () => {
    reloads++
    return { text: '' }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ key: 'update' })).toBeUndefined()
  // The version shows at the foot, open or closed.
  expect(await ui.find({ type: 'Text', text: `v${VERSION}` })).toBeDefined()
  await ui.press({ key: 'settings-toggle' })
  expect((await ui.find({ key: 'update' }))?.text).toBe('[Update]')
  expect(await ui.find({ type: 'Text', text: ': update dashboard' })).toBeDefined()

  await ui.press({ key: 'events-toggle' })
  await ui.press({ key: 'update' })
  expect(ran).toEqual([
    'claude plugin marketplace update slime-dashboard',
    'claude plugin update slime-dashboard@slime-dashboard',
  ])
  expect(reloads).toBe(1)
  // Told in a toast and in Event Message; nothing shows under the button.
  expect(toasts).toEqual(['Updating: fetching the latest from GitHub…', 'Updated from GitHub: reloading plugins'])
  expect(await ui.find({ type: 'Text', text: /^Updated from GitHub/ })).toBeDefined()

  failOn = 'plugin update'
  await ui.press({ key: 'update' })
  expect(reloads).toBe(1)
  expect(toasts.at(-1)).toBe('Update failed to update the plugin: Plugin "slime-dashboard" is not installed')
  expect(await ui.find({ type: 'Text', text: /^Update failed to update/ })).toBeDefined()
  await ui.unmount()
})

test('every block shows ▲ while closed and ▼ while open', async ($, on) => {
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const key of ['props-toggle', 'skills-toggle', 'settings-toggle']) {
      expect((await ui.find({ key }))?.text).toBe('▲')
      await ui.press({ key })
      expect((await ui.find({ key }))?.text).toBe('▼')
      await ui.press({ key })
    }
    await ui.unmount()
  }
})

test('Setting: Display hides and shows sections, Reload reloads the dashboard', async ($, on) => {
  mock.store(on)
  const reloads: string[] = []
  on('command.run', { command: 'reload-plugins' }, async () => {
    reloads.push('reload')
    return { text: '' }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'settings-toggle' })
    expect(await ui.find({ key: 'display-property' })).toBeUndefined()
    await ui.press({ key: 'display' })
    expect((await ui.find({ key: 'display-property' }))?.text).toBe('[x] Property')

    expect(await ui.find({ key: 'props-toggle' })).toBeDefined()
    await ui.press({ key: 'display-property' })
    expect((await ui.find({ key: 'display-property' }))?.text).toBe('[ ] Property')
    expect(await ui.find({ key: 'props-toggle' })).toBeUndefined()
    await ui.press({ key: 'display-property' })
    expect(await ui.find({ key: 'props-toggle' })).toBeDefined()

    // Pressed again, [Display] closes its box.
    await ui.press({ key: 'display' })
    expect(await ui.find({ key: 'display-property' })).toBeUndefined()
    await ui.press({ key: 'settings-toggle' })
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'settings-toggle' })
  await ui.press({ key: 'reload' })
  expect(reloads).toEqual(['reload'])
  await ui.unmount()
})

test('Setting: Color cycles a family through six colors; Default puts them back', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'settings-toggle' })
  expect(await ui.find({ key: 'color-Opus' })).toBeUndefined()
  await ui.press({ key: 'color' })
  expect((await ui.find({ key: 'color-Opus' }))?.text).toBe('[Red]')
  const seen: string[] = []
  for (let i = 0; i < 6; i++) {
    await ui.press({ key: 'color-Opus' })
    seen.push((await ui.find({ key: 'color-Opus' }))!.text!)
  }
  expect(seen).toEqual(['[Blue]', '[Yellow]', '[Green]', '[Pink]', '[Purple]', '[Red]'])
  // Opus wearing Haiku's yellow: colors may repeat.
  await ui.press({ key: 'color-Opus' })
  await ui.press({ key: 'color-Opus' })
  expect((await ui.find({ key: 'color-Opus' }))?.text).toBe('[Yellow]')
  await ui.press({ key: 'color-default' })
  expect((await ui.find({ key: 'color-Opus' }))?.text).toBe('[Red]')
  await ui.press({ key: 'color' })
  expect(await ui.find({ key: 'color-Opus' })).toBeUndefined()
  await ui.unmount()
})

test('Order: a kept order is cleaned up, and a move swaps neighbors', () => {
  expect(orderFrom(undefined)).toEqual(DEFAULT_ORDER)
  // Unknown and repeated ids dropped; the missing ones back at the end.
  expect(orderFrom(['events', 'nope', 'events', 'stats', 3])).toEqual(['session', 'events', 'scene', 'models', 'property', 'skills', 'monitor', 'stats'])
  // A section added since the order was kept goes in at its default place.
  expect(orderFrom(DEFAULT_ORDER.filter(id => id !== 'session'))).toEqual(DEFAULT_ORDER)
  expect(moveSection(DEFAULT_ORDER, 'scene', -1).slice(1, 3)).toEqual(['scene', 'stats'])
  expect(moveSection(DEFAULT_ORDER, 'session', -1)).toEqual(DEFAULT_ORDER)
  expect(moveSection(DEFAULT_ORDER, 'events', 1)).toEqual(DEFAULT_ORDER)
})

test('Setting: Order moves sections up and down; Default puts them back', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const titles = async () =>
    (await ui.findAll({ type: 'Text' })).map(t => (t.text ?? '').replace(/ \(\d+\) $/, ' ')).filter(t => ['Property ', 'Skill Box ', 'Party ', 'Event Message '].includes(t))
  await ui.press({ key: 'settings-toggle' })
  expect(await ui.find({ key: 'order-up-events' })).toBeUndefined()
  await ui.press({ key: 'order' })
  expect(await titles()).toEqual(['Property ', 'Skill Box ', 'Party ', 'Event Message '])
  await ui.press({ key: 'order-up-events' })
  await ui.press({ key: 'order-up-events' })
  expect(await titles()).toEqual(['Property ', 'Event Message ', 'Skill Box ', 'Party '])
  await ui.press({ key: 'order-down-property' })
  expect(await titles()).toEqual(['Event Message ', 'Property ', 'Skill Box ', 'Party '])
  // A hidden section keeps its place, so it comes back where it was.
  await ui.press({ key: 'display' })
  await ui.press({ key: 'display-property' })
  expect(await titles()).toEqual(['Event Message ', 'Skill Box ', 'Party '])
  await ui.press({ key: 'display-property' })
  expect(await titles()).toEqual(['Event Message ', 'Property ', 'Skill Box ', 'Party '])
  await ui.press({ key: 'order-default' })
  expect(await titles()).toEqual(['Property ', 'Skill Box ', 'Party ', 'Event Message '])
  await ui.press({ key: 'order' })
  expect(await ui.find({ key: 'order-up-events' })).toBeUndefined()
  await ui.unmount()
})

test('Setting: Width asks for the pane a column narrower or wider', async ($, on) => {
  mock.store(on)
  const asked: (number | undefined)[] = []
  on('ui.open', async (_$, e) => {
    asked.push(e.columns)
    return { value: { isPlaced: true as const } }
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'settings-toggle' })
  expect(await ui.find({ type: 'Text', text: ' 33 ' })).toBeDefined()
  await ui.press({ key: 'width-up' })
  await ui.press({ key: 'width-up' })
  await ui.press({ key: 'width-down' })
  expect(await ui.find({ type: 'Text', text: ' 34 ' })).toBeDefined()
  expect(asked.slice(-3)).toEqual([34, 35, 34])
  await ui.unmount()
})

test("Party's red [x] stops that subagent with TaskStop, and it leaves the line", async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const stopped: string[] = []
  on('agent.spawn', async () => ({ agentId: 'a1', model: 'claude-haiku-5-5' }))
  on('agent.list', async () => ({
    value: [{ id: 'a1', description: 'scan files', status: stopped.includes('a1') ? 'killed' : 'running' }],
  }) as never)
  on('tool.call', { tool: 'TaskStop' }, async (_$, e) => {
    stopped.push((e as { task_id: string }).task_id)
    return { result: 'stopped' } as never
  })
  await $.agent.spawn({ prompt: 'Scan.', description: 'scan files' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shown = async (text: string) => (await ui.findAll({ type: 'Text' })).some(t => t.text?.includes(text))
  await ui.press({ key: 'monitor-toggle' })
  expect(await shown('scan files')).toBe(true)
  const red = (await ui.findAll({ type: 'Text' })).filter(t => t.props.color === '#e63946').map(t => t.text)
  expect(red).toEqual(['[', ']'])
  await ui.press({ key: 'stop-a1' })
  expect(stopped).toEqual(['a1'])
  expect(await shown('scan files')).toBe(false)
  await ui.press({ key: 'events-toggle' })
  expect(await shown('✖ Stopped')).toBe(true)
  await ui.unmount()
})

test('the session name stands on a wooden sign, updated by each prompt, /rename included', async ($, on) => {
  mock.store(on)
  on('classic.UserPromptSubmit', async () => ({}))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const shown = async (text: string) => (await ui.findAll({ type: 'Text' })).some(t => t.text === text)
  expect(await shown('—')).toBe(true)
  await $.classic.UserPromptSubmit({ prompt: 'hi', session_title: 'Slim-dashboard 動畫互動' } as never)
  expect(await shown('Slim-dashboard 動畫互動')).toBe(true)
  // On a wooden sign: cream letters on brown.
  expect((await ui.find({ type: 'Text', text: 'Slim-dashboard 動畫互動' }))?.props).toMatchObject({ color: '#f5e6c8', backgroundColor: '#8b5a2b' })
  await $.classic.UserPromptSubmit({ prompt: 'hi', session_title: 'renamed' } as never)
  expect(await shown('renamed')).toBe(true)
  await ui.unmount()
})
