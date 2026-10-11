import { expect, mock, test } from 'claude-code/testing'

import { addLayer, addStep, agentLabel, forSteps, comboPrompt, combosFrom, comboSummary, cycleAgent, cycleModel, moveLayer, newComboName, removeLayer, removeStep, renameOk, reportsDir, rallyDir, rallyMessage, setCondition, addCondition, removeCondition, conditionsOf, stepTag } from './combos'
import type { Combo } from './combos'

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

// Run-Test: build, then test, then check and archive at once, then debug
// should the check say Fail.
const runTest = (): Combo => {
  let c: Combo = { name: 'Run-Test', layers: [] }
  c = addStep(addLayer(c), 0, 'build')
  c = addStep(addLayer(c), 1, 'unit-test')
  c = addStep(addStep(addLayer(c), 2, 'check'), 2, 'archive')
  c = cycleModel(c, 2, 0)
  c = setCondition(addCondition(c, 2), 2, 0, 'If Pass, report done and stop; if Fail, report Fail and go on.')
  return addStep(addLayer(c), 3, 'debug-log')
}

test('a combo is built a layer and a skill at a time', () => {
  const c = runTest()
  expect(c.layers.map(l => l.steps.map(s => `${s.skill}:${s.model}`))).toEqual([['build:haiku'], ['unit-test:haiku'], ['check:sonnet', 'archive:haiku'], ['debug-log:haiku']])
  expect(comboSummary(c)).toBe('4 waves · 5 skills')
  // Models go round the families; subagent types round those offered.
  expect(cycleModel(cycleModel(cycleModel(c, 0, 0), 0, 0), 0, 0).layers[0]!.steps[0]!.model).toBe('fable')
  expect(cycleModel(cycleModel(cycleModel(cycleModel(c, 0, 0), 0, 0), 0, 0), 0, 0).layers[0]!.steps[0]!.model).toBe('haiku')
  expect(cycleAgent(c, 0, 0, ['general-purpose', 'Explore']).layers[0]!.steps[0]!.agent).toBe('Explore')
  expect(cycleAgent(c, 0, 0, ['Explore', 'Plan']).layers[0]!.steps[0]!.agent).toBe('Explore')
  // Waves move and go; a step goes; a condition goes, the list with its last.
  expect(moveLayer(c, 0, 1).layers.map(l => l.steps[0]!.skill)).toEqual(['unit-test', 'build', 'check', 'debug-log'])
  expect(moveLayer(c, 0, -1)).toEqual(c)
  expect(removeLayer(c, 3).layers).toHaveLength(3)
  expect(removeStep(c, 2, 0).layers[2]!.steps.map(s => s.skill)).toEqual(['archive'])
  expect(removeCondition(c, 2, 0).layers[2]!.conditions).toBeUndefined()
  const two = setCondition(addCondition(c, 2), 2, 1, 'else go back to wave 1')
  expect(two.layers[2]!.conditions).toEqual(['If Pass, report done and stop; if Fail, report Fail and go on.', 'else go back to wave 1'])
  expect(removeCondition(two, 2, 0).layers[2]!.conditions).toEqual(['else go back to wave 1'])
  expect(conditionsOf({ conditions: [' a ', '  ', 'b'] })).toEqual(['a', 'b'])
})

test('steps take general, explore, plan and the person\'s own agents', () => {
  expect(['general-purpose', 'Explore', 'Plan', 'my-agent'].map(agentLabel)).toEqual(['general', 'explore', 'plan', 'my-agent'])
  expect(forSteps('claude-code-guide', 'built-in')).toBe(false)
  expect(forSteps('statusline-setup', 'built-in')).toBe(false)
  expect(forSteps('claude', 'userSettings')).toBe(false)
  expect(forSteps('Explore', 'built-in')).toBe(false)
  expect(forSteps('reviewer', 'projectSettings')).toBe(true)
})

test('names: fresh ones count up, a rename refuses empty and taken names', () => {
  const list = [{ name: 'Combo 1', layers: [] }, { name: 'Run-Test', layers: [] }]
  expect(newComboName(list)).toBe('Combo 2')
  expect(renameOk(list, 'Combo 1', '  Lint  Fix ')).toBe('Lint Fix')
  expect(renameOk(list, 'Combo 1', 'Run-Test')).toBeUndefined()
  expect(renameOk(list, 'Combo 1', ' ')).toBeUndefined()
})

