import { expect, test } from 'claude-code/testing'

import { branchFromHead, formatDuration, labelOf, mergeEntries, toCsv, toRows, weekStartOf } from '../hooks/worklog'

test('reads the branch from HEAD, or a short sha when detached', () => {
  expect(branchFromHead('ref: refs/heads/feature/ABC-12-login\n')).toBe('feature/ABC-12-login')
  expect(branchFromHead('3ae29d5f1c2b\n')).toBe('3ae29d5')
})

test('groups by ticket when the branch names one', () => {
  expect(labelOf('feature/ABC-12-login')).toBe('ABC-12')
  expect(labelOf('fix/webapi-validation-messages')).toBe('fix/webapi-validation-messages')
})

test('adds up the same repo and branch across sessions', () => {
  const merged = mergeEntries([{ '2026-10-05|repo|ABC-1': 60_000 }, { '2026-10-05|repo|ABC-1': 120_000, '2026-10-04|repo|x': 1 }])

  expect(merged['2026-10-05|repo|ABC-1']).toBe(180_000)
})

test('starts the week on Monday', () => {
  expect(weekStartOf(new Date(2026, 9, 5, 15).getTime())).toBe('2026-10-05')
  expect(weekStartOf(new Date(2026, 9, 11, 15).getTime())).toBe('2026-10-05')
})

test('lists the week newest day first and writes a CSV', () => {
  const rows = toRows({ '2026-10-05|repo|ABC-1': 90 * 60_000, '2026-10-06|repo|"odd"': 60_000, '2026-09-28|repo|old': 1 }, '2026-10-05')

  expect(rows.map(row => row.day)).toEqual(['2026-10-06', '2026-10-05'])
  expect(formatDuration(rows[1]!.ms)).toBe('1h 30m')
  expect(toCsv(rows)).toBe('date,repo,branch_or_ticket,minutes\n2026-10-06,"repo","""odd""",1\n2026-10-05,"repo","ABC-1",90')
})
