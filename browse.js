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
const chips = Array.from(document.querySelectorAll('.chips .chip')); // the All / Vinyl / CD buttons
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const resultCount = document.getElementById('result-count');
const emptyNote = document.getElementById('empty');

// Featured order is whatever the markup shipped with — remember it so
// "Featured" can put the grid back.
cards.forEach((card, i) => { card.dataset.order = i; });

// Which crate is on show. Changed by the chips and by the URL hash.
let activeFilter = 'all';

// The filter bar sticks directly under the top bar (style.css reads
// --topbar-h). Measured rather than hardcoded, because the top bar's
// height changes: it wraps on narrow screens and grows when signed in.
const topbar = document.querySelector('.topbar');
function measureTopbar() {
    document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
}
measureTopbar();                                   // right away, before the first paint
new ResizeObserver(measureTopbar).observe(topbar); // and again whenever it changes height

// The filter bar only gets its dark glass once it's pinned under the header
// (.is-stuck in style.css). While it sits under the title it stays clear.
const toolbar = document.querySelector('.toolbar');
function updateStuck() {
    const stuck = toolbar.getBoundingClientRect().top <= topbar.offsetHeight + 1;
    toolbar.classList.toggle('is-stuck', stuck);
}
window.addEventListener('scroll', updateStuck, { passive: true });
window.addEventListener('resize', updateStuck);
updateStuck();


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
// The saved bag, quietly updated for the seller's latest prices and stock
const bag = loadBag();
if (reconcileBag(bag).length) saveBag(bag);

// Where focus was before a pop-up opened, so we can hand it back on close
let lastFocusedInShop = null;

const MAX_QTY = 10;

// Most copies one line can have: the per-order cap, or what's in stock
const maxFor = (item) => Math.min(MAX_QTY,
    item.productTitle ? stockLeft(productKey(item.productTitle, item.format), item.baseStock) : MAX_QTY);

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
        const clamped = Math.min(Math.max(next, 0), maxFor(item));

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
    field.max = String(maxFor(item));
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
    plus.disabled = item.qty >= maxFor(item);
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
        existing.qty = Math.min(existing.qty + 1, maxFor(existing));
    } else {
        bag.push({
            key: title + card.dataset.format,
            // productTitle + format let catalogue.js find the seller's later changes
            productTitle: title,
            format: card.dataset.format,
            baseStock: card.dataset.stock,   // starting stock; catalogue.js knows what's left
            added: card.querySelector('.art img').getAttribute('src').startsWith('data:'),
            title: card.querySelector('.title').textContent,
            artist: card.dataset.artist,
            price: Number(card.dataset.price),
            image: card.querySelector('.art img').getAttribute('src'),
            qty: 1
        });
    }

    renderBag();
}

