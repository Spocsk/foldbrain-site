# Fold Brain — site

Landing page de [Fold Brain](https://spocsk.github.io/foldbrain-site/), l'app d'entraînement cérébral pensée pour l'iPhone Duo.

Site statique, sans build : HTML, CSS et un peu de JavaScript. Plio est rendu en 3D avec three.js (chargé depuis unpkg par l'import map de `index.html`).

- `index.html` : la page.
- `privacy.html` : politique de confidentialité (même texte que `PrivacyPolicyView` dans l'app).
- `css/tokens.css` : tokens du design system (palette papier / encre, sombre « tableau noir », typo, ombres).
- `plio/plio-3d.js` : l'élément `<plio-3d>` ; `plio/plio-model.js` : le modèle, porté de `Plio3D.swift`.
- `js/site.js` : onglets d'appareils, réactions de Plio, et `APP_STORE_URL` à renseigner à la sortie de l'app.

## En local

```bash
python3 -m http.server 8080
```

puis http://localhost:8080 (les modules ES ne se chargent pas en `file://`).

Publié par GitHub Pages depuis la branche `main`.
