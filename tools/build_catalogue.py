"""Rebuild docs/venaudio-catalogue.pdf, the printable price list, from browse.html.

    python tools/build_catalogue.py

Reads every record card on the Browse page (artist, title, format, price,
Spotify album), so the PDF always matches the shop. Re-run it whenever
prices change. Each row's "Listen" is a clickable link to Spotify.

The PDF is written by hand — no libraries needed. It uses the fonts every
PDF reader has built in (Helvetica, Courier), which can't draw the ₱ sign,
so prices are printed as "PHP 1,450.00".
"""
import datetime, html, os, re

ROOT = os.path.join(os.path.dirname(__file__), '..')
SOURCE = os.path.join(ROOT, 'browse.html')
OUT = os.path.join(ROOT, 'docs', 'venaudio-catalogue.pdf')

# ---------- read the cards ----------
page = open(SOURCE, encoding='utf-8').read()
records = []
for card in re.findall(r'<article class="card"(.*?)</article>', page, re.S):
    attr = lambda name: html.unescape(re.search(rf'data-{name}="([^"]*)"', card).group(1))
    records.append({
        'artist': attr('artist'),
        'title': html.unescape(re.search(r'<h2 class="title">(.*?)</h2>', card, re.S).group(1).strip()),
        'format': attr('label'),
        'price': int(attr('price')),
        'spotify': attr('spotify') if 'data-spotify=' in card else '',
    })
records.sort(key=lambda r: (r['artist'].lower(), r['title'].lower()))

# ---------- lay out the page ----------
PAGE_W, PAGE_H = 612, 792          # US Letter, in points
LEFT, RIGHT = 72, 540              # margins
FORMAT_X = 300                     # where the format column starts
LISTEN_X = 418                     # the "Listen" link column
LINK_RGB = (0.11, 0.30, 0.22)      # the shop's forest green

lines = []                         # (font, size, x, y, text, colour)
links = []                         # (x0, y0, x1, y1, url) clickable areas


def text(font, size, x, y, s, rgb=(0, 0, 0)):
    lines.append((font, size, x, y, s, rgb))


def right_aligned(size, right_edge, y, s):
    # Courier is monospaced (every character 0.6 of the font size wide), so
    # right-aligning the prices is exact arithmetic
    text('F3', size, right_edge - len(s) * 0.6 * size, y, s)


today = datetime.date.today()
text('F2', 28, LEFT, 730, 'VenAudio')
text('F1', 15, LEFT, 704, 'Price list')
text('F1', 10, LEFT, 686, 'Albums on wax, disc & file')
text('F1', 9, LEFT, 670, f'Prices in Philippine pesos (PHP) as of {today.day} {today:%B %Y}.')

y = 636
current_artist = None
for r in records:
    if r['artist'] != current_artist:          # a small heading per artist
        current_artist = r['artist']
        y -= 6
        text('F2', 11, LEFT, y, current_artist)
        y -= 18
    text('F1', 10.5, LEFT + 12, y, r['title'])
    text('F1', 9.5, FORMAT_X, y, r['format'])
    if r['spotify']:
        # Helvetica's "Listen" is about 2.6 times the font size wide
        text('F1', 9, LISTEN_X, y, 'Listen', LINK_RGB)
        links.append((LISTEN_X, y - 3, LISTEN_X + 26, y + 9, f"https://open.spotify.com/{r['spotify']}"))
    right_aligned(10, RIGHT, y, f"PHP {r['price']:,}.00")
    y -= 17

text('F1', 9, LEFT, y - 22, f'{len(records)} records. Ships nationwide. Sleeves handled with gloves.')
text('F1', 9, LEFT, y - 36, '"Listen" opens the album on Spotify.', LINK_RGB)

# ---------- write the PDF ----------


def pdf_string(s):
    # Built-in fonts read the WinAnsi (Windows-1252) character set, which has the em dash
    raw = s.encode('cp1252', errors='replace')
    return raw.replace(b'\\', b'\\\\').replace(b'(', b'\\(').replace(b')', b'\\)')


content = bytearray(b'BT\n')
for font, size, x, y_pos, s, (r, g, b) in lines:
    content += (f'{r} {g} {b} rg\n/{font} {size} Tf\n1 0 0 1 {x:.2f} {y_pos:.2f} Tm\n'.encode()
                + b'(' + pdf_string(s) + b') Tj\n')
content += b'ET\n'

font = lambda name: f'<< /Type /Font /Subtype /Type1 /BaseFont /{name} /Encoding /WinAnsiEncoding >>'.encode()

# Each "Listen" link is its own annotation object, numbered after the fonts
FIRST_LINK = 8
link = lambda x0, y0, x1, y1, url: (
    f'<< /Type /Annot /Subtype /Link /Rect [{x0} {y0} {x1} {y1}] /Border [0 0 0] '
    f'/A << /S /URI /URI ({url}) >> >>'.encode())
annots = ' '.join(f'{FIRST_LINK + i} 0 R' for i in range(len(links)))

objects = [
    b'<< /Type /Catalog /Pages 2 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] '
    '/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R '
    f'/Annots [{annots}] >>'.encode(),
    b'<< /Length ' + str(len(content)).encode() + b' >>\nstream\n' + bytes(content) + b'endstream',
    font('Helvetica'),
    font('Helvetica-Bold'),
    font('Courier'),
    *(link(*l) for l in links),
]

pdf = bytearray(b'%PDF-1.4\n')
offsets = []
for number, body in enumerate(objects, start=1):
    offsets.append(len(pdf))
    pdf += f'{number} 0 obj\n'.encode() + body + b'\nendobj\n'

xref_at = len(pdf)
pdf += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
pdf += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)
pdf += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n'.encode()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'wb') as f:
    f.write(pdf)
print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(records)} records, {len(pdf):,} bytes')
