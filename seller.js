/* =============================================================
   SELLER DASHBOARD
   For the staff demo account only. Four parts:
     - Sales overview, worked out from every customer's orders
     - Orders, where the seller marks each one shipped / delivered
     - Products: price, sold out, shown or hidden in the shop
     - Add a record, with its own cover picture

   The shop's base records are read from browse.html itself, and
   the seller's changes are saved on top through catalogue.js — so
   Browse and this page always agree. (Staff-only is enforced in
   the browser, which is fine for a demo but isn't real security.)
   ============================================================= */

const sellerArea = document.getElementById('seller');

const PAYMENT_NAMES = { cod: 'Cash on delivery', gcash: 'GCash', maya: 'Maya', card: 'Card' };
const STATUS_NAMES = { processing: 'Processing', shipped: 'Shipped', delivered: 'Delivered' };
const FORMAT_LABELS = { vinyl: 'Vinyl LP', cd: 'CD', cassette: 'Cassette', boxset: 'Boxset' };

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });

// Small helper: an element with a class and text. Order and product details
// come from localStorage, so they only ever go in as textContent.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/* =============================================================
   SALES OVERVIEW
   ============================================================= */

// Units and money per record across every order: { "artist|title": {...} }
function salesByRecord(orders) {
    const totals = {};
    orders.forEach((order) => order.items.forEach((item) => {
        const key = `${item.artist}|${item.title}`;
        totals[key] = totals[key] || { title: item.title, artist: item.artist, units: 0, revenue: 0 };
        totals[key].units += item.qty;
        totals[key].revenue += item.qty * item.price;
    }));
    return totals;
}

function renderOverview(orders) {
    const revenue = orders.reduce((sum, o) => sum + o.total, 0);
    const units = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0), 0);
    const toShip = orders.filter((o) => (o.status || 'processing') === 'processing').length;

    const stats = [
        ['Revenue', money(revenue)],
        ['Orders', orders.length],
        ['Average order', orders.length ? money(revenue / orders.length) : '—'],
        ['Records sold', units],
        ['Waiting to ship', toShip]
    ];
    document.getElementById('seller-stats').replaceChildren(...stats.map(([label, value]) => {
        const card = el('div', 'seller-stat');
        card.append(el('p', 'seller-stat-label', label), el('p', 'seller-stat-value', String(value)));
        return card;
    }));

    const best = Object.values(salesByRecord(orders)).sort((a, b) => b.units - a.units).slice(0, 5);
    const list = document.getElementById('seller-best');
    list.replaceChildren(...best.map((r) => {
        const li = el('li');
        li.append(el('span', 'seller-best-name', `${r.title} — ${r.artist}`),
                  el('span', 'seller-best-count', `${r.units} sold · ${money(r.revenue)}`));
        return li;
    }));
    if (!best.length) list.replaceChildren(el('li', 'seller-best-empty', 'Nothing sold yet.'));
}

/* =============================================================
   ORDERS
   ============================================================= */

// Older orders were saved before they carried the customer's name
function customerOf(order) {
    if (order.customer) return order.customer;
    const demo = DEMO_ACCOUNTS.find((a) => a.id === order.accountId);
    const stored = storedAccounts().find((a) => a.id === order.accountId);
    const who = demo || (stored && profileOf(stored));
    return who ? { name: who.name, email: who.email } : { name: 'Unknown customer', email: '' };
}

function paymentLabel(payment) {
    const name = PAYMENT_NAMES[payment.method] || payment.method;
    return payment.last4 ? `${name} ····${payment.last4}` : name;
}

function renderOrders(orders) {
    const body = document.querySelector('#seller-orders tbody');
    document.getElementById('seller-orders-empty').hidden = orders.length > 0;
    document.getElementById('seller-orders').hidden = orders.length === 0;

    body.replaceChildren(...orders.map((order) => {
        const status = order.status || 'processing';
        const customer = customerOf(order);
        const tr = el('tr');

        const orderCell = el('td');
        orderCell.append(el('strong', null, order.id), el('span', 'seller-sub', shortDate(order.placedAt)));

        const customerCell = el('td');
        customerCell.append(el('span', null, customer.name), el('span', 'seller-sub', customer.email));

        const records = order.items.map((i) => `${i.qty} × ${i.title}`).join(', ');

        const statusCell = el('td', 'seller-status-cell');
        statusCell.appendChild(el('span', `order-status is-step-${ORDER_STATUSES.indexOf(status)}`, STATUS_NAMES[status]));
        const next = { processing: 'shipped', shipped: 'delivered' }[status];
        if (next) {
            const button = el('button', 'seller-action', `Mark ${next}`);
            button.type = 'button';
            button.addEventListener('click', () => {
                setOrderStatus(order.accountId, order.id, next);
                renderSales();
            });
            statusCell.appendChild(button);
        }

        tr.append(orderCell, customerCell, el('td', 'seller-records', records), el('td', null, money(order.total)),
                  el('td', null, paymentLabel(order.payment)), statusCell);
        return tr;
    }));
}

