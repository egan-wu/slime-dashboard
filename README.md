# slime-subagent-dashboard

A Claude Code side pane in the spirit of the offline dino game, starring a slime.

- **Busy / idle**: while Claude works, the slime travels and clouds, birds, trees and rocks scroll past at their own speeds. Once the turn ends it falls asleep: clouds and birds keep drifting, while trees and rocks stand still.
- **Model colors**: the slime is purple on Fable, red on Opus, blue on Sonnet and yellow on Haiku.
- **Subagents**: each subagent buds off a little slime in its model's color. When the work is done the troop finds a treasure chest.
- **Sub-agent Monitor**: lists the running subagents, each with its model and its task.
- **Context Window**: shows how full the context window is as a 10-cell bar, white to dark.
- **Model buttons**: switch the session's model from the pane.
- **Weather**: the sky follows day or night and the weather where you are, read from [wttr.in](https://wttr.in) once an hour (wttr.in places you by your IP address).

## Install

At a Claude Code prompt in a terminal:

```
/plugin install slime-subagent-dashboard --marketplace egan-wu/slime-subagent-dashboard-claude-code-mod
```

Answer `y` to add the marketplace, then pick a scope. The pane opens by itself when the terminal is 144 columns wide or more. In a narrower terminal, or after closing it, type `/slime-subagent-dashboard` to open it.

It docks on the right only in Claude Code's fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1`, 110 columns or more). Otherwise it sits above the prompt.

## Development

```
claude --plugin-dir ./slime-subagent-dashboard   # load from this folder
claude plugin validate ./slime-subagent-dashboard
claude plugin test ./slime-subagent-dashboard
```