test('what the store kept is cleaned up', () => {
  expect(combosFrom(undefined)).toEqual([])
  expect(
    combosFrom([
      { name: 'A', layers: [{ steps: [{ skill: 'x', model: 'gpt', agent: '' }, { model: 'opus' }], conditions: [' ', 3] }] },
      // An earlier version kept one condition, a string.
      { name: 'Old', layers: [{ steps: [{ skill: 'y', model: 'opus', agent: 'Plan' }], condition: 'if Fail, stop' }] },
      { name: 'A', layers: [] },
      { name: '' },
      'B',
    ]),
  ).toEqual([
    { name: 'A', layers: [{ steps: [{ skill: 'x', model: 'haiku', agent: 'general-purpose' }] }] },
    { name: 'Old', layers: [{ steps: [{ skill: 'y', model: 'opus', agent: 'Plan' }], conditions: ['if Fail, stop'] }] },
  ])
})

test('the leader is told each layer in order, its steps fanned out at once, and the conditions', () => {
  const text = comboPrompt(runTest(), 'only the vitals tests')!
  expect(text).toContain('Run the Party Combo "Run-Test"')
  expect(text).toContain('Input: only the vitals tests')
  expect(text).toContain(`Wave 3 (all at once):\n- ${stepTag('Run-Test', 2, 0)} skill /check, model sonnet, subagent_type general-purpose\n- [Run-Test 3.2] skill /archive, model haiku`)
  expect(text).toContain('judge what came back: If Pass, report done and stop; if Fail, report Fail and go on.')
  expect(text.indexOf('Wave 1:')).toBeLessThan(text.indexOf('Wave 2:'))
  // More than one: judged in order, the first that holds deciding.
  const many = comboPrompt(setCondition(addCondition(runTest(), 2), 2, 1, 'If it fails 3 times, stop'), '')!
  expect(many).toContain('against these conditions in order; the first that holds decides what you do:\n  1. If Pass, report done and stop; if Fail, report Fail and go on.\n  2. If it fails 3 times, stop')
  expect(comboPrompt({ name: 'Empty', layers: [{ steps: [] }] }, '')).toBeUndefined()
  // A press's mission number goes in its first line and every tag.
  const numbered = comboPrompt(runTest(), '', 7)!
  expect(numbered).toContain('Run the Party Combo "Run-Test" (mission #7).')
  expect(numbered).toContain('- [Run-Test #7 3.2] skill /archive')
  expect(stepTag('Run-Test', 0, 0, 7)).toBe('[Run-Test #7 1.1]')
})

test('given a reports folder, the leader hands earlier reports on by path, not retold', () => {
  const dir = reportsDir('/home/me', 7)
  expect(dir).toBe('/home/me/.claude/slime-dashboard/missions/7')
  const text = comboPrompt(runTest(), '', 7, true, dir)!
  expect(text).toContain(`- [Run-Test #7 3.2] skill /archive, model haiku, subagent_type general-purpose, report ${dir}/w3-s2.md`)
  expect(text).toContain('Do not retell an earlier step')
  expect(text).toContain('the paths of the earlier reports it needs')
  expect(text).not.toContain('whatever earlier steps found')
  // A long output goes beside the step's report, in the mission's folder.
  expect(text).toContain(`send that output to a file in ${dir}, named after its own report`)
  // Without one, the leader passes on what it needs, as before.
  const plain = comboPrompt(runTest(), '', 7, true)!
  expect(plain).toContain('whatever earlier steps found that it needs')
  expect(plain).not.toContain('report /')
})

test('a combo sent back to an earlier wave wakes the subagents that ran it', () => {
  const text = comboPrompt(runTest(), '', 7, true)!
  expect(text).toContain('waking the subagents that ran them, with SendMessage')
  expect(text).toContain('not reuse or change its last result')
  // It says which condition held, a line Dungeon reads; and leaves the reports to the dashboard.
  expect(text).toContain('`Condition: wave N #K`')
  expect(comboPrompt(runTest(), '', 7, true, reportsDir('/home/me', 7))!).toContain('do not ask a step to write it, nor check that it did')
  // With a reports folder, the leader hears of each step's rounds file, to hand on where needed.
  expect(comboPrompt(runTest(), '', 7, true, reportsDir('/home/me', 7))!).toContain('`.rounds.md` file beside it (`w1-s1.rounds.md`)')
  expect(text).not.toContain('.rounds.md')
})

