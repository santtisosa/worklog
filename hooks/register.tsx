import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Entries, Row, Today } from '../types'
import {
  addTime, branchFromHead, dayOf, formatDuration, keyOf, labelOf, mergeEntries, toCsv, toRows, weekStartOf,
} from './worklog'

const PANE = 'worklog'
const MINUTE = 60_000
const LABEL_LENGTH = 32
const DAY_COLUMN = 12
const REPO_COLUMN = 20
const LABEL_COLUMN = 36

const entries = atom({ plugin: 'worklog', key: 'entries' } as const, {} as Entries)
const today = atom({ plugin: 'worklog', key: 'today' } as const, null as Today | null)
const week = atom({ plugin: 'worklog', key: 'week' } as const, [] as Row[])

async function folderOf($: EngineInterface): Promise<string> {
  return `${(await $.env.get('HOME')) ?? '.'}/.claude/worklog`
}

async function branchOf($: EngineInterface, root: string): Promise<string> {
  const dotGit = `${root}/.git`

  if(!(await $.fs.exists(dotGit))) {
    return '-'
  }

  const isWorktree = (await $.fs.stat(dotGit)).kind === 'file'
  const gitDir = isWorktree ? (await $.fs.read(dotGit)).replace(/^gitdir:\s*/, '').trim() : dotGit

  return branchFromHead(await $.fs.read(`${gitDir}/HEAD`))
}

async function currentKey($: EngineInterface, at: number): Promise<{ key: string; label: string }> {
  const root = await $.session.root()
  const repo = (await $.session.repo())?.name ?? root.split('/').pop() ?? root
  const label = labelOf(await branchOf($, root))

  return { key: keyOf(dayOf(at), repo, label), label }
}

async function everySession($: EngineInterface): Promise<Entries> {
  const folder = await folderOf($)

  if(!(await $.fs.exists(folder))) {
    return {}
  }

  const files = (await $.fs.list(folder)).filter(file => file.kind === 'file' && file.name.endsWith('.json'))
  const all = await Promise.all(files.map(async file => JSON.parse(await $.fs.read(`${folder}/${file.name}`)) as Entries))

  return mergeEntries(all)
}

async function showToday($: EngineInterface, isStatus: boolean) {
  const at = await $.clock.now()
  const { key, label } = await currentKey($, at)
  const ms = (await everySession($))[key] ?? 0
  const short = label.length > LABEL_LENGTH ? `${label.slice(0, LABEL_LENGTH - 1)}…` : label
  await update($, today, () => ({ label: short, ms }))

  if(isStatus) {
    $.ui.status(`⏱ ${short} ${formatDuration(ms)}`)
  }
}

async function addWork($: EngineInterface, ms: number, isStatus: boolean) {
  if(ms <= 0) {
    return
  }

  const { key } = await currentKey($, await $.clock.now())
  const mine = await update($, entries, current => addTime(current, key, ms))
  await $.fs.write(`${await folderOf($)}/${await $.session.id()}.json`, JSON.stringify(mine))
  await showToday($, isStatus)
}

export const register: Register = (on, options) => {
  const isStatus = String(options.placement ?? 'hint') === 'status'
  const idleMs = Number(options.idleMinutes ?? 5) * MINUTE
  // ponytail: kept in the module, so a reload forgets the last reply and skips one pause at most
  let lastReplyAt: number | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: PANE, description: 'Time worked per repo and branch this week', argumentHint: '[export]' })
    $.ui.status(undefined)
    await showToday($, isStatus)

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    const isNewTurn = e.turnId === undefined && lastReplyAt !== undefined

    if(isNewTurn) {
      const pause = (await $.clock.now()) - lastReplyAt!
      await addWork($, pause <= idleMs ? pause : 0, isStatus)
    }

    return next(e)
   }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if(e.agentId === undefined) {
      await addWork($, e.durationMs, isStatus)
      lastReplyAt = await $.clock.now()
    }

    return next(e)
   }).catch(($, e, next) => next(e))

  on('command.run', { command: PANE }, async ($, e) => {
    const rows = toRows(await everySession($), weekStartOf(await $.clock.now()))

    if(e.args.trim() === 'export') {
      const path = `${await folderOf($)}/worklog.csv`
      await $.fs.write(path, toCsv(toRows(await everySession($), '')))

      return { text: `Timesheet written to ${path}` }
    }

    await update($, week, () => rows)
    await $.ui.open({ id: PANE, title: 'Worklog · this week', focus: true, closeOnEscape: true })

    return { text: 'Worklog opened.' }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const line = await next(e)
    const current = await read($, today)

    if(isStatus || current === null) {
      return line
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box gap={2}>
        {line}
        <Box gap={1}>
          <Text color="magenta">⏱</Text>
          <Text color="cyan">{current.label}</Text>
          <Text color="magenta" bold>{formatDuration(current.ms)}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const rows = await read($, week)
    const { Box, Text } = $.ui.resolve(e)
    const total = rows.reduce((sum, row) => sum + row.ms, 0)

    return (
      <Box flexDirection="column">
        {rows.length === 0 ? <Text dimColor>Nothing logged this week yet.</Text> : null}
        {rows.map(row => (
          <Box key={`${row.day}|${row.repo}|${row.label}`}>
            <Box width={DAY_COLUMN}><Text dimColor>{row.day}</Text></Box>
            <Box width={REPO_COLUMN}><Text wrap="truncate-end">{row.repo}</Text></Box>
            <Box width={LABEL_COLUMN}><Text wrap="truncate-end">{row.label}</Text></Box>
            <Text bold>{formatDuration(row.ms)}</Text>
          </Box>
        ))}
        <Text dimColor>{`Total this week: ${formatDuration(total)} · /worklog export for a CSV`}</Text>
      </Box>
    )
  })
}
