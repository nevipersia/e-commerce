"""Rebuild data/ph-zip/*.js — ZIP codes for the checkout's address dropdowns.

    python tools/build_ph_zip.py

Reads the barangay lists already in data/ph/ (so run build_ph_address.py
first if those change) and joins ZIP codes onto them from GeoNames'
Philippine postal file (CC BY 4.0, https://www.geonames.org/):

    https://download.geonames.org/export/zip/PH.zip

Outside Metro Manila every city / municipality has exactly one ZIP.
Inside Metro Manila a city has many, so we try to narrow it down to the
barangay:  Manila by the district PSGC puts in brackets, everywhere else
by matching the barangay against GeoNames' area names.

Output per region, one entry per city:
    "2425"                        one ZIP — the checkout fills it in
    {"all": [...], "b": {...}}    several — "b" maps barangay -> the ZIPs
                                  that barangay can have; anything not in
                                  "b" gets offered the whole "all" list
"""
import csv, difflib, glob, io, json, os, re, unicodedata, urllib.request, zipfile
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'data', 'ph')
OUT = os.path.join(ROOT, 'data', 'ph-zip')
GEONAMES = 'https://download.geonames.org/export/zip/PH.zip'
NCR = '130000000'

# GeoNames region name -> PSGC region code
REGIONS = {
    'Ilocos': '010000000', 'Cagayan Valley': '020000000', 'Central Luzon': '030000000',
    'Calabarzon': '040000000', 'Bicol': '050000000', 'Western Visayas': '060000000',
    'Central Visayas': '070000000', 'Eastern Visayas': '080000000', 'Zamboanga Peninsula': '090000000',
    'Northern Mindanao': '100000000', 'Davao': '110000000', 'Soccsksargen': '120000000',
    'Metro Manila': NCR, 'Cordillera': '140000000',
    'Autonomous Region in Muslim Mindanao': '150000000', 'Caraga': '160000000', 'Mimaropa': '170000000',
}

# Towns renamed since GeoNames' list was made, or spelled too differently
# for the fuzzy match. Right-hand side is the GeoNames name, so the ZIP
# still comes from the data — the build stops if one stops resolving.
ALIASES = {
    ('Bohol', 'Getafe'): 'Jetafe',
    ('Cotabato', 'President Roxas'): 'Pre. Roxas',
    ('Antique', 'San Jose'): 'San Jose de Buanavista',
    ('Basilan', 'City of Isabela'): 'Isabela de Basilan',
    ('Cavite', 'General Emilio Aguinaldo'): 'Gen. Aguinaldo (Bailen)',
    ('Davao Oriental', 'Governor Generoso'): 'Gov. Generoso',
    ('Lanao Del Sur', 'Amai Manabilang'): 'Bumbaran',
    ('Lanao Del Sur', 'Bacolod-Kalawi'): 'Bacolod Grande',
    ('Lanao Del Sur', 'Ditsaan-Ramain'): 'Ramain-Ditsaan',
    ('Maguindanao', 'City of Cotabato'): 'Cotabato City',
    ('Maguindanao', 'Gen. S.K. Pendatun'): 'General Salipada K. Pendatun',
    ('Maguindanao', 'Pagagawan'): 'Datu Montawal (formerly Pagagawan)',
    ('Maguindanao', 'Talitay'): 'Sultan Sumagka (formerly Talitay)',
    ('Maguindanao', 'Parang'): 'Parang',
    ('Misamis Occidental', 'City of Ozamiz'): 'Ozamis City',
    ('Nueva Ecija', 'Science City of Muñoz'): 'Muñoz',
    ('Palawan', 'Bataraza'): 'Batazara',
    ('Samar', 'Paranas'): 'Wright',
    ('Sultan Kudarat', 'Lambayong'): 'Mariano Marcos',
    ('Sulu', 'Old Panamao'): 'Panamao',
    ('Sulu', 'Tongkil'): 'Banguingui (formerly Tongkil)',
    ('Surigao Del Sur', 'Cortes'): 'Cortez',
    ('Zamboanga Del Norte', 'Bacungan'): 'Leon B. Postigo (Bacungan)',
    ('Zamboanga Del Sur', 'Sominot'): 'Don Mariano Marcos',
    ('Zamboanga Del Sur', 'Vincenzo A. Sagun'): 'Vicencio Sagun',
}

