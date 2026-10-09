#!/usr/bin/env python3
"""Draws the README's pictures of the pane, one per section: docs/*.png, and
the walk at the top as docs/top.gif.

The scene comes from the mod's own hooks/scene.ts (run with Node's type
stripping); the rows of text around it are laid out as hooks/register.tsx
lays them out, by hand, so change them here when the pane changes.

Needs Node 22+ and Pillow:  python3 tools/pictures.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOKS = os.path.join(ROOT, 'hooks')
DOCS = os.path.join(ROOT, 'docs')
W = 33  # the pane's columns
GIF_FRAMES = 120  # top.gif: twelve seconds of the walk, one loop of the road
CW, CH, PAD = 18, 36, 24  # a cell's pixels, and the margin
MARGIN = 3  # columns right of the pane for badges
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 29)
BOLD = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 29)
BADGE_FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)

BG, FG, DIM = (24, 24, 27), (220, 220, 220), (128, 128, 136)
BORDER, BADGE = (70, 70, 80), (255, 210, 63)
DEFAULT = 0x01000000
HP, MP, SLATE = (255, 92, 92), (77, 184, 255), (95, 113, 134)
STOP = (230, 57, 70)  # Party's red [x]
MODEL = {'Haiku': 0xffc300, 'Sonnet': 0x3a86ff, 'Opus': 0xe5383b, 'Fable': 0x9b5de5}


def rgb(n):
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


def scenes():
    """Scene cells for the three pictures, from hooks/scene.ts."""
    with tempfile.TemporaryDirectory() as tmp:
        for name in ('scene.ts', 'weather.ts', 'vitals.ts'):
            with open(os.path.join(HOOKS, name)) as f:
                text = re.sub(r"from '\./(\w+)'", r"from './\1.ts'", f.read())
            with open(os.path.join(tmp, name), 'w') as f:
                f.write(text)
        with open(os.path.join(tmp, 'cells.ts'), 'w') as f:
            f.write("""
