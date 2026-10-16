/* =============================================================
   CHECKOUT PAGE
   Reads the saved bag, runs the Region -> Province -> City ->
   Barangay dropdowns, works out shipping, and "places" the order.
   Nothing is sent anywhere — placing an order just shows a
   confirmation and empties the bag.
   ============================================================= */

const form = document.getElementById('checkout-form');
const regionSelect = document.getElementById('region');
const provinceSelect = document.getElementById('province');
const citySelect = document.getElementById('city');
const barangaySelect = document.getElementById('barangay');
const formError = document.getElementById('form-error');
const placeOrder = document.getElementById('place-order');
const signinPrompt = document.getElementById('checkout-signin');
const accountChip = document.getElementById('account-chip');

const bag = loadBag();

// 2390 -> "₱2,390.00"
const money = (n) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Shipping in pesos by zone, per delivery speed
const RATES = {
    metro:    { standard: 99,  express: 199, eta: ['2–3 business days', 'Next business day'] },
    luzon:    { standard: 99, express: 290, eta: ['3–5 business days', '1–2 business days'] },
    visayas:  { standard: 180, express: 350, eta: ['4–6 business days', '2–3 business days'] },
    mindanao: { standard: 200, express: 390, eta: ['5–7 business days', '2–3 business days'] }
};


/* =============================================================
   CASCADING ADDRESS DROPDOWNS
   ============================================================= */

// Replace a select's options with a placeholder plus `names`,
// and disable it when there's nothing to pick yet.
function fillSelect(select, placeholder, names) {
    select.innerHTML = '';
    select.add(new Option(placeholder, ''));
    names.forEach((name) => select.add(new Option(name, name)));
    select.disabled = names.length === 0;
}

const postalInput = document.getElementById('postal');
const postalOptions = document.getElementById('postal-options');
const postalHint = document.getElementById('postal-hint');

const selectedRegion = () => PH_REGIONS.find((r) => r.code === regionSelect.value);
const provinces = () => regionData[regionSelect.value] || {};
const cities = () => provinces()[provinceSelect.value] || {};

// Regions list, filled once
PH_REGIONS.forEach((r) => regionSelect.add(new Option(r.name, r.code)));

// Picking a region loads its file (ph-address.js), then fills provinces.
// Each level resets everything below it. Resolves once provinces are in.
async function onRegionChange() {
    const code = regionSelect.value;
    fillSelect(provinceSelect, code ? 'Loading…' : 'Select province', []);
    fillSelect(citySelect, 'Select city', []);
    fillSelect(barangaySelect, 'Select barangay', []);
    updatePostal();
    renderTotals();
    if (!code) return;

    // ZIPs come in their own file. Optional: if it fails, the address still works.
    loadRegionZips(code).then(updatePostal, () => {});

    try {
        await loadRegion(code);
    } catch {
        fillSelect(provinceSelect, "Couldn't load — pick the region again", []);
        return;
    }
    if (regionSelect.value !== code) return;   // they picked another region meanwhile

    const names = Object.keys(provinces());
    fillSelect(provinceSelect, 'Select province', names);

    // A region with a single province (e.g. NCR) needs no extra click
    if (names.length === 1) {
        provinceSelect.value = names[0];
        onProvinceChange();
    }
}

function onProvinceChange() {
    fillSelect(citySelect, 'Select city', Object.keys(cities()));
    fillSelect(barangaySelect, 'Select barangay', []);
    updatePostal();
}

function onCityChange() {
    fillSelect(barangaySelect, 'Select barangay', cities()[citySelect.value] || []);
    updatePostal();
}

regionSelect.addEventListener('change', onRegionChange);
provinceSelect.addEventListener('change', onProvinceChange);
citySelect.addEventListener('change', onCityChange);
barangaySelect.addEventListener('change', updatePostal);


/* ---------- Postal code from the address ---------- */

// "1012", "1012 or 1013", "1008, 1015 or 1016"
const orList = (zips) => zips.length === 1 ? zips[0]
    : `${zips.slice(0, -1).join(', ')} or ${zips[zips.length - 1]}`;

// Runs whenever the address changes, so the ZIP always belongs to the
// address on screen — a ZIP left over from another address (or from the
// account's saved one) is replaced. Typing your own ZIP still works: it
// stands until the address changes again.
function updatePostal() {
    // No town picked yet: whatever ZIP is there was for some other address
    if (!citySelect.value) {
        postalInput.value = '';
        postalOptions.innerHTML = '';
        postalHint.textContent = '';
        return;
    }

    const zips = zipsFor(regionSelect.value, provinceSelect.value, citySelect.value, barangaySelect.value);
    if (zips.length === 0) return;   // ZIP file still loading — it calls us again when it lands

    postalOptions.innerHTML = '';
    zips.forEach((zip) => postalOptions.append(new Option(zip)));

    if (zips.length === 1) {
        postalInput.value = zips[0];
        postalHint.textContent = 'Filled in from your address — change it if yours is different.';
        return;
    }

    // Several possible: keep the current ZIP only if it's one of them
    if (!zips.includes(postalInput.value)) postalInput.value = '';

    if (postalInput.value) {
        postalHint.textContent = '';
    } else if (zips.length <= 3) {
        postalHint.textContent = `${barangaySelect.value || citySelect.value} uses ${orList(zips)} — pick yours from the list.`;
    } else if (!barangaySelect.value) {
        postalHint.textContent = `${citySelect.value} has ${zips.length} ZIP codes — choose your barangay to narrow it down.`;
    } else {
        postalHint.textContent = `${citySelect.value} has ${zips.length} ZIP codes and we can't tell yours from the barangay — pick it from the list.`;
    }
}

