// One-line summaries for the tool rows calm-ui compacts. Pure, so tests cover them.

export const COMPACT_TOOLS = new Set(['Read', 'Bash'])
const MAX = 60

const clip = (s: string, n = MAX): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// last two path segments: enough to tell files apart, short enough for one line
const shortPath = (p: string): string => p.split('/').filter(Boolean).slice(-2).join('/')

export const callOf = (tool: string, input: unknown): string => {
  const i = obj(input)
  if (tool === 'Read') return shortPath(str(i.file_path))
  if (tool === 'Bash') return clip(str(i.description) || str(i.command).split('\n')[0]!)
  return ''
}

// Bash's command on a line of its own, when the first line shows the description
export const commandOf = (tool: string, input: unknown): string | null => {
  const i = obj(input)
  if (tool !== 'Bash' || !str(i.description)) return null
  const lines = str(i.command).trim().split('\n')
  return `$ ${lines[0]}${lines.length > 1 ? ' …' : ''}`
}

const EXIT_LINE = /^(Error: )?Exit code (\d+)$/

// a failed Bash's exit code, from the error text the model read
export const exitCodeOf = (output: unknown): string | null => {
  for (const l of str(output).split('\n')) {
    const m = l.trim().match(EXIT_LINE)
    if (m) return m[2]!
  }
  return null
}

// a failed call's output is the error text the model read: show its head,
// less the exit-code line the header already carries
export const errorLinesOf = (output: unknown, max = 3): string[] =>
  str(output).split('\n').map(l => l.trim()).filter(l => l && !EXIT_LINE.test(l)).slice(0, max)

export const resultOf = (tool: string, output: unknown): string => {
  const o = obj(output)
  if (tool === 'Read') {
    const f = obj(o.file)
    return o.type === 'text' ? `${f.numLines} lines` : str(o.type)
  }
  if (tool === 'Bash') {
    if (o.backgroundTaskId) return 'background'
    if (o.interrupted) return 'interrupted'
    // one line is the answer itself; more is output whose last line is often noise
    const lines = str(o.stdout).trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return 'no output'
    return lines.length === 1 ? clip(lines[0]!.trim(), 40) : `${lines.length} lines`
  }
  return ''
}
