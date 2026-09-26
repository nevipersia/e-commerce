// Entry pop-up: opens from the logo button, closes on X / backdrop / Escape.
const logoButton = document.getElementById('logo-button');
const backdrop = document.getElementById('msgbox-backdrop');
const dialog = document.getElementById('entry-dialog');
const closeButton = document.getElementById('msgbox-close');
const note = document.getElementById('msgbox-note');
const welcomeView = document.getElementById('view-welcome');
const signinView = document.getElementById('view-signin');
const demoTile = document.getElementById('demo-account');

let lastFocused = null;

// Swap which view the pop-up shows and move focus into it
function showView(view) {
    welcomeView.hidden = view !== welcomeView;
    signinView.hidden = view !== signinView;
    dialog.setAttribute('aria-labelledby', view === signinView ? 'signin-title' : 'msgbox-title');
    view.querySelector('button, a').focus();
}

function openMsgbox(view = welcomeView) {
    lastFocused = document.activeElement;
    backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    showView(view);
}

function closeMsgbox() {
    backdrop.hidden = true;
    document.body.style.overflow = '';
    note.hidden = true;
    showView(welcomeView);
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

// Fill the demo tile from the shared account
document.getElementById('demo-initials').textContent = DEMO_ACCOUNT.initials;
document.getElementById('demo-name').textContent = DEMO_ACCOUNT.name;
document.getElementById('demo-email').textContent = DEMO_ACCOUNT.email;

dialog.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'signin') showView(signinView);
        if (action === 'back') showView(welcomeView);
        if (action === 'signup') note.hidden = false;   // no sign-up flow yet
    });
});

// Clicking the account signs in and heads wherever the visitor was going
demoTile.addEventListener('click', () => {
    signIn();
    const next = new URLSearchParams(location.search).get('next');
    location.href = next === 'checkout' ? 'checkout.html' : 'browse.html';
});

// Other pages link here with ?signin to jump straight to the account picker
if (new URLSearchParams(location.search).has('signin')) {
    openMsgbox(signinView);
}
