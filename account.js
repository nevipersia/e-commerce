/* =============================================================
ACCOUNT + SAVED BAG
Shared by every page that needs to know who's signed in or
what's in the bag. There is no server: accounts, the session
and the bag all live in this browser's localStorage, so they
survive moving between pages but never leave this computer.

Two kinds of account:
  - the demo account, one click on the sign-in pop-up
  - accounts people create with Sign up, which have a password
   ============================================================= */

// The one mock account offered on the sign-in pop-up.
// The address uses PSGC names (data/ph/) so checkout can prefill it;
// `region` is the PSGC region code.
const DEMO_ACCOUNT = {
    id: 'demo-juan',
    name: 'Juan dela Cruz',
    firstName: 'Juan',
    lastName: 'dela Cruz',
    initials: 'JD',
    email: 'juan.delacruz@example.com',
    phone: '0917 123 4567',
    address: {
        region: '130000000',
        province: 'Metro Manila',
        city: 'Quezon City',
        barangay: 'Teachers Village East',
        postal: '1101',
        street: 'Unit 4B, 88 Maginhawa St.',
        landmark: 'Across the bakeshop'
    }
};

// The shop's own demo account. Its top bar shows the Seller dashboard, and
// it's the only account that page lets in. (Client-side only — a demo, not
// real security: anyone could edit localStorage to look like a seller.)
const DEMO_SELLER = {
    id: 'demo-seller',
    role: 'seller',
    name: 'VenAudio Staff',
    firstName: 'VenAudio',
    lastName: 'Staff',
    initials: 'VS',
    email: 'staff@venaudio.example',
    phone: '',
    address: null
};

const DEMO_ACCOUNTS = [DEMO_ACCOUNT, DEMO_SELLER];

// 2390 -> "₱2,390.00". Every page loads this file, so this is the one copy.
const money = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SESSION_KEY = 'venaudio.session';
const ACCOUNTS_KEY = 'venaudio.accounts';
const BAG_KEY = 'venaudio.bag.php';   // renamed when prices moved to pesos, so old $ bags are dropped

// localStorage can throw (private windows, blocked site data) —
// every read and write goes through these so a failure just means
// "nothing saved" instead of a broken page.
function readStore(key) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
}

function writeStore(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable — carry on in memory */
    }
}

/* ---------- Passwords ---------- */

// Passwords are never stored. We keep a salted PBKDF2 hash instead: the
// browser's built-in way of turning a password into a value that can be
// checked again later but not turned back into the password.
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function hashPassword(password, saltHex) {
    if (!window.crypto?.subtle) {
        throw new Error("This browser can't create accounts here. Open the site through Live Server (http://localhost).");
    }
    const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
    return { salt: toHex(salt), hash: toHex(bits) };
}

/* ---------- Accounts ---------- */

// Signed-up accounts as stored: { id, firstName, lastName, email, phone, address, salt, hash }
function storedAccounts() {
    const saved = readStore(ACCOUNTS_KEY);
    return Array.isArray(saved) ? saved : [];
}

// What the rest of the site sees — never the salt or hash
function profileOf(stored) {
    return {
        id: stored.id,
        firstName: stored.firstName,
        lastName: stored.lastName,
        name: `${stored.firstName} ${stored.lastName}`,
        initials: (stored.firstName[0] + stored.lastName[0]).toUpperCase(),
        email: stored.email,
        phone: stored.phone,
        address: stored.address
    };
}

const sameEmail = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Create an account, sign it in, and return its profile.
// Throws an Error with a message fit to show the visitor.
// Is this email already taken — by a demo account or another signed-up one?
// `exceptId` lets an account keep its own email when editing its details.
function emailTaken(email, exceptId) {
    return DEMO_ACCOUNTS.some((a) => sameEmail(a.email, email))
        || storedAccounts().some((a) => a.id !== exceptId && sameEmail(a.email, email));
}

