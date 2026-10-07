export type SlimeModel = string
// Tokens the session's turns used, by kind (hooks/props.ts).
export type SlimeTally = { input: number; cacheWrite: number; cacheRead: number; output: number }
// What is left of the usage limits and how full the context is (hooks/vitals.ts).
export type SlimeVitals = { plan: 'subscription' | 'api'; hp: number; mp: number; cp: number }
// `done` once its subagent has handed back; its slime is then dropping out of line.
// `description` is the few words the Agent call gave its task.
export type SlimeMinion = { id: string; model: string; description?: string; done?: boolean }
export type SlimeWeather = { day: boolean; sky: 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow' }

declare module 'claude-code' {
  interface PluginState {
    'slime-subagent-dashboard': {
      busy: boolean; model: SlimeModel; minions: SlimeMinion[]; weather: SlimeWeather; vitals: SlimeVitals
      waiting: boolean
      skills: string[]
      skillsOpen: boolean
      skillPrompt: string
      skillTop: number
      propsOpen: boolean
      tally: SlimeTally
      iteration: number
      lastTurnMs: number
      turnStartedAt: number
      effort: string
    }
  }
}
