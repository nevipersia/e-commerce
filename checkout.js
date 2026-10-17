/* =============================================================
   CHECKOUT PAGE
   Reads the saved bag, runs the Region -> Province -> City ->
   Barangay dropdowns, works out shipping, takes a (pretend)
   payment and "places" the order.
   Nothing is sent anywhere — payment is simulated, and placing an
   order just shows a confirmation and empties the bag.
   ============================================================= */

const form = document.getElementById('checkout-form');
const regionSelect = document.getElementById('region');
const provinceSelect = document.getElementById('province');
const citySelect = document.getElementById('city');
const barangaySelect = document.getElementById('barangay');
const formError = document.getElementById('form-error');
const placeOrder = document.getElementById('place-order');
const signinPrompt = document.getElementById('checkout-signin');

// The bag as saved, updated for anything the seller changed since
const bag = loadBag();
const bagNotes = reconcileBag(bag);
if (bagNotes.length) saveBag(bag);

// Shipping in pesos by zone, per delivery speed
const RATES = {
    metro:    { standard: 99,  express: 199, eta: ['2–3 business days', 'Next business day'] },
    luzon:    { standard: 99, express: 290, eta: ['3–5 business days', '1–2 business days'] },
    visayas:  { standard: 180, express: 350, eta: ['4–6 business days', '2–3 business days'] },
    mindanao: { standard: 200, express: 390, eta: ['5–7 business days', '2–3 business days'] }
};


/* =============================================================
   ADDRESS
   The dropdowns and postal code live in address-picker.js, shared
   with My account. Changing the region re-prices shipping.
   ============================================================= */

const picker = createAddressPicker({
    region: regionSelect,
    province: provinceSelect,
    city: citySelect,
    barangay: barangaySelect,
    postal: document.getElementById('postal'),
    postalHint: document.getElementById('postal-hint')
}, { onRegionChange: () => renderTotals() });

const selectedRegion = picker.selectedRegion;
const setAddress = picker.setAddress;


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

    const notes = document.getElementById('summary-notes');
    notes.textContent = bagNotes.join(' ');
    notes.hidden = bagNotes.length === 0;

    document.getElementById('summary-empty').hidden = bag.length > 0;
    placeOrder.disabled = bag.length === 0;
}

// Store credit from accepted trade-ins (account.js). It covers as much of
// the order as it can; the rest is paid the usual way.
const creditChoice = document.getElementById('credit-choice');
const useCredit = document.getElementById('use-credit');

function creditAvailable() {
    const account = currentAccount();
    return account ? creditOf(account.id) : 0;
}

const creditUsed = () => (useCredit.checked
    ? Math.min(creditAvailable(), subtotal() + (shippingCost() || 0))
    : 0);

useCredit.addEventListener('change', () => renderTotals());

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
    const credit = creditUsed();
    document.getElementById('sum-subtotal').textContent = money(subtotal());
    document.getElementById('sum-shipping').textContent = ship === null ? 'Select a region' : money(ship);
    document.getElementById('sum-total').textContent = money(subtotal() + (ship || 0) - credit);

    creditChoice.hidden = creditAvailable() === 0 || bag.length === 0;
    document.getElementById('credit-available').textContent = money(creditAvailable());
    document.getElementById('sum-credit-row').hidden = credit === 0;
    document.getElementById('sum-credit').textContent = `−${money(credit)}`;
}

form.querySelectorAll('input[name="speed"]').forEach((radio) => {
    radio.addEventListener('change', renderTotals);
});


/* =============================================================
   PAYMENT METHOD
   ============================================================= */

const cardDetails = document.getElementById('card-details');
const cardNumber = document.getElementById('card-number');
const cardExp = document.getElementById('card-exp');

// Card fields only exist while "card" is picked. Disabling the fieldset
// (not just hiding it) takes its required fields out of validation.
form.querySelectorAll('input[name="payment"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        const isCard = form.elements.payment.value === 'card';
        cardDetails.disabled = !isCard;
        cardDetails.hidden = !isCard;
        formError.hidden = true;
    });
});

// 4242424242424242 -> "4242 4242 4242 4242" as they type
cardNumber.addEventListener('input', () => {
    const digits = cardNumber.value.replace(/\D/g, '').slice(0, 19);
    cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
});

// "1229" -> "12/29", so nobody has to hunt for the slash
cardExp.addEventListener('input', (e) => {
    if (e.inputType === 'deleteContentBackward') return;   // let backspace through the slash
    const digits = cardExp.value.replace(/\D/g, '').slice(0, 4);
    cardExp.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
});

// The Luhn check: the checksum every real card number passes, which
// catches most typos (one wrong digit, two digits swapped)
function passesLuhn(digits) {
    let sum = 0;
    [...digits].reverse().forEach((d, i) => {
        let n = Number(d);
        if (i % 2 === 1) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
    });
    return sum % 10 === 0;
}

