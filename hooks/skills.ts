// The Skill Box's skills: each a slash command, a category to file it under,
// and a few words drawn dim after its name.

export type Skill = {
  name: string
  category: string
  description?: string
  // The slash command it runs, when not its own name (Unload runs /compact).
  command?: string
}

export const DEFAULT_CATEGORY = 'General'

// Always in the box, ahead of the person's own: Unload compacts the context.
export const BUILT_IN: readonly Skill[] = [
  { name: 'Unload', category: DEFAULT_CATEGORY, description: 'compact context window', command: 'compact' },
]

// What the store held before categories (plain names) reads as General skills.
export function skillsFrom(kept: unknown): Skill[] {
  if (!Array.isArray(kept)) return []
  return kept.flatMap((s): Skill[] => {
    if (typeof s === 'string') return [{ name: s, category: DEFAULT_CATEGORY }]
    if (s && typeof s === 'object' && typeof (s as Skill).name === 'string') {
      const { name, category, description } = s as Skill
      return [{ name, category: typeof category === 'string' && category ? category : DEFAULT_CATEGORY, ...(description ? { description } : {}) }]
    }
    return []
  })
}

// The box's categories in order (General first, then as first registered),
// each with its skills: the built-ins, then the person's.
export function grouped(own: readonly Skill[]): { category: string; skills: Skill[] }[] {
  const all = [...BUILT_IN, ...own.filter(s => !BUILT_IN.some(b => b.name === s.name))]
  const order = [DEFAULT_CATEGORY, ...new Set(all.map(s => s.category).filter(c => c !== DEFAULT_CATEGORY))]
  return order.map(category => ({ category, skills: all.filter(s => s.category === category) }))
}

// `add <skill> [--category <name>] [--desc <words…>]`: the description runs to
// the end of the line, so it comes last when both are given.
export function parseAdd(args: string): Skill | undefined {
  const m = args.trim().match(/^\/?(\S+)(?:\s+--category\s+(\S+))?(?:\s+--desc\s+(.+))?\s*$/)
  if (!m) return undefined
  const [, name, category, description] = m
  return { name: name!, category: category ?? DEFAULT_CATEGORY, ...(description ? { description: description.trim() } : {}) }
}
