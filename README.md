# claude-mods

Mods for Claude Code: plugins built on **function hooks**, TypeScript that
runs inside Claude Code's own process. Early access, so each needs
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and the API can change between releases.
Tested on Claude Code 2.1.289.

| mod | what it does |
| --- | --- |
| [hush-ui](hush-ui/README.md) | a quieter transcript: prompts as cards, Read/Bash rows on one line (failures stay loud), side padding around replies |
| [mermaid-draw](mermaid-draw/README.md) | every ```` ```mermaid ```` block Claude writes is drawn as box art inline in the transcript, CJK labels included |

The two stack: hush-ui leaves any reply holding a mermaid fence to mermaid-draw.

## Install

Turn function hooks on, in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

The repository is a marketplace named `mods`. Add it once, then install either mod:

```sh
claude plugin marketplace add fredrick84823/claude-mods
claude plugin install hush-ui@mods
claude plugin install mermaid-draw@mods
```

Or load one straight from a clone, for one session (the repo's own
`.claude/settings.json` sets the variable for sessions started inside it):

```sh
git clone https://github.com/fredrick84823/claude-mods
cd claude-mods
claude --plugin-dir hush-ui --plugin-dir mermaid-draw
```

## Where this comes from

Forked from [galElmalah/claude-mods](https://github.com/galElmalah/claude-mods),
which wrote claude-mermaid. This fork:

- renames it to `mermaid-draw`: since Claude Code 2.1.287 a third-party plugin
  name may not start with `claude-` ([galElmalah/claude-mods#1](https://github.com/galElmalah/claude-mods/issues/1))
- carries [galElmalah/claude-mods#3](https://github.com/galElmalah/claude-mods/pull/3), so colour draws again on 2.1.287+
- builds the renderer with [lukilabs/beautiful-mermaid#128](https://github.com/lukilabs/beautiful-mermaid/pull/128)
  (CJK / fullwidth widths) and a fix for [#140](https://github.com/lukilabs/beautiful-mermaid/issues/140)
  (`A-->B` without spaces), and measures CJK as two columns when fitting a diagram to the terminal
- drops claude-queue, and adds hush-ui

## Layout

Each mod is a folder of its own: `.claude-plugin/plugin.json`, `hooks/hooks.json`
naming the hooks module, tests under `tests/`, and a README. The root holds the
marketplace manifest and `.claude/`, where `/plugin-types` writes the
declarations both typecheck against.

## License

MIT.
