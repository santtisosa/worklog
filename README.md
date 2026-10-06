# worklog

A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that tracks the time you actively work with Claude, per repo and branch (or ticket), and turns it into a weekly view and a CSV timesheet.

```
⏱ ABC-123 1h 24m
```

- Active time is every reply Claude gives plus your pauses between a reply and your next prompt, up to the idle limit (5 minutes by default). Longer pauses do not count.
- A branch that names a ticket (`feature/ABC-123-login`) is grouped under the ticket; otherwise under the branch.
- Time from every Claude Code window on the same repo and branch adds up.
- `/worklog` opens this week: day, repo, branch or ticket and time, with the total.
- `/worklog export` writes everything to `~/.claude/worklog/worklog.csv`.

Everything stays on your machine: each session writes its own file in `~/.claude/worklog/`, so parallel sessions never overwrite each other.

## Install

Requires Claude Code 2.1.287 or later.

```
/plugin marketplace add santtisosa/worklog
/plugin install worklog@worklog
```

## Settings (`/config`)

| Setting | Default | |
|---|---|---|
| Placement | `hint` | `hint`: at the end of the hint line under the prompt. `status`: a pinned notice under the prompt. |
| Idle after (minutes) | `5` | Longer pauses between a reply and your next prompt are not counted. |

## Develop

```
claude plugin validate .
claude plugin test .
```

`hooks/worklog.ts` holds the pure logic (keys, merge, week, CSV); `hooks/register.tsx` wires it to Claude Code.

## License

MIT