// Briefly swap a button's label to "In crate" so the click feels answered
function flashAdded(button) {
    button.classList.add('is-added');

    // Stash the real label on the element the first time round
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = 'In crate';

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
const viewerTracks = document.getElementById('viewer-tracks');
const viewerTracklist = document.getElementById('viewer-tracklist');
const viewerPrice = document.getElementById('viewer-price');
const viewerAdd = document.getElementById('viewer-add');
const viewerBack = document.getElementById('viewer-back');
const viewerListen = document.getElementById('viewer-listen');
const viewerStock = document.getElementById('viewer-stock');
const reviewSummary = document.getElementById('review-summary');
const reviewList = document.getElementById('review-list');
const reviewMore = document.getElementById('review-more');

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

// Spotify's own player for the record. data-spotify is "album/<id>" or
// "track/<id>"; anything else (or nothing) just leaves the player out.
// One <iframe> lives in the viewer and is pointed at each record in turn:
//   - resting on a record's sleeve starts loading its player early, while
//     the viewer is still closed, so it's usually ready when it opens
//   - until Spotify's page has loaded, a "Loading Spotify…" placeholder
//     holds its space
//   - closing the viewer points it at a blank page, which stops the music
const SPOTIFY_REF = /^(album|track)\/[A-Za-z0-9]{22}$/;
const WARM_DELAY = 250;   // ms on a sleeve before its player starts loading

function loadPlayer(card) {
    const ref = card.dataset.spotify || '';
    if (!SPOTIFY_REF.test(ref)) return null;

    let player = viewerListen.querySelector('iframe');
    if (player && player.dataset.ref === ref) return player;   // already loading or loaded

    if (!player) {
        player = document.createElement('iframe');
        player.height = '152';
        // Not lazy: lazy loading made Chrome hold it back inside the pop-up
        player.allow = 'encrypted-media; clipboard-write; picture-in-picture';
        player.addEventListener('load', () => {
            if (!player.dataset.ref) return;   // the blank page after closing
            player.dataset.loaded = 'true';
            viewerListen.classList.add('is-loaded');
        });
        viewerListen.appendChild(player);
    }

    player.dataset.ref = ref;
    player.dataset.loaded = 'false';
    viewerListen.classList.remove('is-loaded');
    player.title = `Listen to ${card.dataset.title} on Spotify`;
    player.src = `https://open.spotify.com/embed/${ref}`;
    return player;
}

function showListen(card) {
    const player = loadPlayer(card);
    viewerListen.hidden = !player;
    if (player) viewerListen.classList.toggle('is-loaded', player.dataset.loaded === 'true');
}

function stopPlayer() {
    const player = viewerListen.querySelector('iframe');
    if (!player) return;
    player.dataset.ref = '';
    player.dataset.loaded = 'false';
    viewerListen.classList.remove('is-loaded');
    player.src = 'about:blank';
}

// Warm up a record's player while the mouse rests on its sleeve (or the
// View button gets keyboard focus), so opening it feels instant
let warmTimer = null;
grid.addEventListener('pointerover', (e) => {
    const art = e.target.closest('.art');
    clearTimeout(warmTimer);
    if (!art || !viewer.hidden) return;
    const card = art.closest('.card');
    warmTimer = setTimeout(() => loadPlayer(card), WARM_DELAY);
});
grid.addEventListener('pointerout', (e) => {
    if (!e.target.closest('.art')?.contains(e.relatedTarget)) clearTimeout(warmTimer);
});
grid.addEventListener('focusin', (e) => {
    if (e.target.matches('.view') && viewer.hidden) loadPlayer(e.target.closest('.card'));
});

// What people who bought this record thought (account.js keeps the
// reviews; they're written on My orders once an order arrives). The
// viewer shows the newest few; "Show all" opens every review in a second
// pop-up on top, with Back (or Escape) to return and X to close both.
const REVIEWS_SHOWN = 3;
let viewerReviews = [];   // every review of the record on show, newest first

const reviewDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One review as a list item — the same in the viewer and in "Show all"
function reviewItem(r) {
    const li = document.createElement('li');
    const head = document.createElement('p');
    head.className = 'review-head';
    const stars = document.createElement('span');
    stars.className = 'review-stars';
    stars.textContent = starText(r.rating);
    stars.setAttribute('aria-label', `${r.rating} out of 5 stars`);
    const who = document.createElement('span');
    who.className = 'review-who';
    who.textContent = `${r.author} · ${reviewDate(r.date)}`;
    head.append(stars, who);
    li.append(head);
    if (r.text) {
        const text = document.createElement('p');
        text.className = 'review-text';
        text.textContent = r.text;
        li.append(text);
    }
    return li;
}

const averageOf = (reviews) => reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

function showReviews(card) {
    viewerReviews = reviewsOf(productKey(card.dataset.title, card.dataset.format),
        card.dataset.artist, card.querySelector('.title').textContent);
    reviewList.innerHTML = '';
    reviewMore.hidden = viewerReviews.length <= REVIEWS_SHOWN;

    if (viewerReviews.length === 0) {
        reviewSummary.textContent = 'No reviews yet — they come from people whose order has arrived.';
        return;
    }

    const average = averageOf(viewerReviews);
    reviewSummary.textContent = '';
    const stars = document.createElement('span');
    stars.className = 'review-stars';
    stars.textContent = starText(Math.round(average));
    stars.setAttribute('aria-hidden', 'true');
    reviewSummary.append(stars, ` ${average.toFixed(1)} out of 5 · ${plural(viewerReviews.length, 'review')}`);

    reviewList.append(...viewerReviews.slice(0, REVIEWS_SHOWN).map(reviewItem));
    reviewMore.textContent = `Show all ${viewerReviews.length} reviews`;
}

/* ---------- "Show all" reviews pop-up ---------- */
const reviewsPop = document.getElementById('reviews-pop');
const reviewsBackdrop = document.getElementById('reviews-backdrop');
const reviewsBack = document.getElementById('reviews-back');
const reviewsSort = document.getElementById('reviews-sort');
const reviewsPopList = document.getElementById('reviews-pop-list');

const SORTS = {
    newest: (a, b) => new Date(b.date) - new Date(a.date),
    highest: (a, b) => b.rating - a.rating || new Date(b.date) - new Date(a.date),
    lowest: (a, b) => a.rating - b.rating || new Date(b.date) - new Date(a.date)
};

function listAllReviews() {
    const sorted = [...viewerReviews].sort(SORTS[reviewsSort.value] || SORTS.newest);
    reviewsPopList.replaceChildren(...sorted.map(reviewItem));
}

function openReviews() {
    const average = averageOf(viewerReviews);
    document.getElementById('reviews-pop-title').textContent = viewerTitle.textContent;
    document.getElementById('reviews-avg').textContent = average.toFixed(1);
    document.getElementById('reviews-avg-stars').textContent = starText(Math.round(average));
    document.getElementById('reviews-count').textContent = plural(viewerReviews.length, 'review');
    document.getElementById('reviews-all-label').textContent = `All ${plural(viewerReviews.length, 'review')}`;

    // How many people gave each star rating, 5 down to 1
    const bars = document.getElementById('reviews-bars');
    bars.replaceChildren(...[5, 4, 3, 2, 1].map((stars) => {
        const count = viewerReviews.filter((r) => r.rating === stars).length;
        const li = document.createElement('li');
        li.setAttribute('aria-label', `${stars} star${stars > 1 ? 's' : ''}: ${count}`);
        const label = document.createElement('span');
        label.textContent = `${stars}★`;
        label.setAttribute('aria-hidden', 'true');
        const track = document.createElement('span');
        track.className = 'reviews-bar';
        const fill = document.createElement('span');
        fill.style.width = `${(count / viewerReviews.length) * 100}%`;
        track.append(fill);
        const n = document.createElement('span');
        n.textContent = count;
        n.setAttribute('aria-hidden', 'true');
        li.append(label, track, n);
        return li;
    }));

    reviewsSort.value = 'newest';
    listAllReviews();
    reviewsPop.scrollTop = 0;
    reviewsPop.hidden = false;
    reviewsBackdrop.hidden = false;
    reviewsBack.focus();
}

// Back (or Escape): just the reviews, back to the record
function closeReviews() {
    if (reviewsPop.hidden) return;
    reviewsPop.hidden = true;
    reviewsBackdrop.hidden = true;
    reviewMore.focus();
}

reviewMore.addEventListener('click', openReviews);
reviewsBack.addEventListener('click', closeReviews);
reviewsBackdrop.addEventListener('click', closeReviews);
reviewsSort.addEventListener('change', listAllReviews);
// X: the reviews and the record together, back to the shop
document.getElementById('reviews-close').addEventListener('click', () => {
    reviewsPop.hidden = true;
    reviewsBackdrop.hidden = true;
    closeViewer();
});

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

    // A record the seller marked sold out can be looked at, not bought
    const soldOut = card.classList.contains('is-sold-out');
    viewerAdd.disabled = soldOut;
    viewerAdd.textContent = soldOut ? 'Sold out' : 'Add to crate';

    // How many are left, from catalogue.js (data-left)
    const left = Number(card.dataset.left);
    viewerStock.textContent = soldOut ? 'Sold out'
        : !card.dataset.left ? 'In stock'
        : left <= 3 ? `Only ${left} left`
        : `${left} available`;
    delete viewerAdd.dataset.label;   // flashAdded() remembers the label; let it re-read this one

    // Song titles live in data-tracks, separated by "|"
    const tracks = (card.dataset.tracks || '').split('|').map((t) => t.trim()).filter(Boolean);
    viewerTracklist.innerHTML = '';
    tracks.forEach((title) => {
        const li = document.createElement('li');
        li.textContent = title;
        viewerTracklist.appendChild(li);
    });
    viewerTracks.hidden = tracks.length === 0;

    showReviews(card);
    showListen(card);
    stopPreview();   // the full player takes over from the hover preview

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
    stopPlayer();   // a blank page in the player is what stops its music
    document.body.style.overflow = '';
    if (lastFocusedInShop) lastFocusedInShop.focus();   // hand focus back where it came from
}

