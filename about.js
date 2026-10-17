/* =============================================================
   ABOUT PAGE
   - Top 3 best sellers: the records sold most across every order in
     this browser, each with an <audio> player for its featured song.
     about.html ships with three staff picks so the section works
     before any orders exist (and without JavaScript).
   - "Open now" / "Closed now" beside the counter's hours.
   Needs account.js (allOrders, money) and catalogue.js (seller edits).
   ============================================================= */

const bestList = document.getElementById('best-list');
const bestNote = document.getElementById('best-note');

// The shop's records, read off the Browse page's cards — the one place
// their pictures, songs and previews are written down
async function shopRecords() {
    const response = await fetch('browse.html');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const { edits } = catalogueChanges();
    return [...doc.querySelectorAll('#grid .card')].map((card) => {
        const edit = edits[productKey(card.dataset.title, card.dataset.format)] || {};
        return {
            title: card.dataset.title,
            format: card.dataset.format,
            artist: card.dataset.artist,
            name: card.querySelector('.title').textContent.trim(),
            label: card.dataset.label,
            price: Number.isFinite(edit.price) ? edit.price : Number(card.dataset.price),
            image: card.querySelector('.art img').getAttribute('src'),
            song: card.dataset.song || '',
            preview: card.dataset.preview || '',
            hidden: !!edit.hidden
        };
    });
}

// Copies sold per record, most first. Orders store the card's shown name.
function unitsSold() {
    const units = {};
    allOrders().forEach((order) => order.items.forEach((item) => {
        const key = `${item.artist}|${item.title}`;
        units[key] = (units[key] || 0) + item.qty;
    }));
    return Object.entries(units).sort((a, b) => b[1] - a[1]);
}

function bestItem(record, rank) {
    const li = document.createElement('li');
    li.className = 'best-item';

    const badge = document.createElement('span');
    badge.className = 'best-rank';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = rank;

    const img = document.createElement('img');
    img.className = 'best-cover';
    img.src = record.image;
    img.alt = '';
    img.width = 88;
    img.height = 88;

    const text = document.createElement('div');
    text.className = 'best-text';
    const line = (className, value) => {
        const p = document.createElement('p');
        p.className = className;
        p.textContent = value;
        text.appendChild(p);
        return p;
    };
    line('best-artist', record.artist);
    // The record's name opens its pop-up on Browse (browse.js reads ?record=)
    const nameLink = document.createElement('a');
    nameLink.href = `browse.html?record=${encodeURIComponent(productKey(record.title, record.format))}`;
    nameLink.textContent = record.name;
    line('best-name', '').appendChild(nameLink);
    line('best-meta', `${record.label} · ${money(record.price)}`);

    if (record.preview.startsWith('https://')) {
        const song = line('best-song', 'Featured song: ');
        const name = document.createElement('span');
        name.textContent = record.song;
        song.appendChild(name);

        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = record.preview;
        text.appendChild(audio);
        modernPlayer(audio, record.song);
    }

    li.append(badge, img, text);
    return li;
}

/* ---------- The players ---------- */
// about.html writes plain <audio controls> (they work without JavaScript).
// Here each one gets the shop's own controls instead: a round play button,
// a seek bar and the time. The <audio> still does the playing.
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="icon-play" d="M8 5.5v13l11-6.5z"/><path class="icon-pause" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

const clock = (seconds) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function modernPlayer(audio, song) {
    audio.controls = false;

    const player = document.createElement('div');
    player.className = 'player';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'player-play';
    button.innerHTML = PLAY_ICON;
    button.setAttribute('aria-label', `Play ${song}`);

    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'player-seek';
    seek.min = 0;
    seek.max = 30;          // Apple's previews are 30 seconds; corrected once the file says
    seek.step = 0.1;
    seek.value = 0;
    seek.setAttribute('aria-label', `Position in ${song}`);

    const time = document.createElement('span');
    time.className = 'player-time';

    const show = () => {
        const length = Number(seek.max);
        time.textContent = `${clock(audio.currentTime)} / ${clock(length)}`;
        seek.style.setProperty('--progress', `${(audio.currentTime / length) * 100}%`);
    };

    button.addEventListener('click', () => {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
    });
    audio.addEventListener('play', () => {
        player.classList.add('is-playing');
        button.setAttribute('aria-label', `Pause ${song}`);
    });
    audio.addEventListener('pause', () => {
        player.classList.remove('is-playing');
        button.setAttribute('aria-label', `Play ${song}`);
    });
    audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration)) seek.max = audio.duration;
        show();
    });
    audio.addEventListener('timeupdate', () => {
        seek.value = audio.currentTime;
        show();
    });
    audio.addEventListener('ended', () => {
        audio.currentTime = 0;
    });
    seek.addEventListener('input', () => {
        audio.currentTime = Number(seek.value);
        show();
    });

    show();
    player.append(button, seek, time);
    audio.after(player);
}

// Swap the staff picks for real best sellers, topped up with picks
// when fewer than three different records have sold
async function showBestSellers() {
    const sold = unitsSold();
    if (sold.length === 0) return;   // keep the picks written in about.html

    let records;
    try {
        records = (await shopRecords()).filter((r) => !r.hidden);
    } catch {
        return;   // fetch() can't read browse.html from file:// — keep the picks
    }
    const find = (key) => records.find((r) => `${r.artist}|${r.name}` === key);

    const top = sold.map(([key]) => find(key)).filter(Boolean).slice(0, 3);
    if (top.length === 0) return;

    // Fill any gaps with the picks already on the page, by name
    const picks = [...bestList.querySelectorAll('.best-item')].map((li) =>
        find(`${li.querySelector('.best-artist').textContent}|${li.querySelector('.best-name').textContent}`));
    picks.forEach((pick) => {
        if (top.length < 3 && pick && !top.includes(pick)) top.push(pick);
    });

    bestList.replaceChildren(...top.map((record, i) => bestItem(record, i + 1)));
    bestNote.textContent = 'The records people buy most here. Press play for a 30-second taste.';
}

// One song at a time: starting a player pauses the others on the page
document.addEventListener('play', (e) => {
    document.querySelectorAll('audio').forEach((audio) => {
        if (audio !== e.target) audio.pause();
    });
}, true);   // 'play' doesn't bubble, so listen on the way down

/* ---------- Open now? ---------- */
// The counter keeps Manila time, whatever the visitor's clock says
function updateOpenNow() {
    const status = document.getElementById('visit-status');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila', weekday: 'short', hour: 'numeric', hourCycle: 'h23'
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));

    const weekday = !['Sat', 'Sun'].includes(parts.weekday);
    const hour = Number(parts.hour);
    const open = weekday && hour >= 10 && hour < 18;

    status.textContent = open ? 'Open now' : 'Closed now';
    status.classList.toggle('is-open', open);
    status.hidden = false;
}

// The picks written in about.html get the new controls first
document.querySelectorAll('.best-item audio').forEach((audio) => {
    modernPlayer(audio, audio.closest('.best-item').querySelector('.best-song span').textContent);
});

showBestSellers();
updateOpenNow();
