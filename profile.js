/* =============================================================
   MY ACCOUNT
   The page the name in the top bar links to: details, shipping
   address, a summary of orders, and Sign out. (Staff reach the Seller
   dashboard from the "Dashboard" link in the top bar.)

   Signed-up accounts can edit their details and address here.
   The two demo accounts are shared, so they're shown read-only.
   Accounts live in account.js; the address form reuses checkout's
   dropdowns from address-picker.js.
   ============================================================= */

const page = document.getElementById('account-page');
const guestNote = document.getElementById('account-guest');
const subtitle = document.getElementById('account-sub');
const accountChip = document.getElementById('account-chip');

const detailsView = document.getElementById('details-view');
const detailsForm = document.getElementById('details-form');
const detailsError = document.getElementById('details-error');
const editDetailsButton = document.getElementById('edit-details');

const addressView = document.getElementById('address-view');
const addressForm = document.getElementById('address-form');
const addressError = document.getElementById('address-error');
const editAddressButton = document.getElementById('edit-address');

// "Name", "Email" rows. Values come from localStorage (partly typed by the
// shopper), so they only ever go in as textContent.
function detailRow(label, value) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    return row;
}

// The saved address as one line
function addressLine(address) {
    if (!address) return 'No shipping address saved yet.';
    const region = PH_REGIONS.find((r) => r.code === address.region);
    return [
        address.street,
        `Brgy. ${address.barangay}`,
        address.city,
        address.province,
        region && region.name,
        address.postal
    ].filter(Boolean).join(', ') + (address.landmark ? ` (${address.landmark})` : '');
}

function render() {
    const account = currentAccount();
    page.hidden = !account;
    guestNote.hidden = !!account;

    if (!account) {
        subtitle.textContent = 'Sign in to see your details and orders.';
        return;
    }

    const editable = canEdit(account);
    subtitle.textContent = `Signed in as ${account.name}.`;
    document.getElementById('account-initials').textContent = account.initials;

    document.getElementById('account-details').replaceChildren(
        detailRow('Name', account.name),
        detailRow('Email', account.email),
        detailRow('Mobile number', account.phone || 'Not added')
    );
    editDetailsButton.hidden = !editable;
    document.getElementById('account-demo-note').hidden = editable;

    document.getElementById('account-address').textContent = addressLine(account.address);
    editAddressButton.hidden = !editable;
    editAddressButton.textContent = account.address ? 'Edit address' : 'Add an address';

    const orders = ordersOf(account.id);
    document.getElementById('account-orders-note').textContent = orders.length
        ? `You've placed ${orders.length} ${orders.length === 1 ? 'order' : 'orders'}. The latest is ${orders[0].id}.`
        : "You haven't placed an order yet.";
}

/* ---------- Switching a panel between showing and editing ---------- */

function openForm(view, form, errorBox) {
    errorBox.hidden = true;
    form.classList.remove('was-submitted');
    view.hidden = true;
    form.hidden = false;
    form.querySelector('input, select').focus();
}

function closeForm(view, form, focusBack) {
    form.hidden = true;
    view.hidden = false;
    focusBack.focus();
}

function showError(box, message, field) {
    box.textContent = message;
    box.hidden = false;
    if (field) field.focus();
}

/* ---------- Details ---------- */

editDetailsButton.addEventListener('click', () => {
    const account = currentAccount();
    const f = detailsForm.elements;
    f.firstName.value = account.firstName;
    f.lastName.value = account.lastName;
    f.email.value = account.email;
    f.phone.value = account.phone || '';
    openForm(detailsView, detailsForm, detailsError);
});

detailsForm.querySelector('[data-cancel]').addEventListener('click', () => {
    closeForm(detailsView, detailsForm, editDetailsButton);
});

detailsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    detailsError.hidden = true;
    const f = detailsForm.elements;

    if (!f.firstName.value.trim()) return showError(detailsError, 'Enter your first name.', f.firstName);
    if (!f.lastName.value.trim()) return showError(detailsError, 'Enter your last name.', f.lastName);
    if (!f.email.value.trim() || !f.email.checkValidity()) return showError(detailsError, 'Enter a valid email address.', f.email);
    if (!f.phone.checkValidity()) return showError(detailsError, 'Enter a PH mobile number, e.g. 0917 123 4567 — or leave it blank.', f.phone);

    try {
        updateAccountDetails({
            firstName: f.firstName.value,
            lastName: f.lastName.value,
            email: f.email.value,
            phone: f.phone.value
        });
    } catch (err) {
        return showError(detailsError, err.message, f.email);
    }

    render();
    mountAccountChip(accountChip, 'account');   // the name in the top bar may have changed
    closeForm(detailsView, detailsForm, editDetailsButton);
});

/* ---------- Shipping address ---------- */

const af = addressForm.elements;
const picker = createAddressPicker({
    region: af.region,
    province: af.province,
    city: af.city,
    barangay: af.barangay,
    postal: af.postal,
    postalHint: document.getElementById('addr-postal-hint')
});

editAddressButton.addEventListener('click', async () => {
    const saved = currentAccount().address;
    openForm(addressView, addressForm, addressError);

    af.street.value = saved ? saved.street : '';
    af.landmark.value = saved ? saved.landmark || '' : '';
    if (saved) {
        await picker.setAddress(saved);
        af.postal.value = saved.postal;   // keep their own ZIP if they'd changed it
    } else {
        await picker.setAddress({ region: '', province: '', city: '', barangay: '' });
    }
});

addressForm.querySelector('[data-cancel]').addEventListener('click', () => {
    closeForm(addressView, addressForm, editAddressButton);
});

addressForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addressError.hidden = true;
    addressForm.classList.add('was-submitted');

    const bad = Array.from(af).find((el) => el.willValidate && !el.checkValidity());
    if (bad) {
        const label = bad.closest('.field').querySelector('span').firstChild.textContent.trim();
        const message = bad.name === 'postal' && bad.value
            ? 'Postal codes are 4 digits.'
            : `Please fill in: ${label}.`;
        return showError(addressError, message, bad);
    }

    saveAccountAddress({
        region: af.region.value,
        province: af.province.value,
        city: af.city.value,
        barangay: af.barangay.value,
        postal: af.postal.value.trim(),
        street: af.street.value.trim(),
        landmark: af.landmark.value.trim()
    });

    render();
    closeForm(addressView, addressForm, editAddressButton);
});

/* ---------- Sign out ---------- */

// Signing out happens here, not in the top bar
document.getElementById('sign-out').addEventListener('click', () => {
    signOut();
    location.href = 'browse.html';
});

render();
