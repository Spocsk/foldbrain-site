# Fold Brain — site

Landing page de [Fold Brain](https://spocsk.github.io/foldbrain-site/), l'app d'entraînement cérébral pensée pour l'iPhone Duo.

Site statique, sans build : HTML, CSS et un peu de JavaScript. Plio est rendu en 3D avec three.js (chargé depuis unpkg par l'import map de `index.html`).

Le site existe en 14 langues : français à la racine, les autres dans un dossier chacune (`en/`, `ja/`, `ar/`…). Les pages sont **générées** : ne pas éditer `index.html`, `privacy.html` ni les dossiers de langue à la main.

- `src/index.html`, `src/privacy.html` : les gabarits (`{{t.clé}}` = texte traduit).
- `i18n/<langue>.json` : les textes de chaque langue (`fr.json` est la source). La confidentialité (`p_*`) suit `PrivacyPolicyView` dans l'app.
- `tools/build.py` : génère les 28 pages, les balises `hreflang` et `sitemap.xml`. À relancer après toute modification : `python3 tools/build.py`.
- La racine envoie, à la première visite, vers la langue du navigateur (anglais par défaut) ; le choix fait dans le pied de page est retenu dans `localStorage`.
- `css/tokens.css` : tokens du design system (palette papier / encre, sombre « tableau noir », typo, ombres).
- `plio/plio-3d.js` : l'élément `<plio-3d>` ; `plio/plio-model.js` : le modèle, porté de `Plio3D.swift` (cerveau en un maillage sculpté, calculé une fois au chargement du module, environ 100 ms).
- `js/site.js` : onglets d'appareils et réactions de Plio, avec les textes de la page (`<script id="i18n">`).

## En local

```bash
python3 -m http.server 8080
```

puis http://localhost:8080 (les modules ES ne se chargent pas en `file://`).

Publié par GitHub Pages depuis la branche `main`.
