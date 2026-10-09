import { expect, mock, test } from 'claude-code/testing'
import { comboPrompt } from './combos'
import type { Combo } from './combos'
import { agentsToFollow, anyLive, coinText, settleLed, attachRun, reviveRun, runTokens, watching, beginMission, combosOf, dateTimeText, elapsed, endLed, endMissions, leaderOf, newMission, nextMissionId, resultLines, runsOf, statusOfAgent, tagOf, tokensOf, tokensText, updateRun, usageTokens } from './squad'
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
  // A run's tokens: its requests', else its turns' ends'.
  expect(runTokens({ ...run('a', 'x'), tokens: 900, turnTokens: 500 })).toBe(900)
  expect(runTokens({ ...run('a', 'x'), turnTokens: 500 })).toBe(500)
  expect(runTokens(run('a', 'x'))).toBe(0)
  expect(coinText(812)).toBe('812')
  expect(coinText(9_420)).toBe('9.4K')
  expect(coinText(124_400)).toBe('124K')
  expect(coinText(1_234_567)).toBe('1.2M')
  expect(tokensText(812)).toBe('812 tok')
  expect(tokensText(9_420)).toBe('9.4k tok')
  expect(tokensText(30_776)).toBe('31k tok')
  expect(tokensText(1_234_567)).toBe('1.2M tok')
  expect(usageTokens({ input_tokens: 3, output_tokens: 200, cache_read_input_tokens: 28_000, cache_creation_input_tokens: 1_500 })).toBe(29_703)
  expect(dateTimeText(Date.UTC(2026, 9, 9, 6, 54), 8 * 60)).toBe('2026-10-09 14:54')
  expect(dateTimeText(Date.UTC(2026, 11, 31, 23, 5), 60)).toBe('2027-01-01 00:05')
})

test('a leader begins its mission, keeps it going, and ends it; what its steps send out stays with it', () => {
  expect(leaderOf('[Run-Test #3] lead the Party Combo')).toEqual({ combo: 'Run-Test', mission: 3 })
  expect(leaderOf('[Run-Test #3 1.1] build')).toBeUndefined()
  let ms = [newMission(1, RUN_TEST, 0), newMission(2, RUN_TEST, 0)]
  ms = attachRun(ms, run('L2', '[Run-Test #2] lead the Party Combo'))!
  expect(ms[1]!.leader?.id).toBe('L2')
  expect(ms[1]!.begunAt).toBe(0)
  expect(ms[0]!.begunAt).toBeUndefined()
  ms = attachRun(ms, run('b', '[Run-Test #2 1.1] build'), 'L2')!
  // A helper the build sends out, untagged, goes to the build's mission.
  ms = attachRun(ms, run('h', 'look around'), 'b')!
  expect(ms[1]!.others.map(r => r.id)).toEqual(['h'])
  // The person's turn ends: the leader still runs, so its mission goes on.
  ms = endMissions(ms, 'done', 5)
  expect(ms[1]!.endedAt).toBeUndefined()
  expect(endLed(ms, 'b', 'done', 6)).toBeUndefined()
  for (const id of ['b', 'h']) ms = updateRun(ms, id, r => ({ ...r, status: 'completed' }))!
  ms = endLed(ms, 'L2', 'done', 9)!
  expect(ms[1]).toMatchObject({ endedAt: 9, outcome: 'done' })
  expect(runsOf([ms[1]!]).map(r => r.id)).toEqual(['L2', 'b', 'h'])
})

test('a leader that sends its steps to the background ends its turn, is woken by their reports, and only then ends its mission', () => {
  let ms = attachRun([newMission(1, RUN_TEST, 0)], run('L', '[Run-Test #1] lead the Party Combo'))!
  // Wave 1 sent, the leader's turn ends; its step, not seen yet, is listed as running.
  expect(endLed(ms, 'L', 'done', 5, true)).toBeUndefined()
  ms = updateRun(ms, 'L', r => ({ ...r, status: 'completed', endedAt: 5 }))!
  ms = attachRun(ms, run('b', '[Run-Test #1 1.1] build'), 'L')!
  // The person's turn ends meanwhile: not this mission's.
  ms = endMissions(ms, 'done', 6)
  expect(ms[0]!.endedAt).toBeUndefined()
  // A seen step still runs: no end either.
  expect(endLed(ms, 'L', 'done', 7)).toBeUndefined()
  ms = updateRun(ms, 'b', r => ({ ...r, status: 'completed', endedAt: 8 }))!
  // The build's report wakes the leader.
  ms = reviveRun(ms, 'L')!
  expect(ms[0]!.leader).toMatchObject({ status: 'running' })
  expect(ms[0]!.leader?.endedAt).toBeUndefined()
  expect(reviveRun(ms, 'L')).toBeUndefined()
  ms = endLed(ms, 'L', 'done', 9)!
  expect(ms[0]).toMatchObject({ endedAt: 9, outcome: 'done' })
  // Ended, it is still watched a while, then not.
  expect(watching(ms, 9 + 60_000, 120_000)).toBe(true)
  expect(watching(ms, 9 + 180_000, 120_000)).toBe(false)
  // A step found after its end takes the mission up again.
  ms = attachRun(ms, run('c', 'late'), 'L')!
  expect(ms[0]!.endedAt).toBeUndefined()
})

