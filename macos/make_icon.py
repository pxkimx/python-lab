"""Draw the app icon (a terminal prompt beside a DNA helix on a blue tile) and write AppIcon.icns."""
import math
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw


def draw(size: int) -> Image.Image:
    s = size * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    m = int(s * 0.06)
    tile = Image.new("RGBA", (s, s))
    td = ImageDraw.Draw(tile)
    for y in range(s):  # diagonal-ish gradient blue -> indigo
        t = y / s
        td.line((0, y, s, y), fill=(int(10 + 84 * t), int(132 - 40 * t), int(255 - 25 * t), 255))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle((m, m, s - m, s - m), radius=int(s * 0.22), fill=255)
    img.paste(tile, (0, 0), mask)
    d = ImageDraw.Draw(img)
    w = int(s * 0.055)
    # prompt ">_"
    d.line([(s * .22, s * .36), (s * .35, s * .46), (s * .22, s * .56)], fill="white", width=w, joint="curve")
    for x, y in [(s * .22, s * .36), (s * .35, s * .46), (s * .22, s * .56)]:
        d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill="white")
    d.rounded_rectangle((s * .39, s * .55, s * .54, s * .55 + w), radius=w // 2, fill="white")
    # helix
    cx, top, bot, amp = s * .72, s * .18, s * .82, s * .085
    pts = lambda ph: [(cx + amp * math.sin((y - top) / (bot - top) * 2 * math.pi * 1.25 + ph), y) for y in range(int(top), int(bot), 2)]
    for y in range(int(top) + 30, int(bot), int(s * .075)):
        th = (y - top) / (bot - top) * 2 * math.pi * 1.25
        d.line([(cx + amp * math.sin(th), y), (cx + amp * math.sin(th + math.pi), y)], fill=(255, 255, 255, 210), width=int(s * .018))
    r = s * .016
    for ph in (0, math.pi):
        for x, y in pts(ph):
            d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 214, 10, 255))
    return img.resize((size, size), Image.LANCZOS)


def main(out: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, "AppIcon.iconset")
        os.mkdir(iconset)
        for base in (16, 32, 128, 256, 512):
            draw(base).save(os.path.join(iconset, f"icon_{base}x{base}.png"))
            draw(base * 2).save(os.path.join(iconset, f"icon_{base}x{base}@2x.png"))
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out], check=True)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--png":
        draw(512).save(sys.argv[2])
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else "AppIcon.icns")
