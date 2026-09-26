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
const regionWaiters = {};

// Each data/ph/<code>.js file calls this when it loads
function registerRegionData(code, data) {
    regionData[code] = data;
    (regionWaiters[code] || []).forEach(({ resolve }) => resolve(data));
    delete regionWaiters[code];
}

// Resolve with one region's provinces, loading its file the first time
function loadRegion(code) {
    if (regionData[code]) return Promise.resolve(regionData[code]);

    return new Promise((resolve, reject) => {
        const first = !regionWaiters[code];
        (regionWaiters[code] = regionWaiters[code] || []).push({ resolve, reject });
        if (!first) return;   // already on its way

        const script = document.createElement('script');
        script.src = `data/ph/${code}.js`;
        script.onerror = () => {
            regionWaiters[code].forEach((w) => w.reject(new Error(`Couldn't load ${script.src}`)));
            delete regionWaiters[code];
            script.remove();   // let a later attempt try again
        };
        document.head.appendChild(script);
    });
}
