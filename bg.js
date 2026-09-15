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
