#!/usr/bin/env python3
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "store-assets"
ICON = ROOT / "icons" / "scrybe-128.png"

BG = (5, 7, 10)
PANEL = (13, 18, 24)
PANEL_SOFT = (17, 25, 35)
LINE = (32, 43, 55)
TEXT = (238, 245, 255)
MUTED = (140, 152, 168)
ACCENT = (94, 234, 212)
ACCENT_DARK = (20, 184, 166)
DANGER = (251, 113, 133)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy, value, size=18, fill=TEXT, bold=False, anchor=None):
    draw.text(xy, value, font=font(size, bold), fill=fill, anchor=anchor)


def draw_wrapped_text(draw: ImageDraw.ImageDraw, xy, value: str, max_width: int, size=18, fill=TEXT, bold=False, line_gap=6) -> int:
    x, y = xy
    line_height = size + line_gap
    for line in wrap_pixels(draw, value, max_width, size, bold):
        text(draw, (x, y), line, size, fill, bold)
        y += line_height
    return y


def wrap_pixels(draw: ImageDraw.ImageDraw, value: str, max_width: int, size=18, bold=False) -> list[str]:
    words = value.split()
    lines: list[str] = []
    line: list[str] = []
    f = font(size, bold)
    for word in words:
        candidate = " ".join([*line, word])
        if line and draw.textlength(candidate, font=f) > max_width:
            lines.append(" ".join(line))
            line = [word]
        else:
            line.append(word)
    if line:
        lines.append(" ".join(line))
    return lines


def ellipsize(draw: ImageDraw.ImageDraw, value: str, max_width: int, size=18, bold=False) -> str:
    f = font(size, bold)
    if draw.textlength(value, font=f) <= max_width:
        return value
    suffix = "..."
    while value and draw.textlength(value + suffix, font=f) > max_width:
        value = value[:-1]
    return value + suffix


def gradient(size, top=(23, 37, 54), bottom=BG):
    w, h = size
    im = Image.new("RGB", size, bottom)
    px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        radial = max(0, 1 - math.hypot((0.5), (y / h + 0.14)) / 0.9)
        blend = min(1, (1 - t) * 0.62 + radial * 0.38)
        for x in range(w):
            dx = abs(x / w - 0.5)
            local = max(0, blend - dx * 0.45)
            px[x, y] = tuple(round(bottom[i] * (1 - local) + top[i] * local) for i in range(3))
    return im.convert("RGBA")


def alpha_paste(base: Image.Image, overlay: Image.Image, xy):
    base.alpha_composite(overlay, xy)


def shadowed_card(base: Image.Image, box, radius=14, fill=(13, 18, 24, 232), outline=(32, 43, 55, 255)):
    x1, y1, x2, y2 = box
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x1 + 4, y1 + 8, x2 + 4, y2 + 8), radius=radius, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    base.alpha_composite(shadow)
    d = ImageDraw.Draw(base)
    rounded(d, box, radius, fill, outline)


def button(draw, box, label, primary=False, danger=False):
    fill = PANEL_SOFT
    outline = LINE
    label_fill = TEXT
    if primary:
        fill = ACCENT
        outline = (94, 234, 212)
        label_fill = (2, 17, 15)
    if danger:
        outline = (135, 67, 82)
        label_fill = (254, 205, 211)
    rounded(draw, box, 7, fill, outline)
    text(draw, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), label, 14, label_fill, True, "mm")


