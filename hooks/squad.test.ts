import { expect, mock, test } from 'claude-code/testing'
import { comboPrompt } from './combos'
import type { Combo } from './combos'
import { anyLive, attachRun, beginMission, combosOf, dateTimeText, elapsed, endMissions, newMission, nextMissionId, resultLines, runsOf, statusOfAgent, tagOf, updateRun } from './squad'
import type { SquadRun } from './squad'

const PLUGIN = 'slime-dashboard'
const SQUAD = {
  plugin: PLUGIN,
  component: 'Pane' as const,
  requestId: 'dungeon',
  props: {
    title: 'Dungeon',
    isFocused: true,
    bodyColumns: 40,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 120 },
    view: {},
  },
}
const PANE = { ...SQUAD, requestId: PLUGIN, props: { ...SQUAD.props, title: 'Slime', bodyColumns: 33 } }

const RUN_TEST: Combo = {
  name: 'Run-Test',
  layers: [
    { steps: [{ skill: 'demo-build', model: 'haiku', agent: 'general-purpose' }] },
    { steps: [], condition: 'never shown: no steps' },
    {
      steps: [
        { skill: 'demo-test', model: 'sonnet', agent: 'general-purpose' },
        { skill: 'demo-check', model: 'opus', agent: 'Explore' },
      ],
      condition: 'if Fail, say so',
    },
  ],
}

const run = (id: string, description: string): SquadRun => ({ id, description, status: 'running', steps: 0, startedAt: 0 })

test('a mission keeps the combo as pressed; tags put each subagent on its step', () => {
  const m = newMission(1, RUN_TEST, 1000)
  // The empty wave is left out; the others keep their numbers, as tags count them.
  expect(m.waves.map(w => w.n)).toEqual([1, 3])
  expect(m.waves[1]!.condition).toBe('if Fail, say so')
  expect(tagOf('[Run-Test 3.2] check the result')).toEqual({ combo: 'Run-Test', wave: 3, step: 2 })
  expect(tagOf('[My Combo 1.1] x')).toEqual({ combo: 'My Combo', wave: 1, step: 1 })
  expect(tagOf('[My Combo #12 2.3] x')).toEqual({ combo: 'My Combo', mission: 12, wave: 2, step: 3 })
  expect(tagOf('scan files')).toBeUndefined()
  expect(combosOf(comboPrompt(RUN_TEST, 'all')!)).toEqual([{ combo: 'Run-Test' }])
  expect(combosOf('hello')).toEqual([])
  // Two sent while the leader was busy come in as one prompt.
  expect(combosOf(`${comboPrompt(RUN_TEST, '', 4)}\n${comboPrompt({ ...RUN_TEST, name: 'Slow' }, '', 5)}`)).toEqual([
    { combo: 'Run-Test', mission: 4 },
    { combo: 'Slow', mission: 5 },
  ])

  // Not begun yet: an untagged subagent is not the squad's.
  expect(attachRun([m], run('a0', 'look around'))).toBeUndefined()
  let ms = beginMission([m], 'Run-Test', 2000)
  expect(ms[0]!.begunAt).toBe(2000)
  ms = attachRun(ms, run('a1', '[Run-Test 1.1] build'))!
  ms = attachRun(ms, run('a2', '[Run-Test 3.2] check'))!
  // A tag naming no free step, and an untagged one, go among the others.
  ms = attachRun(ms, run('a3', '[Run-Test 1.1] build again'))!
  ms = attachRun(ms, run('a4', 'look around'))!
  expect(ms[0]!.waves[0]!.steps[0]!.run?.id).toBe('a1')
  expect(ms[0]!.waves[1]!.steps[0]!.run).toBeUndefined()
  expect(ms[0]!.waves[1]!.steps[1]!.run?.id).toBe('a2')
  expect(ms[0]!.others.map(r => r.id)).toEqual(['a3', 'a4'])

  ms = updateRun(ms, 'a2', r => ({ ...r, status: 'completed', result: 'PASS' }))!
  expect(ms[0]!.waves[1]!.steps[1]!.run).toMatchObject({ status: 'completed', result: 'PASS' })
  expect(updateRun(ms, 'nobody', r => r)).toBeUndefined()
  expect(runsOf(ms).map(r => r.id).sort()).toEqual(['a1', 'a2', 'a3', 'a4'])
  expect(anyLive(ms)).toBe(true)

  // The leader's turn ends with subagents still running (in the background):
  // the mission goes on, and the next wave's subagents still join it.
  ms = endMissions(ms, 'done', 8000)
  expect(ms[0]!.endedAt).toBeUndefined()
  ms = attachRun(ms, run('a6', '[Run-Test 3.1] test'))!
  expect(ms[0]!.waves[1]!.steps[0]!.run?.id).toBe('a6')
  // Once none runs, the leader's next turn end ends it, and nothing more joins it.
  for (const id of ['a1', 'a3', 'a4', 'a6']) ms = updateRun(ms, id, r => ({ ...r, status: 'completed' }))!
  ms = endMissions(ms, 'done', 9000)
  expect(ms[0]).toMatchObject({ endedAt: 9000, outcome: 'done' })
  expect(attachRun(ms, run('a5', '[Run-Test 3.1] test'))).toBeUndefined()
  expect(anyLive(ms)).toBe(false)
})

