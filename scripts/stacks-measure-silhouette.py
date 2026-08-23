#!/usr/bin/env python3
"""Measure a prop's silhouette from a packshot on white — stdlib only.

Why this exists: the MiO bottle profile in
src/app/components/stacks/scene/mioBottleGeometry.ts was typed from memory
twice and wrong twice. The third time it was read off the owner's packshot
with this script and pasted in verbatim. Use it for the next lathed or
extruded prop that has a product photo: scan every row for the left and
right edge, and you get radius-vs-height plus where the cap, the band and
the wordmark sit, as fractions of the bottle's height.

Usage:
  python3 scripts/stacks-measure-silhouette.py <packshot.png> [samples=28]

Input must be a PNG (8-bit RGB/RGBA, not interlaced); on macOS convert
anything with `sips -s format png in.jpg --out out.png`. Output is JSON:
  profile_r_by_height  — [radius / max radius, height fraction] from the base
  cap_bottom_frac      — where navy/dark rows stop, from the top
  band_top_frac        — where the base band's colour stops, from the bottom
  wordmark_frac        — rows with a dense navy run between cap and band
Colour classes are tuned for MiO (navy / teal / light blue / yellow); edit
`classify` for another product.
"""
import json
import struct
import sys
import zlib


def decode(path):
    d = open(path, "rb").read()
    pos = 8
    idat = b""
    w = h = ct = 0
    while pos < len(d):
        (L,) = struct.unpack(">I", d[pos : pos + 4])
        c = d[pos + 4 : pos + 8]
        body = d[pos + 8 : pos + 8 + L]
        pos += 12 + L
        if c == b"IHDR":
            w, h, bd, ct, _, _, il = struct.unpack(">IIBBBBB", body)
        elif c == b"IDAT":
            idat += body
        elif c == b"IEND":
            break
    ch = {2: 3, 6: 4}[ct]
    raw = zlib.decompress(idat)
    stride = w * ch
    out = bytearray(w * h * ch)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                line[i] = (line[i] + (((line[i - ch] if i >= ch else 0) + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                pa = abs(b - c)
                pb = abs(a - c)
                pc = abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return w, h, ch, out


path = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 28
W, H, CH, PX = decode(path)


def px(x, y):
    i = (y * W + x) * CH
    r, g, b = PX[i], PX[i + 1], PX[i + 2]
    if CH == 4:
        a = PX[i + 3]
        if a < 255:
            r = (r * a + 255 * (255 - a)) // 255
            g = (g * a + 255 * (255 - a)) // 255
            b = (b * a + 255 * (255 - a)) // 255
    return r, g, b


def is_bg(c):
    return c[0] > 232 and c[1] > 232 and c[2] > 232


# per-row extents
rows = []
for y in range(H):
    left = None
    right = None
    for x in range(W):
        if not is_bg(px(x, y)):
            left = x
            break
    if left is None:
        rows.append(None)
        continue
    for x in range(W - 1, -1, -1):
        if not is_bg(px(x, y)):
            right = x
            break
    rows.append((left, right))

ys = [y for y, r in enumerate(rows) if r is not None and r[1] - r[0] > W * 0.03]
top, bottom = min(ys), max(ys)
height = bottom - top
widths = {y: rows[y][1] - rows[y][0] for y in ys}
maxw = max(widths.values())
maxw_y = max(widths, key=lambda y: widths[y])
center = sum((rows[y][0] + rows[y][1]) / 2 for y in ys) / len(ys)


def classify(c):
    r, g, b = c
    if r > 232 and g > 232 and b > 232:
        return "white"
    if b > 120 and r < 90 and g < 90:
        return "navy"
    if r > 200 and g > 170 and b < 120:
        return "yellow"
    if b > g > r and b > 150:
        return "lightblue"
    if g > r and g > 120 and abs(g - b) < 60 and b > 110 and r < 120:
        return "teal"
    if b > r + 40 and b > 150:
        return "blue"
    if r < 90 and g < 90 and b < 90:
        return "dark"
    return "other"


# dominant body colour per row (sampled across the middle 60% of the row)
dom = {}
for y in ys:
    l, r = rows[y]
    span = r - l
    counts = {}
    for x in range(l + int(span * 0.2), r - int(span * 0.2), max(1, span // 40)):
        k = classify(px(x, y))
        counts[k] = counts.get(k, 0) + 1
    dom[y] = max(counts, key=lambda k: counts[k])

# cap: navy rows from the top
cap_end = top
for y in ys:
    if dom[y] in ("navy", "dark"):
        cap_end = y
    else:
        break
# band: from the bottom up, first row whose dominant colour differs from the
# base band colour (skip a few rim rows)
base_rows = [y for y in ys if y > bottom - height * 0.06]
band_color = max(set(dom[y] for y in base_rows), key=[dom[y] for y in base_rows].count)
band_top = bottom
for y in sorted(ys, reverse=True):
    if y > bottom - height * 0.06:
        continue
    if dom[y] == band_color or dom[y] in ("white", "navy", "other", "dark"):
        band_top = y
        continue
    break
# wordmark: rows between cap and band with many navy pixels in the middle
wm_rows = []
for y in ys:
    if y <= cap_end or y >= band_top:
        continue
    l, r = rows[y]
    span = r - l
    navy = 0
    total = 0
    for x in range(l + int(span * 0.15), r - int(span * 0.15), 2):
        total += 1
        if classify(px(x, y)) in ("navy", "dark"):
            navy += 1
    if total and navy / total > 0.12:
        wm_rows.append(y)
# largest contiguous run = the big wordmark
runs = []
for y in wm_rows:
    if runs and y == runs[-1][-1] + 1:
        runs[-1].append(y)
    else:
        runs.append([y])
wm = max(runs, key=len) if runs else []

frac = lambda y: round((bottom - y) / height, 4)  # height fraction from the base
profile = []
for k in range(N + 1):
    t = k / N
    y = round(bottom - t * height)
    y = min(max(y, top), bottom)
    # nearest measured row
    cand = [yy for yy in (y - 2, y - 1, y, y + 1, y + 2) if yy in widths]
    wv = max(widths[yy] for yy in cand) if cand else 0
    profile.append([round(wv / maxw, 4), round(t, 4)])

out = {
    "image": path,
    "size": [W, H],
    "bottle_rows": [top, bottom],
    "height_px": height,
    "max_width_px": maxw,
    "aspect_w_over_h": round(maxw / height, 4),
    "widest_at_height_frac": frac(maxw_y),
    "cap_bottom_frac": frac(cap_end),
    "cap_width_frac_of_max": round(widths[cap_end] / maxw, 4) if cap_end in widths else None,
    "band_color": band_color,
    "band_top_frac": frac(band_top),
    "wordmark_frac": [frac(wm[-1]), frac(wm[0])] if wm else None,
    "profile_r_by_height": profile,
}
print(json.dumps(out, indent=1))
