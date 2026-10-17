/* =============================================================
   MY ORDERS
   Lists the signed-in account's past orders (saved by checkout.js
   through account.js), newest first, each with a delivery status.

   The status is whatever the seller last set on the Seller
   dashboard: Processing until they mark it Shipped, then Delivered.
   The arrival date is an estimate from the delivery speed. Once an
   order is delivered, each record in it can be reviewed.
   ============================================================= */

const list = document.getElementById('orders-list');
const emptyNote = document.getElementById('orders-empty');
const guestNote = document.getElementById('orders-guest');
const subtitle = document.getElementById('orders-sub');

const STEPS = ['Processing', 'Shipped', 'Delivered'];
const DAY = 24 * 60 * 60 * 1000;

// "2–3 business days" -> 3, "Next business day" -> 1
const daysToDeliver = (eta) => Math.max(1, ...(eta.match(/\d+/g) || ['1']).map(Number));

// Which step the seller has the order at, and when it should arrive.
// Orders saved before the seller could set a status count as processing.
function statusOf(order) {
    const step = Math.max(0, ORDER_STATUSES.indexOf(order.status || 'processing'));
    const due = new Date(new Date(order.placedAt).getTime() + daysToDeliver(order.eta) * DAY);
    return { step, due };
}

const longDate = (d) => d.toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function paymentText(payment, total) {
    if (payment.method === 'credit') return 'Paid in full with store credit';
    if (payment.method === 'cod') return `Cash on delivery — ${money(total)} due on arrival`;
    if (payment.method === 'card') return `Card ending ${payment.last4} · ref ${payment.reference}`;
    const wallet = payment.method === 'gcash' ? 'GCash' : 'Maya';
    return `${wallet} · ref ${payment.reference}`;
}

// Small helper: an element with a class and text. Everything shown comes
// from localStorage (partly typed by the shopper), so it only ever goes in
// as textContent — never innerHTML.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/* ---------- Reviews ---------- */
// Under each record of a delivered order: the review written for it, or a
// button that opens a small form (stars + a few words). Saved by account.js.
let reviewFormCount = 0;   // keeps each form's radio group and ids unique