test('two presses of one combo: the leader takes them up in turn', () => {
  let ms = [newMission(1, RUN_TEST, 0), newMission(2, RUN_TEST, 10)]
  ms = beginMission(ms, 'Run-Test', 20)
  expect(ms.map(m => m.begunAt)).toEqual([20, undefined])
  ms = endMissions(ms, 'stopped', 30)
  ms = beginMission(ms, 'Run-Test', 40)
  expect(ms.map(m => m.outcome)).toEqual(['stopped', undefined])
  ms = attachRun(ms, run('b1', '[Run-Test 1.1] build'))!
  expect(ms[1]!.waves[0]!.steps[0]!.run?.id).toBe('b1')
})

test('a press whose taking up went unseen begins with its first tagged subagent', () => {
  let ms = [newMission(1, RUN_TEST, 0), newMission(2, { ...RUN_TEST, name: 'Slow' }, 5)]
  ms = beginMission(ms, 'Run-Test', 10)
  ms = attachRun(ms, { ...run('c1', '[Slow 1.1] build'), startedAt: 20 })!
  expect(ms[1]).toMatchObject({ begunAt: 20 })
  expect(ms[1]!.waves[0]!.steps[0]!.run?.id).toBe('c1')
  expect(ms[0]!.others).toEqual([])
  // Untagged, or naming no press at all: no mission is begun for it.
  expect(attachRun([newMission(3, RUN_TEST, 0)], run('c2', 'look'))).toBeUndefined()
  expect(attachRun([newMission(3, RUN_TEST, 0)], run('c3', '[Other 1.1] x'))).toBeUndefined()
})

test('pressed fast, one combo twice: each subagent goes to the press its tag numbers', () => {
  // Numbers never repeat, a mission taken off included.
  expect(nextMissionId([], 0)).toBe(1)
  expect(nextMissionId([newMission(2, RUN_TEST, 0)], 5)).toBe(6)
  expect(nextMissionId([newMission(9, RUN_TEST, 0)], 5)).toBe(10)

  let ms = [newMission(1, RUN_TEST, 0), newMission(2, RUN_TEST, 1), newMission(3, { ...RUN_TEST, name: 'Slow' }, 2)]
  // Both prompts came in as one: each numbered mission begins.
  for (const c of combosOf(`${comboPrompt(RUN_TEST, '', 2)}\n${comboPrompt(RUN_TEST, '', 1)}`)) ms = beginMission(ms, c.combo, 10, c.mission)
  expect(ms.map(m => m.begunAt)).toEqual([10, 10, undefined])
  // The second press's build starts first; it still lands on #2, not the newest free step.
  ms = attachRun(ms, run('d1', '[Run-Test #2 1.1] build'))!
  ms = attachRun(ms, run('d2', '[Run-Test #1 1.1] build'))!
  expect(ms[0]!.waves[0]!.steps[0]!.run?.id).toBe('d2')
  expect(ms[1]!.waves[0]!.steps[0]!.run?.id).toBe('d1')
  // A numbered tag on a press never seen taken up begins it; one on an ended
  // press takes it up again; a step already taken goes among its others.
  ms = attachRun(ms, { ...run('d3', '[Slow #3 3.1] test'), startedAt: 30 })!
  expect(ms[2]).toMatchObject({ begunAt: 30 })
  expect(ms[2]!.waves[1]!.steps[0]!.run?.id).toBe('d3')
  for (const id of ['d1', 'd2', 'd3']) ms = updateRun(ms, id, r => ({ ...r, status: 'completed' }))!
  ms = endMissions(ms, 'done', 40)
  expect(ms.every(m => m.outcome === 'done')).toBe(true)
  ms = attachRun(ms, run('d4', '[Run-Test #1 1.1] build again'))!
  expect(ms[0]!.endedAt).toBeUndefined()
  expect(ms[0]!.others.map(r => r.id)).toEqual(['d4'])
  // A number no mission has: as a tag without one.
  expect(attachRun([newMission(1, RUN_TEST, 0)], run('d5', '[Run-Test #8 1.1] x'))![0]!.waves[0]!.steps[0]!.run?.id).toBe('d5')
})

