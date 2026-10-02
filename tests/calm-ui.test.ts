import type { RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { tableCellsOf } from '../hooks/register'

const SURFACES = ['terminal', 'desktop'] as const

test('plain reply is re-drawn as Markdown inside a padded Box', async $ => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'AssistantMessage',
      props: { text: '| a | b |\n|---|---|\n| 1 | 2 |', isFirstOfReply: true },
    })
    const tree = await ui.drawn()
    expect(tree).toMatchObject({ type: 'Box', props: { paddingLeft: 2, paddingRight: 5, marginTop: 1 } })
    expect(JSON.stringify(tree)).toContain('Markdown')
    expect(JSON.stringify(tree)).toContain('●')
    expect(JSON.stringify(tree)).toContain('#6F4E37')
    const later = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'AssistantMessage',
      props: { text: 'second block', isFirstOfReply: false },
    })
    expect(JSON.stringify(await later.drawn())).not.toContain('●')
  }
})

test('reply with a mermaid fence is passed to the chain untouched', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'MERMAID-ART') as RenderElement
  })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'AssistantMessage',
      props: { text: '```mermaid\nflowchart LR\n  A --> B\n```', isFirstOfReply: true },
    })
    expect(await ui.drawn()).toMatchObject({ type: 'Text' })
  }
})

test('composer prompt is re-drawn padded like a reply; other user rows pass through', async ($, on) => {
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'ENGINE') as RenderElement
  })
  for (const surface of SURFACES) {
    const prompt = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'UserMessage',
      props: { text: 'hi there', origin: { kind: 'composer' }, isExpanded: true },
    })
    const tree = await prompt.drawn()
    expect(tree).toMatchObject({ type: 'Box', props: { paddingLeft: 2, paddingRight: 5, marginTop: 1 } })
    expect(JSON.stringify(tree)).toContain('hi there')
    expect(JSON.stringify(tree)).toContain('userMessageBackground')
    expect(JSON.stringify(tree)).toContain('"paddingY":1')
    expect(JSON.stringify(tree)).toContain('▍')
    expect(JSON.stringify(tree)).not.toContain('ENGINE')
    const other = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'UserMessage',
      props: { text: 'done', origin: { kind: 'unclassified' }, isExpanded: false },
    })
    expect(JSON.stringify(await other.drawn())).toContain('ENGINE')
  }
})

const WIDE = '| 看到的樣子 | 意思 |\n|---|---|\n| 框線完整，格子裡的字自己換行 | Claude Code 窄寬度時本來就會這樣，跟 mod 無關 |'

test('table width counts CJK as two cells', () => {
  // cells: 28 and 45 (CJK x2), plus 3 per column and 1 border
  expect(tableCellsOf(WIDE)).toBe(28 + 45 + 3 * 2 + 1)
  expect(tableCellsOf('no table here')).toBe(0)
})

test('a table that would need shrinking drops the padding', async $ => {
  for (const surface of SURFACES) {
    const narrow = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'AssistantMessage',
      viewport: { columns: 70, rows: 40 },
      props: { text: WIDE, isFirstOfReply: true },
    })
    expect(await narrow.drawn()).toMatchObject({ props: { paddingLeft: 0, paddingRight: 0 } })
    const wide = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'AssistantMessage',
      viewport: { columns: 200, rows: 40 },
      props: { text: WIDE, isFirstOfReply: true },
    })
    expect(await wide.drawn()).toMatchObject({ props: { paddingLeft: 2, paddingRight: 5 } })
    // gutter 5: 89 cols → (89 - 5 - 80) / 2 = 2
    const mid = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'AssistantMessage',
      viewport: { columns: 89, rows: 40 },
      props: { text: WIDE, isFirstOfReply: true },
    })
    expect(await mid.drawn()).toMatchObject({ props: { paddingLeft: 0, paddingRight: 2 } })
  }
})
