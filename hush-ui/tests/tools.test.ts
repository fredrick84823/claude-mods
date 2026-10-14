import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { callOf, commandOf, errorLinesOf, exitCodeOf, resultOf } from '../hooks/tools'

const SURFACES = ['terminal', 'desktop'] as const

test('summaries for Read and Bash', () => {
  expect(callOf('Read', { file_path: '/repo/src/auth.py' })).toBe('src/auth.py')
  expect(resultOf('Read', { type: 'text', file: { numLines: 218 } })).toBe('218 lines')
  expect(callOf('Bash', { command: 'pytest -q', description: 'Run tests' })).toBe('Run tests')
  expect(callOf('Bash', { command: 'pytest -q\necho hi' })).toBe('pytest -q')
  // never clipped here: the row truncates to the terminal's width
  expect(callOf('Bash', { command: 'x', description: 'd'.repeat(120) })).toBe('d'.repeat(120))
  expect(resultOf('Bash', { stdout: '42 passed\n', stderr: '', interrupted: false })).toBe('42 passed')
  expect(resultOf('Bash', { stdout: 'a\n\nb\n87: noise\n', stderr: '', interrupted: false })).toBe('3 lines')
  expect(resultOf('Bash', { stdout: '', stderr: '', interrupted: false })).toBe('no output')
  expect(resultOf('Bash', { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' })).toBe('background')
  expect(commandOf('Bash', { command: 'pytest -q', description: 'Run tests' })).toBe('$ pytest -q')
  expect(commandOf('Bash', { command: 'a\nb', description: 'Two' })).toBe('$ a …')
  // no description: the command is already the first line
  expect(commandOf('Bash', { command: 'pytest -q' })).toBeNull()
  expect(commandOf('Read', { file_path: '/x' })).toBeNull()
  expect(errorLinesOf('Exit code 1\n\nls: /x: No such file\na\nb')).toEqual(['ls: /x: No such file', 'a', 'b'])
  expect(errorLinesOf('Error: Exit code 2\nboom')).toEqual(['boom'])
  expect(exitCodeOf('Error: Exit code 2\nboom')).toBe('2')
  expect(exitCodeOf('permission denied')).toBeNull()
})

// the engine's /config rows; tests flip verbose
let verbose = false
const config = (on: On) =>
  on('config.list', () => ({ value: [{ key: 'verbose', label: 'Verbose', kind: 'boolean', value: verbose, provider: { plugin: 'engine', tier: 'core' } }] as never }))

const BASH = { tool_use_id: 't1', tool: 'Bash', input: { command: 'pytest', description: 'Run tests' }, isRunning: false, isInterrupted: false }

test('Bash row is one line with its verdict; failure is loud', async ($, on) => {
  verbose = false
  config(on)
  for (const surface of SURFACES) {
    const ok = await $.ui.mount({
      plugin: 'hush-ui', surface, component: 'ToolUse',
      props: { ...BASH, isErrored: false, output: { stdout: '42 passed', stderr: '', interrupted: false } },
    })
    const okTree = JSON.stringify(await ok.drawn())
    expect(okTree).toContain('"Run tests"')
    expect(okTree).toContain(' · 42 passed')
    expect(okTree).toContain('"dimColor":true')
    expect(okTree).toContain('$ pytest')
    const bad = await $.ui.mount({
      plugin: 'hush-ui', surface, component: 'ToolUse',
      props: { ...BASH, isErrored: true, output: 'Exit code 1\nls: /x: No such file or directory' },
    })
    const badTree = JSON.stringify(await bad.drawn())
    expect(badTree).toContain(' · failed · exit 1')
    expect(badTree).toContain('"bold":true')
    expect(badTree).toContain('No such file or directory')
  }
})

test('result block: hidden on success, engine-drawn on error and for other tools', async ($, on) => {
  verbose = false
  config(on)
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'ENGINE') as RenderElement
  })
  for (const surface of SURFACES) {
    const ok = await $.ui.mount({ plugin: 'hush-ui', surface, component: 'ToolResult', props: { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: false } })
    expect(JSON.stringify(await ok.drawn())).not.toContain('ENGINE')
    const bad = await $.ui.mount({ plugin: 'hush-ui', surface, component: 'ToolResult', props: { tool_use_id: 't2', tool: 'Bash', output: {}, isErrored: true } })
    expect(JSON.stringify(await bad.drawn())).toContain('ENGINE')
    const edit = await $.ui.mount({ plugin: 'hush-ui', surface, component: 'ToolResult', props: { tool_use_id: 't3', tool: 'Edit', output: {}, isErrored: false } })
    expect(JSON.stringify(await edit.drawn())).toContain('ENGINE')
  }
})

test('verbose on: Bash rows are the engine\'s full drawing', async ($, on) => {
  verbose = true
  config(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'ENGINE') as RenderElement
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'ENGINE') as RenderElement
  })
  for (const surface of SURFACES) {
    const use = await $.ui.mount({ plugin: 'hush-ui', surface, component: 'ToolUse', props: { ...BASH, isErrored: false, output: { stdout: '', stderr: '', interrupted: false } } })
    expect(JSON.stringify(await use.drawn())).toContain('ENGINE')
    const result = await $.ui.mount({ plugin: 'hush-ui', surface, component: 'ToolResult', props: { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: false } })
    expect(JSON.stringify(await result.drawn())).toContain('ENGINE')
  }
})
