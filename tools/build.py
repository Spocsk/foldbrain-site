#!/usr/bin/env python3
"""Génère les pages du site dans chaque langue à partir de src/*.html et i18n/*.json.

    python3 tools/build.py

Le français est à la racine (index.html, privacy.html), les autres langues dans un dossier
chacune (en/, ja/…). Les pages générées sont commitées : GitHub Pages les sert telles quelles.
"""
import datetime
import html
import json
import re
import subprocess
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
    ('ar', 'ar/', 'ar_SA', 'rtl'),
    ('bn', 'bn/', 'bn_IN', 'ltr'),
    ('pt-BR', 'pt-br/', 'pt_BR', 'ltr'),
    ('ru', 'ru/', 'ru_RU', 'ltr'),
    ('id', 'id/', 'id_ID', 'ltr'),
    ('ur', 'ur/', 'ur_PK', 'rtl'),
    ('de', 'de/', 'de_DE', 'ltr'),
    ('ja', 'ja/', 'ja_JP', 'ltr'),
    ('tr', 'tr/', 'tr_TR', 'ltr'),
    ('vi', 'vi/', 'vi_VN', 'ltr'),
    ('ko', 'ko/', 'ko_KR', 'ltr'),
    ('it', 'it/', 'it_IT', 'ltr'),
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
  var paths = __PATHS__, page = __PAGE__;
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
    if (choice !== 'fr' && paths[choice]) location.replace(paths[choice] + page + location.hash);
  } catch (e) {}
})();
</script>"""


def load(code):
    return json.loads((ROOT / 'i18n' / f'{code}.json').read_text(encoding='utf-8'))


def attr(s):
    """Texte traduit dans un attribut ou un nœud texte : tout est échappé (un traducteur ne casse pas la page)."""
    return html.escape(s, quote=True)


def last_change():
    """Date du dernier commit (lastmod du sitemap), aujourd'hui hors dépôt git."""
    try:
        return subprocess.run(['git', 'log', '-1', '--format=%cs'], cwd=ROOT, capture_output=True,
                              text=True, check=True).stdout.strip() or str(datetime.date.today())
    except (OSError, subprocess.CalledProcessError):
        return str(datetime.date.today())


def head_meta(t, code, og, page, canonical, depth, alternates):
    """Balises communes : canonical, hreflang, Open Graph, carte Twitter, icônes, données structurées."""
    if page == 'index.html':
        title, desc = t['og_title'], t['og_description']
    else:
        title, desc = t['privacy_meta_title'], t['privacy_meta_description']
    image = BASE + 'img/og.png'
    others = '\n'.join(f'<meta property="og:locale:alternate" content="{o}">' for c, _, o, _ in LANGS if c != code)
    tags = f"""<link rel="canonical" href="{canonical}">
{alternates}
<meta property="og:site_name" content="Fold Brain">
<meta property="og:title" content="{attr(title)}">
<meta property="og:description" content="{attr(desc)}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{attr(t['og_image_alt'])}">
<meta property="og:url" content="{canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="{og}">
{others}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{attr(title)}">
<meta name="twitter:description" content="{attr(desc)}">
<meta name="twitter:image" content="{image}">
<link rel="icon" href="{depth}img/icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="{depth}img/apple-touch-icon.png">"""
    if page == 'index.html':
        app = {
            '@context': 'https://schema.org', '@type': 'MobileApplication', 'name': 'Fold Brain',
            'operatingSystem': 'iOS', 'applicationCategory': 'EducationalApplication',
            'inLanguage': code, 'url': canonical, 'image': image, 'description': t['meta_description'],
            'author': {'@type': 'Person', 'name': 'Dylan Couto de Oliveira'},
            # Téléchargement gratuit, achat intégré ensuite : pas de prix figé ici (il varie selon le pays).
            'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'EUR', 'description': t['cta_note']},
        }
        tags += '\n<script type="application/ld+json">' + json.dumps(app, ensure_ascii=False).replace('</', '<\\/') + '</script>'
    return tags


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
        'head_meta': head_meta(t, code, og, page, canonical, depth, '\n'.join(alternates)),
        'alternates': '\n'.join(alternates), 'footer': footer, 'days': days,
        # Captures de l'app : en français sur la page française, en anglais ailleurs.
        'shots': 'fr' if code == 'fr' else 'en',
        'redirect': REDIRECT.replace('__PATHS__', json.dumps(paths)).replace('__PAGE__', json.dumps(PAGES[page])) if code == 'fr' else '',
        'script_json': json.dumps({k: t[k] for k in SCRIPT_KEYS}, ensure_ascii=False).replace('</', '<\\/'),
    }

    def fill(m):
        name, raw = m.group(1), m.group(2) == '|html'
        if name.startswith('t.'):
            key = name[2:]
            if key not in t:
                raise KeyError(f'{code}: clé manquante {key}')
            # `{{t.clé|html}}` : texte qui contient volontairement des liens (politique de confidentialité).
            return t[key] if raw else attr(t[key])
        return values[name]

    out = re.sub(r'\{\{([\w.]+)(\|html)?\}\}', fill, template)
    left = re.findall(r'\{\{[^}]*\}\}', out)
    if left:
        raise SystemExit(f'{code}/{page}: balises non remplacées {left}')
    return out


