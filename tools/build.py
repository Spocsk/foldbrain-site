#!/usr/bin/env python3
"""Génère les pages du site dans chaque langue à partir de src/*.html et i18n/*.json.

    python3 tools/build.py

Le français est à la racine (index.html, privacy.html), les autres langues dans un dossier
chacune (en/, ja/…). Les pages générées sont commitées : GitHub Pages les sert telles quelles.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://spocsk.github.io/foldbrain-site/'

# Code BCP 47 (hreflang, lang), dossier, locale Open Graph, sens d'écriture.
LANGS = [
    ('fr', '', 'fr_FR', 'ltr'),
    ('en', 'en/', 'en_US', 'ltr'),
    ('zh-Hans', 'zh-hans/', 'zh_CN', 'ltr'),
    ('zh-Hant', 'zh-hant/', 'zh_TW', 'ltr'),
    ('hi', 'hi/', 'hi_IN', 'ltr'),
    ('es', 'es/', 'es_ES', 'ltr'),
    ('ar', 'ar/', 'ar_AR', 'rtl'),
    ('bn', 'bn/', 'bn_IN', 'ltr'),
    ('pt-BR', 'pt-br/', 'pt_BR', 'ltr'),
    ('ru', 'ru/', 'ru_RU', 'ltr'),
    ('id', 'id/', 'id_ID', 'ltr'),
    ('ur', 'ur/', 'ur_PK', 'rtl'),
    ('de', 'de/', 'de_DE', 'ltr'),
    ('ja', 'ja/', 'ja_JP', 'ltr'),
]
PAGES = {'index.html': '', 'privacy.html': 'privacy.html'}
# Jours de l'illustration, du lundi au dimanche : joué, parfait, joué, joué, pas joué, joué, aujourd'hui.
DAY_STAMPS = ['', ' stamp--gold', '', '', ' stamp--rest', '', ' stamp--today']
# Textes dont site.js a besoin pour les onglets d'appareils et les répliques de Plio.
SCRIPT_KEYS = ['duo_note', 'duo_title', 'duo_step1', 'duo_step2', 'phone_note', 'phone_title', 'phone_step1',
               'phone_step2', 'pad_note', 'pad_title', 'pad_step1', 'pad_step2', 'plio_cheer', 'plio_tickle']

# Racine en français : premier passage sans choix enregistré, on suit la langue du navigateur.
REDIRECT = """<script>
(function () {
  var paths = %s;
  try {
    if (/bot|crawl|spider|slurp/i.test(navigator.userAgent)) return;
    var choice = localStorage.getItem('fb-lang');
    if (!choice) {
      var tags = navigator.languages || [navigator.language || ''];
      for (var i = 0; i < tags.length && !choice; i++) {
        var t = String(tags[i]).toLowerCase();
        if (/^zh-(tw|hk|mo|hant)/.test(t)) choice = 'zh-Hant';
        else if (/^zh/.test(t)) choice = 'zh-Hans';
        else if (/^pt/.test(t)) choice = 'pt-BR';
        else if (t.split('-')[0] === 'fr' || paths[t.split('-')[0]]) choice = t.split('-')[0];
      }
      choice = choice || 'en';
    }
    if (choice !== 'fr' && paths[choice]) location.replace(paths[choice] + location.hash);
  } catch (e) {}
})();
</script>"""


def load(code):
    return json.loads((ROOT / 'i18n' / f'{code}.json').read_text())


def attr(s):
    return s.replace('"', '&quot;')


def render(template, t, code, folder, og, direction, page, strings):
    depth = '../' if folder else ''
    canonical = BASE + folder + PAGES[page]
    alternates = [f'<link rel="alternate" hreflang="{c}" href="{BASE}{f}{PAGES[page]}">' for c, f, _, _ in LANGS]
    alternates.append(f'<link rel="alternate" hreflang="x-default" href="{BASE}en/{PAGES[page]}">')

    links = []
    for c, f, _, _ in LANGS:
        href = (depth + f + PAGES[page]) or './'
        current = ' aria-current="true"' if c == code else ''
        links.append(f'<a href="{href}" hreflang="{c}" lang="{c}" data-lang="{c}"{current}>{html.escape(strings[c]["_name"])}</a>')
    footer = f"""<footer class="footer">
  <div class="wrap">
    <a class="brand" href="./">Fold Brain</a>
    <nav aria-label="{attr(t['footer_label'])}">
      <a href="privacy.html">{t['privacy']}</a>
      <a href="mailto:apps@dylan-cdo.fr">{t['support']}</a>
    </nav>
    <nav class="langs" aria-label="{attr(t['language'])}">
      {' '.join(links)}
    </nav>
  </div>
</footer>
<script>
for (const a of document.querySelectorAll('[data-lang]')) {{
  a.addEventListener('click', () => {{ try {{ localStorage.setItem('fb-lang', a.dataset.lang); }} catch (e) {{}} }});
}}
</script>"""

    days = '\n        '.join(
        f'<div class="day"><div class="stamp{s}"></div><div class="day-label">{html.escape(d)}</div></div>'
        for s, d in zip(DAY_STAMPS, t['weekdays']))
    paths = {c: f for c, f, _, _ in LANGS if f}
    values = {
        'lang': code, 'dir': direction, 'root': depth, 'canonical': canonical, 'og_locale': og,
        'alternates': '\n'.join(alternates), 'footer': footer, 'days': days,
        'redirect': REDIRECT % json.dumps(paths) if (code == 'fr' and page == 'index.html') else '',
        'script_json': json.dumps({k: t[k] for k in SCRIPT_KEYS}, ensure_ascii=False).replace('</', '<\\/'),
    }

    def fill(m):
        name = m.group(1)
        if name.startswith('t.'):
            key = name[2:]
            if key not in t:
                raise KeyError(f'{code}: clé manquante {key}')
            return attr(t[key])
        return values[name]

    return re.sub(r'\{\{([\w.]+)\}\}', fill, template)


def main():
    strings = {c: load(c) for c, _, _, _ in LANGS}
    reference = set(strings['fr'])
    for c, s in strings.items():
        missing = reference - set(s)
        if missing:
            raise SystemExit(f'{c}: clés manquantes {sorted(missing)}')
    for page in PAGES:
        template = (ROOT / 'src' / page).read_text()
        template = template.replace('<!-- Gabarit : ne pas éditer les pages générées, mais ce fichier et i18n/*.json, puis lancer tools/build.py. -->\n',
                                    '<!-- Page générée par tools/build.py depuis src/ et i18n/ : ne pas éditer à la main. -->\n')
        for code, folder, og, direction in LANGS:
            out = ROOT / folder / page
            out.parent.mkdir(exist_ok=True)
            out.write_text(render(template, strings[code], code, folder, og, direction, page, strings))

    urls = []
    for page, path in PAGES.items():
        for _, folder, _, _ in LANGS:
            alts = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{c}" href="{BASE}{f}{path}"/>' for c, f, _, _ in LANGS)
            urls.append(f'  <url>\n    <loc>{BASE}{folder}{path}</loc>{alts}\n  </url>')
    (ROOT / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + '\n'.join(urls) + '\n</urlset>\n')
    print(f'{len(LANGS)} langues, {len(LANGS) * len(PAGES)} pages, sitemap.xml')


if __name__ == '__main__':
    main()