test('a leader that answered while a helper still ran: its mission ends once the helper does', () => {
  let ms = attachRun([newMission(1, RUN_TEST, 0)], run('L', '[Run-Test #1] lead the Party Combo'))!
  ms = attachRun(ms, run('h', 'look around'), 'L')!
  ms = updateRun(ms, 'L', r => ({ ...r, status: 'completed', endedAt: 5 }))!
  expect(endLed(ms, 'L', 'done', 5)).toBeUndefined()
  expect(settleLed(ms, 6)).toBeUndefined()
  ms = updateRun(ms, 'h', r => ({ ...r, status: 'completed', endedAt: 7 }))!
  ms = settleLed(ms, 8)!
  expect(ms[0]).toMatchObject({ endedAt: 8, outcome: 'done' })
  expect(settleLed(ms, 9)).toBeUndefined()
})

test('the agents a leader spawned, unseen by agent.spawn, are found in the agent list', () => {
  let ms = attachRun([newMission(1, RUN_TEST, 0)], run('L1', '[Run-Test #1] lead the Party Combo'))!
  const agents = [
    { id: 'L1', description: '[Run-Test #1] lead the Party Combo' },
    { id: 'a', description: '[Run-Test #1 3.2] check', parentId: 'L1' },
    { id: 'z', description: 'someone else', parentId: 'other' },
    { id: 'y', description: 'main thread' },
  ]
  expect(agentsToFollow(ms, agents, 'sonnet')).toEqual([{ id: 'a', description: '[Run-Test #1 3.2] check', parentId: 'L1', model: 'opus' }])
  ms = attachRun(ms, run('a', '[Run-Test #1 3.2] check'), 'L1')!
  // Once followed, never again; a helper it sends out comes next, on the fallback.
  expect(agentsToFollow(ms, [...agents, { id: 'h', description: 'look', parentId: 'a' }], 'sonnet')).toEqual([{ id: 'h', description: 'look', parentId: 'a', model: 'sonnet' }])
})

const STEP_USAGE = { input_tokens: 3, output_tokens: 200, cache_read_input_tokens: 28_000, cache_creation_input_tokens: 1_500 }

