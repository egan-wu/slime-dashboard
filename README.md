# slime-subagent-dashboard

A Claude Code side pane in the spirit of the offline dino game, starring a slime.

| Idle | Busy, with three subagents |
| --- | --- |
| <img src="docs/idle.png" width="320" alt="Idle on an API key: full HP, CP 18%, the slime asleep at night, Property and Skill Box closed, no subagents"> | <img src="docs/busy.png" width="320" alt="Busy on a subscription: HP 23%, MP 70%, CP 62% so the slime squints, three subagent slimes behind it, Property and Skill Box open"> |

- **Busy / idle**: while Claude works, the slime travels and clouds, birds, trees and rocks scroll past at their own speeds. Once the turn ends it falls asleep: clouds and birds keep drifting, while trees and rocks stand still.
- **Model colors**: the slime is purple on Fable, red on Opus, blue on Sonnet and yellow on Haiku.
- **Subagents**: each subagent buds off a little slime in its model's color. When the work is done the troop finds a treasure chest.
- **Sub-agent Monitor**: lists the running subagents, each with its model and its task.
- **Event Message**: the newest three events, each in a rounded frame with its local time (`YYYYMMDD-hhmm`, from this computer's clock) above a summary: a subagent started or finished, a question waiting or answered, the slime out of HP/MP or back up, the model or effort switched, a skill sent, the context compacted.
- **HP / MP / CP**: on a Pro or Max subscription HP is what is left of the seven-day limit and MP of the five-hour one; on an API key or enterprise seat HP stays full. CP (capacity) is how full the context window is, shading from light to dark grey. Out of HP or MP the slime stops with `x` eyes until a limit resets. Walking with CP at 50% it squints (`> <`), at 70% a `#` shows beside its head, at 90% it is in tears (`T T`).
- **Waiting on you**: when a permission prompt or a question is waiting for an answer, the troop stops and a speech bubble with a bold `?` flashes over the main slime.
- **Property**: opens to show the model, the reasoning effort, the session's cache hit rate, the tokens it has used, the current turn's iterations, and how long the latest turn took. Pressing the model opens `[Haiku][Sonnet][Opus][Fable]`, and picking one runs `/model` with it; pressing the effort opens `[Low][Mid][High][xHigh][Max]`, and picking one runs `/effort` with it.
- **Skill Box**: opens to a prompt field over your skills, filed by category; each category opens and closes and shows five rows at a time, each skill's description dim after its name. Pressing `[skill]` runs `/skill "prompt"`, or `/skill` alone with the field empty. **General** always holds `[Unload]: compact context window`, which runs `/compact`.
- **Model buttons**: switch the session's model from the pane.
- **Setting**: at the bottom, opens to `[Update]: update dashboard`, which fetches the latest version from GitHub, updates the installed plugin and reloads plugins in the session. It updates a plugin installed with `/plugin install`; a copy loaded with `--plugin-dir` is updated with `git pull` instead.
- **Weather**: the sky follows day or night and the weather where you are, read from [wttr.in](https://wttr.in) every 15 minutes (wttr.in places you by your IP address). `/slime-subagent-dashboard weather` reads it now and says what it got, or why it got nothing.

## Install

At a Claude Code prompt in a terminal:

```
/plugin install slime-subagent-dashboard --marketplace egan-wu/slime-subagent-dashboard-claude-code-mod
```

Answer `y` to add the marketplace, then pick a scope. The pane opens by itself when the terminal is 144 columns wide or more. In a narrower terminal, or after closing it, type `/slime-subagent-dashboard` to open it.

Register skills for the Skill Box with the same command:

```
/slime-subagent-dashboard add run-unit-test --category Test --desc run the unit tests
/slime-subagent-dashboard remove run-unit-test
/slime-subagent-dashboard list
/slime-subagent-dashboard weather
```

It docks on the right only in Claude Code's fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1`, 110 columns or more). Otherwise it sits above the prompt.

## Development

```
claude --plugin-dir ./slime-subagent-dashboard   # load from this folder
claude plugin validate ./slime-subagent-dashboard
claude plugin test ./slime-subagent-dashboard
```