import { CAMPFIRE_W, frame, homeCx, ROWS, setLoop } from './scene.ts'
const W = %d
const decode = (b64: string) => { const b = Buffer.from(b64, 'base64'); const u = new Uint32Array(b.buffer, b.byteOffset, b.length / 4); return Array.from({ length: ROWS }, (_, r) => Array.from(u.slice(r * W * 3, (r + 1) * W * 3))) }
const off = (n: number) => ({ cloud: 23 + n, bird: 40, tree: 52 + n, rock: 31 + n, ground: 9 })
// Where register.tsx lights the campfire: two pixels clear of the resting slime.
const CAMP = homeCx(W) - 3 - 2 - CAMPFIRE_W
const troop = [{ model: 'claude-haiku-5-5', pos: 0 }, { model: 'claude-sonnet-5-5', pos: 1 }]
// The walk, frame by frame at ten a second, made to loop: the road repeats
// every LOOP pixels and the walk covers exactly one, while the clouds and
// birds drift exactly one span of theirs, so the last frame leads into the first.
const T = %d, LOOP = T * 0.8
setLoop(LOOP)
const walkingFrames = Array.from({ length: T }, (_, t) => {
  const road = 40 + t * 0.8
  const at = { cloud: 23 + (t * 50) / T, bird: 40 + (t * 75) / T, tree: road, rock: road, ground: road }
  return decode(frame(W, at, t, true, 'claude-opus-5-5', troop, { day: true, sky: 'partly' }))
})
setLoop(undefined)
console.log(JSON.stringify({
  walkingFrames,
  asleep: decode(frame(W, off(0), 7, false, 'claude-opus-5-5', [], { day: false, sky: 'clear' })),
  waiting: decode(frame(W, off(5), 0, true, 'claude-opus-5-5', troop, { day: true, sky: 'partly' }, undefined, { ask: true })),
  campfire: decode(frame(W, off(2), 41, false, 'claude-opus-5-5', [], { day: false, sky: 'clear' }, undefined, { warming: true, camp: CAMP, campAge: 100 })),
  embers: decode(frame(W, off(2), 43, false, 'claude-opus-5-5', [], { day: false, sky: 'clear' }, undefined, { embers: true, camp: CAMP })),
}))
""" % (W, GIF_FRAMES))
        out = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', 'cells.ts'],
                             cwd=tmp, capture_output=True, text=True, check=True)
        return json.loads(out.stdout)


# A row is a list of runs (text, color, bold, background), or ('scene',), or
# ('frame', rows, edge, fill) for a rounded frame around some rows (frames
# nest), or ('split', left runs, right runs) for a row with buttons at its
# right edge, or ('indent', columns, rows[, right columns]); a top-level row may carry a badge
# as ('badge', n) placed after the row.
def run(text, color=FG, bold=False, bg=None):
    return (text, color, bold, bg)


def bar(label, pct, cells, color):
    filled = round(pct / 100 * cells)
    return [run(label, FG, True), run(' ['), run('█' * filled, color), run('░' * (cells - filled), DIM),
            run(f'] {f"{pct}%":<4}')]


def cp_bar(pct, cells):
    filled = round(pct / 100 * cells)
    shade = lambda i: tuple(round(a + (b - a) * i / (cells - 1)) for a, b in zip((158,) * 3, (74,) * 3))
    return [run('CP', FG, True), run(' [')] + [run('█', shade(i)) for i in range(filled)] + \
           [run('░' * (cells - filled), DIM), run(f'] {f"{pct}%":<4}')]


RULE = [run('─' * (W - 1), DIM)]


def header(title, open_):
    return [run(f'{title} ', DIM), run(f'[ {"▼" if open_ else "▲"} ]')]


def picker():
    row = []
    for name, color in MODEL.items():
        row += [run('■', rgb(color)), run(f':{name} ')]
    return row


def event(stamp, *lines):
    return ('frame', [[run(stamp, FG, True)]] + [[run(line)] for line in lines])


def version():
    v = f'v{VERSION}'
    return [run(' ' * (W - 1 - len(v))), run(v, SLATE)]


def section(title, *rows):
    """A section as the pane draws it open: its title, then its rows."""
    return [(header(title, True), None)] + [(r, None) for r in rows]


def top_rows():
    hp_mp = bar('HP', 23, 5, HP) + [run(' ')] + bar('MP', 70, 5, MP)
    return [(hp_mp, None), (cp_bar(62, 21), None), (('scene',), None), (picker(), None)]


SIGN_EDGE, SIGN_BOARD, SIGN_TEXT = (92, 58, 30), (139, 90, 43), (245, 230, 200)


def session_rows():
    # [≡] at the sign's left, the name centered with as much again on the right;
    # pressed, the project's recent sessions open under it.
    name = 'Dashboard tuning'
    room = W - 5 - 3 - 3
    pad = (room - len(name)) // 2
    sign = ('frame', [[run('[≡]', SIGN_TEXT, True), run(' ' * pad), run(name, SIGN_TEXT, True)]], SIGN_EDGE, SIGN_BOARD)
    recent = ('frame', [('split', [run('Release day')], [run('2h', DIM)]),
                        ('split', [run('Weather block')], [run('1d', DIM)]),
                        ('split', [run('Fix the build')], [run('3d', DIM)])], SIGN_EDGE)
    return [(sign, None), (recent, None)]


def property_rows():
    return section(
        'Property',
        [run(' Model: '), run('[Opus 5.5]')],
        [run(' Effort: '), run('[High]')],
        [run(' '), run('[Low]', DIM), run('[Mid]', DIM), run('[High]'), run('[xHigh]', DIM), run('[Max]', DIM)],
        [run(' Cache Hit Rate: 91.4%')],
        [run(' Cache TTL: 1h (auto)')],
        [run(' Token Usage: 1.84M')],
        [run(' Iteration Rate: 7/∞')],
        [run(' Latest Command: 48.2s')],
    )


WARM_GROUND = (156, 93, 18)  # Passive's switch, lit


def passive_rows():
    switch = [run('['), run(' Cache Warming ', FG, False, WARM_GROUND), run(']')]
    return section('Passive', [run(' ')] + switch + [run(' 74.3k warm', DIM)])


def journal_rows():
    spark = '·▅▆▆▇·▆▇▇▆··▇▇█▇▆··▆▇▇▇▆·▇██'  # the box's 28 columns, today last
    block = ('frame', [
        [run('▼ Cache Warming')],
        [run('Cache Read: 1.62M')],
        [run('Cache Write: 74.3k')],
        [run('Cache Expires: 14:32 · 52m')],
        [run('Cache Hit Rate: 93.8%')],
        [run(spark, DIM)],
        [run('28d ago' + ' ' * (len(spark) - 12) + 'today', DIM)],
        [run('Cold Starts: 4 (296.1k)')],
        [run('Pings: 23 · Rescues: 6')],
        [run('Saved: 312.4k')],
    ], BORDER)
    return section('Journal', block)


def skills_rows():
    return section(
        'Skill Box',
        ('frame', [('split', [run('Prompt for skill', MP, True)], [run('[Clear]')]), ('frame', [('split', [run('only slow tests')], [run('▲ ▼ x', DIM)])], MP), ('frame', [('split', [run('30')], [run('▲ ▼ x', DIM)])], MP), [run('› ')]], MP),
        ('frame', [('split', [run('▼ General')], MOVE),
                   [run('[▼]'), run('[Unload]'), run(': compact context window', DIM)],
                   [run('[▼]'), run('[Respawn]'), run(': create new session', DIM)],
                   [run('[▼]', DIM), run('[timer]'), run(': background timer, prompt = seconds', DIM)]]),
        ('indent', 2, [('split', [run('▸ Code (1)')], MOVE)], 2),
        ('frame', [('split', [run('▼ Party Combo')], MOVE),
                   [run('[▼]'), run('[Run-Test]'), run(': 3 waves · 4 skills', DIM)],
                   [run('[▼]', DIM), run('[Nightly]'), run(': 2 waves · 3 skills', DIM)]]),
    )


MOVE = [run('[▼][▲]')]
PURPLE = (90, 24, 154)


def step(skill, model, agent):
    """A skill in a wave, as a 33-column pane lays it out: two rows."""
    return [('split', [run('■ ', rgb(MODEL[model])), run(f'/{skill}')], [run('✕', DIM)]),
            [run('  '), run(f'{model:<6}', DIM), run(' '), run(agent, DIM)]]


def wave(n, *steps, last=False):
    head = ('split', [run(f'Wave {n}', FG, True)], [run('▲ ▼ ✕', DIM)])
    return ('frame', [head] + [r for st in steps for r in st] + [[run('+ skill', DIM)]])


def tree_rows():
    gap = lambda *cond: ('indent', 3, [[run(f'◆ {cond[0]}', DIM)]] + [[run(f'  {c}', DIM)] for c in cond[1:]] + [[run('↓', DIM)]])
    combo = ('frame', [
        [run(' ▾ Run-Test ', (255, 255, 255), True, PURPLE), run(' [Rename]')],
        wave(1, step('demo-build', 'Haiku', 'general')),
        gap('+ condition'),
        wave(2, step('demo-test', 'Sonnet', 'general')),
        gap('if Fail, run the debug', 'wave; if Pass, go on'),
        wave(3, step('demo-check', 'Opus', 'explore'), step('demo-archive', 'Haiku', 'general')),
        ('indent', 3, [[run('◆ + condition', DIM)]]),
        [run('+ Wave', DIM)],
        [run('[Save] [Delete]')],
    ], PURPLE)
    return section(
        'Party Combo',
        [run(' '), run('[Run-Test]'), run('[Nightly*]', DIM), run('[+New]')],
        combo,
    )


def stop_mark():
    return [run(' '), run('[', STOP), run('x'), run(']', STOP)]


def party_rows():
    return section(
        'Party',
        [run(' - '), run('Haiku 5.5', rgb(MODEL['Haiku']))] + stop_mark(),
        [run('    - Timer: 30 s', DIM)],
        [run(' - '), run('Sonnet 5.5', rgb(MODEL['Sonnet']))] + stop_mark(),
        [run('    - Review the hooks module', DIM)],
    )


def events_rows():
    return section(
        'Event Message',
        event('20261008-0114', '✔ Finished Haiku 5.5: Timer:', '30 s'),
        event('20261008-0113', '✖ Stopped Fable 5.1: Review', 'layout'),
        event('20261008-0112', '▶ Started Sonnet 5.5: Review', 'the hooks module'),
    )


def setting_rows():
    return section(
        'Setting',
        [run('  [Update]'), run(': update dashboard', DIM)],
        [run('  [Display]'), run(': choose sections', DIM)],
        [run('  [Color]'), run(': slime colors', DIM)],
        [run('  [Order]'), run(': arrange sections', DIM)],
        [run('  [Width] [-] 33 [+]'), run(': panel width', DIM)],
        [run('  [Performance]'), run(': animation effect', DIM)],
        [run('  [Reload]'), run(': reload dashboard', DIM)],
    ) + [(version(), None)]


def waiting_rows():
    return [(('scene',), None)]


def row_height(content):
    kind = content[0] if isinstance(content, tuple) else None
    if kind == 'frame':
        return sum(row_height(r) for r in content[1]) + 2
    if kind == 'indent':
        return sum(row_height(r) for r in content[2])
    if kind == 'scene':
        return 6
    return 1


def height(rows):
    return sum(row_height(r[0]) for r in rows)


def clip(runs, room):
    """Runs cut to `room` columns, ending in … where cut, as the pane's truncate-end does."""
    if sum(len(r[0]) for r in runs) <= room:
        return runs
    out, left = [], room - 1
    for text, color, bold, bg in runs:
        out.append((text[:left], color, bold, bg))
        left -= len(out[-1][0])
        if left <= 0:
            out.append(('…', color, bold, bg))
            break
    return out


