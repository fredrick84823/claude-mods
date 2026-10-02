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

export const resultOf = (tool: string, output: unknown): string => {
  const o = obj(output)
  if (tool === 'Read') {
    const f = obj(o.file)
    return o.type === 'text' ? `${f.numLines} lines` : str(o.type)
  }
  if (tool === 'Bash') {
    if (o.backgroundTaskId) return 'background'
    if (o.interrupted) return 'interrupted'
    // the last line is usually the verdict: "42 passed", "Done", a count
    const last = str(o.stdout).trim().split('\n').pop()?.trim() ?? ''
    return last ? clip(last, 40) : 'no output'
  }
  return ''
}
