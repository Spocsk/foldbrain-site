// <plio-3d> — Plio en 3D temps réel, intégrable partout (cartes, écrans, bulles).
// Un seul moteur WebGL partagé dessine toutes les instances de la page dans leur propre <canvas> 2D :
// on peut afficher 8, 20 Plio sans saturer les contextes WebGL.
//
// Prérequis : l'import map three@0.184.0 dans <head>, puis
//   <script type="module" src="plio/plio-3d.js"></script>
//
// Attributs : mood (neutre|content|surpris|reflechit|encourage|fier|triste|endormi) · size (px, défaut 160)
//             anim (joue une animation au montage) · follow (regard suit le pointeur dans la page)
//             still (fige la pose : pas de respiration, pas de clignement) · outline="off" · halftone="off"
// Méthodes  : el.setMood(m) · el.play(nom) · el.say(texte) · el.look(x, y) · el.unlook()
// Événement : 'plio-ready'
import * as THREE from 'three';
import { createPlio, MOODS, ANIMS } from './plio-model.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let engine = null;
function getEngine() {
  if (engine) return engine;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const items = new Set();
  let last = performance.now(), elapsed = 0;
  const loop = () => {
    const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.05); last = now; elapsed += dt; const t = elapsed;
    items.forEach((it) => { if (it.visible) it.frame(dt, t); });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  engine = { renderer, items };
  return engine;
}

/** Ombre portée : tache d'encre au centre, fondue jusqu'au bord (partagée). */
let shadowTex = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(43,38,33,0.2)'); grad.addColorStop(0.5, 'rgba(43,38,33,0.14)'); grad.addColorStop(1, 'rgba(43,38,33,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  shadowTex = new THREE.CanvasTexture(c); shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0xd8c6a8, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.6, 2.6, 2.4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe2cc, 0.8); rim.position.set(-2, 1.2, -1.5); scene.add(rim);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; shadow.scale.set(1.15, 0.8, 1); shadow.renderOrder = -1; scene.add(shadow);
  return { scene, shadow };
}

class Plio3D extends HTMLElement {
  static get observedAttributes() { return ['mood', 'size', 'outline', 'halftone']; }
  connectedCallback() {
    if (this._init) return; this._init = true;
    const size = parseInt(this.getAttribute('size') || '160', 10);
    this.style.display = this.style.display || 'inline-block';
    this.style.lineHeight = '0';
    this.setAttribute('role', 'img');
    this.c2 = document.createElement('canvas');
    this.c2.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
    this.appendChild(this.c2);
    this._resize(size);
    const E = getEngine();
    const pr = Math.min(devicePixelRatio || 1, 2);
    this.plio = createPlio(THREE, { pixelRatio: pr, reducedMotion: reduced || this.hasAttribute('still'), size });
    const { scene, shadow } = makeScene();
    this.scene = scene; this.shadow = shadow; scene.add(this.plio.root);
    this.plio.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // Un peu plus large que la case de l'app : Plio saute sans être coupé.
    this.cam = new THREE.PerspectiveCamera(30, 1.2, 0.1, 50);
    this.cam.position.set(0.55, 0.95, 4.1); this.cam.lookAt(0, 0.58, 0);
    this.plio.pose(this.getAttribute('mood') || 'neutre');
    this._label();
    this.visible = true;
    this._io = new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible && this.frame) this.frame(0.016, 0); }); this._io.observe(this);
    this.frame = (dt, t) => {
      const still = this.hasAttribute('still');
      this.plio.update(still ? 0.0001 : dt, t);
      this.shadow.scale.set(1.15 * (1 - this.plio.root.children[0].position.y * 0.8), 0.8 * (1 - this.plio.root.children[0].position.y * 0.8), 1);
      const r = E.renderer, w = this.c2.width, h = this.c2.height;
      if (r.domElement.width < w || r.domElement.height < h) r.setSize(Math.max(w, r.domElement.width), Math.max(h, r.domElement.height), false);
      r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h); r.setScissorTest(true);
      this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
      r.clear(); r.render(this.scene, this.cam);
      const g = this.c2.getContext('2d'); g.clearRect(0, 0, w, h);
      g.drawImage(r.domElement, 0, r.domElement.height - h, w, h, 0, 0, w, h);
    };
    E.items.add(this); this.frame(0.016, 0);
    if (this.hasAttribute('follow')) {
      this._pm = (e) => { const b = this.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height * 0.45;
        this.plio.look(Math.max(-1, Math.min(1, (e.clientX - cx) / 300)), Math.max(-1, Math.min(1, -(e.clientY - cy) / 300))); };
      window.addEventListener('pointermove', this._pm);
    }
    if (this.getAttribute('outline') === 'off') this.plio.setOutline(false);
    if (this.getAttribute('halftone') === 'off') this.plio.setHalftone(false);
    const a = this.getAttribute('anim'); if (a) setTimeout(() => this.play(a), 250);
    this.dispatchEvent(new Event('plio-ready'));
  }
  disconnectedCallback() { if (engine) engine.items.delete(this); this._io && this._io.disconnect(); this._pm && window.removeEventListener('pointermove', this._pm); this._init = false; this.innerHTML = ''; }
  attributeChangedCallback(n, o, v) {
    if (!this.plio) return;
    if (n === 'mood') { this.plio.setMood(v || 'neutre'); this._label(); }
    if (n === 'size') this._resize(parseInt(v || '160', 10));
    if (n === 'outline') this.plio.setOutline(v !== 'off');
    if (n === 'halftone') this.plio.setHalftone(v !== 'off');
  }
  _resize(size) {
    const pr = Math.min(devicePixelRatio || 1, 2);
    this.style.width = size + 'px'; this.style.height = Math.round(size * 1.0) + 'px';
    this.c2.width = Math.round(size * pr); this.c2.height = Math.round(size * pr);
  }
  _label() { this.setAttribute('aria-label', 'Plio, ' + (this.getAttribute('mood') || 'neutre')); }
  setMood(m) { this.setAttribute('mood', m); }
  play(name) { this.plio && this.plio.play(name); }
  say(text) { this.plio && this.plio.say(text); }
  look(x, y) { this.plio && this.plio.look(x, y); }
  unlook() { this.plio && this.plio.unlook(); }
  get mood() { return this.plio ? this.plio.mood : this.getAttribute('mood'); }
}
if (!customElements.get('plio-3d')) customElements.define('plio-3d', Plio3D);
export { MOODS, ANIMS };