def draw_runs(d, runs, col, y, room=W - 1):
    for text, color, bold, bg in clip(runs, room - col):
        for ch in text:
            x = PAD + col * CW
            if bg is not None:
                d.rectangle([x, y, x + CW - 1, y + CH - 1], fill=bg)
            if ch == '█':
                d.rectangle([x, y + 2, x + CW - 1, y + CH - 3], fill=color)
            else:
                d.text((x, y + 1), ch, font=BOLD if bold else FONT, fill=color)
            col += 1
    return col


def draw_row(d, content, y, left, right, cells=None, ask=False):
    """One row (of any kind) between columns left and right; returns the y after it."""
    kind = content[0] if isinstance(content, tuple) else None
    if kind == 'scene':
        draw_scene(d, cells, y, ask)
        return y + 6 * CH
    if kind == 'frame':
        inner = content[1]
        color = content[2] if len(content) > 2 else DIM
        fill = content[3] if len(content) > 3 else None
        x0, x1 = PAD + left * CW + CW // 2, PAD + right * CW - CW // 2
        d.rounded_rectangle([x0, y + CH // 2, x1, y + (row_height(content) - 1) * CH + CH // 2],
                            radius=10, outline=color, width=2, fill=fill)
        y += CH
        for r in inner:
            y = draw_row(d, r, y, left + 2, right - 2, cells, ask)
        return y + CH
    if kind == 'indent':
        # ('indent', columns, rows, columns off the right too)
        inset = content[3] if len(content) > 3 else 0
        for r in content[2]:
            y = draw_row(d, r, y, left + content[1], right - inset, cells, ask)
        return y
    if kind == 'split':
        width = sum(len(r[0]) for r in content[2])
        draw_runs(d, content[1], left, y, right - width - 1)
        draw_runs(d, content[2], right - width, y, right)
        return y + CH
    draw_runs(d, content, left, y, right)
    return y + CH


def draw_badge(d, n, y):
    cx, cy = PAD + (W + 1) * CW + CW // 2, y + CH // 2
    d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=BADGE)
    d.text((cx, cy), str(n), font=BADGE_FONT, fill=(24, 24, 27), anchor='mm')


