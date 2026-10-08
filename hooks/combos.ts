// Party Combos: a chain of Skill Box skills, each run by a subagent, which the
// main model leads. A combo is waves (`layers`) run one after another; every
// step of a wave is fanned out at once, and the next wave waits for them all.
// After a wave, an optional condition tells the leader what to do with what came
// back (report and stop, go on, …), in the person's own words.

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
export type ComboLayer = { steps: ComboStep[]; condition?: string }
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
      const { steps, condition } = l as ComboLayer
      const kept: ComboStep[] = (Array.isArray(steps) ? steps : []).flatMap((s: unknown): ComboStep[] => {
        if (!s || typeof s !== 'object') return []
        const { skill, model, agent } = s as ComboStep
        if (typeof skill !== 'string' || !skill) return []
        return [{ skill, model: isModel(model) ? model : 'haiku', agent: typeof agent === 'string' && agent ? agent : DEFAULT_AGENTS[0] }]
      })
      return [{ steps: kept, ...(typeof condition === 'string' && condition.trim() ? { condition } : {}) }]
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

// The edits the Skill Tree makes, each giving a new combo.
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

export const setCondition = (c: Combo, layer: number, text: string): Combo =>
  editLayer(c, layer, l => {
    const { condition: _, ...rest } = l
    return text.trim() ? { ...rest, condition: text } : rest
  })

// What a combo holds, dim after its button in the Skill Box: `2 layers · 3 skills`.
export function comboSummary(c: Combo): string {
  const steps = c.layers.reduce((n, l) => n + l.steps.length, 0)
  const layers = c.layers.filter(l => l.steps.length > 0).length
  return `${layers} wave${layers === 1 ? '' : 's'} · ${steps} skill${steps === 1 ? '' : 's'}`
}

// The tag each Agent call's description starts with, so a step can be told apart.
export const stepTag = (combo: string, layer: number, step: number) => `[${combo} ${layer + 1}.${step + 1}]`

// The prompt the main model gets to lead the combo: every layer in order, its
// steps fanned out at once with the model and subagent type each names, and
// the conditions to judge after a layer. Empty layers are skipped; a combo
// with no step at all has nothing to run.
export function comboPrompt(combo: Combo, input: string): string | undefined {
  const layers = combo.layers.filter(l => l.steps.length > 0)
  if (layers.length === 0) return undefined
  const lines = [
    `Run the Party Combo "${combo.name}". You lead it: hand each step below to a subagent with the Agent tool, with exactly the model and subagent_type it names, and do not do a step's work yourself.`,
    'Run the waves in order. Dispatch every step of a wave at once, as parallel Agent calls in one message, and wait for all of them to report before you go on. Begin each Agent call\'s description with the step\'s tag. Tell each subagent to run its skill (the Skill tool, or the slash command) and report what came of it, and pass on the input and whatever earlier steps found that it needs.',
    '',
    `Input: ${input.trim() || '(none)'}`,
  ]
  combo.layers.forEach((layer, i) => {
    if (layer.steps.length === 0) return
    lines.push('', `Wave ${i + 1}${layer.steps.length > 1 ? ' (all at once)' : ''}:`)
    layer.steps.forEach((s, j) => lines.push(`- ${stepTag(combo.name, i, j)} skill /${s.skill}, model ${s.model}, subagent_type ${s.agent}`))
    if (layer.condition?.trim()) lines.push(`Then, before anything else, judge what came back: ${layer.condition.trim()}`)
  })
  lines.push('', 'When the combo ends, report each step\'s result in a line or two.')
  return lines.join('\n')
}
