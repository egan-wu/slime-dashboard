export type SlimeModel = string
// A Skill Box skill (hooks/skills.ts): its command, category and dim description.
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
      waiting: boolean
      skills: SlimeSkill[]
      skillsOpen: boolean
      skillPrompt: string
      skillTops: Record<string, number>
      skillCatsClosed: string[]
      propsOpen: boolean
      tally: SlimeTally
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
      order: Array<'stats' | 'scene' | 'models' | 'property' | 'skills' | 'monitor' | 'events'>
      behind: boolean
    }
  }
}