def draw_scene(d, cells, y, ask=False):
    for r, row in enumerate(cells):
        for x in range(W):
            cp, fg, bg = row[x * 3:(x + 1) * 3]
            X, Y = PAD + x * CW, y + r * CH
            mid = Y + CH // 2
            if cp == 0x2580:
                d.rectangle([X, Y, X + CW - 1, mid - 1], fill=rgb(fg))
                if bg != DEFAULT:
                    d.rectangle([X, mid, X + CW - 1, Y + CH - 1], fill=rgb(bg))
            elif cp == 0x2584:
                d.rectangle([X, mid, X + CW - 1, Y + CH - 1], fill=rgb(fg))
            elif cp != 0x20:
                if bg != DEFAULT:
                    d.rectangle([X, Y, X + CW - 1, Y + CH - 1], fill=rgb(bg))
                d.text((X, Y + 1), chr(cp), font=FONT, fill=rgb(fg) if fg != DEFAULT else FG)
    if ask:
        # The bold question mark the pane lays over the bubble's middle cell.
        col = max(6, W - 8)
        d.text((PAD + col * CW, y + 2 * CH + 1), '?', font=BOLD, fill=(16, 16, 24))


def render(name, rows, cells, ask=False):
    img = draw(rows, cells, ask)
    path = os.path.join(DOCS, f'{name}.png')
    img.save(path)
    print(path, img.size)