test('a leader ends its answer saying whether the mission cleared or the wave it fell at', () => {
  expect(comboPrompt(runTest(), '', 7, true)!).toContain('`Mission: fell at wave N`')
  expect(comboPrompt(runTest(), '', 7, false)!).not.toContain('Mission: fell')
})

test('a Rally: the leader woken runs again from its wave; a new leader reads the log first', () => {
  const dir = reportsDir('/home/me', 7)
  const before = rallyDir(dir, 1)
  expect(before).toBe(`${dir}/rally-1`)
  const woken = rallyMessage(runTest(), 7, 3, before)
  expect(woken).toContain('again from wave 3')
  expect(woken).toContain('The waves before wave 3 stand as they ended')
  expect(woken).toContain(`old reports of the waves run again are in ${before}`)
  expect(woken).toContain('`Mission: fell at wave N`')
  const fresh = comboPrompt(runTest(), 'go', 7, true, dir, { from: 3, before })!
  expect(fresh).toContain(`First read ${before}/leader.md`)
  expect(fresh).toContain('Wave 1 (ran before; not run again):')
  expect(fresh).toContain(`report ${dir}/w1-s1.md`)
  expect(fresh).toContain('Wave 3 (all at once):')
  expect(fresh).toContain('If Pass')
  // A wave that stands is not judged again; a press that is no Rally says none.
  expect(comboPrompt(runTest(), '', 7, true, dir, { from: 4, before })!).not.toContain('If Pass')
  expect(comboPrompt(runTest(), '', 7, true, dir)!).not.toContain('This is a Rally')
})

