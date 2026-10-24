import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'
import type { TurnStats } from '../types'
import { COMPACT_TOOLS, callOf, commandOf, detailOf, errorLinesOf, exitCodeOf, resultOf } from './tools'

// Presentation only. The engine's own drawing is laid out at full terminal
// width, so wrapping it in padding wraps its tables. Instead we re-draw the
// reply's markdown inside a padded Box, where it lays out to the narrower room.
// A reply still holding a ```mermaid fence is left to mermaid-draw untouched.

const PAD = 5
const MERMAID_FENCE = /^\s*(```|~~~)\s*mermaid\b/m
// bullet + gap before the text; the engine's own is 2
const BULLET_COLUMNS = 3
// the transcript's own gutter beside the reply, plus what our bullet column adds over the engine's
const GUTTER = 4 + (BULLET_COLUMNS - 2)
// tool names padded to one column so summaries line up
const TOOL_COLUMNS = 7
// undefined: the terminal's own text colour, as Claude Code draws its bullet.
// A raw colour ('#D77757', Claude orange) or a theme key also works here.
const ACCENT: string | undefined = undefined
// a theme key, so light and dark themes each get their own
const PROMPT_BACKGROUND = 'userMessageBackground'
// left three-eighths block on the card's background: the line is the card's outer edge
// ponytail: 200 rows; a prompt card taller than that shows the bar only on its top 200
const BAR = Array(200).fill('▍').join('\n')
// Colours of the /hush callout (paper, errPaper, ink, red) and of the spinner and
// turn footer (accent, fg, muted, ok, err), picked by the `palette` option.
// vellum: the WezTerm "Paper Ink Vellum" palette (~/.config/wezterm/vellum.lua) for the
// callout, and the skins plugin's `vellum` light palette for the spinner and footer.
// theme: Claude Code theme keys, so a custom theme file recolours them live.
// ponytail: vellum is light only, as WezTerm runs Paper Ink Vellum; a dark set if that changes
const PALETTES = {
  vellum: { paper: '#E4D8C5', errPaper: '#EBD9CC', ink: '#6A5C4A', red: '#A44837', accent: '#655576', fg: '#57504a', muted: '#6a5c4a', ok: '#53603b', err: '#8c4b3f' },
  theme: { paper: 'bashMessageBackgroundColor', errPaper: 'diffRemoved', ink: 'inactive', red: 'error', accent: 'claude', fg: 'text', muted: 'inactive', ok: 'success', err: 'error' },
}
export const paletteOf = (name: unknown) => (name === 'theme' ? PALETTES.theme : PALETTES.vellum)
const ICON_COLUMNS = 3
const SPINNER_WORDS = ['Pressing', 'Ruling', 'Inking', 'Drying', 'Binding', 'Warming']
const DONE_WORDS = ['Pressed', 'Ruled', 'Inked', 'Bound']
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 90
const KEPT_TURNS = 40

// CJK and fullwidth forms take two cells
const cellsOf = (s: string): number => {
  let n = 0
  for (const ch of s) n += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1
  return n
}

// Widest markdown table's natural width in cells, 0 when none.
// Markdown shrinks a table against the terminal's width, not our padded box,
// so a table that needs shrinking overflows by the padding and its rows wrap.
// ponytail: strips only ` * _ inline marks; links etc. overestimate, which just drops padding early
export const tableCellsOf = (text: string): number => {
  let widest = 0
  let cols: number[] = []
  for (const line of [...text.split('\n'), '']) {
    const t = line.trim()
    if (!t.startsWith('|')) {
      if (cols.length) widest = Math.max(widest, cols.reduce((a, w) => a + w + 3, 1))
      cols = []
      continue
    }
    if (/^\|[\s:|-]+\|$/.test(t)) continue
    t.replace(/^\||\|$/g, '').split('|').forEach((cell, i) => {
      cols[i] = Math.max(cols[i] ?? 0, cellsOf(cell.trim().replace(/[`*_]/g, '')))
    })
  }
  return widest
}

// The same seed always picks the same word, so a row keeps it when it redraws.
const pick = (words: readonly string[], seed: string): string => {
  let hash = 5381
  for (let i = 0; i < seed.length; i++) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0
  return words[hash % words.length] ?? seed
}

export const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000)
  return seconds < 1 ? '<1s' : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// Lines added and removed, read from an Edit or Write result's patch.
export const diffstatOf = (result: unknown): { added: number; removed: number } => {
  const patch = (result as { structuredPatch?: unknown } | null)?.structuredPatch
  const lines = Array.isArray(patch) ? patch.flatMap(hunk => (hunk as { lines?: unknown } | null)?.lines ?? []).filter((l): l is string => typeof l === 'string') : []
  return { added: lines.filter(l => l.startsWith('+')).length, removed: lines.filter(l => l.startsWith('-')).length }
}

const NO_STATS: TurnStats = { tools: 0, added: 0, removed: 0 }
// The footer only gets durationMs, so each finished turn's stats are kept under it.
const turnsAtom = atom({ plugin: 'hush-ui', key: 'turns' } as const, {} as Record<string, TurnStats>)
const frameAtom = atom({ plugin: 'hush-ui', key: 'frame' } as const, 0)
const startedAtom = atom({ plugin: 'hush-ui', key: 'startedAt' } as const, 0)

// /hush toggles: off, Read and Bash rows become a callout with the full call and output.
// ToolUse carries no per-row expand flag, and verbose is often left on for good.
// ponytail: module variable, so a plugin reload turns it back on; $.state if that matters
let hushed = true

export const register: Register = (on, options) => {
  const { paper, errPaper, ink, red, accent, fg, muted, ok, err } = paletteOf(options.palette)
  // what the main loop's turn has done so far, for its footer
  let stats = NO_STATS
  let isWorking = false
  let ticker: Timer | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hush', description: 'Toggle compact Read/Bash rows (off: full command and output)' })
    ticker?.cancel()
    ticker = undefined
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // only the spinner reads the frame, so a tick redraws the spinner and nothing else.
    // Armed here, not at session.start: a palette change re-runs register without one.
    ticker ??= $.clock.every(FRAME_MS, () => {
      if (isWorking) void update($, frameAtom, frame => frame + 1)
    })
    stats = NO_STATS
    isWorking = true
    const now = await $.clock.now()
    await update($, startedAtom, () => now)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && ran.deny === undefined) {
      const diff = diffstatOf(ran.result)
      stats = { tools: stats.tools + 1, added: stats.added + diff.added, removed: stats.removed + diff.removed }
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      const finished = stats
      await update($, turnsAtom, turns => Object.fromEntries([...Object.entries(turns), [String(e.durationMs), finished]].slice(-KEPT_TURNS)))
    }
    return next(e)
  })

  // The spinner (thinking, compacting) gets a line's breath above it. Its own word
  // shimmers: a band of light sweeps through it, one letter a frame.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const word = pick(SPINNER_WORDS, e.props.word)
    if (e.props.message !== null) return <Box marginTop={1}>{await next({ ...e, props: { ...e.props, word } })}</Box>
    const frame = await read($, frameAtom)
    const startedAt = await read($, startedAtom)
    const elapsed = startedAt === 0 ? 0 : (await $.clock.now()) - startedAt
    const letters = [...word]
    const head = (frame % (letters.length + 8)) - 4
    const shade = (i: number) => (i === head ? fg : Math.abs(i - head) === 1 ? accent : muted)
    return (
      <Box marginTop={1}>
        <Text>
          <Text color={accent}>{`${FRAMES[frame % FRAMES.length]} `}</Text>
          {letters.map((letter, i) => <Text key={String(i)} color={shade(i)}>{letter}</Text>)}
          <Text color={muted}>{`…  ${formatDuration(elapsed)}`}</Text>
        </Text>
      </Box>
    )
  })

  // The turn footer, `✓ Pressed   17s   1 tool   +12 −3`, in the reply's text column.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const turn = (await read($, turnsAtom))[String(e.props.durationMs)]
    const tools = turn?.tools ?? 0
    const hasDiff = turn !== undefined && turn.added + turn.removed > 0
    return (
      <Box marginTop={1} paddingLeft={PAD}>
        <Text color={muted}>
          <Text color={accent}>{'✓ '}</Text>
          {pick(DONE_WORDS, e.props.word)}
          <Text color={fg}>{`   ${formatDuration(e.props.durationMs)}`}</Text>
          {tools > 0 && <Text color={fg}>{`   ${tools}`}</Text>}
          {tools > 0 && ` tool${tools === 1 ? '' : 's'}`}
          {hasDiff && <Text color={ok}>{`   +${turn.added}`}</Text>}
          {hasDiff && <Text color={err}>{` −${turn.removed}`}</Text>}
        </Text>
      </Box>
    )
  })

  on('command.run', { command: 'hush' }, async $ => {
    hushed = !hushed
    $.ui.invalidate('ui.render')
    return { text: hushed ? 'hush-ui: tool rows compact' : 'hush-ui: tool rows in full' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (MERMAID_FENCE.test(e.props.text)) return next(e)
    const { Box, Markdown, Text } = $.ui.resolve(e)
    // shrink the padding just enough for the widest table to keep its natural width
    const spare = (e.viewport?.columns ?? 80) - GUTTER - tableCellsOf(e.props.text)
    const pad = Math.max(0, Math.min(PAD, Math.floor(spare / 2)))
    // the reply's bullet hangs in the left padding, in a column every block keeps
    // so text stays aligned; at pad 0 that column is the engine's own bullet column
    const left = Math.max(pad, BULLET_COLUMNS) - BULLET_COLUMNS
    return (
      <Box flexDirection="row" paddingLeft={left} paddingRight={pad} marginTop={e.props.isFirstOfReply ? 1 : 0}>
        <Box width={BULLET_COLUMNS} flexShrink={0}>
          <Text color={ACCENT}>{e.props.isFirstOfReply ? '●' : ' '}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1}>
          <Markdown text={e.props.text} />
        </Box>
      </Box>
    )
  })

  // Read / Bash rows: one dim line, `Read   path · 218 lines`. Errors stay loud:
  // the header says failed and the engine's ToolResult below shows the error text.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!COMPACT_TOOLS.has(e.props.tool)) return next(e)
    const { isRunning, isErrored, isInterrupted, output } = e.props
    const state = isRunning ? '…' : isInterrupted ? 'interrupted' : isErrored ? ['failed', exitCodeOf(output) && `exit ${exitCodeOf(output)}`].filter(Boolean).join(' · ') : resultOf(e.props.tool, output)
    if (!hushed && !isRunning) {
      // the callout: an icon column, then the header and the whole call on one paper
      const { Box, Text } = $.ui.resolve(e)
      const detail = detailOf(e.props.tool, e.props.input, output)
      const iconInk = isErrored ? red : ink
      return (
        <Box paddingLeft={PAD} paddingRight={PAD} marginY={1}>
          <Box flexGrow={1} flexShrink={1} backgroundColor={isErrored ? errPaper : paper} paddingY={1} paddingRight={1}>
            <Box width={ICON_COLUMNS} flexShrink={0} justifyContent="center">
              <Text bold color={iconInk}>{isErrored ? '!' : '$'}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text>
                <Text bold color={isErrored ? red : undefined}>{`${e.props.tool}  `}</Text>
                <Text dimColor={!isErrored}>{callOf(e.props.tool, e.props.input)}</Text>
                <Text dimColor={!isErrored} color={isErrored ? red : undefined}>{state && ` · ${state}`}</Text>
              </Text>
              {detail.command && <Text>{detail.command}</Text>}
              {detail.output && <Text dimColor={!isErrored} color={isErrored ? red : undefined}>{detail.output}</Text>}
            </Box>
          </Box>
        </Box>
      )
    }
    const command = commandOf(e.props.tool, e.props.input)
    // the error text is drawn by the row we replace, so we draw its head ourselves
    const errors = isErrored ? errorLinesOf(output) : []
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" paddingLeft={PAD}>
        <Box flexDirection="row">
          <Box width={TOOL_COLUMNS} flexShrink={0}>
            <Text dimColor={!isErrored} color={isErrored ? 'red' : undefined}>{e.props.tool}</Text>
          </Box>
          {/* the call shrinks to the terminal's width; the state after it always shows */}
          <Box flexShrink={1}>
            <Text dimColor={!isErrored} bold={isErrored} wrap="truncate-end">
              {callOf(e.props.tool, e.props.input)}
            </Text>
          </Box>
          {state && (
            <Box flexShrink={0}>
              <Text dimColor={!isErrored} bold={isErrored}>{` · ${state}`}</Text>
            </Box>
          )}
        </Box>
        {command && (
          <Box paddingLeft={TOOL_COLUMNS}>
            <Text dimColor wrap="truncate-end">{command}</Text>
          </Box>
        )}
        {errors.map((line, i) => (
          <Box key={`err${i}`} paddingLeft={TOOL_COLUMNS}>
            <Text color="red" wrap="truncate-end">{line}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  // the summary already sits on the ToolUse line, the error under it or in the callout
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!COMPACT_TOOLS.has(e.props.tool) || (e.props.isErrored && hushed)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  // The person's prompt as a card: same side room as a reply, an accent bar down its
  // left edge, a line of the theme's prompt background above and below the text.
  // Re-drawn rather than wrapped: the engine's row spans the full width.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.props.origin.kind !== 'composer') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box paddingLeft={PAD - BULLET_COLUMNS} paddingRight={PAD} marginTop={1}>
        {/* a cell-wide column whose height the card sets; the thin glyphs are an
            absolute layer clipped to it, so their count never sizes the row */}
        <Box width={1} flexShrink={0}>
          <Box position="absolute" top={0} left={0} width={1} height="100%" overflow="hidden">
            <Text color={ACCENT} backgroundColor={PROMPT_BACKGROUND}>{BAR}</Text>
          </Box>
        </Box>
        <Box
          flexGrow={1}
          flexShrink={1}
          backgroundColor={PROMPT_BACKGROUND}
          paddingY={1}
          paddingLeft={BULLET_COLUMNS - 1}
          paddingRight={1}
        >
          <Text>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })
}
