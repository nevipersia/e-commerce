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
    const INTERACTIVE = 'a, area, button, .chip, .art, .title, .add, .view, .mapped,' +
                        ' audio, [role="button"], input[type="image"], input[type="submit"]';

    // Over these the record steps aside and the real cursor comes back:
    // either its shape means something (text bar, help "?", the hand over
    // a dropdown and its options), or we can't follow the mouse in there
    // (an embedded page, the PDF viewer).
    const NATIVE = 'input, textarea, select, option, .help-hint, iframe, object, embed';

    const stylus = document.createElement('div');
    stylus.id = 'stylus';
    stylus.setAttribute('aria-hidden', 'true');
    stylus.appendChild(document.createElement('span'));
    document.body.appendChild(stylus);

    // The one switch between the two cursors. `stylus-on` on <html> is what
    // hides the real cursor (style.css), and it's set only while the record
    // is showing — so there's never a moment with neither. Until the mouse
    // first moves, the real cursor stays.
    function useRecord(on) {
        stylus.classList.toggle('is-ready', on);
        root.classList.toggle('stylus-on', on);
    }

    window.addEventListener('pointermove', (e) => {
        // Straight from the event, with no CSS transition on the parent,
        // so the record sits exactly under the pointer
        stylus.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        stylus.classList.toggle('is-hover', !!e.target.closest(INTERACTIVE));
        useRecord(!e.target.closest(NATIVE));
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

    // The page stops hearing about the mouse when it leaves the window or
    // crosses into an embedded page / PDF — hand back to the real cursor
    // rather than leave the record frozen at the edge.
    document.addEventListener('mouseout', (e) => {
        if (!e.relatedTarget || e.relatedTarget.closest('iframe, object, embed')) useRecord(false);
    });
}

/* ---------- Back to top / go to bottom ---------- */
// Built here rather than written into each page, so all five pages get the
// same pair. The whole control hides itself on pages too short to scroll.
(() => {
    const EDGE = 120;   // how close to an end counts as "already there"

    const nav = document.createElement('div');
    nav.className = 'scroll-nav';

    // One round button. `toTop` picks which end it sends you to.
    function makeButton(toTop, label, glyph) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'scroll-btn';
        button.setAttribute('aria-label', label);
        button.textContent = glyph;

        button.addEventListener('click', () => {
            // Jump instantly for anyone who asked for less motion
            const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({
                top: toTop ? 0 : document.documentElement.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
        });

        return button;
    }

    const up = makeButton(true, 'Back to top', '↑');
    const down = makeButton(false, 'Go to bottom', '↓');
    nav.append(up, down);
    document.body.appendChild(nav);

    // Show the pair only when the page scrolls, and dim whichever
    // direction you are already at.
    function update() {
        const slack = document.documentElement.scrollHeight - window.innerHeight;

        nav.classList.toggle('is-on', slack > EDGE);
        if (slack <= EDGE) return;

        up.classList.toggle('is-off', window.scrollY < EDGE);
        down.classList.toggle('is-off', window.scrollY > slack - EDGE);
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
})();
