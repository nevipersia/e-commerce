/* =============================================================
   CATALOGUE CHANGES
   The records in browse.html are the shop's base catalogue. The
   seller's changes from the dashboard live in localStorage on top:
     edits  — per record: a new price, sold out, or hidden
     added  — whole new records, with their picture as a data: URL
   On the Browse page these are applied to the grid before
   browse.js reads the cards, so filters, sorting and the bag all
   see the changed shop. Needs account.js (readStore/writeStore).
   ============================================================= */

const CATALOGUE_KEY = 'venaudio.catalogue';

// Title + format identifies a record — "Gabriel" exists on vinyl and on CD
const productKey = (title, format) => `${title}|${format}`;

function catalogueChanges() {
    const saved = readStore(CATALOGUE_KEY);
    return {
        edits: saved && typeof saved.edits === 'object' ? saved.edits : {},
        added: saved && Array.isArray(saved.added) ? saved.added : []
    };
}

function saveCatalogueChanges(changes) {
    writeStore(CATALOGUE_KEY, changes);
}

// Only pictures the dashboard made itself (resized into a data: URL) are
// trusted as an added record's image
const safeImage = (src) => (typeof src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(src) ? src : '');

// A record card with the same markup as the ones written in browse.html.
// Everything typed by the seller goes in through textContent / dataset.
function buildCard(p) {
    const card = document.createElement('article');
    card.className = 'card';
    Object.assign(card.dataset, {
        format: p.format,
        price: p.price,
        title: p.title,
        artist: p.artist,
        label: p.label,
        desc: p.desc || '',
        tracks: p.tracks || ''
    });

    const art = document.createElement('div');
    art.className = 'art';
    const disc = document.createElement('span');
    disc.className = 'disc';
    disc.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.src = safeImage(p.image);
    img.alt = `${p.artist} — ${p.title}`;
    img.loading = 'lazy';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = p.label;
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'view';
    view.textContent = 'View';
    art.append(disc, img, tag, view);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const artist = document.createElement('p');
    artist.className = 'artist';
    artist.textContent = p.artist;
    const title = document.createElement('h2');
    title.className = 'title';
    title.textContent = p.title;
    const buy = document.createElement('div');
    buy.className = 'buy';
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = money(p.price);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add';
    add.textContent = 'Add to crate';
    buy.append(price, add);
    meta.append(artist, title, buy);

    card.append(art, meta);
    return card;
}

// Sold out: a flag on the sleeve and an add button that can't be pressed
function markSoldOut(card) {
    card.classList.add('is-sold-out');
    let flag = card.querySelector('.flag');
    if (!flag) {
        flag = document.createElement('span');
        flag.className = 'flag';
        card.querySelector('.art').appendChild(flag);
    }
    flag.textContent = 'Sold out';
    const add = card.querySelector('.add');
    add.disabled = true;
    add.textContent = 'Sold out';
}

// Turn the Browse grid into the shop as the seller has left it
function applyCatalogue(grid) {
    const { edits, added } = catalogueChanges();
    added.forEach((p) => grid.appendChild(buildCard(p)));

    grid.querySelectorAll('.card').forEach((card) => {
        const edit = edits[productKey(card.dataset.title, card.dataset.format)];
        if (!edit) return;
        if (edit.hidden) {
            card.remove();
            return;
        }
        if (Number.isFinite(edit.price)) {
            card.dataset.price = edit.price;
            card.querySelector('.price').textContent = money(edit.price);
        }
        if (edit.soldOut) markSoldOut(card);
    });
}

const FORMAT_NAMES = { vinyl: 'vinyl', cd: 'CD', cassette: 'cassette', boxset: 'box set' };

// Bring a saved bag in line with the shop as the seller has left it:
// new prices, and records now hidden, sold out or removed taken out.
// Changes the array in place and returns a short note per change.
function reconcileBag(bag) {
    const { edits, added } = catalogueChanges();
    const notes = [];

    for (let i = bag.length - 1; i >= 0; i--) {
        const item = bag[i];
        if (!item.productTitle) continue;   // put in the bag before it remembered this

        const key = productKey(item.productTitle, item.format);
        const name = `${item.title} (${FORMAT_NAMES[item.format] || item.format})`;
        const edit = edits[key] || {};
        const gone = item.added && !added.some((p) => productKey(p.title, p.format) === key);

        if (gone || edit.hidden || edit.soldOut) {
            bag.splice(i, 1);
            notes.push(`${name} is ${edit.soldOut && !gone ? 'sold out' : 'no longer in the shop'}, so it was taken out.`);
        } else if (Number.isFinite(edit.price) && edit.price !== item.price) {
            notes.push(`${name} is now ${money(edit.price)} (was ${money(item.price)}).`);
            item.price = edit.price;
        }
    }
    return notes.reverse();   // the loop ran backwards; give them in bag order
}

// On the Browse page, before browse.js reads the cards
const shopGrid = document.getElementById('grid');
if (shopGrid) applyCatalogue(shopGrid);