function reviewBlock(order, item) {
    const box = el('div', 'review-box');
    const account = currentAccount();
    const mine = account && reviewFor(account.id, order.id, item);

    if (mine) {
        const shown = el('div', 'review-mine');
        const stars = el('span', 'review-stars', starText(mine.rating));
        stars.setAttribute('aria-label', `${mine.rating} out of 5 stars`);
        shown.append(el('span', 'review-label', 'Your review'), stars);
        if (mine.text) shown.append(el('p', 'review-text', mine.text));
        const edit = el('button', 'link-button review-edit', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', () => box.replaceWith(reviewForm(order, item, mine)));
        shown.append(edit);
        box.append(shown);
        return box;
    }

    const write = el('button', 'btn btn-ghost review-write', 'Write a review');
    write.type = 'button';
    write.addEventListener('click', () => {
        const form = reviewForm(order, item, null);
        box.replaceWith(form);
        form.querySelector('input').focus();
    });
    box.append(write);
    return box;
}

function reviewForm(order, item, existing) {
    const n = ++reviewFormCount;
    const form = el('form', 'review-form');
    form.noValidate = true;

    // Five stars as radio buttons. They're written 5 -> 1 so CSS can light
    // up every star up to the one under the mouse (row-reverse puts them
    // back in 1 -> 5 order on screen).
    const fieldset = el('fieldset', 'review-rating');
    fieldset.append(el('legend', null, `Your rating for ${item.title}`));
    const row = el('div', 'review-stars-input');
    for (let stars = 5; stars >= 1; stars--) {
        const id = `review-${n}-${stars}`;
        const radio = el('input');
        radio.type = 'radio';
        radio.name = `rating-${n}`;
        radio.value = stars;
        radio.id = id;
        if (existing && existing.rating === stars) radio.checked = true;
        const label = el('label', null, '★');
        label.htmlFor = id;
        label.title = `${stars} star${stars > 1 ? 's' : ''}`;
        label.setAttribute('aria-label', label.title);
        row.append(radio, label);
    }
    fieldset.append(row);

    const textLabel = el('label', 'field');
    textLabel.append(el('span', null, 'A few words (optional)'));
    const text = el('textarea');
    text.rows = 3;
    text.maxLength = REVIEW_MAX;
    text.value = existing ? existing.text : '';
    text.placeholder = 'How does it sound? How did it arrive?';
    textLabel.append(text);

    const error = el('p', 'form-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const actions = el('div', 'review-actions');
    const save = el('button', 'btn btn-primary', existing ? 'Save review' : 'Post review');
    save.type = 'submit';
    const cancel = el('button', 'btn btn-ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => form.replaceWith(reviewBlock(order, item)));
    actions.append(save, cancel);

    form.append(fieldset, textLabel, error, actions);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const picked = form.querySelector(`input[name="rating-${n}"]:checked`);
        try {
            saveReview(order, item, picked ? picked.value : 0, text.value);
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            return;
        }
        const done = reviewBlock(order, item);
        form.replaceWith(done);
        (done.querySelector('button') || done).focus();
    });
    return form;
}

function renderOrder(order) {
    const { step, due } = statusOf(order);
    const card = el('article', 'panel order');

    // Heading: order number, date, status
    const head = el('header', 'order-head');
    const titles = el('div');
    titles.append(
        el('h2', null, `Order ${order.id}`),
        el('p', 'order-date', `Placed ${longDate(new Date(order.placedAt))}`)
    );
    head.append(titles, el('span', `order-status is-step-${step}`, STEPS[step]));

    // Progress: Processing → Shipped → Delivered
    const progress = el('ol', 'order-progress');
    progress.setAttribute('aria-label', `Status: ${STEPS[step]}`);
    STEPS.forEach((name, i) => {
        const li = el('li', i <= step ? 'is-done' : '', name);
        if (i === step) li.setAttribute('aria-current', 'step');
        progress.appendChild(li);
    });

    const speed = order.speed === 'express' ? 'Express' : 'Standard';
    const arrival = el('p', 'order-arrival', [
        `Being packed · expected by ${longDate(due)} · ${speed} delivery`,
        order.shippedAt
            ? `On its way since ${longDate(new Date(order.shippedAt))} · expected by ${longDate(due)}`
            : `On its way · expected by ${longDate(due)}`,
        order.deliveredAt ? `Delivered ${longDate(new Date(order.deliveredAt))}` : 'Delivered'
    ][step]);

    // What was bought — same look as the bag and checkout summary
    const items = el('ul', 'drawer-list order-items');
    order.items.forEach((item) => {
        const li = el('li');
        const img = el('img');
        img.src = item.image;
        img.alt = '';
        const text = el('div', 'drawer-item-text');
        text.append(
            el('p', 'artist', item.artist),
            el('p', 'name', item.title),
            el('p', 'line-price', `${item.qty} × ${money(item.price)} · ${money(item.qty * item.price)}`)
        );
        // Delivered: each record can be reviewed
        if (step === STEPS.length - 1) text.append(reviewBlock(order, item));
        li.append(img, text);
        items.appendChild(li);
    });

    // Totals, payment and address
    const totals = el('dl', 'summary-totals');
    [['Subtotal', money(order.subtotal)], ['Shipping', money(order.shipping)],
        order.credit ? ['Store credit', `−${money(order.credit)}`] : null,
        ['Total', money(order.total)]]
        .filter(Boolean)
        .forEach(([label, value], i, rows) => {
            const row = el('div', i === rows.length - 1 ? 'summary-grand' : '');
            row.append(el('dt', null, label), el('dd', null, value));
            totals.appendChild(row);
        });

    const details = el('dl', 'order-details');
    [['Payment', paymentText(order.payment, order.total)], ['Delivering to', order.address]]
        .forEach(([label, value]) => {
            const row = el('div');
            row.append(el('dt', null, label), el('dd', null, value));
            details.appendChild(row);
        });

    card.append(head, progress, arrival, items, totals, details);
    return card;
}

function render() {
    list.innerHTML = '';
    const account = currentAccount();

    guestNote.hidden = !!account;
    if (!account) {
        emptyNote.hidden = true;
        subtitle.textContent = 'Sign in to see what you’ve ordered.';
        return;
    }

    const orders = ordersOf(account.id);
    emptyNote.hidden = orders.length > 0;
    subtitle.textContent = orders.length
        ? `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}, newest first.`
        : 'Nothing ordered yet.';
    orders.forEach((order) => list.appendChild(renderOrder(order)));
}

render();
