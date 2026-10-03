import type { Register } from 'claude-code'
import {
  TEXT_PALETTE,
  fitLines,
  inlineTextOf,
  leftToRightOf,
  mermaidBlocksOf,
  partsOf,
  pickLayout,
  plainOf,
  renderOf,
  withoutPseudoStates,
  type MermaidBlock,
  type Rendered,
  type Segment,
} from './diagrams.ts'

// Every ```mermaid block Claude writes is drawn as box art where the fence
// was, in the transcript. /mermaid sets the glyph set, the colours and
// whether top-down diagrams may be laid out sideways.

const COMMAND = 'mermaid'
const PREFS_KEY = 'prefs'
// the transcript's code block has a gutter and margins the art must clear
const INLINE_MARGIN = 6
// a tree of our own sits behind the reply's two-column gutter alone
const TREE_MARGIN = 3
// the glyph the transcript opens a reply with; drawn by the tree, which stands in for the whole block
const BULLET = '\u23fa'

type Prefs = { ascii: boolean; color: boolean; lr: boolean }
const DEFAULT_PREFS: Prefs = { ascii: false, color: true, lr: true }

let prefs: Prefs = DEFAULT_PREFS
const cache = new Map<string, Rendered>()

const isPrefs = (value: unknown): value is Partial<Prefs> => typeof value === 'object' && value !== null

const rendered = (source: string): Rendered => {
  const key = `${prefs.ascii ? 'a' : 'u'}:${source}`
  let out = cache.get(key)
  if (!out) {
    out = renderOf(source, prefs.ascii)
    cache.set(key, out)
  }
  return out
}

const drawn = (source: string, columns: number): Rendered => {
  const prepared = withoutPseudoStates(source)
  const base = rendered(prepared)
  const sideways = prefs.lr ? leftToRightOf(prepared) : null
  return sideways ? pickLayout(base, rendered(sideways), columns) : base
}

const onOff = (word: string): boolean | undefined =>
  word === 'on' || word === 'true' ? true : word === 'off' || word === 'false' ? false : undefined

const status = () => `mermaid: ascii ${prefs.ascii ? 'on' : 'off'} · color ${prefs.color ? 'on' : 'off'} · lr ${prefs.lr ? 'on' : 'off'}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const saved = await $.store.get(PREFS_KEY).catch(() => undefined)
    if (isPrefs(saved)) prefs = { ...DEFAULT_PREFS, ...saved }
    await $.command
      .register({
        name: COMMAND,
        description: 'Mermaid diagrams drawn in the transcript: ascii|color|lr on|off, reset (claude-mermaid)',
        argumentHint: '[ascii|color|lr on|off | reset]',
        immediate: true,
      })
      .catch(err => $.ui.log(`mermaid: /${COMMAND} not registered: ${err}`))
    return r
  })

  // Colours cannot ride on a rewritten `props.text`: since Claude Code 2.1.287
  // the engine refuses a rewrite holding an escape sequence and skips the hook,
  // leaving the raw fence. So with colour on, the hook returns a tree of its
  // own instead (`Markdown` for the prose, one `Text` per diagram line with
  // the colours as props); otherwise it rewrites the text to plain art as before.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const blocks = mermaidBlocksOf(e.props.text)
    if (blocks.length === 0) return next(e)
    const artOf = (margin: number) => (block: MermaidBlock): Segment[][] | null => {
      const room = (e.viewport?.columns ?? 80) - margin - block.indent.length
      const art = drawn(block.source, room)
      if (!('lines' in art)) return null
      const fit = fitLines(art.lines, room)
      const lines = fit.lines.map(line => [...line])
      if (fit.overflow > 0) lines.push([{ text: `… ${fit.overflow} columns cut · widen the terminal`, role: 'line' }])
      return lines
    }

    if (prefs.color && e.surface === 'terminal') {
      const parts = partsOf(e.props.text, blocks, artOf(TREE_MARGIN))
      if (parts) {
        const { Box, Text, Markdown } = $.ui.resolve(e)
        const spanOf = (segment: Segment) => {
          const style = segment.role ? TEXT_PALETTE[segment.role] : {}
          return style.color || style.dimColor ? Text({ ...style, children: segment.text }) : segment.text
        }
        const body = parts.map(part =>
          part.kind === 'markdown'
            ? Markdown({ text: part.text })
            : Box({
                flexDirection: 'column',
                marginY: 1,
                children: part.lines.map(line => Text({ children: [part.indent, ...line.map(spanOf)] })),
              }),
        )
        return Box({
          flexDirection: 'row',
          children: [
            Text({ children: e.props.isFirstOfReply ? `${BULLET} ` : '  ' }),
            Box({ flexDirection: 'column', flexGrow: 1, children: body }),
          ],
        })
      }
    }

    const plain = artOf(INLINE_MARGIN)
    const text = inlineTextOf(e.props.text, blocks, block => plain(block)?.map(plainOf) ?? null)
    return next({ ...e, props: { ...e.props, text } })
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const [word = '', value = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const save = async () => {
      await $.store.set(PREFS_KEY, prefs).catch(err => $.ui.log(`mermaid: store write failed: ${err}`))
      cache.clear()
      $.ui.invalidate('ui.render')
    }
    if (word === 'reset') {
      prefs = DEFAULT_PREFS
      await save()
      return { text: status() }
    }
    if (word === 'ascii' || word === 'color' || word === 'lr') {
      const flag = onOff(value)
      prefs = { ...prefs, [word]: flag ?? !prefs[word] }
      await save()
      const why = {
        ascii: 'plain ASCII art',
        color: 'borders, lines and arrows coloured',
        lr: 'top-down flowcharts and state diagrams laid out left to right when nothing is lost',
      }[word]
      return { text: `mermaid ${word} ${prefs[word] ? 'on' : 'off'} · ${why}` }
    }
    return { text: `${status()} · /mermaid ascii|color|lr on|off · reset` }
  })
}
