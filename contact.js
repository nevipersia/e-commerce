// Contact page: bulk-order total, image-button validation, help prompt,
// the main enquiry form (order picker, "Message sent"), and trade-ins.

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

/* ---------- Trade in your crate ---------- */
// Saved by account.js for the staff to review on the Seller dashboard.
// Accepting one adds store credit to the shopper's account.
const tradeForm = document.getElementById('trade-form');
const tradeError = document.getElementById('trade-error');
const tradeEstimateLine = document.getElementById('trade-estimate');
const tradePreview = document.getElementById('trade-preview');
const tradeSent = document.getElementById('trade-sent');
const tf = tradeForm.elements;

// Guests can see the form but need an account for the credit to land on
document.getElementById('trade-guest').hidden = !!currentAccount();

function showTradeEstimate() {
    const estimate = tradeEstimate(tf['Trade Format'].value, tf.Condition.value, tf.Copies.value);
    tradeEstimateLine.textContent = estimate
        ? `We'd offer about ${money(estimate)} in store credit — staff confirm it after seeing the photo.`
        : 'Pick a format and condition for an estimate.';
}
['Trade Format', 'Condition', 'Copies'].forEach((name) => {
    tf[name].addEventListener('input', showTradeEstimate);
    tf[name].addEventListener('change', showTradeEstimate);
});

// Show the chosen photo, already shrunk the way it'll be saved
let tradePhoto = null;
tf.file.addEventListener('change', async () => {
    tradePhoto = null;
    tradePreview.hidden = true;
    const file = tf.file.files[0];
    if (!file) return;
    try {
        tradePhoto = await resizeImage(file);   // catalogue.js
        tradePreview.src = tradePhoto;
        tradePreview.hidden = false;
    } catch (err) {
        showTradeError(err.message, tf.file);
    }
});

function showTradeError(message, field) {
    tradeError.textContent = message;
    tradeError.hidden = false;
    if (field) field.focus();
}

tradeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    tradeError.hidden = true;

    if (!currentAccount()) {
        return showTradeError('Sign in first — the credit goes on your account.');
    }
    if (!tradePhoto) return showTradeError('Add a photo of the records.', tf.file);
    if (!tf.Records.value.trim()) return showTradeError('Say which records you\u2019re trading.', tf.Records);
    if (!tf['Trade Format'].value) return showTradeError('Pick what you\u2019re trading.', tf['Trade Format']);
    if (!tf.Condition.value) return showTradeError('Pick their condition.', tf.Condition);
    const copies = Number(tf.Copies.value);
    if (!Number.isInteger(copies) || copies < 1 || copies > TRADE_MAX_COPIES) {
        return showTradeError(`Copies must be a whole number from 1 to ${TRADE_MAX_COPIES}.`, tf.Copies);
    }

    let tradeIn;
    try {
        tradeIn = sendTradeIn({
            records: tf.Records.value,
            format: tf['Trade Format'].value,
            condition: tf.Condition.value,
            copies,
            photo: tradePhoto
        });
    } catch (err) {
        return showTradeError(err.message);
    }

    document.getElementById('trade-sent-text').textContent =
        `Reference ${tradeIn.id}. Our estimate is ${money(tradeIn.estimate)} in store credit; ` +
        "you'll see the final offer on My account once the staff have looked.";
    tradeForm.hidden = true;
    tradeSent.hidden = false;
    tradeSent.focus();
});

document.getElementById('trade-another').addEventListener('click', () => {
    tradeForm.reset();
    tradePhoto = null;
    tradePreview.hidden = true;
    showTradeEstimate();
    tradeSent.hidden = true;
    tradeForm.hidden = false;
    tf.file.focus();
});
