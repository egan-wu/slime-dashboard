#!/usr/bin/env python3
"""Draws the README's pictures of the pane, one per section: docs/*.png.

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
import { frame, ROWS } from './scene.ts'
const W = %d
const decode = (b64: string) => { const b = Buffer.from(b64, 'base64'); const u = new Uint32Array(b.buffer, b.byteOffset, b.length / 4); return Array.from({ length: ROWS }, (_, r) => Array.from(u.slice(r * W * 3, (r + 1) * W * 3))) }
const off = (n: number) => ({ cloud: 23 + n, bird: 40, tree: 52 + n, rock: 31 + n, ground: 9 })
const troop = [{ model: 'claude-haiku-5-5', pos: 0 }, { model: 'claude-sonnet-5-5', pos: 1 }]
console.log(JSON.stringify({
  walking: decode(frame(W, off(28), 12, true, 'claude-opus-5-5', troop, { day: true, sky: 'partly' })),
  asleep: decode(frame(W, off(0), 7, false, 'claude-opus-5-5', [], { day: false, sky: 'clear' })),
  waiting: decode(frame(W, off(5), 0, true, 'claude-opus-5-5', troop, { day: true, sky: 'partly' }, undefined, { ask: true })),
}))
""" % W)
        out = subprocess.run(['node', '--experimental-strip-types', '--no-warnings', 'cells.ts'],
                             cwd=tmp, capture_output=True, text=True, check=True)
        return json.loads(out.stdout)


# A row is a list of runs (text, color, bold), or ('scene',), or ('frame', rows)
# for a rounded frame around some rows; a run's text may carry a badge as
# ('badge', n) placed after the row.
def run(text, color=FG, bold=False):
    return (text, color, bold)


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


def property_rows():
    return section(
        'Property',
        [run(' Model: '), run('[Opus 5.5]')],
        [run(' Effort: '), run('[High]')],
        [run(' '), run('[Low]', DIM), run('[Mid]', DIM), run('[High]'), run('[xHigh]', DIM), run('[Max]', DIM)],
        [run(' Cache Hit Rate: 91.4%')],
        [run(' Token Usage: 1.84M')],
        [run(' Iteration Rate: 7/∞')],
        [run(' Latest Command: 48.2s')],
    )


def skills_rows():
    return section(
        'Skill Box',
        ('frame', [[run('Prompt for skill', MP, True)], [run('› '), run('30')]], MP),
        [run('▼ General')],
        ('frame', [[run('[Unload]'), run(': compact context window', DIM)],
                   [run('[timer]'), run(': background timer, prompt = seconds', DIM)]]),
        [run('▲ Code (1)')],
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
        [run('  [Reload]'), run(': reload dashboard', DIM)],
    ) + [(version(), None)]


def waiting_rows():
    return [(('scene',), None)]


def height(rows):
    return sum(len(r[0][1]) + 2 if r[0][0] == 'frame' else 6 if r[0][0] == 'scene' else 1 for r in rows)


def clip(runs, room):
    """Runs cut to `room` columns, ending in … where cut, as the pane's truncate-end does."""
    if sum(len(t) for t, _, _ in runs) <= room:
        return runs
    out, left = [], room - 1
    for text, color, bold in runs:
        out.append((text[:left], color, bold))
        left -= len(out[-1][0])
        if left <= 0:
            out.append(('…', color, bold))
            break
    return out


def draw_runs(d, runs, col, y, room=W - 1):
    for text, color, bold in clip(runs, room - col):
        for ch in text:
            x = PAD + col * CW
            if ch == '█':
                d.rectangle([x, y + 2, x + CW - 1, y + CH - 3], fill=color)
            else:
                d.text((x, y + 1), ch, font=BOLD if bold else FONT, fill=color)
            col += 1
    return col


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
    margin = MARGIN if any(badge is not None for _, badge in rows) else 0
    img = Image.new('RGB', ((W + margin) * CW + 2 * PAD, height(rows) * CH + 2 * PAD), BG)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([4, 4, PAD + W * CW + PAD // 2, img.height - 5], radius=14, outline=BORDER, width=3)
    y = PAD
    for content, badge in rows:
        top = y
        if content[0] == 'scene':
            draw_scene(d, cells, y, ask)
            y += 6 * CH
        elif content[0] == 'frame':
            inner = content[1]
            color = content[2] if len(content) > 2 else DIM
            x0, x1 = PAD + CW // 2, PAD + (W - 1) * CW - CW // 2
            d.rounded_rectangle([x0, y + CH // 2, x1, y + (len(inner) + 1) * CH + CH // 2],
                                radius=10, outline=color, width=2)
            for i, runs in enumerate(inner):
                draw_runs(d, runs, 2, y + (i + 1) * CH)
            y += (len(inner) + 2) * CH
        else:
            draw_runs(d, content, 0, y)
            y += CH
        if badge is not None:
            draw_badge(d, badge, top if content[0] != 'frame' else top + CH)
    path = os.path.join(DOCS, f'{name}.png')
    img.save(path)
    print(path, img.size)


with open(os.path.join(HOOKS, 'version.ts')) as f:
    VERSION = re.search(r"VERSION = '([^']+)'", f.read()).group(1)

if not shutil.which('node'):
    sys.exit('needs node 22+ on PATH')
cells = scenes()
for old in ('idle', 'busy'):
    if os.path.exists(os.path.join(DOCS, f'{old}.png')):
        os.remove(os.path.join(DOCS, f'{old}.png'))
render('top', top_rows(), cells['walking'])
render('asleep', waiting_rows(), cells['asleep'])
render('waiting', waiting_rows(), cells['waiting'], ask=True)
render('property', property_rows(), None)
render('skills', skills_rows(), None)
render('party', party_rows(), None)
render('events', events_rows(), None)
render('setting', setting_rows(), None)
