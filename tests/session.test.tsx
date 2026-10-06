import { expect, mock, test } from 'claude-code/testing'

type Args = Parameters<Parameters<typeof test>[1]>

const HOME = '/home/me'
const FOLDER = `${HOME}/.claude/worklog`
const START = new Date(2026, 9, 5, 10, 0).getTime()

const startSession = async ($: Args[0], on: Args[1], others: Record<string, string> = {}) => {
  const files: Record<string, string> = { '/repo/.git/HEAD': 'ref: refs/heads/feature/FARM-7-launch\n', ...others }
  const clock = mock.clock(on, { now: START })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.repo', () => ({ value: { root: '/repo', remote: null, internal: false, name: 'FarmeORT' } }) as never)
  on('session.id', () => ({ value: 'session-a' }) as never)
  on('env.get', () => ({ value: HOME }) as never)
  on('command.register', ($, e) => ({ value: { command: e.name } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('fs.exists', ($, e) => ({ value: e.path === FOLDER || e.path === '/repo/.git' || e.path in files }) as never)
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }) as never)
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '' }) as never)
  on('fs.write', ($, e) => {
    files[e.path] = e.text

    return { value: undefined } as never
  })
  on('fs.list', () => ({
    value: Object.keys(files)
      .filter(path => path.startsWith(`${FOLDER}/`))
      .map(path => ({ name: path.slice(FOLDER.length + 1), kind: 'file', size: 1, mtimeMs: 0, isLink: false })),
  }) as never)
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{[e.props.hint, e.props.tail].filter(Boolean).join(' ')}</Text>
  })
  on('prompt.submit', ($, e) => ({ text: e.text }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  return { clock, files }
}

test('counts turns plus short pauses, and adds other sessions on the same ticket', async ($, on) => {
  const other = { [`${FOLDER}/session-b.json`]: JSON.stringify({ '2026-10-05|FarmeORT|FARM-7': 10 * 60_000 }) }
  const { clock, files } = await startSession($, on, other)

  await $.turn.complete({ answer: '', durationMs: 4 * 60_000, isAborted: false, turnId: 't1' } as never)
  await clock.advance(3 * 60_000)
  await $.prompt.submit({ text: 'next', wait: false, origin: 'user' } as never)
  await $.turn.complete({ answer: '', durationMs: 60_000, isAborted: false, turnId: 't2' } as never)
  await clock.advance(30 * 60_000)
  await $.prompt.submit({ text: 'after lunch', wait: false, origin: 'user' } as never)

  expect(JSON.parse(files[`${FOLDER}/session-a.json`]!)).toEqual({ '2026-10-05|FarmeORT|FARM-7': 8 * 60_000 })

  const ui = await $.ui.mount({ plugin: 'worklog', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } as never })

  expect(await ui.find({ type: 'Text', text: '? for shortcuts' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '18m' }))?.props.color).toBe('magenta')
  expect(await ui.find({ type: 'Text', text: 'FARM-7' })).toBeDefined()
})

test('writes the timesheet as CSV', async ($, on) => {
  const { files } = await startSession($, on)
  await $.turn.complete({ answer: '', durationMs: 25 * 60_000, isAborted: false, turnId: 't1' } as never)

  const result = await $.command.run({ command: 'worklog', args: 'export' } as never)

  expect(result).toEqual({ text: `Timesheet written to ${FOLDER}/worklog.csv` })
  expect(files[`${FOLDER}/worklog.csv`]).toBe('date,repo,branch_or_ticket,minutes\n2026-10-05,"FarmeORT","FARM-7",25')
})

test('shows the branch from the start, before any time is logged', async ($, on) => {
  await startSession($, on)

  const ui = await $.ui.mount({ plugin: 'worklog', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } as never })

  expect(await ui.find({ type: 'Text', text: '0m' })).toBeDefined()
})
