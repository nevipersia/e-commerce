/* =============================================================
   ADDRESS PICKER
   The Region -> Province -> City -> Barangay dropdowns, with the
   postal code filled in from them. Shared by checkout and by the
   address form on My account. Needs ph-address.js loaded first.
   ============================================================= */

// Replace a select's options with a placeholder plus `names`,
// and disable it when there's nothing to pick yet.
function fillSelect(select, placeholder, names) {
    select.innerHTML = '';
    select.add(new Option(placeholder, ''));
    names.forEach((name) => select.add(new Option(name, name)));
    select.disabled = names.length === 0;
}

// "1012", "1012 or 1013", "1008, 1015 or 1016"
const orList = (zips) => zips.length === 1 ? zips[0]
    : `${zips.slice(0, -1).join(', ')} or ${zips[zips.length - 1]}`;

// Wire up one set of address fields. `fields` holds the elements:
//   { region, province, city, barangay, postal, postalOptions, postalHint }
// `onRegionChange` runs whenever the region changes (checkout re-prices
// shipping then). Returns { setAddress, selectedRegion }.
function createAddressPicker(fields, { onRegionChange = () => {} } = {}) {
    const { region, province, city, barangay, postal, postalOptions, postalHint } = fields;

    const provinces = () => regionData[region.value] || {};
    const cities = () => provinces()[province.value] || {};

    // Regions list, filled once
    PH_REGIONS.forEach((r) => region.add(new Option(r.name, r.code)));

    // Picking a region loads its file (ph-address.js), then fills provinces.
    // Each level resets everything below it. Resolves once provinces are in.
    async function regionChanged() {
        const code = region.value;
        fillSelect(province, code ? 'Loading…' : 'Select province', []);
        fillSelect(city, 'Select city', []);
        fillSelect(barangay, 'Select barangay', []);
        updatePostal();
        onRegionChange();
        if (!code) return;

        // ZIPs come in their own file. Optional: if it fails, the address still works.
        loadRegionZips(code).then(updatePostal, () => {});

        try {
            await loadRegion(code);
        } catch {
            fillSelect(province, "Couldn't load — pick the region again", []);
            return;
        }
        if (region.value !== code) return;   // they picked another region meanwhile

        const names = Object.keys(provinces());
        fillSelect(province, 'Select province', names);

        // A region with a single province (e.g. NCR) needs no extra click
        if (names.length === 1) {
            province.value = names[0];
            provinceChanged();
        }
    }

    function provinceChanged() {
        fillSelect(city, 'Select city', Object.keys(cities()));
        fillSelect(barangay, 'Select barangay', []);
        updatePostal();
    }

    function cityChanged() {
        fillSelect(barangay, 'Select barangay', cities()[city.value] || []);
        updatePostal();
    }

    // Runs whenever the address changes, so the ZIP always belongs to the
    // address on screen — a ZIP left over from another address (or from the
    // account's saved one) is replaced. Typing your own ZIP still works: it
    // stands until the address changes again.
    function updatePostal() {
        // No town picked yet: whatever ZIP is there was for some other address
        if (!city.value) {
            postal.value = '';
            postalOptions.innerHTML = '';
            postalHint.textContent = '';
            return;
        }

        const zips = zipsFor(region.value, province.value, city.value, barangay.value);
        if (zips.length === 0) return;   // ZIP file still loading — it calls us again when it lands

        postalOptions.innerHTML = '';
        zips.forEach((zip) => postalOptions.append(new Option(zip)));

        if (zips.length === 1) {
            postal.value = zips[0];
            postalHint.textContent = 'Filled in from your address — change it if yours is different.';
            return;
        }

        // Several possible: keep the current ZIP only if it's one of them
        if (!zips.includes(postal.value)) postal.value = '';

        if (postal.value) {
            postalHint.textContent = '';
        } else if (zips.length <= 3) {
            postalHint.textContent = `${barangay.value || city.value} uses ${orList(zips)} — pick yours from the list.`;
        } else if (!barangay.value) {
            postalHint.textContent = `${city.value} has ${zips.length} ZIP codes — choose your barangay to narrow it down.`;
        } else {
            postalHint.textContent = `${city.value} has ${zips.length} ZIP codes and we can't tell yours from the barangay — pick it from the list.`;
        }
    }

    region.addEventListener('change', regionChanged);
    province.addEventListener('change', provinceChanged);
    city.addEventListener('change', cityChanged);
    barangay.addEventListener('change', updatePostal);

    // Once they type, "Filled in from your address" is no longer true
    postal.addEventListener('input', () => {
        postalHint.textContent = '';
    });

    // Pick a full address in one go, e.g. from the signed-in account
    async function setAddress({ region: code, province: prov, city: town, barangay: brgy }) {
        region.value = code;
        await regionChanged();
        province.value = prov;
        provinceChanged();
        city.value = town;
        cityChanged();
        barangay.value = brgy;
        updatePostal();   // setting .value doesn't fire 'change'
    }

    return {
        setAddress,
        selectedRegion: () => PH_REGIONS.find((r) => r.code === region.value)
    };
}