test('Party Combo section builds a combo in a draft; [Save] keeps it and the Skill Box runs it under Party Combo', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  // A press sends a leader subagent; the conversation gets nothing.
  const sent: string[] = []
  const led: { description: string; model?: string }[] = []
  on('agent.spawn', async (_$, e) => {
    sent.push(e.prompt)
    led.push({ description: e.description, model: e.model })
    return { agentId: `lead${led.length}`, model: 'claude-sonnet-5-5' }
  })
  on('agent.list', async () => ({ value: led.map((l, i) => ({ id: `lead${i + 1}`, description: l.description, status: 'running' })) }) as never)
  const submitted: string[] = []
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  for (const args of ['add build --category Code', 'add unit-test --category Code']) {
    await $.command.run({ command: PLUGIN, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tree-toggle' })
  await ui.press({ key: 'combo-new' })
  expect((await ui.find({ key: 'combo-tab-Combo 1' }))?.text).toBe('[Combo 1*]')
  expect(await ui.find({ key: 'combo-run' })).toBeUndefined()
  // Wave 1 gets build; a new wave 2 gets unit-test, on Sonnet.
  await ui.press({ key: 'wave-add-0' })
  await ui.press({ key: 'pick-0-build' })
  // A skill already in the wave is not offered again.
  expect(await ui.find({ key: 'pick-0-build' })).toBeUndefined()
  expect(await ui.find({ key: 'pick-0-unit-test' })).toBeDefined()
  await ui.press({ key: 'wave-new' })
  await ui.press({ key: 'wave-add-1' })
  await ui.press({ key: 'pick-1-unit-test' })
  await ui.press({ key: 'step-model-1-0' })
  expect((await ui.find({ key: 'step-model-1-0' }))?.text).toBe('Sonnet')
  expect((await ui.find({ key: 'step-agent-1-0' }))?.text).toBe('general')
  await ui.press({ key: 'wave-cond-add-1' })
  await ui.input({ key: 'cond-1-0', text: 'if Fail, say so', kind: 'submit' })
  expect((await ui.find({ key: 'wave-cond-1-0' }))?.text).toBe('◆ if Fail, say so')
  // A second one under it; one left empty goes.
  await ui.press({ key: 'wave-cond-add-1' })
  await ui.input({ key: 'cond-1-1', text: 'if 3 fails, stop', kind: 'submit' })
  expect((await ui.find({ key: 'wave-cond-1-1' }))?.text).toBe('◆ if 3 fails, stop')
  await ui.press({ key: 'wave-cond-add-1' })
  await ui.input({ key: 'cond-1-2', text: '  ', kind: 'submit' })
  expect(await ui.find({ key: 'wave-cond-1-2' })).toBeUndefined()
  expect(await ui.find({ key: 'wave-cond-0-0' })).toBeUndefined()
  expect((await ui.find({ key: 'wave-cond-add-0' }))?.text).toBe('◆ + condition')
  // An empty wave goes when the combo is saved.
  await ui.press({ key: 'wave-new' })
  expect(await ui.find({ key: 'wave-remove-2' })).toBeDefined()
  await ui.press({ key: 'combo-rename' })
  await ui.input({ key: 'combo-name', text: 'Run-Test', kind: 'change' })
  await ui.press({ key: 'combo-rename' })
  expect((await ui.find({ key: 'combo-fold' }))?.text).toBe('▾ Run-Test *')
  // Unsaved, it is not in the Skill Box yet.
  await ui.press({ key: 'skills-toggle' })
  expect(await ui.find({ key: 'combo-Run-Test' })).toBeUndefined()
  await ui.press({ key: 'combo-save' })
  expect((await ui.find({ key: 'combo-fold' }))?.text).toBe('▾ Run-Test')
  expect(await ui.find({ key: 'wave-remove-2' })).toBeUndefined()
  expect((await ui.find({ key: 'skillcat-Party Combo' }))?.text).toBe('▼ Party Combo')
  await ui.input({ key: 'skill-prompt-0', text: 'all tests', kind: 'change' })
  await ui.press({ key: 'combo-Run-Test' })
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain('[Run-Test #1 2.1] skill /unit-test, model sonnet')
  expect(sent[0]).toContain('Input: all tests')
  expect(sent[0]).toContain('  1. if Fail, say so\n  2. if 3 fails, stop')
  expect(sent[0]).toContain('However the Agent tool runs them, wait for every report')
  expect(led[0]).toEqual({ description: '[Run-Test #1] lead the Party Combo', model: 'sonnet' })
  expect(submitted).toHaveLength(0)
  // A trial edit left unsaved runs nothing new: the Skill Box runs the saved combo.
  await ui.press({ key: 'step-remove-1-0' })
  await ui.press({ key: 'combo-Run-Test' })
  expect(sent[1]).toContain('/unit-test')
  expect(led[1]!.description).toBe('[Run-Test #2] lead the Party Combo')
  // The name folds the box and opens it again.
  await ui.press({ key: 'combo-fold' })
  expect(await ui.find({ key: 'wave-new' })).toBeUndefined()
  await ui.press({ key: 'combo-fold' })
  // Delete asks first: [N] backs out, [Y] deletes.
  await ui.press({ key: 'combo-delete' })
  await ui.press({ key: 'combo-delete-no' })
  expect(await ui.find({ key: 'combo-tab-Run-Test' })).toBeDefined()
  await ui.press({ key: 'combo-delete' })
  await ui.press({ key: 'combo-delete-yes' })
  expect(await ui.find({ key: 'combo-tab-Run-Test' })).toBeUndefined()
  expect(await ui.find({ key: 'combo-Run-Test' })).toBeUndefined()
  await ui.unmount()
})

test('a combo with no subagent to lead it asks the conversation to lead it instead', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  on('agent.spawn', async () => {
    throw new Error('no subagents here')
  })
  const submitted: string[] = []
  on('prompt.submit', async (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  await $.command.run({ command: PLUGIN, args: 'add build --category Code', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tree-toggle' })
  await ui.press({ key: 'combo-new' })
  await ui.press({ key: 'wave-add-0' })
  await ui.press({ key: 'pick-0-build' })
  await ui.press({ key: 'combo-save' })
  await ui.press({ key: 'skills-toggle' })
  await ui.press({ key: 'combo-Combo 1' })
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain('Run the Party Combo "Combo 1" (mission #1)')
  expect(submitted[0]).not.toContain('However the Agent tool runs them')
  await ui.unmount()
})
