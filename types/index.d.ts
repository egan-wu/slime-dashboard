export type SlimeModel = string
// A Skill Box skill (hooks/skills.ts): its command, category and dim description.
// A Party Combo (hooks/combos.ts): layers of skills, each step's model and
// subagent type, and a condition the leader judges after a layer.
export type SlimeComboStep = { skill: string; model: 'haiku' | 'sonnet' | 'opus' | 'fable'; agent: string }
export type SlimeCombo = { name: string; layers: { steps: SlimeComboStep[]; condition?: string }[] }
export type SlimeSkill = { name: string; category: string; description?: string; command?: string }
// One line of the Event Message block (hooks/events.ts): when, and what happened.
export type SlimeEventEntry = { at: number; text: string }
// Tokens the session's turns used, by kind (hooks/props.ts).
export type SlimeTally = { input: number; cacheWrite: number; cacheRead: number; output: number }
// What is left of the usage limits and how full the context is (hooks/vitals.ts).
export type SlimeVitals = { plan: 'subscription' | 'api'; hp: number; mp: number; cp: number }
// `done` once its subagent has handed back; its slime is then dropping out of line.
// `description` is the few words the Agent call gave its task.
export type SlimeMinion = { id: string; model: string; description?: string; done?: boolean }
// A recent session the sign's [≡] lists (hooks/summary.ts): its id, name and last write.
export type SlimeRecentSession = { id: string; title: string; at: number }
// One day of the Journal (hooks/journal.ts).
export type SlimeDay = {
  day: string; turns: number; input: number; cacheWrite: number; cacheRead: number; output: number
  cold: number; coldTokens: number; pings: number; pingRead: number; rescues: number; rescued: number; saved: number
}
export type SlimeWeather = {
  day: boolean
  sky: 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow'
  rise?: number
  set?: number
  at?: number
  readAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'slime-dashboard': {
      busy: boolean; model: SlimeModel; minions: SlimeMinion[]; weather: SlimeWeather; vitals: SlimeVitals
      sessionTitle: string
      renameOpen: boolean
      renameDraft: string
      sessionsOpen: boolean
      recentSessions: SlimeRecentSession[]
      respawnConfirm: boolean
      performance: 'high' | 'mid' | 'low'
      liveWeather: boolean
      perfOpen: boolean
      waiting: boolean
      skills: SlimeSkill[]
      skillsOpen: boolean
      skillPrompt: string
      skillPieces: string[]
      skillTops: Record<string, number>
      skillCatsClosed: string[]
      skillOrder: Record<string, string[]>
      catOrder: string[]
      combos: SlimeCombo[]
      treeOpen: boolean
      comboSel: string
      comboPick: number
      comboCond: number
      comboFold: boolean
      comboRename: boolean
      comboName: string
      comboEdits: Record<string, SlimeCombo>
      comboFresh: string[]
      comboDelete: boolean
      agents: string[]
      propsOpen: boolean
      passiveOpen: boolean
      tally: SlimeTally
      cacheTtl: { ttl: '5m' | '1h'; from: 'env' | 'setting' | 'auto' }
      cacheAt: number
      warmAuto: boolean
      warmPrefix: number
      journal: SlimeDay[]
      journalOpen: boolean
      journalWarmOpen: boolean
      iteration: number
      lastTurnMs: number
      turnStartedAt: number
      effort: string
      effortOpen: boolean
      modelOpen: boolean
      events: SlimeEventEntry[]
      monitorOpen: boolean
      eventsOpen: boolean
      settingsOpen: boolean
      displayOpen: boolean
      hidden: string[]
      colorOpen: boolean
      colors: Record<'Fable' | 'Opus' | 'Sonnet' | 'Haiku', 'purple' | 'red' | 'blue' | 'yellow' | 'green' | 'pink'>
      unloading: boolean
      orderOpen: boolean
      width: number
      order: Array<'session' | 'stats' | 'scene' | 'models' | 'passive' | 'property' | 'skills' | 'tree' | 'monitor' | 'events' | 'journal'>
      behind: boolean
    }
  }
}