test('a few words of a run: its status, time and answer', () => {
  expect(statusOfAgent('completed')).toBe('completed')
  expect(statusOfAgent('failed')).toBe('failed')
  expect(statusOfAgent('killed')).toBe('stopped')
  expect(statusOfAgent('running')).toBeUndefined()
  expect(elapsed(42_000)).toBe('42s')
  expect(elapsed(65_000)).toBe('1m 05s')
  expect(elapsed(3_780_000)).toBe('1h 03m')
  expect(resultLines('## Result\n\n- **PASS**: 12 tests\n\nall good', 3)).toEqual(['Result', 'PASS: 12 tests', 'all good'])
  expect(resultLines('a\nb\nc\nd', 2)).toEqual(['a', 'b …'])
  expect(dateTimeText(Date.UTC(2026, 9, 9, 6, 54), 8 * 60)).toBe('2026-10-09 14:54')
  expect(dateTimeText(Date.UTC(2026, 11, 31, 23, 5), 60)).toBe('2027-01-01 00:05')
})

test('Dungeon: a pressed combo opens its tab and follows each subagent to its answer', async ($, on) => {
  // The store holds one saved combo.
  const kept = new Map<string, unknown>([['combos', [RUN_TEST]]])
  on('store.get', async (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', async (_$, e) => (kept.set(e.key, JSON.parse(JSON.stringify(e.value))), { value: undefined }))
  mock.clock(on)
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  let spawned = 0
  on('agent.spawn', async () => ({ agentId: `s${++spawned}`, model: 'claude-haiku-5-5' }))
  on('classic.UserPromptSubmit', async () => ({}))
  on('tool.call', async () => ({ result: 'ok' }))
  on('turn.complete', async () => ({ text: '' }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'skills-toggle' })
  await ui.press({ key: 'combo-Run-Test' })
  expect(opened).toContain('dungeon')
  await ui.unmount()

  const squad = await $.ui.mount({ ...SQUAD, surface: 'terminal' })
  const text = async (t: string | RegExp) => squad.find({ type: 'Text', text: t })
  expect(await text('Run-Test')).toBeDefined()
  expect(await text('#1 · 1970-01-01 00:00 · queued')).toBeDefined()
  expect(await text('/demo-build')).toBeDefined()
  expect(await text('/demo-check')).toBeDefined()
  expect(await text(/Opus · explore/)).toBeDefined()
  expect(await text('◆ if Fail, say so')).toBeDefined()
  expect((await squad.findAll({ type: 'Text', text: ' waiting' })).length).toBe(3)

  // The leader takes the combo up and hands out the steps.
  await $.classic.UserPromptSubmit({ prompt: comboPrompt(RUN_TEST, '', 1)!, session_title: '' } as never)
  expect(await text(/· running/)).toBeDefined()
  await $.agent.spawn({ prompt: 'Build.', description: '[Run-Test #1 1.1] build calc' } as never)
  await $.agent.spawn({ prompt: 'Look.', description: 'look around' } as never)
  await $.tool.call({ tool: 'Bash', command: 'make', agentId: 's1' } as never)
  expect(await text(/Bash/)).toBeDefined()
  expect(await text('Other subagents')).toBeDefined()
  expect(await text('look around')).toBeDefined()
  // The build answers.
  await $.turn.complete({ reason: 'answer', answer: 'Built calc.\nAll good.', durationMs: 1, turnId: 't1', isAborted: false, agentId: 's1' } as never)
  expect(await text(' done')).toBeDefined()
  expect(await text('  Built calc.')).toBeDefined()
  // The leader's turn ends while one still runs: the mission goes on.
  await $.turn.complete({ reason: 'answer', answer: 'Waiting on it.', durationMs: 1, turnId: 't0', isAborted: false } as never)
  expect(await text(/· running/)).toBeDefined()
  // It answers; the leader's next turn ends the mission, the later steps never reached.
  await $.turn.complete({ reason: 'answer', answer: 'Looked.', durationMs: 1, turnId: 't2', isAborted: false, agentId: 's2' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'Done.', durationMs: 1, turnId: 't3', isAborted: false } as never)
  expect(await text(/· done/)).toBeDefined()
  expect((await squad.findAll({ type: 'Text', text: ' not run' })).length).toBe(2)
  // [x] takes one mission off; [Clear All] the rest.
  expect(await squad.find({ key: 'squad-clear' })).toBeDefined()
  expect(await squad.find({ key: 'mission-x-1' })).toBeDefined()
  await squad.press({ key: 'mission-x-1' })
  expect(await text('Run-Test')).toBeUndefined()
  expect(await text(/No Party Combo sent yet/)).toBeDefined()
  expect(await squad.find({ key: 'squad-clear' })).toBeUndefined()
  await squad.unmount()
})