def main():
    strings = {c: load(c) for c, _, _, _ in LANGS}
    reference = set(strings['fr'])
    for c, s in strings.items():
        missing, extra = reference - set(s), set(s) - reference
        if missing:
            raise SystemExit(f'{c}: clés manquantes {sorted(missing)}')
        if extra:
            raise SystemExit(f'{c}: clés absentes du français {sorted(extra)}')
    for page in PAGES:
        template = (ROOT / 'src' / page).read_text(encoding='utf-8')
        template = template.replace('<!-- Gabarit : ne pas éditer les pages générées, mais ce fichier et i18n/*.json, puis lancer tools/build.py. -->\n',
                                    '<!-- Page générée par tools/build.py depuis src/ et i18n/ : ne pas éditer à la main. -->\n')
        for code, folder, og, direction in LANGS:
            out = ROOT / folder / page
            out.parent.mkdir(exist_ok=True)
            out.write_text(render(template, strings[code], code, folder, og, direction, page, strings), encoding='utf-8')

    urls, lastmod = [], last_change()
    for page, path in PAGES.items():
        alts = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{c}" href="{BASE}{f}{path}"/>' for c, f, _, _ in LANGS)
        alts += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{BASE}en/{path}"/>'
        for _, folder, _, _ in LANGS:
            urls.append(f'  <url>\n    <loc>{BASE}{folder}{path}</loc>\n    <lastmod>{lastmod}</lastmod>{alts}\n  </url>')
    (ROOT / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + '\n'.join(urls) + '\n</urlset>\n', encoding='utf-8')
    (ROOT / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {BASE}sitemap.xml\n', encoding='utf-8')

    # 404 de GitHub Pages : une seule page, servie à toutes les profondeurs (chemins absolus).
    # Le texte suit la langue du dossier demandé, sinon celle du navigateur, sinon l'anglais.
    nf = {c: {'title': strings[c]['nf_title'], 'text': strings[c]['nf_text'], 'home': strings[c]['nf_home'],
              'href': '/foldbrain-site/' + f, 'dir': d} for c, f, _, d in LANGS}
    folders = {f.rstrip('/'): c for c, f, _, _ in LANGS if f}
    en = strings['en']
    links = ' '.join(f'<a href="/foldbrain-site/{f}" hreflang="{c}" lang="{c}">{html.escape(strings[c]["_name"])}</a>' for c, f, _, _ in LANGS)
    (ROOT / '404.html').write_text(f"""<!doctype html>
<!-- Page générée par tools/build.py : ne pas éditer à la main. -->
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{attr(en['nf_title'])} — Fold Brain</title>
<link rel="icon" href="/foldbrain-site/img/icon-32.png" sizes="32x32" type="image/png">
<link rel="stylesheet" href="/foldbrain-site/css/tokens.css">
<link rel="stylesheet" href="/foldbrain-site/css/site.css">
</head>
<body>
<header class="wrap nav">
  <a class="brand" href="/foldbrain-site/"><img src="/foldbrain-site/img/logo-72.webp" alt="" width="36" height="36">Fold Brain</a>
</header>
<main class="wrap doc notfound">
  <h1 id="nf-title">{html.escape(en['nf_title'])}</h1>
  <p id="nf-text">{html.escape(en['nf_text'])}</p>
  <p><a class="btn" id="nf-home" href="/foldbrain-site/en/">{html.escape(en['nf_home'])}</a></p>
  <nav class="langs" aria-label="{attr(en['language'])}">{links}</nav>
</main>
<script>
(function () {{
  var nf = {json.dumps(nf, ensure_ascii=False).replace('</', '<\\/')}, folders = {json.dumps(folders)};
  var seg = location.pathname.split('/')[2] || '', code = folders[seg];
  if (!code) {{
    var tag = String((navigator.languages || [navigator.language || 'en'])[0]).toLowerCase();
    code = /^zh-(tw|hk|mo|hant)/.test(tag) ? 'zh-Hant' : /^zh/.test(tag) ? 'zh-Hans' : /^pt/.test(tag) ? 'pt-BR' : tag.split('-')[0];
  }}
  var t = nf[code] || nf.en;
  document.documentElement.lang = code in nf ? code : 'en';
  document.documentElement.dir = t.dir;
  document.title = t.title + ' — Fold Brain';
  document.getElementById('nf-title').textContent = t.title;
  document.getElementById('nf-text').textContent = t.text;
  var home = document.getElementById('nf-home'); home.textContent = t.home; home.href = t.href;
}})();
</script>
</body>
</html>
""", encoding='utf-8')
    print(f'{len(LANGS)} langues, {len(LANGS) * len(PAGES)} pages, sitemap.xml, robots.txt, 404.html')


if __name__ == '__main__':
    main()
