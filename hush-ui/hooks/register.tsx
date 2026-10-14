import type { EngineInterface, Register } from 'claude-code'
import { COMPACT_TOOLS, callOf, commandOf, errorLinesOf, exitCodeOf, resultOf } from './tools'

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

// /config verbose on: tool rows draw the engine's full call and output.
// ToolUse carries no ctrl+o flag, so verbose is the one switch it can read.
const isVerbose = async ($: EngineInterface) =>
  (await $.config.list()).find(r => r.key === 'verbose')?.value === true

export const register: Register = on => {
  // render answers are cached; flipping verbose redraws the rows
  on('config.set', { key: 'verbose' }, async ($, e, next) => {
    const result = await next(e)
    $.ui.invalidate('ui.render')
    return result
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
    if (!COMPACT_TOOLS.has(e.props.tool) || (await isVerbose($))) return next(e)
    const { isRunning, isErrored, isInterrupted, output } = e.props
    const state = isRunning ? '…' : isInterrupted ? 'interrupted' : isErrored ? ['failed', exitCodeOf(output) && `exit ${exitCodeOf(output)}`].filter(Boolean).join(' · ') : resultOf(e.props.tool, output)
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

  // the summary already sits on the ToolUse line; a successful result draws nothing
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!COMPACT_TOOLS.has(e.props.tool) || e.props.isErrored || (await isVerbose($))) return next(e)
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
