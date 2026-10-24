# hush-ui

A quieter Claude Code transcript. Presentation only: it changes how the
transcript is drawn, never what Claude said or did.

| part | Claude Code draws | hush-ui draws |
| --- | --- | --- |
| your prompt | `> text` on a full-width band | a card: a thin bar down its left edge, one line of background above and below |
| Read / Bash | `⏺ Bash(cmd)` then the output under `⎿` | one line, `Bash   description · 19 lines`, then `$ cmd`; a successful result is hidden |
| a failed Bash | the error under `⎿` | the row turns red with `failed · exit N` and the first error lines |
| replies | text from the edge, bullet at column 0 | 5 columns of room each side, the `●` hung in the left room |
| spinner | `✻ Thinking…` right under the last row | a blank line above; the word shimmers in the `palette` colours (see Tune) |
| turn footer | `Done in 17s` right under the reply | a blank line above, in the reply's column: `✓ Pressed   17s   1 tool   +12 −3` |

`/hush` turns each Read / Bash row into a callout: a paper block in the `palette`
colours, `$` (or `!` on failure) in its icon column, the header on its
first line, then the full command and up to 40 lines of output. Again compacts.

Tables keep their natural width: the side room shrinks just enough for the
widest table in a reply. A reply holding a ```` ```mermaid ```` fence is left
untouched, so [mermaid-draw](../mermaid-draw/README.md) can draw it.

## Install

Function hooks are early access. Turn them on in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

```sh
claude plugin marketplace add fredrick84823/claude-mods
claude plugin install hush-ui@mods
```

## Tune

The knobs are constants at the top of `hooks/register.tsx`:

| constant | default | what |
| --- | --- | --- |
| `PAD` | `5` | columns of room each side of a reply |
| `ACCENT` | `undefined` | bullet and prompt-bar colour; `undefined` is the terminal's text colour |
| `PROMPT_BACKGROUND` | `'userMessageBackground'` | prompt card background, a theme key so light and dark each get theirs |

One option, set in `/config` or in `~/.claude/settings.json`; a change reloads the mod live:

```json
{ "pluginConfigs": { "hush-ui@mods": { "options": { "palette": "theme" } } } }
```

| `palette` | spinner, turn footer and `/hush` callout colours |
| --- | --- |
| `vellum` (default) | the built-in Vellum hex colours |
| `theme` | Claude Code theme keys: `claude` (spinner, ✓), `text`, `inactive`, `success`, `error`, `bashMessageBackgroundColor` (callout), `diffRemoved` (failed callout). A custom theme file in `~/.claude/themes/` then recolours them, live |

## Test

```sh
claude plugin test .
```
