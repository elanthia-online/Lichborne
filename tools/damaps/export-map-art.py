#!/usr/bin/env python3
"""Da'Maps: export one guide PNG per map, for painting background art.

Each PNG is the map's rooms, lines and place names drawn on a transparent
canvas at a FIXED scale (SCALE pixels per map unit). Paint the background on a
layer under the guide, hide the guide, and export at the SAME pixel size, so
the art lines up when Da'Maps places it at the map's origin.

The placement of every image is written to map-art.json (origin in map units,
scale, pixel size), which is what Da'Maps will read to draw the art.

    python3 tools/damaps/export-map-art.py OUT_DIR
Needs rsvg-convert.
"""
import json, os, re, subprocess, sys, math
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.join(HERE, '..', '..', 'src', 'renderer', 'public', 'damaps-world.json')
SCALE = 3          # pixels per map unit, the same for every map
PAD = 30           # map units of empty margin around the drawing
SNAP = 10          # origin rounded down to a multiple of this
ROOM = 8           # square size (DA_ROOM_SIZE)
FONT = 9           # LABEL_FONT
CHAR_W = FONT * 0.6
ARC = ['#888888', '#d4a574', '#ffb74d']   # cardinal, climb, go (the app's fallbacks)


def safe(name):
    return re.sub(r'[<>:"/\\|?*]', '', name).strip().rstrip('.')


def main(out):
    world = json.load(open(WORLD, encoding='utf-8'))
    placements = []
    for a in world['areas']:
        rooms = a['rooms']
        if not rooms:
            continue
        by = {r[0]: r for r in rooms}
        xs, ys = [], []
        for r in rooms:
            xs += [r[2] - ROOM / 2, r[2] + ROOM / 2]
            ys += [r[3] - ROOM / 2, r[3] + ROOM / 2]
        for t, x, y in a['texts']:
            xs += [x, x + 1 + len(t) * CHAR_W]
            ys += [y, y + 1 + FONT * 1.3]
        x0 = math.floor((min(xs) - PAD) / SNAP) * SNAP
        y0 = math.floor((min(ys) - PAD) / SNAP) * SNAP
        x1 = math.ceil((max(xs) + PAD) / SNAP) * SNAP
        y1 = math.ceil((max(ys) + PAD) / SNAP) * SNAP
        w, h = x1 - x0, y1 - y0
        pw, ph = w * SCALE, h * SCALE

        parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{pw}" height="{ph}" '
                 f'viewBox="{x0} {y0} {w} {h}">']
        for cat in range(3):
            d = ''.join(f'M{by[p][2]},{by[p][3]}L{by[q][2]},{by[q][3]}'
                        for p, q, c in a['lines'] if c == cat and p in by and q in by)
            if d:
                parts.append(f'<path d="{d}" stroke="{ARC[cat]}" stroke-width="0.6" fill="none" opacity="0.8"/>')
        for t, x, y in a['texts']:
            parts.append(f'<text x="{x + 1}" y="{y + 1 + FONT * 0.8}" font-size="{FONT}" font-style="italic" '
                         f'font-family="DejaVu Sans Mono, monospace" fill="#999999">{escape(t)}</text>')
        for r in rooms:
            _, lich, x, y, fill, stub = r[:6]
            f = fill or '#2a2a2a'
            stroke = '' if fill else ' stroke="#555555" stroke-width="0.5"'
            parts.append(f'<rect x="{x - ROOM / 2}" y="{y - ROOM / 2}" width="{ROOM}" height="{ROOM}" fill="{f}"{stroke}/>')
            if stub:
                parts.append(f'<text x="{x}" y="{y + 3.5}" font-size="10" font-weight="bold" text-anchor="middle" '
                             f'font-family="DejaVu Sans" fill="#ffb74d">↗</text>')
        parts.append('</svg>')

        floor = a['floors'][0] != a['key']
        folder = os.path.join(out, 'Upper floors' if floor else a['province'])
        os.makedirs(folder, exist_ok=True)
        fname = safe(a['name']) + '.png'
        svg = os.path.join(out, '_tmp.svg')
        open(svg, 'w', encoding='utf-8').write(''.join(parts))
        subprocess.run(['rsvg-convert', '-w', str(pw), '-h', str(ph), '-o', os.path.join(folder, fname), svg], check=True)
        placements.append({'key': a['key'], 'name': a['name'],
                           'file': os.path.relpath(os.path.join(folder, fname), out).replace('\\', '/'),
                           'x': x0, 'y': y0, 'scale': SCALE, 'width': pw, 'height': ph})
    os.remove(os.path.join(out, '_tmp.svg'))
    json.dump({'version': 1, 'scale': SCALE, 'maps': placements},
              open(os.path.join(out, 'map-art.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(placements), 'maps; largest', max(max(p['width'], p['height']) for p in placements), 'px')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'damaps-map-art')