async function signUp({ firstName, lastName, email, phone, password }) {
    if (emailTaken(email)) {
        throw new Error('That email already has an account. Sign in instead.');
    }

    const { salt, hash } = await hashPassword(password);
    const account = {
        id: `acct-${crypto.randomUUID()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: null,          // filled in after their first order
        salt,
        hash
    };

    writeStore(ACCOUNTS_KEY, [...storedAccounts(), account]);
    writeStore(SESSION_KEY, account.id);
    return profileOf(account);
}

// Check an email and password; sign in and return the profile, or throw
async function signInWithPassword(email, password) {
    if (DEMO_ACCOUNTS.some((a) => sameEmail(a.email, email))) {
        throw new Error("The demo accounts don't use a password — choose one below instead.");
    }

    const account = storedAccounts().find((a) => sameEmail(a.email, email));
    const { hash } = account ? await hashPassword(password, account.salt) : { hash: null };

    // One message for both "no such email" and "wrong password", so the form
    // doesn't tell a stranger which emails have accounts
    if (!account || hash !== account.hash) {
        throw new Error("That email and password don't match an account.");
    }

    writeStore(SESSION_KEY, account.id);
    return profileOf(account);
}

// Only signed-up accounts can be edited — the demo accounts are shared
const canEdit = (account) => !!account && !DEMO_ACCOUNTS.some((d) => d.id === account.id);

// Change the signed-in account's name, email or phone. Throws an Error with
// a message fit to show if the email belongs to someone else.
function updateAccountDetails({ firstName, lastName, email, phone }) {
    const id = readStore(SESSION_KEY);
    const accounts = storedAccounts();
    const account = accounts.find((a) => a.id === id);
    if (!account) throw new Error('Only accounts you created can be edited.');
    if (emailTaken(email, id)) throw new Error('That email already belongs to another account.');

    account.firstName = firstName.trim();
    account.lastName = lastName.trim();
    account.email = email.trim().toLowerCase();
    account.phone = phone.trim();
    writeStore(ACCOUNTS_KEY, accounts);
    return profileOf(account);
}

// Remember a signed-up account's address so their next checkout fills itself in
function saveAccountAddress(address) {
    const id = readStore(SESSION_KEY);
    const accounts = storedAccounts();
    const account = accounts.find((a) => a.id === id);
    if (!account) return;          // guests and the demo account have nothing to update
    account.address = address;
    writeStore(ACCOUNTS_KEY, accounts);
}

/* ---------- Session ---------- */

// The signed-in account, or null for a guest
function currentAccount() {
    const id = readStore(SESSION_KEY);
    const demo = DEMO_ACCOUNTS.find((a) => a.id === id);
    if (demo) return demo;
    const account = storedAccounts().find((a) => a.id === id);
    return account ? profileOf(account) : null;
}

const isSeller = (account) => account?.role === 'seller';

// One click on a demo tile — the shopper demo unless told otherwise
function signIn(account = DEMO_ACCOUNT) {
    writeStore(SESSION_KEY, account.id);
    return account;
}

function signOut() {
    writeStore(SESSION_KEY, null);
}

/* ---------- Bag ---------- */

function loadBag() {
    const saved = readStore(BAG_KEY);
    return Array.isArray(saved) ? saved : [];
}

function saveBag(bag) {
    writeStore(BAG_KEY, bag);
}

/* ---------- Orders ---------- */

// Every account's past orders, newest first: { [accountId]: [order, ...] }.
// Keyed by account id so the demo account keeps its own history too.
// Guests' orders aren't kept — there's no account to show them under.
const ORDERS_KEY = 'venaudio.orders';

function ordersOf(accountId) {
    const all = readStore(ORDERS_KEY) || {};
    return Array.isArray(all[accountId]) ? all[accountId] : [];
}

// Save an order under the signed-in account. Returns false for a guest.
// New orders start at 'processing'; the seller moves them on.
function saveOrder(order) {
    const account = currentAccount();
    if (!account) return false;
    const all = readStore(ORDERS_KEY) || {};
    const record = {
        ...order,
        status: 'processing',
        customer: { name: account.name, email: account.email }
    };
    all[account.id] = [record, ...ordersOf(account.id)];
    writeStore(ORDERS_KEY, all);
    return true;
}

// Every customer's orders in one list, newest first — for the seller.
// Each carries `accountId` so the seller can update the right one.
function allOrders() {
    const all = readStore(ORDERS_KEY) || {};
    return Object.entries(all)
        .flatMap(([accountId, orders]) => (Array.isArray(orders) ? orders : []).map((o) => ({ ...o, accountId })))
        .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));
}

const ORDER_STATUSES = ['processing', 'shipped', 'delivered'];

// The seller marks an order shipped or delivered; the time is kept so the
// shopper's My orders page can say when it happened
function setOrderStatus(accountId, orderId, status) {
    if (!ORDER_STATUSES.includes(status)) return;
    const all = readStore(ORDERS_KEY) || {};
    const order = (all[accountId] || []).find((o) => o.id === orderId);
    if (!order) return;
    order.status = status;
    order[`${status}At`] = new Date().toISOString();
    writeStore(ORDERS_KEY, all);
}

/* ---------- Reviews ----------
   Written on My orders once an order is delivered, one per record per
   order; shown in the record's pop-up on Browse. Each review:
   { id, product, artist, name, rating, text, author, accountId, orderId, date }
   `product` is "title|format" (the same key catalogue.js uses); orders
   placed before it was saved only have the artist and shown name. */

const REVIEWS_KEY = 'venaudio.reviews';
const REVIEW_MAX = 500;   // characters

function allReviews() {
    const saved = readStore(REVIEWS_KEY);
    return Array.isArray(saved) ? saved : [];
}

// This account's review of one record from one order, if written
function reviewFor(accountId, orderId, item) {
    return allReviews().find((r) => r.accountId === accountId && r.orderId === orderId
        && r.artist === item.artist && r.name === item.title) || null;
}

// Save (or replace) the signed-in account's review of a delivered record.
// Throws an Error with a message fit to show.
function saveReview(order, item, rating, text) {
    const account = currentAccount();
    if (!account) throw new Error('Sign in to write a review.');
    if (order.status !== 'delivered') throw new Error('You can review a record once it has arrived.');
    const stars = Math.round(Number(rating));
    if (!(stars >= 1 && stars <= 5)) throw new Error('Pick from one to five stars.');

    const review = {
        id: `rev-${Date.now().toString(36)}`,
        product: item.productTitle ? `${item.productTitle}|${item.format}` : '',
        artist: item.artist,
        name: item.title,
        rating: stars,
        text: String(text || '').trim().slice(0, REVIEW_MAX),
        author: `${account.firstName} ${account.lastName[0].toUpperCase()}.`,
        accountId: account.id,
        orderId: order.id,
        date: new Date().toISOString()
    };
    const others = allReviews().filter((r) => !(r.accountId === account.id && r.orderId === order.id
        && r.artist === item.artist && r.name === item.title));
    writeStore(REVIEWS_KEY, [...others, review]);
    return review;
}

// Every review of one record, newest first
function reviewsOf(key, artist, name) {
    return allReviews()
        .filter((r) => (r.product ? r.product === key : r.artist === artist && r.name === name))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
}

// 4 -> "★★★★☆"
const starText = (rating) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

/* ---------- Trade-ins and store credit ----------
   Shoppers send a trade-in from Contact (photo, records, format,
   condition, copies). Staff accept it on the Seller dashboard, which
   adds store credit to the shopper's account; checkout can spend it.
   Each trade-in:
   { id, accountId, customer: {name, email}, records, format, condition,
     copies, photo, estimate, offer, status, sentAt, decidedAt }
   status: 'pending' -> 'accepted' (offer = credit given) or 'declined' */

const TRADEINS_KEY = 'venaudio.tradeins';
const CREDIT_KEY = 'venaudio.credit';   // { accountId: pesos }

// What a copy is worth in store credit, before its condition
const TRADE_VALUES = { 'Vinyl LP': 400, 'CD': 150, 'Boxset': 600, 'Cassette': 100 };
const TRADE_CONDITIONS = { 'Mint': 1, 'Very Good': 0.6, 'Played to death': 0.15 };
const TRADE_MAX_COPIES = 20;

// Rough offer, rounded to the nearest ₱10. 0 until format and condition are picked.
function tradeEstimate(format, condition, copies) {
    const value = TRADE_VALUES[format];
    const factor = TRADE_CONDITIONS[condition];
    const n = Math.round(Number(copies));
    if (!value || !factor || !(n >= 1)) return 0;
    return Math.round((value * factor * Math.min(n, TRADE_MAX_COPIES)) / 10) * 10;
}

function allTradeIns() {
    const saved = readStore(TRADEINS_KEY);
    return Array.isArray(saved) ? saved : [];
}

const tradeInsOf = (accountId) => allTradeIns()
    .filter((t) => t.accountId === accountId)
    .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));

// Save a new trade-in for the signed-in account. Throws an Error with a
// message fit to show (not signed in, or the browser's storage is full).
function sendTradeIn({ records, format, condition, copies, photo }) {
    const account = currentAccount();
    if (!account) throw new Error('Sign in first — the credit goes on your account.');
    const tradeIn = {
        id: `TRD-${Date.now().toString(36).toUpperCase().slice(-6)}`,
        accountId: account.id,
        customer: { name: account.name, email: account.email },
        records: String(records).trim().slice(0, 200),
        format,
        condition,
        copies: Math.min(Math.round(Number(copies)), TRADE_MAX_COPIES),
        photo,
        estimate: tradeEstimate(format, condition, copies),
        offer: null,
        status: 'pending',
        sentAt: new Date().toISOString()
    };
    writeStore(TRADEINS_KEY, [...allTradeIns(), tradeIn]);
    if (!allTradeIns().some((t) => t.id === tradeIn.id)) {
        throw new Error("Couldn't save it — this browser's storage is full. Try a smaller photo.");
    }
    return tradeIn;
}

// Staff decide: accept with an offer (credited straight away) or decline
function decideTradeIn(id, accept, offer) {
    const all = allTradeIns();
    const tradeIn = all.find((t) => t.id === id);
    if (!tradeIn || tradeIn.status !== 'pending') return null;
    tradeIn.status = accept ? 'accepted' : 'declined';
    tradeIn.offer = accept ? Math.max(0, Math.round(Number(offer))) : null;
    tradeIn.decidedAt = new Date().toISOString();
    writeStore(TRADEINS_KEY, all);
    if (accept) addCredit(tradeIn.accountId, tradeIn.offer);
    return tradeIn;
}

function creditOf(accountId) {
    const balances = readStore(CREDIT_KEY) || {};
    return Number(balances[accountId]) || 0;
}

function addCredit(accountId, amount) {
    const balances = readStore(CREDIT_KEY) || {};
    balances[accountId] = Math.max(0, (Number(balances[accountId]) || 0) + amount);
    writeStore(CREDIT_KEY, balances);
}

/* ---------- Top bar account chip ---------- */

// Fill a .account-chip element: the avatar and first name, linking to My
// account, when signed in; a "Sign in" link back to the landing page otherwise.
// My orders and Sign out live on the account page, which keeps the top bar
// short enough for a phone.
// `next` names the page to come back to after signing in (e.g. 'checkout').
function mountAccountChip(chip, next) {
    if (!chip) return;
    chip.innerHTML = '';

    const account = currentAccount();

    if (!account) {
        const link = document.createElement('a');
        link.href = next ? `index.html?signin&next=${next}` : 'index.html?signin';
        link.className = 'account-signin';
        link.textContent = 'Sign in';
        chip.appendChild(link);
        return;
    }

    const link = document.createElement('a');
    link.href = 'account.html';
    link.className = 'account-link';
    link.setAttribute('aria-label', `My account — signed in as ${account.name}`);
    if (location.pathname.endsWith('account.html')) link.setAttribute('aria-current', 'page');

    const avatar = document.createElement('span');
    avatar.className = 'account-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = account.initials;

    const name = document.createElement('span');
    name.className = 'account-name';
    name.setAttribute('aria-hidden', 'true');   // the link's label already says it
    name.textContent = `Hi, ${account.firstName}`;

    link.append(avatar, name);
    chip.appendChild(link);
}

// Staff get a "Dashboard" tab after Contact in the top bar's links.
// Shoppers never see it.
function mountDashboardTab() {
    const nav = document.querySelector('.topnav');
    if (!nav || !isSeller(currentAccount())) return;
    const tab = document.createElement('a');
    tab.href = 'seller.html';
    tab.textContent = 'Dashboard';
    if (location.pathname.endsWith('seller.html')) tab.setAttribute('aria-current', 'page');
    nav.appendChild(tab);
}

/* ---------- Back button ---------- */

// <a data-back href="browse.html">: go back to the page they came from on
// this site; if they arrived some other way (a typed address, a bookmark, a
// link from elsewhere), the href takes them to Browse instead.
document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (!back) return;
    const cameFromHere = document.referrer.startsWith(location.origin) && document.referrer !== location.href;
    if (cameFromHere && history.length > 1) {
        e.preventDefault();
        history.back();
    }
});

// Fill the account area on every page that has one — including About and
// Contact, which have no script of their own. `next` brings people back to
// this page after signing in.
const thisPage = location.pathname.split('/').pop().replace('.html', '') || 'browse';
mountAccountChip(document.getElementById('account-chip'), thisPage);
mountDashboardTab();

/* ---------- Bag count in the top bar ---------- */

// Browse keeps its own count (browse.js). Every other page shows a link to
// checkout with the saved bag's count, filled in here.
const bagLinkCount = document.querySelector('a.cart-button .cart-count');
if (bagLinkCount) {
    const count = loadBag().reduce((sum, item) => sum + item.qty, 0);
    bagLinkCount.textContent = count;
    bagLinkCount.closest('a').setAttribute('aria-label', `Bag, ${count} ${count === 1 ? 'item' : 'items'} — go to checkout`);
}
