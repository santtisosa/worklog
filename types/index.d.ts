export type Entries = Record<string, number>

export type Row = { day: string; repo: string; label: string; ms: number }

export type Today = { label: string; ms: number }

declare module 'claude-code' {
  interface PluginState {
    worklog: { entries: Entries; today: Today | null; week: Row[] }
  }
}
