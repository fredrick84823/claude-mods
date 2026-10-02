import type { RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { callOf, resultOf } from '../hooks/tools'

const SURFACES = ['terminal', 'desktop'] as const

test('summaries for Read and Bash', () => {
  expect(callOf('Read', { file_path: '/repo/src/auth.py' })).toBe('src/auth.py')
  expect(resultOf('Read', { type: 'text', file: { numLines: 218 } })).toBe('218 lines')
  expect(callOf('Bash', { command: 'pytest -q', description: 'Run tests' })).toBe('Run tests')
  expect(callOf('Bash', { command: 'pytest -q\necho hi' })).toBe('pytest -q')
  expect(resultOf('Bash', { stdout: '...\n42 passed\n', stderr: '', interrupted: false })).toBe('42 passed')
  expect(resultOf('Bash', { stdout: '', stderr: '', interrupted: false })).toBe('no output')
  expect(resultOf('Bash', { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' })).toBe('background')
})

const BASH = { tool_use_id: 't1', tool: 'Bash', input: { command: 'pytest', description: 'Run tests' }, isRunning: false, isInterrupted: false }

test('Bash row is one line with its verdict; failure is loud', async $ => {
  for (const surface of SURFACES) {
    const ok = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'ToolUse',
      props: { ...BASH, isErrored: false, output: { stdout: '42 passed', stderr: '', interrupted: false } },
    })
    const okTree = JSON.stringify(await ok.drawn())
    expect(okTree).toContain('Run tests · 42 passed')
    expect(okTree).toContain('"dimColor":true')
    const bad = await $.ui.mount({
      plugin: 'calm-ui', surface, component: 'ToolUse',
      props: { ...BASH, isErrored: true, output: 'Exit code 1' },
    })
    const badTree = JSON.stringify(await bad.drawn())
    expect(badTree).toContain('Run tests · failed')
    expect(badTree).toContain('"bold":true')
  }
})

test('result block: hidden on success, engine-drawn on error and for other tools', async ($, on) => {
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'ENGINE') as RenderElement
  })
  for (const surface of SURFACES) {
    const ok = await $.ui.mount({ plugin: 'calm-ui', surface, component: 'ToolResult', props: { tool_use_id: 't1', tool: 'Bash', output: {}, isErrored: false } })
    expect(JSON.stringify(await ok.drawn())).not.toContain('ENGINE')
    const bad = await $.ui.mount({ plugin: 'calm-ui', surface, component: 'ToolResult', props: { tool_use_id: 't2', tool: 'Bash', output: {}, isErrored: true } })
    expect(JSON.stringify(await bad.drawn())).toContain('ENGINE')
    const edit = await $.ui.mount({ plugin: 'calm-ui', surface, component: 'ToolResult', props: { tool_use_id: 't3', tool: 'Edit', output: {}, isErrored: false } })
    expect(JSON.stringify(await edit.drawn())).toContain('ENGINE')
  }
})