viewerClose.addEventListener('click', closeViewer);
// The size guide is on the page behind the viewer: close it, then the link scrolls there
document.getElementById('viewer-size-link').addEventListener('click', closeViewer);
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
    // With "Show all" reviews open on top, Escape goes back to the record
    // and the arrow keys are left for the reviews' sort menu
    if (!reviewsPop.hidden) {
        if (e.key === 'Escape') closeReviews();
        return;
    }
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

/* ---------- Hover previews ---------- */
// Resting the mouse on a record plays 30 seconds of its featured song
// (data-preview, Apple's preview clip of data-song). Silent until the
// visitor turns Sound on — browsers won't play audio before a click
// anyway — and only where there's a real mouse to hover with.
const SOUND_KEY = 'venaudio.sound';
const PREVIEW_VOLUME = 0.5;
const HOVER_DELAY = 400;   // ms of resting on a card before it plays, so sweeping past stays quiet

const soundToggle = document.getElementById('sound-toggle');
const preview = new Audio();
preview.preload = 'none';

let soundOn = false;
let hoverCard = null;      // the card the mouse is over
let playingCard = null;    // the card whose song is playing
let hoverTimer = null;
let fadeTimer = null;

// Slide the volume to `target` over about a quarter of a second, then run `done`
function fadeTo(target, done) {
    clearInterval(fadeTimer);
    fadeTimer = setInterval(() => {
        const gap = target - preview.volume;
        if (Math.abs(gap) <= 0.05) {
            preview.volume = target;
            clearInterval(fadeTimer);
            if (done) done();
        } else {
            preview.volume += Math.sign(gap) * 0.05;
        }
    }, 25);
}