// Checks the browser can't do by itself. setCustomValidity marks a field
// invalid, so the normal "first bad field" scan below picks it up.
function checkCard() {
    cardNumber.setCustomValidity('');
    cardExp.setCustomValidity('');
    if (cardDetails.disabled) return;

    const digits = cardNumber.value.replace(/\D/g, '');
    if (digits && (digits.length < 13 || !passesLuhn(digits))) {
        cardNumber.setCustomValidity("That card number doesn't look right — check it for typos.");
    }

    const match = cardExp.value.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (match) {
        const firstDayAfterExpiry = new Date(2000 + Number(match[2]), Number(match[1]), 1);
        if (firstDayAfterExpiry <= new Date()) cardExp.setCustomValidity('That card has expired.');
    }
}


/* =============================================================
   PRETEND PAYMENT PROVIDER
   Shaped like a real one — ask, then wait for an answer — so the
   order code would barely change if a real provider replaced it.
   ============================================================= */

const WALLETS = { gcash: 'GCash', maya: 'Maya' };

// "Charge" a card or e-wallet. Resolves with a receipt or rejects with an
// Error whose message can go straight to the shopper.
function fakeCharge({ method, cardDigits }) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {                                  // the "network"
            if (method === 'card' && cardDigits.endsWith('0002')) {
                reject(new Error('Your card was declined. Try another card, or choose a different way to pay.'));
                return;
            }
            resolve({ reference: `PAY-${Math.random().toString(36).slice(2, 8).toUpperCase()}` });
        }, 1500);
    });
}

const walletBackdrop = document.getElementById('wallet-backdrop');
const walletApprove = document.getElementById('wallet-approve');
const walletCancel = document.getElementById('wallet-cancel');

// Stand-in for being sent to the GCash / Maya app: resolves on Approve,
// rejects on Cancel or Escape
function askWalletApproval(wallet, amount) {
    document.getElementById('wallet-title').textContent = `Approve in ${wallet}`;
    document.getElementById('wallet-text').textContent =
        `VenAudio is asking for ${money(amount)}. Approve to pay from your ${wallet} wallet.`;
    walletBackdrop.hidden = false;
    walletApprove.focus();

    return new Promise((resolve, reject) => {
        function finish(approved) {
            walletBackdrop.hidden = true;
            walletApprove.removeEventListener('click', onApprove);
            walletCancel.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey);
            if (approved) resolve();
            else reject(new Error(`You cancelled the payment in ${wallet}. Nothing was charged.`));
        }
        const onApprove = () => finish(true);
        const onCancel = () => finish(false);
        const onKey = (e) => { if (e.key === 'Escape') finish(false); };

        walletApprove.addEventListener('click', onApprove);
        walletCancel.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
    });
}


/* =============================================================
   ACCOUNT PREFILL
   ============================================================= */

async function prefillFromAccount() {
    const account = currentAccount();
    signinPrompt.hidden = !!account;

    // "Save as my shipping address": only for accounts that can keep one.
    // Ticked when there's nothing saved yet; unticked otherwise, so sending
    // one order somewhere else doesn't replace the usual address.
    document.getElementById('save-address-row').hidden = !canEdit(account);
    document.getElementById('save-address').checked = canEdit(account) && !account.address;

    if (!account) return;

    // Only fill blanks, so switching accounts never wipes typed details
    const fillIfEmpty = (id, value) => {
        const el = document.getElementById(id);
        if (!el.value) el.value = value;
    };

    fillIfEmpty('first-name', account.firstName);
    fillIfEmpty('last-name', account.lastName);
    if (account.phone) fillIfEmpty('phone', account.phone);
    fillIfEmpty('email', account.email);

    // A new account has no address until its first order
    if (account.address && !regionSelect.value) {
        fillIfEmpty('postal', account.address.postal);
        fillIfEmpty('street', account.address.street);
        fillIfEmpty('landmark', account.address.landmark);
        await setAddress(account.address);
    }
    renderTotals();
}


/* =============================================================
   PLACE ORDER
   ============================================================= */

// Friendlier messages than the browser defaults
const MESSAGES = {
    phone: 'Enter a PH mobile number, e.g. 0917 123 4567.',
    postal: 'Postal codes are 4 digits.',
    email: 'Enter a valid email address.',
    'card-exp': 'Enter the expiry as MM/YY, e.g. 08/29.',
    'card-cvc': 'The CVC is the 3 or 4 digits on the back of the card.'
};

// The first field that fails, with a message to show for it
function firstProblem() {
    checkCard();
    const bad = Array.from(form.elements).find((el) => el.willValidate && !el.checkValidity());
    if (!bad) return null;

    const label = bad.closest('.field')?.querySelector('span')?.firstChild.textContent.trim();
    let message;
    if (bad.validity.valueMissing) message = `Please fill in: ${label}.`;
    else if (bad.validity.customError) message = bad.validationMessage;   // from checkCard()
    else message = MESSAGES[bad.name] || `Please check: ${label}.`;
    return { field: bad, message };
}

