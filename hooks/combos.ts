// Party Combos: a chain of Skill Box skills, each run by a subagent, which the
// main model leads. A combo is waves (`layers`) run one after another; every
// step of a wave is fanned out at once, and the next wave waits for them all.
// After a wave, optional conditions tell the leader what to do with what came
// back (report and stop, go on, go back to a wave, …), in the person's own
// words: judged in order, the first that holds decides.

export const COMBO_MODELS = ['haiku', 'sonnet', 'opus', 'fable'] as const
export type ComboModel = (typeof COMBO_MODELS)[number]

// The built-in subagent types a step can take, in the order a press cycles
// them; the person's own agents follow.
export const DEFAULT_AGENTS = ['general-purpose', 'Explore', 'Plan'] as const

// The engine's other agents each do one job of their own (Claude Code's docs,
// the status line) or repeat general-purpose, and run no skill: never offered.
const NOT_FOR_STEPS = ['claude', 'claude-code-guide', 'statusline-setup']

// Whether a subagent type the session offers can take a step: the person's own
// and plugins' agents can; of the built-ins, those above already are.
export const forSteps = (agent: string, source: string): boolean =>
  source !== 'built-in' && !NOT_FOR_STEPS.includes(agent) && !(DEFAULT_AGENTS as readonly string[]).includes(agent)

// How a step shows its subagent type: the built-ins short and lower case.
export const agentLabel = (agent: string): string =>
  agent === 'general-purpose' ? 'general' : (DEFAULT_AGENTS as readonly string[]).includes(agent) ? agent.toLowerCase() : agent

export type ComboStep = { skill: string; model: ComboModel; agent: string }
export type ComboLayer = { steps: ComboStep[]; conditions?: string[] }
export type Combo = { name: string; layers: ComboLayer[] }

export const COMBO_CATEGORY = 'Party Combo'

const isModel = (v: unknown): v is ComboModel => COMBO_MODELS.includes(v as ComboModel)

// What the store kept, with anything unreadable dropped and names made unique.
export function combosFrom(kept: unknown): Combo[] {
  if (!Array.isArray(kept)) return []
  const out: Combo[] = []
  for (const c of kept) {
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) continue
    if (out.some(o => o.name === c.name)) continue
    const layers: ComboLayer[] = (Array.isArray(c.layers) ? c.layers : []).flatMap((l: unknown): ComboLayer[] => {
      if (!l || typeof l !== 'object') return []
      const { steps, conditions, condition } = l as ComboLayer & { condition?: unknown }
      const kept: ComboStep[] = (Array.isArray(steps) ? steps : []).flatMap((s: unknown): ComboStep[] => {
        if (!s || typeof s !== 'object') return []
        const { skill, model, agent } = s as ComboStep
        if (typeof skill !== 'string' || !skill) return []
        return [{ skill, model: isModel(model) ? model : 'haiku', agent: typeof agent === 'string' && agent ? agent : DEFAULT_AGENTS[0] }]
      })
      // One condition, as an earlier version kept it, is a list of one.
      const said = (Array.isArray(conditions) ? conditions : [condition]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      return [{ steps: kept, ...(said.length ? { conditions: said } : {}) }]
    })
    out.push({ name: c.name, layers })
  }
  return out
}

// A fresh combo's name: `Combo 1`, `Combo 2`, … the first not taken.
export function newComboName(combos: readonly Combo[]): string {
  for (let n = 1; ; n++) if (!combos.some(c => c.name === `Combo ${n}`)) return `Combo ${n}`
}

// A name for a rename: trimmed, and refused when empty or another's.
export function renameOk(combos: readonly Combo[], from: string, to: string): string | undefined {
  const name = to.trim().replace(/\s+/g, ' ')
  if (!name || (name !== from && combos.some(c => c.name === name))) return undefined
  return name
}

