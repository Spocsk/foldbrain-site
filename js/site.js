// Interactions de la landing : onglets d'appareils, bulle et réactions de Plio, lien App Store.

/** Lien de la fiche App Store. Tant que l'app n'est pas publiée, les boutons mènent au prix. */
const APP_STORE_URL = '';

const DEVICES = {
  duo: {
    note: 'iPhone Duo ouvert · un seul écran, plié au centre',
    title: 'Le jeu au-dessus du pli, ton crayon en dessous.',
    where: ['sur la moitié haute, au-dessus du pli', "sur l'ardoise quadrillée de la moitié basse"],
  },
  phone: {
    note: 'iPhone · jeu en haut, ardoise en bas',
    title: 'Le jeu en haut, ton crayon en bas.',
    where: ["en haut de l'écran", "sur l'ardoise quadrillée en bas, au pouce"],
  },
  pad: {
    note: 'iPad + Apple Pencil · jeu à gauche, ardoise à droite',
    title: 'Le jeu à gauche, ton crayon à droite.',
    where: ["sur la partie gauche de l'écran", "sur la grande ardoise de droite, à l'Apple Pencil"],
  },
};

const $ = (s) => document.querySelector(s);

// ── Onglets (flèches gauche / droite comme un vrai tablist) ──
const tabs = [...document.querySelectorAll('.tab')];
function pick(tab, focus) {
  const key = tab.dataset.device;
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
  const d = DEVICES[key];
  $('#device-note').textContent = d.note;
  $('#how-title').textContent = d.title;
  $('#step-1').textContent = "Le jeu s'affiche " + d.where[0] + ', sans geste à faire.';
  $('#step-2').textContent = 'Au doigt ou au stylet, ' + d.where[1] + '.';
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => pick(t));
  t.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) { e.preventDefault(); pick(tabs[(i + step + tabs.length) % tabs.length], true); }
  });
});

// ── Plio ──
const plio = $('#hero-plio');
const bubble = $('#bubble');
function say(text) {
  if (bubble.textContent === text) return;
  bubble.textContent = text;
  bubble.classList.remove('is-new');
  void bubble.offsetWidth;
  bubble.classList.add('is-new');
  if (plio.say) plio.say(text);
}
for (const el of document.querySelectorAll('[data-cheer]')) {
  el.addEventListener('mouseenter', () => { plio.play?.('joie'); say("Bonne idée. Je t'attends."); });
}
plio.addEventListener('click', () => { plio.play?.('victoire'); say('Tu me chatouilles.'); });

// Plio du hero : pas plus large que l'écran sur téléphone.
function fitPlio() {
  const size = Math.round(Math.min(360, window.innerWidth - 48));
  if (plio.getAttribute('size') !== String(size)) plio.setAttribute('size', size);
}
fitPlio();
window.addEventListener('resize', fitPlio);

// ── Lien App Store ──
if (APP_STORE_URL) {
  for (const a of document.querySelectorAll('[data-store]')) a.href = APP_STORE_URL;
}
