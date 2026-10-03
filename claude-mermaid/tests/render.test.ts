import { test, expect } from 'claude-code/testing'

// The engine's own drawing of an assistant block stands in for the bottom of
// the chain here: the kit needs one, and the plugin's tree replaces it.
const PLUGIN = 'claude-mermaid'
const REPLY = 'A prompt flows to a reply.\n\n```mermaid\nflowchart LR\n  A[Prompt] --> B[Reply]\n```\n\nThat is all.'
const VIEWPORT = { columns: 100, rows: 40 }

test('a reply with a mermaid fence is drawn as a tree with coloured borders (terminal, colour on)', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, (_$, e) => ({ type: 'Markdown', props: { text: e.props.text } }))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage',
    props: { text: REPLY, isFirstOfReply: true }, viewport: VIEWPORT })
  const tree = await ui.drawn()
  expect(tree).toMatchObject({ type: 'Box' })
  expect(await ui.find({ type: 'Markdown', text: /A prompt flows/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /That is all/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Prompt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /⏺/ })).toBeDefined()
  const json = JSON.stringify(tree)
  expect(json).toContain('"color":"cyan"')
  expect(json).toContain('"color":"yellow"')
  expect(json).not.toContain('\u001b')
  expect(json).not.toContain('```mermaid')
})

test('a reply without a fence passes through untouched', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, (_$, e) => ({ type: 'Markdown', props: { text: e.props.text } }))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage',
    props: { text: 'Just words.', isFirstOfReply: true }, viewport: VIEWPORT })
  expect(await ui.drawn()).toMatchObject({ type: 'Markdown', props: { text: 'Just words.' } })
})

test('with colour off the fence becomes a plain text fence, no escapes (terminal)', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, (_$, e) => ({ type: 'Markdown', props: { text: e.props.text } }))
  await $.command.run({ command: 'mermaid', args: 'color off' })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AssistantMessage',
    props: { text: REPLY, isFirstOfReply: true }, viewport: VIEWPORT })
  const tree = await ui.drawn()
  const json = JSON.stringify(tree)
  expect(tree).toMatchObject({ type: 'Markdown' })
  expect(json).toContain('```text')
  expect(json).not.toContain('\u001b')
  await $.command.run({ command: 'mermaid', args: 'color on' })
})

test('on a remote surface the plain rewrite is used even with colour on (desktop)', async ($, on) => {
  on('ui.render', { component: 'AssistantMessage' }, (_$, e) => ({ type: 'Markdown', props: { text: e.props.text } }))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AssistantMessage',
    props: { text: REPLY, isFirstOfReply: true }, viewport: VIEWPORT })
  const json = JSON.stringify(await ui.drawn())
  expect(json).toContain('```text')
  expect(json).not.toContain('\u001b')
})
