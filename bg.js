// Cursor-following radial gradient background
const root = document.documentElement;
let targetX = window.innerWidth / 2;
let targetY = window.innerHeight / 2;
let x = targetX;
let y = targetY;

window.addEventListener('pointermove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
});

function animate() {
    // Ease toward the cursor so the glow trails slightly behind it
    x += (targetX - x) * 0.12;
    y += (targetY - y) * 0.12;
    root.style.setProperty('--mouse-x', `${x}px`);
    root.style.setProperty('--mouse-y', `${y}px`);
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* ---------- Animated record cursor ---------- */
// A CSS `cursor: url()` is a static image, so the animated version has to
// be a real element that chases the pointer. Only worth doing where there
// IS a pointer — on a touch screen we leave the plain PNG cursor alone.
if (window.matchMedia('(pointer: fine)').matches) {

    // Things worth reacting to with the grow-and-spin
    const INTERACTIVE = 'a, button, .chip, .art, .title, .add, .view, .mapped,' +
                        ' audio, [role="button"], input[type="image"], input[type="submit"]';

    // Things whose own cursor shape means something — over these the
    // real cursor stays visible and the record gets out of the way.
    const NATIVE = 'input, textarea, select, .help-hint';

    const stylus = document.createElement('div');
    stylus.id = 'stylus';
    stylus.setAttribute('aria-hidden', 'true');
    stylus.appendChild(document.createElement('span'));
    document.body.appendChild(stylus);
    document.body.classList.add('has-stylus');

    window.addEventListener('pointermove', (e) => {
        // Straight from the event, with no CSS transition on the parent,
        // so the record sits exactly under the pointer
        stylus.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        stylus.classList.add('is-ready');

        stylus.classList.toggle('is-hover', !!e.target.closest(INTERACTIVE));
        stylus.classList.toggle('is-hidden', !!e.target.closest(NATIVE));
    });

    // Press in on mouse-down, and fire the ring outward
    window.addEventListener('pointerdown', () => {
        stylus.classList.add('is-press', 'is-ping');
    });

    window.addEventListener('pointerup', () => {
        stylus.classList.remove('is-press');
    });

    // Re-arm the ring once it has finished, so the next click replays it
    stylus.addEventListener('animationend', (e) => {
        if (e.animationName === 'stylus-ping') stylus.classList.remove('is-ping');
    });

    // Fade out when the pointer leaves the window
    document.addEventListener('mouseleave', () => stylus.classList.remove('is-ready'));
}