function renderSales() {
    const orders = allOrders();
    renderOverview(orders);
    renderOrders(orders);
    renderProducts();   // the "Sold" column follows the orders too
}

/* =============================================================
   PRODUCTS
   ============================================================= */

let baseProducts = [];          // read from browse.html once
let baseProductsError = '';

// The records written into browse.html, as plain objects
async function loadBaseProducts() {
    try {
        const response = await fetch('browse.html');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        baseProducts = [...doc.querySelectorAll('#grid .card')].map((card) => ({
            title: card.dataset.title,
            format: card.dataset.format,
            artist: card.dataset.artist,
            label: card.dataset.label,
            name: card.querySelector('.title').textContent.trim(),
            price: Number(card.dataset.price),
            image: card.querySelector('.art img').getAttribute('src'),
            added: false
        }));
    } catch {
        // fetch() can't read files opened straight from disk (file://)
        baseProductsError = 'Open the site through Live Server (http://localhost) to manage the original records.';
    }
}

// Every record with the seller's changes laid over it
function allProducts() {
    const { edits, added } = catalogueChanges();
    const addedProducts = added.map((p) => ({ ...p, name: p.title, added: true }));
    return [...baseProducts, ...addedProducts].map((p) => {
        const edit = edits[productKey(p.title, p.format)] || {};
        return {
            ...p,
            price: Number.isFinite(edit.price) ? edit.price : p.price,
            soldOut: !!edit.soldOut,
            hidden: !!edit.hidden
        };
    });
}

// Change one record's price / sold out / hidden
function saveEdit(product, change) {
    const changes = catalogueChanges();
    const key = productKey(product.title, product.format);
    changes.edits[key] = { ...changes.edits[key], ...change };
    saveCatalogueChanges(changes);
}

const productsStatus = document.getElementById('products-status');
const productsError = document.getElementById('products-error');

function renderProducts() {
    const body = document.querySelector('#seller-products tbody');
    const sold = salesByRecord(allOrders());
    productsError.hidden = !baseProductsError;
    productsError.textContent = baseProductsError;

    body.replaceChildren(...allProducts().map((product) => {
        const tr = el('tr', product.hidden ? 'is-hidden-product' : '');

        // Picture, name, artist, format
        const recordCell = el('td', 'seller-record');
        const thumb = el('img', 'seller-thumb');
        thumb.src = product.added ? safeImage(product.image) : product.image;
        thumb.alt = '';
        const text = el('div');
        text.append(el('strong', null, product.name), el('span', 'seller-sub', `${product.artist} · ${product.label}`));
        recordCell.append(thumb, text);

        // Price — saved when the box is left or Enter is pressed
        const priceCell = el('td');
        const price = el('input', 'seller-price');
        price.type = 'number';
        price.min = '1';
        price.step = '1';
        price.value = product.price;
        price.setAttribute('aria-label', `Price of ${product.name}, ${product.label}`);
        price.addEventListener('change', () => {
            const value = Math.round(Number(price.value));
            if (!Number.isFinite(value) || value < 1) {
                price.value = product.price;
                productsStatus.textContent = "Prices must be at least ₱1 — that change wasn't saved.";
                return;
            }
            saveEdit(product, { price: value });
            productsStatus.textContent = `Saved: ${product.name} (${product.label}) is now ${money(value)}.`;
            renderProducts();
        });
        priceCell.appendChild(price);

        // Units sold, matched by the name the shopper saw in their bag
        const units = (sold[`${product.artist}|${product.name}`] || { units: 0 }).units;

        const toggle = (label, checked, onChange) => {
            const cell = el('td');
            const box = el('input');
            box.type = 'checkbox';
            box.checked = checked;
            box.setAttribute('aria-label', `${label}: ${product.name}, ${product.label}`);
            box.addEventListener('change', () => onChange(box.checked));
            cell.appendChild(box);
            return cell;
        };

        const soldOutCell = toggle('Sold out', product.soldOut, (on) => {
            saveEdit(product, { soldOut: on });
            productsStatus.textContent = `${product.name} is ${on ? 'now sold out' : 'back in stock'}.`;
            renderProducts();
        });
        const shownCell = toggle('Shown in the shop', !product.hidden, (on) => {
            saveEdit(product, { hidden: !on });
            productsStatus.textContent = `${product.name} is ${on ? 'back in the shop' : 'hidden from the shop'}.`;
            renderProducts();
        });

        // Only records added here can be removed; the originals can be hidden
        const removeCell = el('td');
        if (product.added) {
            const remove = el('button', 'seller-action seller-remove', 'Remove');
            remove.type = 'button';
            remove.addEventListener('click', () => {
                const changes = catalogueChanges();
                changes.added = changes.added.filter((p) => productKey(p.title, p.format) !== productKey(product.title, product.format));
                delete changes.edits[productKey(product.title, product.format)];
                saveCatalogueChanges(changes);
                productsStatus.textContent = `Removed ${product.name} from the shop.`;
                renderProducts();
            });
            removeCell.appendChild(remove);
        }

        tr.append(recordCell, priceCell, el('td', null, String(units)), soldOutCell, shownCell, removeCell);
        return tr;
    }));
}