def render_gif(name, rows, frames):
    """An animated picture: the rows drawn over each frame of the scene, 10 fps, looping."""
    # One palette for every frame, so a color never shifts from one to the next.
    full = [draw(rows, cells) for cells in frames]
    palette = full[0].quantize(colors=255, method=0)
    imgs = [img.quantize(palette=palette) for img in full]
    path = os.path.join(DOCS, f'{name}.gif')
    imgs[0].save(path, save_all=True, append_images=imgs[1:], duration=100, loop=0, optimize=True, disposal=1)
    print(path, imgs[0].size, f'{len(imgs)} frames', f'{os.path.getsize(path) // 1024} KB')


def draw(rows, cells, ask=False):
    margin = MARGIN if any(badge is not None for _, badge in rows) else 0
    img = Image.new('RGB', ((W + margin) * CW + 2 * PAD, height(rows) * CH + 2 * PAD), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([4, 4, PAD + W * CW + PAD // 2, img.height - 5], radius=14, outline=BORDER, width=3)
    y = PAD
    for content, badge in rows:
        top = y
        y = draw_row(d, content, y, 0, W - 1, cells, ask)
        if badge is not None:
            draw_badge(d, badge, top + CH if isinstance(content, tuple) and content[0] == 'frame' else top)
    return img


with open(os.path.join(HOOKS, 'version.ts')) as f:
    VERSION = re.search(r"VERSION = '([^']+)'", f.read()).group(1)

if not shutil.which('node'):
    sys.exit('needs node 22+ on PATH')
cells = scenes()
for old in ('idle', 'busy'):
    if os.path.exists(os.path.join(DOCS, f'{old}.png')):
        os.remove(os.path.join(DOCS, f'{old}.png'))
render('top', top_rows(), cells['walkingFrames'][0])
render_gif('top', top_rows(), cells['walkingFrames'])
render('asleep', waiting_rows(), cells['asleep'])
render('waiting', waiting_rows(), cells['waiting'], ask=True)
render('session-sign', session_rows(), None)
for old in ('session',):
    if os.path.exists(os.path.join(DOCS, f'{old}.png')):
        os.remove(os.path.join(DOCS, f'{old}.png'))
render('property', property_rows(), None)
render('campfire', [(('scene',), None)], cells['campfire'])
render('embers', [(('scene',), None)], cells['embers'])
render('passive', passive_rows(), None)
render('journal', journal_rows(), None)
render('skills', skills_rows(), None)
render('tree', tree_rows(), None)
render('party', party_rows(), None)
render('events', events_rows(), None)
render('setting', setting_rows(), None)
