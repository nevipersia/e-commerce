// Contact page: bulk-order total, image-button validation, help prompt,
// and the main enquiry form (order picker, "Message sent").

// Called from the quantity field's oninput attribute.
// q is the quantity input, p the hidden unit price.
function multiply(q, p) {
    const qty = parseInt(q.value, 10);
    const unit = parseFloat(p.value);

    // Empty or nonsense input clears the total rather than printing NaN
    if (isNaN(qty) || isNaN(unit) || qty < 1) return '';

    // min/max only stop the spinner arrows — someone can still type 999,
    // so don't quote for more copies than we actually have
    const stock = Number(q.max) || qty;
    const capped = Math.min(qty, stock);

    return `Total: ${money(capped * unit)}` +
           (capped < qty ? ` — only ${stock} in stock` : '');
}

const helpButton = document.getElementById('help-button');
helpButton.addEventListener('click', () => {
    alert('Fill in your name and email, tell us which pressing you are after, then hit Send message.');
});

// The plain <img> submits only once the address looks like an address.
const btn = document.getElementById('btn');
btn.addEventListener('click', () => {
    const myForm = document.getElementById('myForm');
    const pattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const adr = document.getElementById('adr').value;

    if (!pattern.test(adr)) alert('Invalid Email Address');
    else myForm.submit();
});

// The boxset's real price and stock (catalogue.js). The HTML holds its
// Browse price (2523) and starting stock (max="60"); the seller's edits
// and sales change them.
const qtyField = document.getElementById('qty');
const BOXSET = productKey('Requiem Collectible Boxset', 'boxset');
const boxsetEdit = catalogueChanges().edits[BOXSET] || {};
if (Number.isFinite(boxsetEdit.price)) {
    document.getElementById('price').value = boxsetEdit.price;
    document.getElementById('bulk-price').textContent = money(boxsetEdit.price);
}
const boxsetLeft = stockLeft(BOXSET, qtyField.max);
if (Number.isFinite(boxsetLeft)) {
    qtyField.max = String(Math.max(boxsetLeft, 1));
    document.getElementById('bulk-stock').textContent = boxsetLeft > 0 ? `${boxsetLeft} available` : 'sold out';
    if (boxsetLeft <= 0) {
        qtyField.disabled = true;
        qtyField.form.querySelector('[type="submit"]').disabled = true;
    }
}

// The field starts at 1, but oninput hasn't fired yet — show that first
// total straight away instead of leaving the line blank until someone types.
document.getElementById('qty').dispatchEvent(new Event('input', { bubbles: true }));

/* ---------- Main enquiry: order picker ---------- */
// Signed-in shoppers can say which order they mean. Picking one starts
// the message with its number (unless they've already written something).
const enquiry = document.getElementById('enquiry-form');
const orderField = document.getElementById('order-ref-field');
const orderSelect = document.getElementById('order-ref');
const messageBox = document.getElementById('message');

const account = currentAccount();
if (account) {
    // Save them typing what the shop already knows
    if (!enquiry.elements.Name.value) enquiry.elements.Name.value = account.name;
    if (!enquiry.elements.Address.value) enquiry.elements.Address.value = account.email;

    const orders = ordersOf(account.id);
    orders.forEach((order) => {
        const first = order.items[0];
        const more = order.items.length > 1 ? ` + ${order.items.length - 1} more` : '';
        const status = order.status || 'processing';
        const label = status[0].toUpperCase() + status.slice(1);
        orderSelect.add(new Option(`${order.id} · ${first.title}${more} · ${label}`, order.id));
    });
    orderField.hidden = orders.length === 0;
}

orderSelect.addEventListener('change', () => {
    const typed = messageBox.value.trim();
    const startedFromPicker = /^About order VND-\w+:$/.test(typed);
    if (orderSelect.value && (!typed || startedFromPicker)) {
        messageBox.value = `About order ${orderSelect.value}: `;
        messageBox.focus();
    } else if (!orderSelect.value && startedFromPicker) {
        messageBox.value = '';
    }
});

/* ---------- Main enquiry: "Message sent" ---------- */
// There's no mail server, so instead of leaving for the echo page the
// form confirms right here. The browser's own checks (required fields,
// email format) still run first.
const sentNote = document.getElementById('sent-note');

enquiry.addEventListener('submit', (e) => {
    e.preventDefault();
    const by = enquiry.elements['Reply Method'].value;
    document.getElementById('sent-text').textContent = by === 'Email'
        ? `Thanks, ${enquiry.elements.Name.value.trim()}. We'll reply to ${enquiry.elements.Address.value.trim()} within one working day.`
        : `Thanks, ${enquiry.elements.Name.value.trim()}. We'll reply by ${by.toLowerCase()} within one working day.`;
    enquiry.hidden = true;
    sentNote.hidden = false;
    sentNote.focus();
});

document.getElementById('send-another').addEventListener('click', () => {
    messageBox.value = '';
    orderSelect.value = '';
    sentNote.hidden = true;
    enquiry.hidden = false;
    messageBox.focus();
});