# One city that absorbed three towns which kept their own ZIPs
SEVERAL = {('Davao Del Norte', 'Island Garden City of Samal'): ['Babak', 'Samal', 'Kaputian']}

# PHLPost gives each Metro Manila city its own block of ZIPs; in the data
# every block opens with that city's central post office (CPO).
NCR_BLOCKS = [
    ('City of Manila', 1000, 1099), ('Quezon City', 1100, 1199), ('City of Makati', 1200, 1299),
    ('Pasay City', 1300, 1399), ('City of Caloocan', 1400, 1439), ('City of Valenzuela', 1440, 1469),
    ('City of Malabon', 1470, 1484), ('City of Navotas', 1485, 1499), ('City of San Juan', 1500, 1549),
    ('City of Mandaluyong', 1550, 1599), ('City of Pasig', 1600, 1619), ('Pateros', 1620, 1629),
    ('City of Taguig', 1630, 1699), ('City of Parañaque', 1700, 1739), ('City of Las Piñas', 1740, 1769),
    ('City of Muntinlupa', 1770, 1799), ('City of Marikina', 1800, 1899),
]

# Manila barangays name their district: 'Barangay 1 (Tondo I/II)'.
# Santa Mesa sits inside Sampaloc and San Andres inside Santa Ana.
MANILA_DISTRICTS = {
    'tondo': ['tondo'], 'binondo': ['binondo'], 'quiapo': ['quiapo'], 'san nicolas': ['san nicolas'],
    'santa cruz': ['santa cruz'], 'sampaloc': ['sampaloc', 'santa mesa'], 'san miguel': ['san miguel'],
    'ermita': ['ermita'], 'intramuros': ['intramuros'], 'malate': ['malate'], 'paco': ['paco'],
    'pandacan': ['pandacan'], 'port area': ['port area'], 'santa ana': ['santa ana', 'san andres'],
}


def words(s):
    """'Sta. Cruz (South)' -> ['santa', 'cruz', 'south']"""
    s = s.replace('�', 'n')   # GeoNames has a few mangled ñ's
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\bsta\b\.?', 'santa', s)
    s = re.sub(r'\bsto\b\.?', 'santo', s)
    s = re.sub(r'\bgen\b\.?', 'general', s)
    s = re.sub(r'\bpres\b\.?', 'president', s)
    return re.findall(r'[a-z0-9]+', s)


def key(s):
    """Town / province name -> comparison key, ignoring 'City of', 'Province of', brackets."""
    s = re.sub(r'\(.*?\)', ' ', s)
    return ''.join(w for w in words(s) if w not in ('city', 'of', 'province', 'municipality'))


def pieces(area):
    """'Fortune Vil. - Paso De Blas - Gen. T. De Leon' names several places."""
    area = re.sub(r'\((inc\.?|including)[^)]*\)?', ' ', area, flags=re.I)
    return [w for w in (words(p) for p in re.split(r'[-/&,()]| and ', area)) if w] + [words(area)]


SUFFIXES = {'north', 'south', 'east', 'west', 'proper', 'i', 'ii', 'iii', 'iv', 'v', 'uno', 'dos', 'tres'}


def covers(area, barangay):
    """Does this GeoNames area take in the barangay? 'Tanza' covers 'Tanza 1' and 'Tanza North'."""
    b = words(barangay)
    for p in pieces(area):
        if b[:len(p)] == p and (len(b) == len(p) or b[len(p)].isdigit() or b[len(p)] in SUFFIXES):
            return True
    return False


# ---------- inputs ----------
psgc = {}
for path in glob.glob(os.path.join(SRC, '*.js')):
    m = re.search(r'registerRegionData\("(\d+)",\s*(\{.*\})\);', open(path, encoding='utf-8').read(), re.S)
    psgc[m.group(1)] = json.loads(m.group(2))

with urllib.request.urlopen(GEONAMES) as res:
    archive = zipfile.ZipFile(io.BytesIO(res.read()))
# Rows without a region are institutions (ADB, Camp Crame, BIR...) — not addresses
rows = [r for r in csv.reader(io.TextIOWrapper(archive.open('PH.txt'), encoding='utf-8'), delimiter='\t') if r[3]]

