// Entry pop-up: opens from the logo button, closes on X / backdrop / Escape.
// Three views: welcome, sign in (email + password, or the demo account),
// and create an account. Accounts themselves live in account.js.
const logoButton = document.getElementById('logo-button');
const backdrop = document.getElementById('msgbox-backdrop');
const dialog = document.getElementById('entry-dialog');
const closeButton = document.getElementById('msgbox-close');
const demoTile = document.getElementById('demo-account');

const VIEWS = {
    welcome: { el: document.getElementById('view-welcome'), title: 'msgbox-title' },
    signin:  { el: document.getElementById('view-signin'),  title: 'signin-title' },
    signup:  { el: document.getElementById('view-signup'),  title: 'signup-title' }
};

let lastFocused = null;

// Show one view, hide the others, and put focus on its first field or button
function showView(name) {
    Object.entries(VIEWS).forEach(([key, view]) => { view.el.hidden = key !== name; });
    dialog.setAttribute('aria-labelledby', VIEWS[name].title);
    VIEWS[name].el.querySelector('input, button, a').focus();
}

function openMsgbox(view = 'welcome') {
    lastFocused = document.activeElement;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    showView(view);
}

function closeMsgbox() {
    backdrop.hidden = true;
    document.body.style.overflow = '';
    showView('welcome');
    if (lastFocused) lastFocused.focus();
}

logoButton.addEventListener('click', () => openMsgbox());
closeButton.addEventListener('click', closeMsgbox);

// Click outside the box closes it
backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeMsgbox();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backdrop.hidden) closeMsgbox();
});

// Buttons that switch views: Sign in, Create an account, Back
dialog.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
        showView(btn.dataset.action === 'back' ? 'welcome' : btn.dataset.action);
    });
});

// After signing in or up, carry on wherever the visitor was heading.
// Only pages on this list — never a URL taken straight from the address bar.
const NEXT_PAGES = {
    browse: 'browse.html', about: 'about.html', contact: 'contact.html',
    checkout: 'checkout.html', orders: 'orders.html', account: 'account.html',
    seller: 'seller.html'
};

function goOn() {
    const next = new URLSearchParams(location.search).get('next');
    location.href = NEXT_PAGES[next] || 'browse.html';
}

/* ---------- Demo account ---------- */

document.getElementById('demo-initials').textContent = DEMO_ACCOUNT.initials;
document.getElementById('demo-name').textContent = DEMO_ACCOUNT.name;
document.getElementById('demo-email').textContent = DEMO_ACCOUNT.email;

demoTile.addEventListener('click', () => {
    signIn();
    goOn();
});

// The staff account goes straight to its dashboard
document.getElementById('seller-initials').textContent = DEMO_SELLER.initials;
document.getElementById('seller-name').textContent = DEMO_SELLER.name;
document.getElementById('seller-email').textContent = DEMO_SELLER.email;

document.getElementById('seller-account').addEventListener('click', () => {
    signIn(DEMO_SELLER);
    location.href = 'seller.html';
});

/* ---------- Shared form handling ---------- */

// Show a message in a form's error box and focus the field it's about
function showError(box, message, field) {
    box.textContent = message;
    box.hidden = false;
    if (field) field.focus();
}

// Run an async submit with the button locked, so a slow hash can't be
// double-submitted; any thrown Error becomes the form's error message.
async function submitWith(form, box, work) {
    const button = form.querySelector('button[type="submit"]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'One moment…';
    try {
        await work();
    } catch (err) {
        showError(box, err.message);
    } finally {
        button.disabled = false;
        button.textContent = label;
    }
}

/* ---------- Sign in ---------- */

const signinForm = document.getElementById('signin-form');
const signinError = document.getElementById('signin-error');

signinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signinError.hidden = true;
    const { email, password } = signinForm.elements;

    if (!email.value.trim() || !email.checkValidity()) return showError(signinError, 'Enter the email you signed up with.', email);
    if (!password.value) return showError(signinError, 'Enter your password.', password);

    submitWith(signinForm, signinError, async () => {
        await signInWithPassword(email.value, password.value);
        goOn();
    });
});

/* ---------- Create an account ---------- */

const signupForm = document.getElementById('signup-form');
const signupError = document.getElementById('signup-error');

// "Show passwords" flips both password boxes between hidden and plain text
document.getElementById('signup-show').addEventListener('change', (e) => {
    ['password', 'confirm'].forEach((name) => {
        signupForm.elements[name].type = e.target.checked ? 'text' : 'password';
    });
});

signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signupError.hidden = true;
    const f = signupForm.elements;

    // First problem wins, checked top to bottom like the form reads
    if (!f.firstName.value.trim()) return showError(signupError, 'Enter your first name.', f.firstName);
    if (!f.lastName.value.trim()) return showError(signupError, 'Enter your last name.', f.lastName);
    if (!f.email.value.trim() || !f.email.checkValidity()) return showError(signupError, 'Enter a valid email address.', f.email);
    if (!f.phone.checkValidity()) return showError(signupError, 'Enter a PH mobile number, e.g. 0917 123 4567 — or leave it blank.', f.phone);
    if (f.password.value.length < 8) return showError(signupError, 'Your password needs at least 8 characters.', f.password);
    if (f.confirm.value !== f.password.value) return showError(signupError, "The two passwords don't match.", f.confirm);

    submitWith(signupForm, signupError, async () => {
        await signUp({
            firstName: f.firstName.value,
            lastName: f.lastName.value,
            email: f.email.value,
            phone: f.phone.value,
            password: f.password.value
        });
        goOn();
    });
});

// Other pages link here with ?signin or ?signup to open straight to that form
const params = new URLSearchParams(location.search);
if (params.has('signin')) openMsgbox('signin');
if (params.has('signup')) openMsgbox('signup');