test('Dungeon: a pressed combo sends its leader, opens its tab and follows each subagent to its answer', async ($, on) => {
  // The store holds one saved combo.
  const kept = new Map<string, unknown>([['combos', [RUN_TEST]]])
  on('store.get', async (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', async (_$, e) => (kept.set(e.key, JSON.parse(JSON.stringify(e.value))), { value: undefined }))
  mock.clock(on)
  const submitted: string[] = []
  on('prompt.submit', async (_$, e) => (submitted.push(e.text), { text: e.text }))
  const opened: string[] = []
  on('ui.open', async (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  // The leader (s1) answers to the agent list: a plugin's own spawn comes back
  // here without its id.
  let spawned = 0
  const agents: { id: string; description: string; status: string; parentId?: string }[] = []
  on('agent.spawn', async (_$, e) => {
    const id = `s${++spawned}`
    agents.push({ id, description: e.description, status: 'running' })
    return { agentId: id, model: e.model === 'sonnet' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5' }
  })
  on('agent.list', async () => ({ value: agents }) as never)
  on('classic.UserPromptSubmit', async () => ({}))
  const stopped: string[] = []
  on('tool.call', async (_$, e) => {
    if (e.tool === 'TaskStop') {
      const id = (e as unknown as { task_id: string }).task_id
      stopped.push(id)
      const a = agents.find(x => x.id === id)
      if (a) a.status = 'killed'
    }
    return { result: 'ok' }
  })
  on('turn.complete', async () => ({ text: '' }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: STEP_USAGE } as never
  })

  // The press sends the leader (s1), not a prompt; the mission begins with it.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'skills-toggle' })
  await ui.press({ key: 'combo-Run-Test' })
  expect(opened).toContain('dungeon')
  expect(submitted).toHaveLength(0)
  await ui.unmount()

  const squad = await $.ui.mount({ ...SQUAD, surface: 'terminal' })
  const text = async (t: string | RegExp) => squad.find({ type: 'Text', text: t })
  expect(await text('Run-Test')).toBeDefined()
  expect(await text('#1 · 1970-01-01 00:00')).toBeDefined()
  expect(await text('0')).toBeDefined()
  expect(await text('Leader')).toBeDefined()
  expect(await text('  Sonnet')).toBeDefined()
  // The waves are closed to how far their steps have got, until pressed open.
  expect(await text(' · 2 waves · 0/3 done')).toBeDefined()
  expect(await text('/demo-build')).toBeUndefined()
  await squad.press({ key: 'mission-1-waves' })
  expect(await text('/demo-build')).toBeDefined()
  expect(await text('/demo-check')).toBeDefined()
  expect(await text('◆ if Fail, say so')).toBeDefined()
  expect((await squad.findAll({ type: 'Text', text: ' waiting' })).length).toBe(3)
  // The leader leads; each step's card is closed until pressed open.
  expect(await text(' leading')).toBeDefined()
  expect(await text(/Opus · explore/)).toBeUndefined()
  await squad.press({ key: 'mission-1-3-1-fold' })
  expect(await text(/Opus · explore/)).toBeDefined()
  await squad.press({ key: 'mission-1-3-1-fold' })
  expect(await text(/Opus · explore/)).toBeUndefined()
  await squad.press({ key: 'mission-1-1-0-fold' })

  // The leader hands out a step (s2), which sends out a helper of its own (s3).
  await $.agent.spawn({ prompt: 'Build.', description: '[Run-Test #1 1.1] build calc', parentAgentId: 's1' } as never)
  await $.agent.spawn({ prompt: 'Look.', description: 'look around', parentAgentId: 's2' } as never)
  await $.tool.call({ tool: 'Bash', command: 'make', agentId: 's2' } as never)
  expect(await text(/Bash/)).toBeDefined()
  // A running step's card has its [X]; the leading leader's, its [Recall].
  expect(await squad.find({ key: 'mission-1-1-0-stop' })).toBeDefined()
  expect(await squad.find({ key: 'mission-1-lead-recall' })).toBeDefined()
  // Its model requests count up its tokens, and the mission's.
  const step = async (index: number) => {
    const stream = $.turn.step({ turnId: 't1', index, agentId: 's2', model: 'claude-haiku-5-5' } as never)
    for await (const _ of stream);
    return stream.result
  }
  await step(0)
  await step(1)
  expect(await text(/· 59k tok/)).toBeDefined()
  // The mission's coin counts them up: K and M.
  expect(await text('59K')).toBeDefined()
  expect(await text('Other subagents')).toBeDefined()
  expect(await text('look around')).toBeDefined()
  await squad.press({ key: 'mission-1-o0-fold' })
  // The build answers.
  await $.turn.complete({ reason: 'answer', answer: 'Built calc.\nAll good.', durationMs: 1, turnId: 't1', isAborted: false, agentId: 's2' } as never)
  expect(await text(' done')).toBeDefined()
  expect(await text('  Built calc.')).toBeDefined()
  expect(await text(' · 2 waves · 1/3 done')).toBeDefined()
  // The person's own turn ends: the mission is the leader's, and goes on.
  await $.turn.complete({ reason: 'answer', answer: 'Hello.', durationMs: 1, turnId: 't0', isAborted: false } as never)
  expect(await text(' leading')).toBeDefined()
  // The helper answers, then the leader: the mission ends with it, the later steps never reached.
  await $.turn.complete({ reason: 'answer', answer: 'Looked.', durationMs: 1, turnId: 't2', isAborted: false, agentId: 's3' } as never)
  expect(await text(' leading')).toBeDefined()
  expect(await text(' leading')).toBeDefined()
  await $.turn.complete({ reason: 'answer', answer: 'Build OK; the check never ran.', durationMs: 1, turnId: 't3', isAborted: false, agentId: 's1' } as never)
  // Done: how long it took follows its waves' count.
  expect(await text(' · 2 waves · 1/3 done · 0s')).toBeDefined()
  expect(await text(' leading')).toBeUndefined()
  expect(await text('  Build OK; the check never ran.')).toBeDefined()
  expect((await squad.findAll({ type: 'Text', text: ' not run' })).length).toBe(2)
  expect(await squad.find({ key: 'mission-1-lead-recall' })).toBeUndefined()
  expect(await squad.find({ key: 'mission-1-1-0-stop' })).toBeUndefined()

  // A second press; [Recall] calls the whole mission back, leader first.
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await again.press({ key: 'combo-Run-Test' })
  await again.unmount()
  await $.agent.spawn({ prompt: 'Build.', description: '[Run-Test #2 1.1] build calc', parentAgentId: 's4' } as never)
  await squad.press({ key: 'mission-2-lead-recall' })
  expect(stopped).toEqual(['s4', 's5'])
  expect(await text(' · 2 waves · 0/3 done · 1 stopped · 0s')).toBeDefined()
  expect(await squad.find({ key: 'mission-2-lead-recall' })).toBeUndefined()
  await squad.press({ key: 'mission-x-2' })
  // [x] takes one mission off; [Clear All] the rest.
  expect(await squad.find({ key: 'squad-clear' })).toBeDefined()
  expect(await squad.find({ key: 'mission-x-1' })).toBeDefined()
  await squad.press({ key: 'mission-x-1' })
  expect(await text('Run-Test')).toBeUndefined()
  expect(await text(/No Party Combo sent yet/)).toBeDefined()
  expect(await squad.find({ key: 'squad-clear' })).toBeUndefined()
  await squad.unmount()
})
