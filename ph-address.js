/* =============================================================
   PHILIPPINE ADDRESSES
   Region -> Province -> City / Municipality -> Barangay for the
   checkout dropdowns — the full PSGC list: 17 regions, every
   province, 1,634 cities / municipalities, 42,046 barangays.
   NCR sits under "Metro Manila"; Isabela City under Basilan.

   All of that is ~560 KB, so it's split one file per region in
   data/ph/ and only the region someone picks gets loaded. The
   files are plain <script>s rather than JSON so they also work
   when the page is opened straight from disk (file://), where
   fetch() is blocked.

   Regenerate data/ph/ with: python tools/build_ph_address.py
   `zone` sets the shipping rate on the checkout page.

   ZIP codes live alongside in data/ph-zip/, one file per region,
   joined on from GeoNames by: python tools/build_ph_zip.py
   ============================================================= */

const PH_REGIONS = [
    { code: '130000000', name: 'National Capital Region (NCR)', zone: 'metro' },
    { code: '140000000', name: 'Cordillera Administrative Region (CAR)', zone: 'luzon' },
    { code: '010000000', name: 'Region I (Ilocos Region)', zone: 'luzon' },
    { code: '020000000', name: 'Region II (Cagayan Valley)', zone: 'luzon' },
    { code: '030000000', name: 'Region III (Central Luzon)', zone: 'luzon' },
    { code: '040000000', name: 'Region IV-A (CALABARZON)', zone: 'luzon' },
    { code: '170000000', name: 'MIMAROPA Region', zone: 'luzon' },
    { code: '050000000', name: 'Region V (Bicol Region)', zone: 'luzon' },
    { code: '060000000', name: 'Region VI (Western Visayas)', zone: 'visayas' },
    { code: '070000000', name: 'Region VII (Central Visayas)', zone: 'visayas' },
    { code: '080000000', name: 'Region VIII (Eastern Visayas)', zone: 'visayas' },
    { code: '090000000', name: 'Region IX (Zamboanga Peninsula)', zone: 'mindanao' },
    { code: '100000000', name: 'Region X (Northern Mindanao)', zone: 'mindanao' },
    { code: '110000000', name: 'Region XI (Davao Region)', zone: 'mindanao' },
    { code: '120000000', name: 'Region XII (SOCCSKSARGEN)', zone: 'mindanao' },
    { code: '160000000', name: 'Region XIII (Caraga)', zone: 'mindanao' },
    { code: '150000000', name: 'Bangsamoro (BARMM)', zone: 'mindanao' }
];

// Loaded regions, by code: { "Province": { "City": ["Barangay", ...] } }
const regionData = {};

// Loaded ZIP codes, by code: { "Province": { "City": entry } } where entry is
//   "6000"                       the town's only ZIP
//   { all: [...], b: {...} }     a Metro Manila city: `b` maps a barangay to
//                                its ZIP (or the 2–3 it might be); any
//                                barangay not listed could be any of `all`
const regionZips = {};

// Promises still waiting on a file, by "folder/code"
const waiters = {};

function settle(id, store, code, data) {
    store[code] = data;
    (waiters[id] || []).forEach(({ resolve }) => resolve(data));
    delete waiters[id];
}

// Each data/ph/<code>.js and data/ph-zip/<code>.js file calls one of these when it loads
function registerRegionData(code, data) { settle(`ph/${code}`, regionData, code, data); }
function registerRegionZips(code, zips) { settle(`ph-zip/${code}`, regionZips, code, zips); }

// Add data/<folder>/<code>.js to the page once; resolve when it registers itself
function loadDataFile(folder, code, store) {
    if (store[code]) return Promise.resolve(store[code]);
    const id = `${folder}/${code}`;

    return new Promise((resolve, reject) => {
        const first = !waiters[id];
        (waiters[id] = waiters[id] || []).push({ resolve, reject });
        if (!first) return;   // already on its way

        const script = document.createElement('script');
        script.src = `data/${id}.js`;
        script.onerror = () => {
            waiters[id].forEach((w) => w.reject(new Error(`Couldn't load ${script.src}`)));
            delete waiters[id];
            script.remove();   // let a later attempt try again
        };
        document.head.appendChild(script);
    });
}

// Resolve with one region's provinces, loading its file the first time
const loadRegion = (code) => loadDataFile('ph', code, regionData);

// Same for its ZIP codes. Kept separate on purpose: the dropdowns must keep
// working even if this file fails, so callers treat it as optional.
const loadRegionZips = (code) => loadDataFile('ph-zip', code, regionZips);

// The ZIP codes an address could have — one when we're sure, several when
// a Metro Manila city can't be narrowed down, none when there's no data.
function zipsFor(code, province, city, barangay) {
    const entry = regionZips[code]?.[province]?.[city];
    if (!entry) return [];
    if (typeof entry === 'string') return [entry];
    const known = entry.b[barangay];
    return known ? [].concat(known) : entry.all;
}
