// Interactions de la landing : onglets d'appareils, bulle et réactions de Plio, lien App Store.

/** Lien de la fiche App Store. Tant que l'app n'est pas publiée, les boutons mènent au prix. */
const APP_STORE_URL = 'https://apps.apple.com/app/id6828494656';

/** Textes de la page dans sa langue, posés par tools/build.py dans <script id="i18n">. */
const T = JSON.parse(document.getElementById('i18n').textContent);

const DEVICES = Object.fromEntries(['duo', 'phone', 'pad'].map((d) => [d, {
  note: T[d + '_note'],
  title: T[d + '_title'],
  steps: [T[d + '_step1'], T[d + '_step2']],
}]));

const $ = (s) => document.querySelector(s);

// ── Onglets (flèches gauche / droite comme un vrai tablist, inversées en arabe et en ourdou) ──
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
  $('#step-1').textContent = d.steps[0];
  $('#step-2').textContent = d.steps[1];
  if (focus) tab.focus();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => pick(t));
  t.addEventListener('keydown', (e) => {
    const forward = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const step = e.key === forward ? 1 : e.key === back ? -1 : 0;
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
  el.addEventListener('mouseenter', () => { plio.play?.('joie'); say(T.plio_cheer); });
}
plio.addEventListener('click', () => { plio.play?.('victoire'); say(T.plio_tickle); });

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
