// Contact page: bulk-order total, image-button validation, help prompt.

// Called from the quantity field's oninput attribute.
function multiply(q, p) {
    const result = parseFloat(q.value) * parseFloat(p.value);

    if (isNaN(result) || result < 1) return '';
    return 'Total: $' + result.toFixed(2);
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