towns = defaultdict(dict)        # (region, province key) -> {town key: set(zips)}
in_region = defaultdict(list)    # (region, town key) -> [(province key, zip)]
ncr_areas = defaultdict(list)    # Metro Manila city -> [(zip, area name)]
for _, zip_code, place, region, _, province, *_ in rows:
    code = REGIONS[region]
    if code == NCR:
        z = int(zip_code)
        city = [c for c, lo, hi in NCR_BLOCKS if lo <= z <= hi]
        assert len(city) == 1, f'{zip_code} {place} is outside every Metro Manila block'
        ncr_areas[city[0]].append((zip_code, place))
        continue
    towns[(code, key(province))].setdefault(key(place), set()).add(zip_code)
    in_region[(code, key(place))].append((key(province), zip_code))


def anywhere_in_region(code, province, town):
    """GeoNames sometimes files a town under a newer province than PSGC
    (Maguindanao del Norte vs Maguindanao), so look region-wide. If the
    name exists in several provinces (Parang: Sulu and Maguindanao),
    keep the ones whose province name lines up with ours.
    code=None searches every region — only used for the hand-checked
    ALIASES, e.g. Isabela City, which GeoNames files under BARMM."""
    if code is None:
        found = [hit for (_, t), hits in in_region.items() if t == key(town) for hit in hits]
    else:
        found = in_region[(code, key(town))]
    if len({z for _, z in found}) > 1:
        p = key(province)
        found = [(gp, z) for gp, z in found if gp.startswith(p) or p.startswith(gp)]
    return sorted({z for _, z in found})


ALIAS_KEYS = {(key(p), key(c)): name for (p, c), name in ALIASES.items()}
SEVERAL_KEYS = {(key(p), key(c)): names for (p, c), names in SEVERAL.items()}


def town_zips(code, province, city):
    """ZIPs for one town outside Metro Manila."""
    pair = (key(province), key(city))
    if pair in SEVERAL_KEYS:
        return sorted(z for name in SEVERAL_KEYS[pair]
                      for z in anywhere_in_region(code, province, name))
    if pair in ALIAS_KEYS:
        name = ALIAS_KEYS[pair]
        found = anywhere_in_region(code, province, name) or anywhere_in_region(None, province, name)
        assert len(found) == 1, f'alias {province} / {city} -> {ALIASES[(province, city)]} gave {found}'
        return found
    pool = towns[(code, key(province))]
    if key(city) in pool:
        return sorted(pool[key(city)])
    found = anywhere_in_region(code, province, city)
    if len(found) == 1:
        return found
    close = difflib.get_close_matches(key(city), pool, n=1, cutoff=0.85)   # Polillo / Polilio
    return sorted(pool[close[0]]) if close else []


def ncr_city(city, barangays):
    areas = ncr_areas[city]
    every = sorted({z for z, _ in areas})
    by_barangay = {}
    for b in barangays:
        if city == 'City of Manila':
            m = re.search(r'\(([^)]+)\)', b)
            district = ' '.join(w for w in words(m.group(1)) if w not in SUFFIXES) if m else ''
            names = MANILA_DISTRICTS.get(district, [])
            zips = {z for z, a in areas if any(n in ' '.join(words(a)) for n in names)}
        else:
            zips = {z for z, a in areas if covers(a, b) or key(a) == key(b)}
        if zips:
            by_barangay[b] = sorted(zips) if len(zips) > 1 else min(zips)
    return {'all': every, 'b': by_barangay}


# ---------- build ----------
os.makedirs(OUT, exist_ok=True)
stats = defaultdict(int)
missing = []
for code, provinces in sorted(psgc.items()):
    out = {}
    for province, cities in provinces.items():
        out[province] = {}
        for city, barangays in cities.items():
            if code == NCR:
                entry = ncr_city(city, barangays)
                for b in barangays:
                    hit = entry['b'].get(b)
                    stats['ncr exact' if isinstance(hit, str) else 'ncr narrowed' if hit else 'ncr city list'] += 1
            else:
                zips = town_zips(code, province, city)
                if not zips:
                    missing.append(f'{province} / {city}')
                    continue
                entry = zips[0] if len(zips) == 1 else {'all': zips, 'b': {}}
                stats['town exact' if len(zips) == 1 else 'town several'] += 1
            out[province][city] = entry

    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, f'{code}.js'), 'w', encoding='utf-8') as f:
        f.write('// ZIP codes from GeoNames (CC BY 4.0) — generated by tools/build_ph_zip.py, do not edit by hand\n'
                f'registerRegionZips("{code}", {body});\n')

for k, v in sorted(stats.items()):
    print(f'{k:16} {v}')
print('no ZIP found:', missing or 'none')
