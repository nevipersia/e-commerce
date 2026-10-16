// Contact page: bulk-order total, image-button validation, help prompt.

// Pesos, formatted the same way as the shop and checkout pages
const money = (n) => `₱${n.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;

// Called from the quantity field's oninput attribute.
// q is the quantity input, p the hidden unit price.
function multiply(q, p) {
    const qty = parseInt(q.value, 10);
    const unit = parseFloat(p.value);

    // Empty or nonsense input clears the total rather than printing NaN
    if (isNaN(qty) || isNaN(unit) || qty < 1) return '';

    // min/max only stop the spinner arrows — someone can still type 999,
    // so don't quote for more copies than we actually have
    const stock = Number(q.max) || qty;
    const capped = Math.min(qty, stock);

    return `Total: ${money(capped * unit)}` +
           (capped < qty ? ` — only ${stock} in stock` : '');
}

const helpButton = document.getElementById('help-button');
helpButton.addEventListener('click', () => {
    alert('Fill in your name and email, tell us which pressing you are after, then hit Send message.');
});

// The plain <img> submits only once the address looks like an address.
const btn = document.getElementById('btn');
btn.addEventListener('click', () => {
    const myForm = document.getElementById('myForm');
    const pattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const adr = document.getElementById('adr').value;

    if (!pattern.test(adr)) alert('Invalid Email Address');
    else myForm.submit();
});

// The field starts at 1, but oninput hasn't fired yet — show that first
// total straight away instead of leaving the line blank until someone types.
document.getElementById('qty').dispatchEvent(new Event('input', { bubbles: true }));