const swap = <T>(list: readonly T[], at: number, by: -1 | 1): T[] => {
  const to = at + by
  if (at < 0 || at >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  next[at] = list[to]!
  next[to] = list[at]!
  return next
}

// The edits the Party Combo section makes, each giving a new combo.
export const addLayer = (c: Combo): Combo => ({ ...c, layers: [...c.layers, { steps: [] }] })
export const moveLayer = (c: Combo, at: number, by: -1 | 1): Combo => ({ ...c, layers: swap(c.layers, at, by) })
export const removeLayer = (c: Combo, at: number): Combo => ({ ...c, layers: c.layers.filter((_, i) => i !== at) })

const editLayer = (c: Combo, at: number, fn: (l: ComboLayer) => ComboLayer): Combo => ({
  ...c,
  layers: c.layers.map((l, i) => (i === at ? fn(l) : l)),
})

export const addStep = (c: Combo, layer: number, skill: string): Combo =>
  editLayer(c, layer, l => ({ ...l, steps: [...l.steps, { skill, model: 'haiku', agent: DEFAULT_AGENTS[0] }] }))

export const removeStep = (c: Combo, layer: number, step: number): Combo =>
  editLayer(c, layer, l => ({ ...l, steps: l.steps.filter((_, i) => i !== step) }))

const editStep = (c: Combo, layer: number, step: number, fn: (s: ComboStep) => ComboStep): Combo =>
  editLayer(c, layer, l => ({ ...l, steps: l.steps.map((s, i) => (i === step ? fn(s) : s)) }))

// The step's next model, round the families.
export const cycleModel = (c: Combo, layer: number, step: number): Combo =>
  editStep(c, layer, step, s => ({ ...s, model: COMBO_MODELS[(COMBO_MODELS.indexOf(s.model) + 1) % COMBO_MODELS.length]! }))

// The step's next subagent type, round those offered (from the first, when
// its own is no longer one of them).
export const cycleAgent = (c: Combo, layer: number, step: number, agents: readonly string[]): Combo =>
  editStep(c, layer, step, s => ({ ...s, agent: agents[(agents.indexOf(s.agent) + 1) % agents.length] ?? s.agent }))

// A wave's conditions: one more (empty, to be written), one written, one gone;
// a wave left with none has no list.
export const addCondition = (c: Combo, layer: number): Combo => editLayer(c, layer, l => ({ ...l, conditions: [...(l.conditions ?? []), ''] }))

export const setCondition = (c: Combo, layer: number, at: number, text: string): Combo =>
  editLayer(c, layer, l => ({ ...l, conditions: (l.conditions ?? []).map((x, k) => (k === at ? text : x)) }))

export const removeCondition = (c: Combo, layer: number, at: number): Combo =>
  editLayer(c, layer, l => {
    const { conditions, ...rest } = l
    const left = (conditions ?? []).filter((_, k) => k !== at)
    return left.length ? { ...rest, conditions: left } : rest
  })

// A wave's conditions as written: the blank ones left out.
export const conditionsOf = (l: { conditions?: readonly string[] }): string[] => (l.conditions ?? []).map(x => x.trim()).filter(Boolean)

// What a combo holds, dim after its button in the Skill Box: `2 layers · 3 skills`.
export function comboSummary(c: Combo): string {
  const steps = c.layers.reduce((n, l) => n + l.steps.length, 0)
  const layers = c.layers.filter(l => l.steps.length > 0).length
  return `${layers} wave${layers === 1 ? '' : 's'} · ${steps} skill${steps === 1 ? '' : 's'}`
}

// The tag each Agent call's description starts with, so a step can be told
// apart: `[Run-Test #3 2.1]`, `#3` the press (Dungeon's mission) it is of,
// when the press has one.
export const stepTag = (combo: string, layer: number, step: number, mission?: number) =>
  `[${combo}${mission === undefined ? '' : ` #${mission}`} ${layer + 1}.${step + 1}]`

// The model a combo's leader runs on: a subagent of its own, so the person's
// conversation is never the one that leads it.
export const LEADER_MODEL: ComboModel = 'sonnet'

// The tool a combo's subagents ask the person with (served by register.tsx):
// the question shows on the step's card in Dungeon, and the answer comes back
// as the tool's result.
export const ASK_TOOL_NAME = 'ask_person'
export const ASK_TOOL = `mcp__slime-dashboard__${ASK_TOOL_NAME}`

// Where the dashboard keeps a mission's step reports, and one step's in it:
// `<home>/.claude/slime-dashboard/missions/3/w2-s1.md`, wave 2's first step.
export const reportsDir = (home: string, mission: number) => `${home}/.claude/slime-dashboard/missions/${mission}`
export const reportPath = (dir: string, layer: number, step: number) => `${dir}/w${layer + 1}-s${step + 1}.md`
// Every round's report of a step run again (a condition taking the combo back
// to its wave), one after another: `w2-s1.rounds.md` beside `w2-s1.md`, which
// holds the latest alone.
export const roundsPath = (dir: string, layer: number, step: number) => `${dir}/w${layer + 1}-s${step + 1}.rounds.md`

// Where a Rally keeps what the run before it left (the reports of the waves
// run again, and its leader's log): `<reports>/rally-1`, the mission's first.
export const rallyDir = (dir: string, rally: number) => `${dir}/rally-${rally}`

// The line a leader's answer ends with, so Dungeon knows the wave a combo fell at.
const OUTCOME_LINE =
  'End your answer with a line of its own: `Mission: cleared` when every wave ran and every condition held, else `Mission: fell at wave N`, N the first wave whose steps failed or whose condition stopped the combo.'

// What the leader of mission `mission` is sent to rally it from wave `from`
// (Dungeon's ⚑ Rally), woken with all it did before: the waves before stand,
// those from `from` run again, and `before` keeps their old reports.
export function rallyMessage(combo: Combo, mission: number, from: number, before: string): string {
  return [
    `Rally: the person sends mission #${mission} of "${combo.name}" again from wave ${from}. Run wave ${from} and every wave after it again, as the combo's lines above name them, with fresh subagents and the same tags; each new report is saved at its path as before.`,
    `The waves before wave ${from} stand as they ended: do not run them again, their reports stay at their paths, and their conditions are taken as held.`,
    `What went wrong before is in this conversation, and the old reports of the waves run again are in ${before}, under the same names. Tell each step of wave ${from} in a line what failed there before and where its old report is, so it can check that it is fixed this time.`,
    `When the combo ends, answer as before. ${OUTCOME_LINE}`,
  ].join('\n\n')
}

// The description a leader's Agent call starts with: `[Run-Test #3] lead`.
export const leaderTag = (combo: string, mission: number) => `[${combo} #${mission}] lead`

// The prompt the leader gets to lead the combo: every layer in order, its
// steps fanned out at once with the model and subagent type each names, and
// the conditions to judge after a layer. Empty layers are skipped; a combo
// with no step at all has nothing to run. `mission` numbers this press;
// `subagent` says the leader is one, which waits on each step in the
// foreground and answers with the report; `reports`, the folder the dashboard
// keeps each step's report in, that the leader hands on by path, not retold;
// `rally`, a new leader's Rally (its leader before could not be woken): it
// runs from wave `from` on, `before` holding the run before's leader's log
// and old reports.
export function comboPrompt(
  combo: Combo,
  input: string,
  mission?: number,
  subagent = false,
  reports?: string,
  rally?: { from: number; before: string },
): string | undefined {
  const layers = combo.layers.filter(l => l.steps.length > 0)
  if (layers.length === 0) return undefined
  const lines = [
    `Run the Party Combo "${combo.name}"${mission === undefined ? '' : ` (mission #${mission})`}. You lead it: hand each step below to a subagent with the Agent tool, with exactly the model and subagent_type it names, and do not do a step's work yourself.`,
    'Run the waves in order. Dispatch every step of a wave at once, as parallel Agent calls in one message, and wait for all of them to report before you go on. Begin each Agent call\'s description with the step\'s tag. Tell each subagent to run its skill (the Skill tool, or the slash command) and report what came of it, and pass on the input and ' +
      (reports ? 'the paths of the earlier reports it needs.' : 'whatever earlier steps found that it needs.') +
      (reports
        ? ` Each step's full report is saved by the dashboard as the step ends, at the path its line below names: do not ask a step to write it, nor check that it did. Do not retell an earlier step's findings to a later step, in full or in summary: give it the paths of the reports it needs and tell it to read them itself; what you write to a step is its task, the input and those paths. Judge a condition on the reports as they reached you. Tell each subagent too: where its skill has a command print a long output, it may send that output to a file in ${reports}, named after its own report (\`w1-s1.out.txt\` beside \`w1-s1.md\`), and give the file's path in its report instead of copying the output out.`
        : '') +
      (subagent
        ? ' However the Agent tool runs them, wait for every report of a wave before you go on. A step the person stopped is not run again: take it as failed, and judge the condition on that.' +
          ' Each time you judge a wave\'s conditions, write a line of its own in your reply: `Condition: wave N #K`, K the place in that wave\'s list of the condition that held (#1 where it has one), or `#0` where none held.' +
          ` Tell each subagent too: whatever it sends out (a subagent, a background command), it waits for before it reports; and where its skill would ask the person something, it asks with the ${ASK_TOOL} tool and waits for the answer, never guessing it. Ask the person that way yourself, if you must.` +
          ' Where a condition sends the combo back to an earlier wave, run that wave\'s steps again by waking the subagents that ran them, with SendMessage to each one\'s agent id: tell it that this is round N of its step, a new run the person\'s combo asks for (quote the condition), that it is to run its skill again from the start as a new request, not reuse or change its last result, and in a line what failed. Keep count of each wave\'s rounds yourself. Send a new subagent instead only where the condition asks for a fresh one, or one cannot be woken.' +
          (reports
            ? ' A step run again has its latest report at its path and every round\'s, one after another, in the `.rounds.md` file beside it (`w1-s1.rounds.md`): hand a later step the latest by default, and the rounds file too where it needs what earlier rounds did (to compare attempts, or find what keeps failing), or where a condition says so.'
            : '')
        : ''),
    ...(rally
      ? [
          '',
          `This is a Rally: the combo ran before and is sent again from wave ${rally.from}. The waves before it stand as they ended: do not run them again; their reports stay at their paths, and their conditions are taken as held. First read ${rally.before}/leader.md, the log of the leader before you: what it was told, how it judged, and what went wrong. The old reports of the waves run again are in ${rally.before}, under the same names. Tell each step of wave ${rally.from} in a line what failed there before and where its old report is, so it can check that it is fixed this time.`,
        ]
      : []),
    '',
    `Input: ${input.trim() || '(none)'}`,
  ]
  combo.layers.forEach((layer, i) => {
    if (layer.steps.length === 0) return
    const done = rally !== undefined && i + 1 < rally.from
    lines.push('', `Wave ${i + 1}${done ? ' (ran before; not run again)' : layer.steps.length > 1 ? ' (all at once)' : ''}:`)
    layer.steps.forEach((s, j) =>
      lines.push(`- ${stepTag(combo.name, i, j, mission)} skill /${s.skill}, model ${s.model}, subagent_type ${s.agent}${reports ? `, report ${reportPath(reports, i, j)}` : ''}`),
    )
    const conds = done ? [] : conditionsOf(layer)
    if (conds.length === 1) lines.push(`Then, before anything else, judge what came back: ${conds[0]}`)
    if (conds.length > 1)
      lines.push('Then, before anything else, judge what came back against these conditions in order; the first that holds decides what you do:', ...conds.map((x, k) => `  ${k + 1}. ${x}`))
  })
  lines.push('', subagent ? `When the combo ends, answer with each step's result in a line or two, and which waves did not run and why. ${OUTCOME_LINE}` : 'When the combo ends, report each step\'s result in a line or two.')
  return lines.join('\n')
}
