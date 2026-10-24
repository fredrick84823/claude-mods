// hush-ui's types contract: the $.state keys its hooks module keeps.
export type TurnStats = { tools: number; added: number; removed: number }

declare module 'claude-code' {
  interface PluginState {
    'hush-ui': {
      // spinner animation frame
      frame: number
      // when the main loop's current turn started, ms
      startedAt: number
      // each finished turn's stats, keyed by its durationMs
      turns: Record<string, TurnStats>
    }
  }
}