// How the confirmation describes the payment
function paymentLine(method, total, receipt, cardDigits) {
    if (method === 'credit') return 'paid in full with store credit';
    if (method === 'cod') return `pay ${money(total)} in cash when it arrives`;
    if (method === 'card') return `${money(total)} paid by card ending ${cardDigits.slice(-4)} (ref ${receipt.reference})`;
    return `${money(total)} paid with ${WALLETS[method]} (ref ${receipt.reference})`;
}

let processing = false;

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (bag.length === 0 || processing) return;

    // Mark fields so :invalid styling only shows after a submit attempt
    form.classList.add('was-submitted');

    const problem = firstProblem();
    if (problem) {
        formError.textContent = problem.message;
        formError.hidden = false;
        problem.field.focus();
        return;
    }
    formError.hidden = true;

    // Stock may have run out (or the seller changed things) since this page
    // opened. If the crate had to change, show why and let them look first.
    const late = reconcileBag(bag);
    if (late.length) {
        saveBag(bag);
        bagNotes.splice(0, bagNotes.length, ...late);
        renderSummary();
        renderTotals();
        formError.textContent = 'Your crate changed — check the summary, then place the order again.';
        formError.hidden = false;
        return;
    }

    const data = new FormData(form);
    const credit = creditUsed();
    const total = subtotal() + shippingCost() - credit;
    // Fully covered by store credit: nothing left to pay by cash, card or wallet
    const method = total === 0 ? 'credit' : data.get('payment');
    const cardDigits = (data.get('card-number') || '').replace(/\D/g, '');

    // Lock the button while we wait — a second click mustn't pay twice
    processing = true;
    placeOrder.disabled = true;
    placeOrder.classList.add('is-processing');
    placeOrder.textContent = 'Processing…';

    try {
        let receipt = null;
        if (WALLETS[method]) await askWalletApproval(WALLETS[method], total);
        if (method !== 'cod' && method !== 'credit') receipt = await fakeCharge({ method, cardDigits });

        // Paid (or paying on delivery): the order goes through
        const orderNo = `VND-${Date.now().toString(36).toUpperCase().slice(-6)}`;
        const region = selectedRegion();

        document.getElementById('confirm-text').textContent =
            `Thanks, ${data.get('first-name').trim()}! Order ${orderNo} — ` +
            `${paymentLine(method, total, receipt, cardDigits)}. We'll text ${data.get('phone')} when it ships.`;

        const addressLine = [
            data.get('street'),
            `Brgy. ${data.get('barangay')}`,
            data.get('city'),
            data.get('province'),
            region.name,
            data.get('postal')
        ].join(', ');
        document.getElementById('confirm-address').textContent = addressLine;

        // Keep a copy under the signed-in account for My orders (guests: not saved).
        // Must happen before the bag is emptied below.
        const speed = data.get('speed');
        const saved = saveOrder({
            id: orderNo,
            placedAt: new Date().toISOString(),
            // productTitle + format say exactly which record, for reviews
            items: bag.map(({ title, artist, price, qty, image, productTitle, format }) =>
                ({ title, artist, price, qty, image, productTitle, format })),
            subtotal: subtotal(),
            shipping: shippingCost(),
            total,
            credit,
            speed,
            eta: RATES[region.zone].eta[speed === 'express' ? 1 : 0],
            payment: {
                method,
                reference: receipt ? receipt.reference : null,
                last4: method === 'card' ? cardDigits.slice(-4) : null
            },
            address: addressLine
        });
        document.getElementById('confirm-orders').hidden = !saved;

        // Keep this as the account's shipping address if they asked to
        if (form.elements['save-address'].checked) saveAccountAddress({
            region: regionSelect.value,
            province: data.get('province'),
            city: data.get('city'),
            barangay: data.get('barangay'),
            postal: data.get('postal'),
            street: data.get('street'),
            landmark: data.get('landmark')
        });

        // Spend the store credit that went towards it
        if (credit > 0) addCredit(currentAccount().id, -credit);

        // Only now — after payment worked — take the records off the shelf
        // (catalogue.js; at 0 they're sold out) and empty the bag
        takeStock(bag);
        saveBag([]);
        bag.length = 0;

        document.getElementById('confirm-backdrop').hidden = false;
        document.body.style.overflow = 'hidden';
        document.getElementById('confirm-done').focus();
    } catch (err) {
        // Declined or cancelled: the bag stays, and they can try again
        formError.textContent = err.message;
        formError.hidden = false;
    } finally {
        processing = false;
        placeOrder.disabled = bag.length === 0;
        placeOrder.classList.remove('is-processing');
        placeOrder.textContent = 'Place order';
    }
});


/* =============================================================
   FIRST DRAW
   ============================================================= */

renderSummary();
renderTotals();
prefillFromAccount();
