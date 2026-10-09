import { expect, mock, test } from 'claude-code/testing'

import { addLayer, addStep, agentLabel, forSteps, comboPrompt, combosFrom, comboSummary, cycleAgent, cycleModel, moveLayer, newComboName, removeLayer, removeStep, renameOk, setCondition, stepTag } from './combos'
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
  c = setCondition(c, 2, 'If Pass, report done and stop; if Fail, report Fail and go on.')
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
  // Waves move and go; a step goes; an emptied condition goes.
  expect(moveLayer(c, 0, 1).layers.map(l => l.steps[0]!.skill)).toEqual(['unit-test', 'build', 'check', 'debug-log'])
  expect(moveLayer(c, 0, -1)).toEqual(c)
  expect(removeLayer(c, 3).layers).toHaveLength(3)
  expect(removeStep(c, 2, 0).layers[2]!.steps.map(s => s.skill)).toEqual(['archive'])
  expect(setCondition(c, 2, '  ').layers[2]!.condition).toBeUndefined()
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
      { name: 'A', layers: [{ steps: [{ skill: 'x', model: 'gpt', agent: '' }, { model: 'opus' }], condition: ' ' }] },
      { name: 'A', layers: [] },
      { name: '' },
      'B',
    ]),
  ).toEqual([{ name: 'A', layers: [{ steps: [{ skill: 'x', model: 'haiku', agent: 'general-purpose' }] }] }])
})

test('the leader is told each layer in order, its steps fanned out at once, and the conditions', () => {
  const text = comboPrompt(runTest(), 'only the vitals tests')!
  expect(text).toContain('Run the Party Combo "Run-Test"')
  expect(text).toContain('Input: only the vitals tests')
  expect(text).toContain(`Wave 3 (all at once):\n- ${stepTag('Run-Test', 2, 0)} skill /check, model sonnet, subagent_type general-purpose\n- [Run-Test 3.2] skill /archive, model haiku`)
  expect(text).toContain('judge what came back: If Pass, report done and stop; if Fail, report Fail and go on.')
  expect(text.indexOf('Wave 1:')).toBeLessThan(text.indexOf('Wave 2:'))
  expect(comboPrompt({ name: 'Empty', layers: [{ steps: [] }] }, '')).toBeUndefined()
  // A press's mission number goes in its first line and every tag.
  const numbered = comboPrompt(runTest(), '', 7)!
  expect(numbered).toContain('Run the Party Combo "Run-Test" (mission #7).')
  expect(numbered).toContain('- [Run-Test #7 3.2] skill /archive')
  expect(stepTag('Run-Test', 0, 0, 7)).toBe('[Run-Test #7 1.1]')
})

test('Party Combo section builds a combo in a draft; [Save] keeps it and the Skill Box runs it under Party Combo', async ($, on) => {
  mock.store(on)
  mock.clock(on)
  const sent: string[] = []
  on('prompt.submit', async (_$, e) => {
    sent.push(e.text)
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
  await ui.press({ key: 'wave-cond-1' })
  await ui.input({ key: 'cond-1', text: 'if Fail, say so', kind: 'submit' })
  expect((await ui.find({ key: 'wave-cond-1' }))?.text).toBe('◆ if Fail, say so')
  expect((await ui.find({ key: 'wave-cond-0' }))?.text).toBe('◆ + condition')
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
  // A trial edit left unsaved runs nothing new: the Skill Box runs the saved combo.
  await ui.press({ key: 'step-remove-1-0' })
  await ui.press({ key: 'combo-Run-Test' })
  expect(sent[1]).toContain('/unit-test')
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
