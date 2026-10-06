import type { Entries, Row } from '../types'

const MINUTE = 60_000
const DAY_MS = 24 * 60 * MINUTE
const TICKET = /[A-Z][A-Z0-9]+-\d+/
const SHORT_SHA = 7
const SEPARATOR = '|'

const pad = (value: number): string => String(value).padStart(2, '0')

export const dayOf = (ms: number): string => {
  const date = new Date(ms)

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const weekStartOf = (ms: number): string => {
  const daysSinceMonday = (new Date(ms).getDay() + 6) % 7

  return dayOf(ms - daysSinceMonday * DAY_MS)
}

export const branchFromHead = (head: string): string => {
  const ref = /^ref:\s*refs\/heads\/(.+)$/m.exec(head)?.[1]?.trim()

  return ref ?? head.trim().slice(0, SHORT_SHA)
}

export const labelOf = (branch: string): string => TICKET.exec(branch)?.[0] ?? branch

export const keyOf = (day: string, repo: string, label: string): string => [day, repo, label].join(SEPARATOR)

export const addTime = (entries: Entries, key: string, ms: number): Entries =>
  ({ ...entries, [key]: (entries[key] ?? 0) + ms })

export const mergeEntries = (all: readonly Entries[]): Entries =>
  all.reduce<Entries>(
    (merged, entries) => Object.entries(entries).reduce((sum, [key, ms]) => addTime(sum, key, ms), merged),
    {})

export const toRows = (entries: Entries, fromDay: string): Row[] =>
  Object.entries(entries)
    .map(([key, ms]) => {
      const [day = '', repo = '', label = ''] = key.split(SEPARATOR)

      return { day, repo, label, ms }
    })
    .filter(row => row.day >= fromDay)
    .sort((a, b) => b.day.localeCompare(a.day) || b.ms - a.ms)

export const formatDuration = (ms: number): string => {
  const minutes = Math.round(ms / MINUTE)
  const hours = Math.floor(minutes / 60)

  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

const csvField = (value: string): string => `"${value.replaceAll('"', '""')}"`

export const toCsv = (rows: readonly Row[]): string =>
  ['date,repo,branch_or_ticket,minutes']
    .concat(rows.map(row => [row.day, csvField(row.repo), csvField(row.label), Math.round(row.ms / MINUTE)].join(',')))
    .join('\n')
