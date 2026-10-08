# slime-dashboard

A Claude Code side pane in the spirit of the offline dino game, starring a slime. It travels while Claude works and sleeps while Claude waits; each subagent is a little slime following it. Around the scene are your usage limits, the session's figures, a box of skills to run with one press, the subagents at work and what just happened.

Each section below can be hidden or moved with Setting's `[Display]` and `[Order]`. Every button also works from the keyboard: ctrl+x tab, or a click, gives the pane the keys, then Tab walks the buttons and Enter presses one. Each section's title button (`[ ▼ ]` while open, `[ ▲ ]` while closed) opens or closes it; closed, Party and Event Message count what they hold in their titles.

## HP / MP / CP, the slime and the model buttons

<img src="docs/top.png" width="340" alt="HP 23%, MP 70%, CP 62%; the red Opus slime walks past a rock and an orange tree, a yellow and a blue little slime behind it; the model buttons below">

- **HP / MP / CP**: on a Pro or Max subscription HP is what is left of the seven-day limit and MP of the five-hour one; on an API key or enterprise seat HP stays full. CP (capacity) is how full the context window is, shading from light to dark grey.
- **The slime** travels while Claude works, past clouds, birds, trees (round green, pine or autumn orange, at random) and rocks at their own speeds. Along the road lie 2x2 blobs of goo in every color: it stretches taller with its white mouth wide open as it reaches each one and eats it, its context filling up. Its color follows the model: Fable purple, Opus red, Sonnet blue, Haiku yellow, unless Setting's `[Color]` picked others.
- **Its face**: walking with CP at 50% it squints (`> <`), at 70% a `#` shows beside its head, at 90% it is in tears (`T T`). Out of HP or MP it stops with `x` eyes until a limit resets, and a flashing ring at its upper left holds the potion it needs: blue mana for MP, red health for HP.
- **Unloading**: while the context compacts (`[Unload]`, `/compact`, or automatically) it wakes up if asleep and sets its load down until the compaction ends: every few beats its body flashes white and it spits the goo it ate back out of its back in a spray of colored blocks, and green `↓` arrows fall beside it.
- **Subagents**: each one buds off a little slime in its model's color that follows it. When the work is done the troop finds a treasure chest.
- **Weather**: the sky follows day or night and the weather where you are, read from [wttr.in](https://wttr.in) every hour, with day turning to night at sunset in between (wttr.in places you by your IP address). Moon, stars and birds hide under an overcast sky.
- **Model buttons** `■:Haiku ■:Sonnet ■:Opus ■:Fable` switch the session's model (`/model haiku`, …): each family's newest model.

| Asleep | Waiting on you |
| --- | --- |
| <img src="docs/asleep.png" width="340" alt="Night: the slime asleep under the moon and stars, zZ above it"> | <img src="docs/waiting.png" width="340" alt="The troop stopped and a speech bubble with a bold question mark over the main slime"> |
| Once the turn ends it falls asleep while the clouds and birds drift on. | A permission prompt or a question is open: the troop stops and a bubble with a bold `?` flashes over the slime until you answer. |

## Property

<img src="docs/property.png" width="340" alt="Property open: Model [Opus 5.5], Effort [High] with its row of levels, then cache hit rate, tokens, iterations and the latest turn's time">

| Button | What it does |
| --- | --- |
| Model `[Opus 5.5]` | Opens a row `[Haiku][Sonnet][Opus][Fable]`, the current one bright; picking one runs `/model`. |
| Effort `[High]` | Opens the row of levels `[Low][Mid][High][xHigh][Max]`; picking one runs `/effort` with it and closes the row. |

Below them: the cache hit rate, the tokens used, the iterations, and the latest turn's time.

## Skill Box

<img src="docs/skills.png" width="340" alt="Skill Box open: a Prompt for skill field holding 30, General open in a rounded box with [Unload] and [timer], Code closed with one skill">

| Button | What it does |
| --- | --- |
| Prompt for skill | Type here; the next skill you press is sent with it. Enter keeps the text, it does not send. |
| `▼ General` / `▲ Code (1)` | Opens or closes a category of skills; open, it is a rounded box with its skills inside, showing five rows at a time, `▲ ▼` scroll the rest. |
| `[Unload]`, `[timer]`, … | Runs the skill: `/timer "30"` with the prompt, `/timer` alone without. `[Unload]` is built in and runs `/compact`. |

Skills are added with `/slime-dashboard add` (see [Usage](#usage)).

## Party

<img src="docs/party.png" width="340" alt="Party open: Haiku 5.5 and Sonnet 5.5, each with a red [x] and its task below">

The subagents at work, each its model in its color and the few words its task was given. The red `[x]` beside one stops that subagent (TaskStop, so Claude Code may ask your permission first); its little slime drops out of line, and Event Message logs it as Stopped.

## Event Message

<img src="docs/events.png" width="340" alt="Event Message open: three framed events, a subagent finished, one stopped and one started">

The newest three events, each framed, with this computer's local time (`YYYYMMDD-hhmm`) above a summary: a subagent started, finished or stopped, a question waiting or answered, out of HP/MP or back, the model or effort switched, a skill sent, the context compacted, an update. Twenty are kept.

## Setting

<img src="docs/setting.png" width="340" alt="Setting open: Update, Display, Color, Order, Width and Reload, then the version">

| Button | What it does |
| --- | --- |
| `[Update]` | Fetches the latest version from GitHub, updates the installed plugin, and reloads plugins in this session; how it went shows in a toast and in Event Message. A red `!` before it means GitHub has a newer version than the one running (checked each time the dashboard loads: at session start and at each reload). |
| `[Display]` | Opens a rounded box of checkboxes, one per section (HP / MP / CP, Slime, Model buttons, Property, Skill Box, Party, Event Message); unticking one hides it, and the choice is kept across sessions. Pressed again, it closes the box. Setting always shows. |
| `[Color]` | Opens a rounded box with one row per model family; pressing a family's color button moves it to the next of six (Purple, Red, Blue, Yellow, Green, Pink). Families may share a color. The choice colors the slimes, the model buttons and Party, and is kept across sessions; `[Default]` puts the original four back. Pressed again, it closes the box. |
| `[Order]` | Opens a rounded box listing the sections top to bottom; each row's `[▲]` / `[▼]` moves that section a place up or down in the pane. A hidden section keeps its place (dim in the list). The order is kept across sessions; `[Default]` puts the original order back. Setting always stays last. Pressed again, it closes the box. |
| `[Width] [-] 33 [+]` | Makes the docked pane a column narrower or wider (24–80), kept across sessions. A width you dragged the dock to by hand wins over it. |
| `[Reload]` | Reloads the dashboard (`/reload-plugins`), as saving its files would. |

The plugin's version shows at the pane's foot.

## Install

At a Claude Code prompt in a terminal:

```
/plugin install slime-dashboard --marketplace egan-wu/slime-dashboard
```

Answer `y` to add the marketplace, then pick a scope. The pane opens by itself when the terminal is 144 columns wide or more; in a narrower terminal, or after closing it, type `/slime-dashboard` to open it. It docks on the right only in Claude Code's fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1`, 110 columns or more); otherwise it sits above the prompt.

To update later, press `[Update]` under [Setting](#setting).

## Usage

```
/slime-dashboard                                   open the pane
/slime-dashboard add <skill> [--category <name>] [--desc <words>]
/slime-dashboard remove <skill>
/slime-dashboard list                              the Skill Box's skills, by category
/slime-dashboard weather                           read the sky now, and say what came back
```

Skills go in the Skill Box with `add`. Without `--category` a skill goes under **General**; `--desc` comes last and runs to the end of the line, drawn dim after the skill's name. Adding a skill again files it anew.

```
/slime-dashboard add timer --category General --desc background timer, prompt = seconds
/slime-dashboard add run-unit-test --category Test --desc run the unit tests
```

The skills you add are kept on this computer, across sessions; another computer starts with General's `[Unload]` alone.

## Development

```
claude --plugin-dir ./slime-dashboard   # load from this folder; saves reload it
claude plugin validate ./slime-dashboard
claude plugin test ./slime-dashboard
python3 tools/pictures.py               # redraw docs/*.png (Node 22+, Pillow)
```

A release bumps the version in both `.claude-plugin/plugin.json` and `hooks/version.ts`.