// Once they type, "Filled in from your address" is no longer true
postalInput.addEventListener('input', () => {
    postalHint.textContent = '';
});

// Pick a full address in one go, e.g. from the signed-in account
async function setAddress({ region, province, city, barangay }) {
    regionSelect.value = region;
    await onRegionChange();
    provinceSelect.value = province;
    onProvinceChange();
    citySelect.value = city;
    onCityChange();
    barangaySelect.value = barangay;
    updatePostal();   // setting .value doesn't fire 'change'
}


/* =============================================================
   ORDER SUMMARY
   ============================================================= */

const subtotal = () => bag.reduce((sum, item) => sum + item.qty * item.price, 0);

function renderSummary() {
    const list = document.getElementById('summary-list');
    list.innerHTML = '';

    bag.forEach((item) => {
        const li = document.createElement('li');

        const img = document.createElement('img');
        img.src = item.image;
        img.alt = '';

        const text = document.createElement('div');
        text.className = 'drawer-item-text';
        text.innerHTML = `
            <p class="artist"></p>
            <p class="name"></p>
            <p class="line-price"></p>`;
        text.querySelector('.artist').textContent = item.artist;
        text.querySelector('.name').textContent = item.title;
        text.querySelector('.line-price').textContent =
            `${item.qty} × ${money(item.price)} · ${money(item.qty * item.price)}`;

        li.append(img, text);
        list.appendChild(li);
    });

    document.getElementById('summary-empty').hidden = bag.length > 0;
    placeOrder.disabled = bag.length === 0;
}

// Shipping depends on the region's zone and the chosen speed
function shippingCost() {
    const region = selectedRegion();
    if (!region) return null;
    return RATES[region.zone][form.elements.speed.value];
}

function renderTotals() {
    const region = selectedRegion();
    const rates = region ? RATES[region.zone] : null;

    // Prices and ETAs on the two speed options
    document.getElementById('standard-price').textContent = rates ? money(rates.standard) : '—';
    document.getElementById('express-price').textContent = rates ? money(rates.express) : '—';
    if (rates) {
        document.getElementById('standard-eta').textContent = rates.eta[0];
        document.getElementById('express-eta').textContent = rates.eta[1];
    }

    const ship = shippingCost();
    document.getElementById('sum-subtotal').textContent = money(subtotal());
    document.getElementById('sum-shipping').textContent = ship === null ? 'Select a region' : money(ship);
    document.getElementById('sum-total').textContent = money(subtotal() + (ship || 0));
}

form.querySelectorAll('input[name="speed"]').forEach((radio) => {
    radio.addEventListener('change', renderTotals);
});


/* =============================================================
   ACCOUNT PREFILL
   ============================================================= */

async function prefillFromAccount() {
    const account = currentAccount();
    signinPrompt.hidden = !!account;
    if (!account) return;

    // Only fill blanks, so switching accounts never wipes typed details
    const fillIfEmpty = (id, value) => {
        const el = document.getElementById(id);
        if (!el.value) el.value = value;
    };

    fillIfEmpty('full-name', account.name);
    fillIfEmpty('phone', account.phone);
    fillIfEmpty('email', account.email);

    if (!regionSelect.value) {
        fillIfEmpty('postal', account.address.postal);
        fillIfEmpty('street', account.address.street);
        fillIfEmpty('landmark', account.address.landmark);
        await setAddress(account.address);
    }
    renderTotals();
}

accountChip.addEventListener('account-change', prefillFromAccount);


/* =============================================================
   PLACE ORDER
   ============================================================= */

// Friendlier messages than the browser defaults
const MESSAGES = {
    phone: 'Enter a PH mobile number, e.g. 0917 123 4567.',
    postal: 'Postal codes are 4 digits.',
    email: 'Enter a valid email address.'
};

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (bag.length === 0) return;

    // Mark fields so :invalid styling only shows after a submit attempt
    form.classList.add('was-submitted');

    const firstBad = Array.from(form.elements).find((el) => el.willValidate && !el.checkValidity());
    if (firstBad) {
        const label = firstBad.closest('.field')?.querySelector('span')?.firstChild.textContent.trim();
        formError.textContent = firstBad.validity.valueMissing
            ? `Please fill in: ${label}.`
            : MESSAGES[firstBad.name] || `Please check: ${label}.`;
        formError.hidden = false;
        firstBad.focus();
        return;
    }
    formError.hidden = true;

    const data = new FormData(form);
    const orderNo = `VND-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const total = subtotal() + shippingCost();
    const region = selectedRegion();

    document.getElementById('confirm-text').textContent =
        `Thanks, ${data.get('name').split(' ')[0]}! Order ${orderNo} — ${money(total)}, ` +
        `${data.get('payment').toLowerCase()}. We'll text ${data.get('phone')} when it ships.`;

    document.getElementById('confirm-address').textContent = [
        data.get('street'),
        `Brgy. ${data.get('barangay')}`,
        data.get('city'),
        data.get('province'),
        region.name,
        data.get('postal')
    ].join(', ');

    // The order is "placed" — empty the saved bag
    saveBag([]);

    document.getElementById('confirm-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('confirm-done').focus();
});


/* =============================================================
   FIRST DRAW
   ============================================================= */

mountAccountChip(accountChip, 'checkout');
renderSummary();
renderTotals();
prefillFromAccount();