function startPreview(card) {
    const src = card.dataset.preview || '';
    if (!src.startsWith('https://') || card === playingCard) return;
    stopPreview();
    playingCard = card;
    clearInterval(fadeTimer);   // cancel the last song's fade-out pause
    preview.src = src;
    preview.volume = 0;
    preview.play()
        .then(() => {
            if (playingCard !== card) return;
            card.classList.add('is-playing');   // spins its disc
            fadeTo(PREVIEW_VOLUME);
        })
        .catch(() => {
            // Blocked (no click yet this visit) or offline — stay quiet
            if (playingCard === card) playingCard = null;
        });
}

function stopPreview() {
    clearTimeout(hoverTimer);
    if (!playingCard) return;
    playingCard.classList.remove('is-playing');
    playingCard = null;
    fadeTo(0, () => preview.pause());
}

function setSound(on) {
    soundOn = on;
    soundToggle.setAttribute('aria-pressed', String(on));
    soundToggle.classList.toggle('is-active', on);
    soundToggle.querySelector('.sound-state').textContent = on ? 'on' : 'off';
    writeStore(SOUND_KEY, on);
    if (!on) stopPreview();
}

// Phones and tablets have no hover — the viewer's Spotify player covers them
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    setSound(readStore(SOUND_KEY) === true);
    soundToggle.addEventListener('click', () => setSound(!soundOn));

    grid.addEventListener('pointerover', (e) => {
        const card = e.target.closest('.card');
        if (card === hoverCard) return;      // still inside the same record
        hoverCard = card;
        clearTimeout(hoverTimer);
        if (card && soundOn) hoverTimer = setTimeout(() => startPreview(card), HOVER_DELAY);
    });

    grid.addEventListener('pointerout', (e) => {
        if (!hoverCard || hoverCard.contains(e.relatedTarget)) return;
        hoverCard = null;
        stopPreview();
    });

    preview.addEventListener('ended', () => {
        if (playingCard) playingCard.classList.remove('is-playing');
        playingCard = null;
    });

    // Switching tabs shouldn't leave a song playing in the background
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopPreview();
    });
} else {
    soundToggle.hidden = true;
}

// First paint
applyHash();
render();
renderBag();

// browse.html?record=<title>|<format> (About's best sellers link here)
// opens that record's pop-up straight away
const linkedRecord = new URLSearchParams(location.search).get('record');
const linkedCard = cards.find((card) => productKey(card.dataset.title, card.dataset.format) === linkedRecord);
if (linkedCard && grid.contains(linkedCard)) openViewer(linkedCard);
