"""Rebuild data/ph/*.js (the checkout's address dropdowns) from the PSGC API.

    python tools/build_ph_address.py

Pulls regions, provinces, cities/municipalities and barangays from
https://psgc.gitlab.io/api and writes one lazy-loaded file per region.
If the region list changes, update PH_REGIONS in ph-address.js to match.
"""
import json, os, re, urllib.request
from collections import defaultdict

API = 'https://psgc.gitlab.io/api'
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'ph')

def load(endpoint):
    with urllib.request.urlopen(f'{API}/{endpoint}/') as res:
        return json.load(res)

R, P, C, B, S = map(load, ['regions', 'provinces', 'cities-municipalities', 'barangays', 'sub-municipalities'])

def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]

prov_name = {p['code']: p['name'] for p in P}
subm_name = {s['code']: s['name'].replace('I/ii', 'I/II') for s in S}

# Cities with no province in PSGC: NCR, plus two independent cities
def province_of(c):
    if c['provinceCode']:
        return prov_name[c['provinceCode']]
    if c['regionCode'] == '130000000':
        return 'Metro Manila'
    return {'City of Isabela': 'Basilan', 'City of Cotabato': 'Maguindanao'}[c['name']]

city_by_code = {c['code']: c for c in C}
tree = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))  # region -> province -> city -> [barangays]
for c in C:
    tree[c['regionCode']][province_of(c)][c['name']]  # make sure every city exists
for b in B:
    c = city_by_code[b['cityCode'] or b['municipalityCode']]
    name = b['name']
    if b['subMunicipalityCode']:  # Manila's numbered barangays: add the district
        name = f"{name} ({subm_name[b['subMunicipalityCode']]})"
    tree[c['regionCode']][province_of(c)][c['name']].append(name)

LABELS = {'130000000': 'National Capital Region (NCR)', '140000000': 'Cordillera Administrative Region (CAR)',
          '170000000': 'MIMAROPA Region', '150000000': 'Bangsamoro (BARMM)'}
ORDER = ['130000000', '140000000', '010000000', '020000000', '030000000', '040000000', '170000000', '050000000',
         '060000000', '070000000', '080000000', '090000000', '100000000', '110000000', '120000000', '160000000', '150000000']
by_code = {r['code']: r for r in R}
regions = []
os.makedirs(OUT, exist_ok=True)
for code in ORDER:
    r = by_code[code]
    regions.append({'code': code, 'name': LABELS.get(code, f"{r['regionName']} ({r['name']})"),
                    'zone': 'metro' if code == '130000000' else r['islandGroupCode']})
    data = {p: {c: sorted(bs, key=natkey) for c, bs in sorted(cs.items(), key=lambda kv: natkey(kv[0]))}
            for p, cs in sorted(tree[code].items(), key=lambda kv: natkey(kv[0]))}
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, f'{code}.js'), 'w', encoding='utf-8') as f:
        f.write(f'// {regions[-1]["name"]} — generated from PSGC, do not edit by hand\n'
                f'registerRegionData("{code}", {body});\n')

print(json.dumps(regions, ensure_ascii=False, indent=4))
print(len(regions), sum(len(cs) for r in tree.values() for cs in r.values()), sum(len(bs) for r in tree.values() for cs in r.values() for bs in cs.values()))