/* =============================================================
   ADD A RECORD
   ============================================================= */

const addForm = document.getElementById('add-form');
const addError = document.getElementById('add-error');
const addDone = document.getElementById('add-done');
const addPreview = document.getElementById('add-preview');

// Shrink the chosen picture to at most 600px and turn it into a JPEG
// data: URL — browser storage only holds a few megabytes
function resizeImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, 600 / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';                    // transparent PNGs get a white sleeve, like the others
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error("That file doesn't look like a picture. Try a JPG or PNG."));
        img.src = URL.createObjectURL(file);
    });
}

addForm.elements.image.addEventListener('change', async () => {
    const file = addForm.elements.image.files[0];
    addPreview.hidden = !file;
    if (!file) return;
    try {
        addPreview.src = await resizeImage(file);
    } catch {
        addPreview.hidden = true;
    }
});

function showAddError(message, field) {
    addError.textContent = message;
    addError.hidden = false;
    if (field) field.focus();
}

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addError.hidden = true;
    addDone.textContent = '';
    const f = addForm.elements;

    const title = f.title.value.trim();
    const artist = f.artist.value.trim();
    const price = Math.round(Number(f.price.value));
    const file = f.image.files[0];

    if (!title) return showAddError('Give the record a title.', f.title);
    if (!artist) return showAddError('Who is the artist?', f.artist);
    if (!Number.isFinite(price) || price < 1) return showAddError('Enter a price of at least ₱1.', f.price);
    if (!file) return showAddError('Choose a cover picture.', f.image);

    const spotify = spotifyRef(f.spotify.value);
    if (spotify === null) {
        return showAddError('That Spotify link isn’t an album or a song. In Spotify, use Share → Copy link.', f.spotify);
    }

    const format = f.signed.checked ? `${f.format.value} signed` : f.format.value;
    const label = (f.signed.checked ? 'Signed ' : '') + FORMAT_LABELS[f.format.value];

    if (allProducts().some((p) => productKey(p.title, p.format) === productKey(title, format))) {
        return showAddError(`There's already a ${label} called ${title}. Change its price in the table above instead.`, f.title);
    }

    let image;
    try {
        image = await resizeImage(file);
    } catch (err) {
        return showAddError(err.message, f.image);
    }

    const product = {
        title,
        artist,
        format,
        label,
        price,
        desc: f.desc.value.trim(),
        // one song per line -> "Song|Song|Song", as the shop's cards store them
        tracks: f.tracks.value.split('\n').map((t) => t.replace(/\|/g, '/').trim()).filter(Boolean).join('|'),
        spotify,
        image
    };

    const changes = catalogueChanges();
    changes.added.push(product);
    saveCatalogueChanges(changes);

    // writeStore() fails quietly when storage is full — check it really landed
    const landed = catalogueChanges().added.some((p) => productKey(p.title, p.format) === productKey(title, format));
    if (!landed) {
        return showAddError("Couldn't save it — this browser's storage is full. Try a smaller picture, or remove an added record.");
    }

    addForm.reset();
    addPreview.hidden = true;
    addDone.textContent = `Added ${title} (${label}) — it's in the shop now.`;
    renderProducts();
});

/* =============================================================
   FIRST DRAW
   ============================================================= */

// Staff only. Anyone else never sees the page: guests are sent to sign in
// (and come back here if they sign in as staff), shoppers back to the shop.
async function start() {
    const account = currentAccount();
    if (!isSeller(account)) {
        location.replace(account ? 'browse.html' : 'index.html?signin&next=seller');
        return;
    }
    document.getElementById('seller-main').hidden = false;
    sellerArea.hidden = false;

    await loadBaseProducts();
    renderSales();
}

start();
