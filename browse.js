/* =============================================================
   BROWSE PAGE
   Runs the shop: filtering the grid, searching, sorting, the
   product viewer pop-up, and the bag drawer.

   Nothing here talks to a server — the records live in the HTML
   as <article class="card"> elements and every number is read
   back off their data- attributes.
   ============================================================= */

/* ---------- Elements we touch more than once ---------- */
const grid = document.getElementById('grid');
const cards = Array.from(grid.querySelectorAll('.card'));   // every record, filtered or not
const chips = Array.from(document.querySelectorAll('.chip')); // the All / Vinyl / CD buttons
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const resultCount = document.getElementById('result-count');
const emptyNote = document.getElementById('empty');

// Featured order is whatever the markup shipped with — remember it so
// "Featured" can put the grid back.
cards.forEach((card, i) => { card.dataset.order = i; });

// Which crate is on show. Changed by the chips and by the URL hash.
let activeFilter = 'all';


/* =============================================================
   FILTER / SEARCH / SORT
   ============================================================= */

// Should this card be on screen right now?
// A card has to clear two hurdles: the chosen format, and the search box.
function matches(card) {
    // data-format can hold more than one word, e.g. "cd signed"
    const formats = card.dataset.format.split(' ');
    const inCrate = activeFilter === 'all' || formats.includes(activeFilter);

    // Match the typed text against the artist and title together
    const query = searchInput.value.trim().toLowerCase();
    const haystack = `${card.dataset.artist} ${card.dataset.title}`.toLowerCase();

    return inCrate && (query === '' || haystack.includes(query));
}

// Reorder the cards in the DOM to match the sort dropdown.
// Appending an element that is already in the grid moves it, so
// re-appending all of them in order is enough to reshuffle.
function sortCards() {
    const mode = sortSelect.value;

    const sorted = cards.slice().sort((a, b) => {
        switch (mode) {
            case 'price-asc':
                return a.dataset.price - b.dataset.price;
            case 'price-desc':
                return b.dataset.price - a.dataset.price;
            case 'title':
                return a.dataset.title.localeCompare(b.dataset.title);
            default:
                // "Featured" — fall back to the original markup order
                return a.dataset.order - b.dataset.order;
        }
    });

    sorted.forEach((card) => grid.appendChild(card));
}

// Redraw the grid: sort it, hide what doesn't match, update the count.
// Called after every chip click, keystroke and sort change.
function render() {
    sortCards();

    let shown = 0;

    cards.forEach((card) => {
        const visible = matches(card);
        card.hidden = !visible;

        if (visible) {
            // Restart the rise-in so filtered results animate in fresh.
            // Reading offsetWidth forces the browser to apply the removal
            // before we put the animation back — without it the change is
            // batched and the animation never replays.
            card.style.animation = 'none';
            void card.offsetWidth;
            card.style.animation = '';

            // Stagger the first few cards, then stop so a big crate
            // doesn't take a second and a half to appear
            card.style.animationDelay = `${Math.min(shown, 8) * 0.05}s`;
            shown += 1;
        }
    });

    resultCount.textContent = `${shown} ${shown === 1 ? 'record' : 'records'}`;
    emptyNote.hidden = shown !== 0;
}

// Clicking a chip makes it the active crate and redraws
chips.forEach((chip) => {
    chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        activeFilter = chip.dataset.filter;
        render();
    });
});

searchInput.addEventListener('input', render);
sortSelect.addEventListener('change', render);


/* =============================================================
   THE BAG
   ============================================================= */

