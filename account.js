/* =============================================================
   ACCOUNT + SAVED BAG
   Shared by every page that needs to know who's signed in or
   what's in the bag. There is no server: the "account" is a
   single demo profile, and both the session and the bag live
   in localStorage so they survive moving between pages.
   ============================================================= */

// The one mock account offered on the sign-in pop-up.
// The address uses PSGC names (data/ph/) so checkout can prefill it;
// `region` is the PSGC region code.
const DEMO_ACCOUNT = {
    id: 'demo-juan',
    name: 'Juan dela Cruz',
    firstName: 'Juan',
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

const SESSION_KEY = 'vendio.session';
const BAG_KEY = 'vendio.bag.php';   // renamed when prices moved to pesos, so old $ bags are dropped

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

/* ---------- Session ---------- */

// The signed-in account, or null for a guest
function currentAccount() {
    return readStore(SESSION_KEY) === DEMO_ACCOUNT.id ? DEMO_ACCOUNT : null;
}

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
