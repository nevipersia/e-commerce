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
async function signUp({ firstName, lastName, email, phone, password }) {
    if (sameEmail(email, DEMO_ACCOUNT.email) || storedAccounts().some((a) => sameEmail(a.email, email))) {
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
    if (sameEmail(email, DEMO_ACCOUNT.email)) {
        throw new Error("The demo account doesn't use a password — choose it below instead.");
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
    if (id === DEMO_ACCOUNT.id) return DEMO_ACCOUNT;
    const account = storedAccounts().find((a) => a.id === id);
    return account ? profileOf(account) : null;
}

// One click on the demo tile
function signIn() {
    writeStore(SESSION_KEY, DEMO_ACCOUNT.id);
    return DEMO_ACCOUNT;
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

/* ---------- Top bar account chip ---------- */

// Fill a .account-chip element: initials + first name and a sign-out
// button when signed in, a "Sign in" link back to the landing page otherwise.
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

    const avatar = document.createElement('span');
    avatar.className = 'account-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = account.initials;

    const name = document.createElement('span');
    name.className = 'account-name';
    name.textContent = `Hi, ${account.firstName}`;

    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'account-signout';
    out.textContent = 'Sign out';
    out.addEventListener('click', () => {
        signOut();
        mountAccountChip(chip, next);
        chip.dispatchEvent(new CustomEvent('account-change', { bubbles: true }));
    });

    chip.append(avatar, name, out);
}