def favicon(label, bg):
    im = Image.new("RGBA", (34, 34), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rounded(d, (0, 0, 33, 33), 7, bg)
    text(d, (17, 17), label, 16, (255, 255, 255), True, "mm")
    return im


@dataclass
class Item:
    title: str
    url: str
    letter: str
    color: tuple[int, int, int]
    time: str | None = None


BOOKMARKS = [
    Item("Shadoweb dashboard", "https://shadoweb.fr", "S", (20, 184, 166)),
    Item("Python 3.14 free-threading notes and migration checklist", "https://docs.python.org/3.14/whatsnew/3.14.html", "P", (45, 112, 191)),
    Item("Encrypted sync architecture reference", "https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions", "M", (216, 93, 77)),
    Item("Chrome extension publishing checklist", "https://developer.chrome.com/docs/webstore", "C", (86, 133, 225)),
]

HISTORY = [
    Item("Scrybe backend health check", "http://127.0.0.1:5000/healthz", "S", (20, 184, 166), "6/28/2026, 2:44:10 PM"),
    Item("Very long article title that stays bounded with clean ellipses in the history list", "https://example.com/security/encrypted-browser-sync-design", "E", (123, 91, 209), "6/28/2026, 2:38:22 PM"),
    Item("Firefox add-ons developer hub", "https://addons.mozilla.org/developers/", "F", (245, 127, 32), "6/28/2026, 2:29:51 PM"),
    Item("Chrome Web Store developer dashboard", "https://chrome.google.com/webstore/devconsole", "C", (86, 133, 225), "6/28/2026, 2:21:04 PM"),
    Item("Shadoweb", "https://shadoweb.fr", "S", (20, 184, 166), "6/28/2026, 2:07:19 PM"),
]


def popup(state: str) -> Image.Image:
    connected = state in {"bookmarks", "history", "settings"}
    w, h = 390, 600 if connected else 640
    im = gradient((w, h))
    d = ImageDraw.Draw(im)
    x = 14
    y = 14
    text(d, (x, y + 1), "Scrybe", 24, TEXT, True)
    status = "Connected: acct_3f93d8a2..." if connected else "No account"
    text(d, (x, y + 34), status, 12, MUTED)
    if connected:
        button(d, (318, y, 376, y + 38), "Sync")
    y += 62

    if state == "connection":
        connection_card(d, x, y, "Create new account", "Start a new encrypted Scrybe account on this browser.", "New account", primary=True)
        y += 136
        connection_card(d, x, y, "Pair this browser", "Use a pairing code from a browser that is already connected.", "Pair browser", input_label="Pairing code")
        y += 196
        connection_card(d, x, y, "Recover account", "Use the recovery code you saved when creating the account.", "Recover account", input_label="Recovery code")
        y += 196
        text(d, (x, y + 10), "Browser disconnected. Connect again to sync.", 12, DANGER)
        return im

    if state == "recovery":
        text(d, (x, y), "Save your recovery code", 18, TEXT, True)
        text(d, (x, y + 32), "Keep this code somewhere safe. It is the only way to recover this account", 12, MUTED)
        text(d, (x, y + 50), "if every browser disconnects.", 12, MUTED)
        rounded(d, (x, y + 82, w - x, y + 146), 8, (7, 17, 15), (57, 131, 124))
        text(d, (w // 2, y + 114), "9XK7-N4TT-Q8C2-M6PA", 18, ACCENT, True, "mm")
        button(d, (x, y + 170, w - x, y + 212), "I saved this code", primary=True)
        return im

    # tabs
    rounded(d, (x, y, w - x, y + 42), 8, (7, 11, 16), LINE)
    tab_w = (w - 2 * x - 12) // 3
    for i, label in enumerate(["Bookmarks", "History", "Settings"]):
        tx = x + 3 + i * (tab_w + 3)
        active = label.lower() == state
        rounded(d, (tx, y + 4, tx + tab_w, y + 38), 7, PANEL_SOFT if active else (7, 11, 16), None)
        text(d, (tx + tab_w // 2, y + 21), label, 13, TEXT if active else MUTED, False, "mm")
    y += 54

    if state == "bookmarks":
        button(d, (x, y, w - x, y + 40), "Save current tab", primary=True)
        y += 52
        for item in BOOKMARKS:
            draw_item(im, d, x, y, w - x, item, history=False)
            y += 68
    elif state == "history":
        button(d, (x, y, w - x, y + 40), "Clear history", danger=True)
        y += 52
        for item in HISTORY:
            draw_item(im, d, x, y, w - x, item, history=True)
            y += 84
    elif state == "settings":
        text(d, (x, y), "Backend URL", 12, MUTED)
        rounded(d, (x, y + 18, w - x, y + 56), 7, (7, 11, 16), LINE)
        text(d, (x + 10, y + 29), "https://scrybe-api.shadoweb.fr", 13, TEXT)
        button(d, (x, y + 68, w - x, y + 106), "Save settings")
        y += 124
        button(d, (x, y, w - x, y + 40), "Pair new browser")
        rounded(d, (x, y + 52, w - x, y + 100), 8, (7, 17, 15), (57, 131, 124))
        text(d, (w // 2, y + 76), "A7QD-9M2K-X4WP", 17, ACCENT, True, "mm")
        y += 118
        text(d, (x, y), "Paired browsers", 15, TEXT, True)
        button(d, (w - x - 78, y - 8, w - x, y + 30), "Refresh")
        y += 42
        devices = [
            ("Chrome on Windows (this browser)", "Last seen 6/28/2026, 2:44:30 PM"),
            ("Firefox on Android", "Last seen 6/28/2026, 2:17:04 PM"),
            ("Brave on Linux", "Last seen 6/27/2026, 10:08:49 PM"),
        ]
        for name, seen in devices:
            rounded(d, (x, y, w - x, y + 58), 8, (13, 18, 24), LINE)
            text(d, (x + 10, y + 10), ellipsize(d, name, 230, 13, True), 13, TEXT, True)
            text(d, (x + 10, y + 31), ellipsize(d, seen, 230, 12), 12, MUTED)
            button(d, (w - x - 90, y + 10, w - x - 8, y + 46), "Disconnect", danger=True)
            y += 66
    return im


def connection_card(d, x, y, title, desc, label, input_label=None, primary=False):
    height = 184 if input_label else 124
    rounded(d, (x, y, 376, y + height), 8, (13, 18, 24), LINE)
    text(d, (x + 10, y + 10), title, 15, TEXT, True)
    draw_wrapped_text(d, (x + 10, y + 36), desc, 336, 12, MUTED, False, 4)
    if input_label:
        text(d, (x + 10, y + 68), input_label, 12, MUTED)
        rounded(d, (x + 10, y + 88, 366, y + 126), 7, (7, 11, 16), LINE)
        text(d, (x + 20, y + 99), "ABCD-EFGH-...", 13, (93, 106, 123))
        button(d, (x + 10, y + 136, 366, y + 174), label)
    else:
        button(d, (x + 10, y + 74, 366, y + 112), label, primary=primary)


def draw_item(im, d, x, y, right, item: Item, history=False):
    height = 76 if history else 58
    rounded(d, (x, y, right, y + height), 8, (13, 18, 24), LINE)
    alpha_paste(im, favicon(item.letter, item.color), (x + 10, y + 12))
    action_left = right - (70 if history else 148)
    title_width = action_left - (x + 54) - 14
    text(d, (x + 54, y + 10), ellipsize(d, item.title, title_width, 13, True), 13, TEXT, True)
    text(d, (x + 54, y + 31), ellipsize(d, item.url, title_width, 12), 12, MUTED)
    if history and item.time:
        text(d, (x + 54, y + 51), item.time, 12, MUTED)
    if not history:
        button(d, (right - 148, y + 14, right - 78, y + 44), "Rename")
    button(d, (right - 70, y + 14, right - 8, y + 44), "Delete", danger=True)


def browser_frame(state: str, title: str, subtitle: str, filename: str):
    base = gradient((1280, 800), top=(17, 32, 48), bottom=BG)
    d = ImageDraw.Draw(base)

    shadowed_card(base, (70, 64, 1210, 736), radius=20, fill=(8, 13, 19, 238), outline=(40, 54, 69, 255))

    icon = Image.open(ICON).convert("RGBA").resize((78, 78), Image.Resampling.LANCZOS)
    alpha_paste(base, icon, (118, 122))
    text(d, (220, 126), "Scrybe", 36, TEXT, True)
    text(d, (222, 171), "Private bookmark and history sync", 20, MUTED)

    content_x = 118
    content_top = 264
    max_text_width = 560
    draw_wrapped_text(d, (content_x, content_top), title, max_text_width, 42, TEXT, True, 8)
    subtitle_y = content_top + 116
    draw_wrapped_text(d, (content_x + 2, subtitle_y), subtitle, max_text_width, 21, MUTED, False, 8)

    feature_y = 512
    features = [
        ("Encrypted before sync", "The backend stores encrypted records only."),
        ("Chrome + Firefox", "Pair browsers without email or passwords."),
    ]
    for i, (feature, copy) in enumerate(features):
        top = feature_y + i * 96
        rounded(d, (content_x, top, content_x + 520, top + 72), 10, (12, 20, 28), (32, 43, 55))
        text(d, (content_x + 22, top + 16), feature, 22, TEXT, True)
        text(d, (content_x + 22, top + 45), copy, 15, MUTED)

    # Extension popup
    pop = popup(state)
    popup_x = 748
    popup_y = 102
    shadowed_card(base, (popup_x - 18, popup_y - 18, popup_x + pop.width + 18, popup_y + pop.height + 18), radius=18, fill=(3, 5, 8, 255), outline=(55, 73, 91, 255))
    alpha_paste(base, pop, (popup_x, popup_y))
    rounded(d, (popup_x - 18, popup_y - 58, popup_x + pop.width + 18, popup_y - 24), 17, (7, 17, 15), (57, 131, 124))
    text(d, (popup_x + pop.width // 2, popup_y - 41), "Extension popup", 17, ACCENT, True, "mm")

    base.convert("RGB").save(OUT / filename, quality=95)


def wrap(value: str, width: int) -> list[str]:
    words = value.split()
    lines = []
    line = []
    for word in words:
        if sum(len(w) for w in line) + len(line) + len(word) > width:
            lines.append(" ".join(line))
            line = [word]
        else:
            line.append(word)
    if line:
        lines.append(" ".join(line))
    return lines


def promo(size: tuple[int, int], filename: str, marquee=False):
    w, h = size
    base = gradient(size, top=(18, 42, 58), bottom=BG)
    d = ImageDraw.Draw(base)
    icon = Image.open(ICON).convert("RGBA").resize((150 if marquee else 92, 150 if marquee else 92), Image.Resampling.LANCZOS)
    ix = 78 if marquee else 28
    iy = (h - icon.height) // 2
    alpha_paste(base, icon, (ix, iy))
    tx = ix + icon.width + (54 if marquee else 24)
    text(d, (tx, 128 if marquee else 58), "Scrybe", 76 if marquee else 42, TEXT, True)
    lines = [
        "Private bookmark and history sync",
        "across Chrome, Firefox, and compatible browsers.",
    ] if marquee else [
        "Encrypted browser sync",
        "Chrome + Firefox",
    ]
    for i, line in enumerate(lines):
        text(d, (tx + 3, (224 if marquee else 122) + i * (42 if marquee else 28)), line, 32 if marquee else 20, MUTED)
    if marquee:
        rounded(d, (tx + 4, 344, tx + 492, 404), 8, (94, 234, 212), None)
        text(d, (tx + 248, 374), "Only your browsers can decrypt", 22, (2, 17, 15), True, "mm")
        for x, y, label in [(1010, 130, "Chrome"), (1080, 244, "Firefox"), (980, 360, "Mobile")]:
            rounded(d, (x, y, x + 230, y + 74), 12, (13, 18, 24, 232), LINE)
            text(d, (x + 115, y + 37), label, 25, TEXT, True, "mm")
    else:
        rounded(d, (292, 196, 410, 240), 8, (94, 234, 212), None)
        text(d, (351, 218), "Private", 18, (2, 17, 15), True, "mm")
    base.convert("RGB").save(OUT / filename, quality=95)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    browser_frame("connection", "Connect once, sync everywhere", "Create an anonymous encrypted account, pair another browser, or recover with your saved backup code.", "screenshot-1-connection.png")
    browser_frame("bookmarks", "Bookmarks that travel with you", "Save the current tab with its title, URL and favicon, then sync it privately across browsers.", "screenshot-2-bookmarks.png")
    browser_frame("history", "Encrypted history across browsers", "Scrybe records visits automatically and keeps long titles neatly bounded in the popup.", "screenshot-3-history.png")
    browser_frame("settings", "Control paired browsers", "Review connected browsers, create pairing codes, replace recovery codes, and disconnect devices you no longer trust.", "screenshot-4-settings.png")
    browser_frame("recovery", "Recovery code at account creation", "Scrybe gives you a backup code when the account is created, so a browser reset does not lock you out.", "screenshot-5-recovery.png")
    promo((440, 280), "promo-small-440x280.png")
    promo((1400, 560), "promo-marquee-1400x560.png", marquee=True)


if __name__ == "__main__":
    main()
