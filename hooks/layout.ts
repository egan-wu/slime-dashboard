// The pane's sections, which Setting's Display can hide and its Order can
// arrange; Setting itself always stays last and shown, so anything hidden or
// moved can always be brought back.

export const SECTIONS = [
  { id: 'stats', label: 'HP / MP / CP' },
  { id: 'scene', label: 'Slime' },
  { id: 'models', label: 'Model buttons' },
  { id: 'property', label: 'Property' },
  { id: 'skills', label: 'Skill Box' },
  { id: 'monitor', label: 'Sub-agent Monitor' },
  { id: 'events', label: 'Event Message' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']
export const DEFAULT_ORDER: SectionId[] = SECTIONS.map(s => s.id)

// A kept order, with anything unknown or repeated dropped and any section it
// lacks (one added since it was kept) put back at its default place's end.
export function orderFrom(value: unknown): SectionId[] {
  const known = new Set<string>(DEFAULT_ORDER)
  const kept = Array.isArray(value) ? value.filter((v): v is SectionId => typeof v === 'string' && known.has(v)) : []
  const order = [...new Set(kept)]
  return [...order, ...DEFAULT_ORDER.filter(id => !order.includes(id))]
}

// The order with `id` swapped with its neighbor `by` (-1 up, 1 down); at
// either end it stays put.
export function moveSection(order: SectionId[], id: SectionId, by: -1 | 1): SectionId[] {
  const at = order.indexOf(id)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return order
  const next = [...order]
  next[at] = order[to]!
  next[to] = id
  return next
}