const cartButton = document.getElementById('cart-button');
const cartCount = document.getElementById('cart-count');
const drawer = document.getElementById('cart-drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const drawerClose = document.getElementById('drawer-close');
const drawerList = document.getElementById('drawer-list');
const drawerEmpty = document.getElementById('drawer-empty');
const drawerTotal = document.getElementById('drawer-total');
const checkout = document.getElementById('checkout');
const checkoutNote = document.getElementById('checkout-note');

// What's in the bag. Each entry: { key, title, artist, price, image, qty }
// Saved to localStorage (account.js) so it follows the visitor to checkout.
const bag = loadBag();

// Where focus was before a pop-up opened, so we can hand it back on close
let lastFocusedInShop = null;

// 2390 -> "₱2,390.00"
const money = (n) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MAX_QTY = 10;

// renderBag rebuilds the list, so a typed quantity loses focus — remember
// which line was being edited and put the caret back afterwards.
let refocusLine = null;

// Quantity control for one bag line: − / editable number / +.
// Dropping to zero takes the line out of the bag entirely.
function buildStepper(item, index) {
    const stepper = document.createElement('div');
    stepper.className = 'qty';

    // One place to change the count, whichever control was used
    const setQty = (next) => {
        const clamped = Math.min(Math.max(next, 0), MAX_QTY);

        if (clamped === 0) {
            bag.splice(index, 1);   // zero copies means remove the line
        } else {
            item.qty = clamped;
        }

        renderBag();
    };

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'qty-step';
    minus.setAttribute('aria-label', `Fewer copies of ${item.title}`);
    minus.textContent = '−';
    minus.addEventListener('click', () => setQty(item.qty - 1));

    // Typing straight into the box is allowed as well as the +/- buttons
    const field = document.createElement('input');
    field.type = 'number';
    field.className = 'qty-input';
    field.min = '0';
    field.max = String(MAX_QTY);
    field.value = item.qty;
    field.setAttribute('aria-label', `Copies of ${item.title}`);
    field.addEventListener('change', () => {
        const typed = parseInt(field.value, 10);
        refocusLine = index;                              // put the caret back after the redraw
        setQty(Number.isNaN(typed) ? item.qty : typed);   // gibberish leaves the count alone
    });

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'qty-step';
    plus.setAttribute('aria-label', `More copies of ${item.title}`);
    plus.textContent = '+';
    plus.disabled = item.qty >= MAX_QTY;
    plus.addEventListener('click', () => setQty(item.qty + 1));

    stepper.append(minus, field, plus);
    return stepper;
}

// Redraw the whole drawer from the bag array, then the count and total.
// Rebuilding from scratch keeps every line's index honest after a removal.
function renderBag() {
    drawerList.innerHTML = '';

    bag.forEach((item, index) => {
        const li = document.createElement('li');

        const img = document.createElement('img');
        img.src = item.image;
        img.alt = '';   // the title sits right next to it, so this would just repeat

        // Build the empty shape first, then fill it with textContent —
        // never drop item values straight into innerHTML
        const text = document.createElement('div');
        text.className = 'drawer-item-text';
        text.innerHTML = `
            <p class="artist"></p>
            <p class="name"></p>
            <p class="line-price"></p>`;
        text.querySelector('.artist').textContent = item.artist;
        text.querySelector('.name').textContent = item.title;
        text.querySelector('.line-price').textContent =
            `${money(item.price)} each · ${money(item.qty * item.price)}`;

        text.appendChild(buildStepper(item, index));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'drawer-remove';
        remove.setAttribute('aria-label', `Remove ${item.title}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
            bag.splice(index, 1);
            renderBag();
        });

        li.append(img, text, remove);
        drawerList.appendChild(li);
    });

    // Totals across every line
    const count = bag.reduce((sum, item) => sum + item.qty, 0);
    const total = bag.reduce((sum, item) => sum + item.qty * item.price, 0);

    saveBag(bag);
    cartCount.textContent = count;
    drawerTotal.textContent = money(total);
    drawerEmpty.hidden = bag.length > 0;

    // Restore the caret if this redraw came from someone typing a quantity
    if (refocusLine !== null) {
        const line = drawerList.children[refocusLine];
        const input = line && line.querySelector('.qty-input');
        if (input) {
            input.focus();
            input.select();
        }
        refocusLine = null;
    }
}

// Add one copy of a card's record, or bump the count if it's already in.
function addToBag(card) {
    const title = card.dataset.title;

    // Title alone isn't unique — Gabriel exists on both vinyl and CD —
    // so the format is part of what identifies a line.
    const existing = bag.find((item) => item.key === title + card.dataset.format);

    if (existing) {
        existing.qty = Math.min(existing.qty + 1, MAX_QTY);
    } else {
        bag.push({
            key: title + card.dataset.format,
            title: card.querySelector('.title').textContent,
            artist: card.dataset.artist,
            price: Number(card.dataset.price),
            image: card.querySelector('.art img').getAttribute('src'),
            qty: 1
        });
    }

    renderBag();
}

// Briefly swap a button's label to "In bag" so the click feels answered
function flashAdded(button) {
    button.classList.add('is-added');

    // Stash the real label on the element the first time round
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = 'In bag';

    setTimeout(() => {
        button.classList.remove('is-added');
        button.textContent = original;
    }, 1200);
}

// One listener on the grid covers every card, including the add buttons.
// Cheaper than wiring a listener per card, and still works if cards move.
grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;

    const addButton = e.target.closest('.add');
    if (addButton) {
        addToBag(card);
        flashAdded(addButton);
        return;     // an add click shouldn't also open the product
    }

    // Anywhere else on the sleeve or the title opens the product
    if (e.target.closest('.art') || e.target.closest('.title')) {
        openViewer(card);
    }
});


/* =============================================================
   PRODUCT VIEWER
   ============================================================= */

const viewer = document.getElementById('viewer');
const viewerBackdrop = document.getElementById('viewer-backdrop');
const viewerClose = document.getElementById('viewer-close');
const viewerImage = document.getElementById('viewer-image');
const viewerThumbs = document.getElementById('viewer-thumbs');
const viewerPrev = document.getElementById('viewer-prev');
const viewerNext = document.getElementById('viewer-next');
const viewerArtist = document.getElementById('viewer-artist');
const viewerTitle = document.getElementById('viewer-title');
const viewerFormat = document.getElementById('viewer-format');
const viewerDesc = document.getElementById('viewer-desc');
const viewerPrice = document.getElementById('viewer-price');
const viewerAdd = document.getElementById('viewer-add');
const viewerBack = document.getElementById('viewer-back');

let viewerCard = null;      // the card currently on show
let viewerShots = [];       // its sample pictures
let shotIndex = 0;          // which of those is on the stage

// Put picture `index` on the stage and mark its thumbnail.
// Wraps around, so Next on the last shot goes back to the first.
function showShot(index) {
    shotIndex = (index + viewerShots.length) % viewerShots.length;
    const shot = viewerShots[shotIndex];

    viewerImage.src = shot.src;
    viewerImage.alt = shot.alt;

    Array.from(viewerThumbs.children).forEach((thumb, i) => {
        thumb.classList.toggle('is-active', i === shotIndex);
        thumb.setAttribute('aria-selected', i === shotIndex ? 'true' : 'false');
    });
}

// Fill the viewer from one card's data- attributes and show it
function openViewer(card) {
    viewerCard = card;
    lastFocusedInShop = document.activeElement;

    // Every <img> in the sleeve is a sample picture of this one product
    viewerShots = Array.from(card.querySelectorAll('.art img')).map((img) => ({
        src: img.getAttribute('src'),
        alt: img.alt || `${card.dataset.artist} — ${card.dataset.title}`
    }));

    viewerArtist.textContent = card.dataset.artist;
    viewerTitle.textContent = card.querySelector('.title').textContent;
    viewerFormat.textContent = card.dataset.label;
    viewerDesc.textContent = card.dataset.desc;
    viewerPrice.textContent = money(Number(card.dataset.price));

    // Thumbnail strip — only worth showing when there's more than one shot
    viewerThumbs.innerHTML = '';
    viewerShots.forEach((shot, i) => {
        const thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'viewer-thumb';
        thumb.setAttribute('role', 'tab');
        thumb.setAttribute('aria-label', `Picture ${i + 1} of ${viewerShots.length}`);

        const img = document.createElement('img');
        img.src = shot.src;
        img.alt = '';
        thumb.appendChild(img);

        thumb.addEventListener('click', () => showShot(i));
        viewerThumbs.appendChild(thumb);
    });

    // A single-picture product needs no thumbnails or arrows
    const multi = viewerShots.length > 1;
    viewerThumbs.hidden = !multi;
    viewerPrev.hidden = !multi;
    viewerNext.hidden = !multi;

    showShot(0);

    viewer.hidden = false;
    viewerBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';   // stop the page scrolling behind the pop-up
    viewerClose.focus();                       // send the keyboard into the dialog
}

function closeViewer() {
    viewer.hidden = true;
    viewerBackdrop.hidden = true;
    viewerCard = null;
    document.body.style.overflow = '';
    if (lastFocusedInShop) lastFocusedInShop.focus();   // hand focus back where it came from
}

viewerClose.addEventListener('click', closeViewer);
viewerBack.addEventListener('click', closeViewer);
viewerBackdrop.addEventListener('click', closeViewer);
viewerPrev.addEventListener('click', () => showShot(shotIndex - 1));
viewerNext.addEventListener('click', () => showShot(shotIndex + 1));

viewerAdd.addEventListener('click', () => {
    if (!viewerCard) return;
    addToBag(viewerCard);
    flashAdded(viewerAdd);
});

// Escape closes the viewer, arrow keys page through its pictures
document.addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowLeft') showShot(shotIndex - 1);
    if (e.key === 'ArrowRight') showShot(shotIndex + 1);
});


/* =============================================================
   BAG DRAWER OPEN / CLOSE
   ============================================================= */

function openDrawer() {
    lastFocusedInShop = document.activeElement;
    drawer.hidden = false;
    drawerBackdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    drawerClose.focus();
}

function closeDrawer() {
    drawer.hidden = true;
    drawerBackdrop.hidden = true;
    checkoutNote.hidden = true;   // clear the "bag's empty" note for next time
    document.body.style.overflow = '';
    if (lastFocusedInShop) lastFocusedInShop.focus();
}

cartButton.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
});

// Head to checkout — unless there's nothing to check out
checkout.addEventListener('click', () => {
    if (bag.length === 0) {
        checkoutNote.hidden = false;
        return;
    }
    location.href = 'checkout.html';
});


/* =============================================================
   DEEP LINKS AND FIRST DRAW
   ============================================================= */

// Other pages link straight into a crate, e.g. the About image map's
// browse.html#boxset. Turn that hash into the matching chip.
function applyHash() {
    const wanted = location.hash.slice(1);
    const chip = chips.find((c) => c.dataset.filter === wanted);
    if (!chip) return;   // unknown hash — leave the current filter alone

    chips.forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    activeFilter = wanted;
}

// Also handle the hash changing while the page is already open
window.addEventListener('hashchange', () => {
    applyHash();
    render();
});

// First paint
mountAccountChip(document.getElementById('account-chip'));
applyHash();
render();
renderBag();
