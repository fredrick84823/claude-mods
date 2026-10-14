# hush-ui

A quieter Claude Code transcript. Presentation only: it changes how the
transcript is drawn, never what Claude said or did.

| part | Claude Code draws | hush-ui draws |
| --- | --- | --- |
| your prompt | `> text` on a full-width band | a card: a thin bar down its left edge, one line of background above and below |
| Read / Bash | `⏺ Bash(cmd)` then the output under `⎿` | one line, `Bash   description · 19 lines`, then `$ cmd`; a successful result is hidden |
| a failed Bash | the error under `⎿` | the row turns red with `failed · exit N` and the first error lines |
| replies | text from the edge, bullet at column 0 | 5 columns of room each side, the `●` hung in the left room |

`/hush` toggles the Read / Bash rows back to Claude Code's own, full command
and output (with its per-row `▸`), and again to compact them.

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

## Test

```sh
claude plugin test .
```
