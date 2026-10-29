// Plio en three.js, porté de FoldBrain/Design/Plio3D.swift (même anatomie, mêmes humeurs, mêmes animations).
// Ombrage toon à 3 paliers, contour encre par coque inversée, trame demi-ton dans les ombres.
//
// createPlio(THREE, { pixelRatio, reducedMotion, size }) → {
//   root, mood, pose(m), setMood(m), play(nom), look(x, y), unlook(), say(texte), update(dt, t),
//   setOutline(bool), setHalftone(bool)
// }
// root.children[0] est le corps (pivot aux pieds) : <plio-3d> s'en sert pour l'ombre portée.

export const MOODS = ['neutre', 'content', 'surpris', 'reflechit', 'encourage', 'fier', 'triste', 'endormi'];

const DURATION = { clin: 0.18, joie: 0.95, triste: 2.2, reflexion: 2.0, dodo: 1.6, reveil: 1.4, victoire: 2.6, choc: 0.9, poke: 0.5, vol: 0.9, etourdi: 2.6 };
export const ANIMS = Object.keys(DURATION);
/** Jamais deux animations fortes en moins de 3 s ; avec « réduire les animations », elles deviennent un simple rebond. */
const STRONG = new Set(['joie', 'victoire', 'reveil']);

const COLORS = {
  rose: 0xEBA79F, sillon: 0xB8615A, encre: 0x2B2621, oeil: 0xFBF6EA, joue: 0xE07A6E,
  bouche: 0x4A2326, langue: 0xE8704A, larme: 0x6E9BD6,
};

// Proportions (unités de scène) : ellipsoïde 1,2 × 0,92 × 1, visage à 48 % de sa hauteur.
const BRAIN = [0.6, 0.46, 0.5];
const TORSO_Y = 0.74, EYE_X = 0.17, EYE_Y = 0.05, MOUTH_Y = -0.09;

/** Tout ce qu'une humeur règle : yeux, sourcils, joues, bras (écartement, avant), inclinaison. */
function poseOf(mood) {
  const p = { eyeOpen: 1, pupil: 1, lookX: 0, lookY: 0, browY: 0, browAngle: 0, cheek: 0.35, armL: [0.25, 0], armR: [0.25, 0], tiltX: 0, tiltZ: 0, drop: 0, tear: 0 };
  switch (mood) {
    case 'content': Object.assign(p, { eyeOpen: 0.8, browY: 0.02, cheek: 0.7, armL: [2.1, 0.2], armR: [2.1, 0.2], tiltX: -0.05 }); break;
    case 'surpris': Object.assign(p, { eyeOpen: 1.25, pupil: 0.7, browY: 0.05, browAngle: 0.1, cheek: 0.3, armL: [1.1, 0.3], armR: [1.1, 0.3], tiltX: -0.08 }); break;
    case 'reflechit': Object.assign(p, { eyeOpen: 0.6, lookX: 0.35, lookY: 0.45, browAngle: -0.12, cheek: 0.25, armL: [0.2, 0], armR: [0.9, 1.2], tiltZ: -0.08 }); break;
    case 'encourage': Object.assign(p, { pupil: 1.05, browY: 0.01, browAngle: -0.2, cheek: 0.6, armR: [2.4, 0.2], tiltZ: 0.05 }); break;
    case 'fier': Object.assign(p, { eyeOpen: 0.7, browY: 0.02, browAngle: -0.1, cheek: 0.7, armL: [0.75, -0.3], armR: [0.75, -0.3], tiltX: -0.1 }); break;
    case 'triste': Object.assign(p, { eyeOpen: 0.85, lookY: -0.5, browY: -0.01, browAngle: 0.35, cheek: 0.2, armL: [0.05, 0.2], armR: [0.05, 0.2], tiltX: 0.12, drop: 0.03, tear: 1 }); break;
    case 'endormi': Object.assign(p, { eyeOpen: 0.06, cheek: 0.5, armL: [0.15, 0], armR: [0.15, 0], tiltZ: 0.15, drop: 0.02 }); break;
  }
  return p;
}

const clonePose = (p) => ({ ...p, armL: [...p.armL], armR: [...p.armR] });

function approach(p, t, k) {
  for (const key of Object.keys(t)) {
    if (Array.isArray(t[key])) { p[key][0] += (t[key][0] - p[key][0]) * k; p[key][1] += (t[key][1] - p[key][1]) * k; }
    else p[key] += (t[key] - p[key]) * k;
  }
}

function mouthOf(mood) {
  switch (mood) {
    case 'content': return { kind: 'open', w: 0.16, h: 0.07 };
    case 'surpris': return { kind: 'oval', w: 0.045, h: 0.055 };
    case 'reflechit': return { kind: 'line', w: 0.08, slant: -0.012 };
    case 'encourage': return { kind: 'open', w: 0.15, h: 0.065 };
    case 'fier': return { kind: 'smile', w: 0.15, d: 0.035 };
    case 'triste': return { kind: 'frown', w: 0.1, d: 0.025 };
    case 'endormi': return { kind: 'oval', w: 0.028, h: 0.026 };
    default: return { kind: 'smile', w: 0.11, d: 0.025 };
  }
}

const smoothstep = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const easeOut = (x) => { const t = Math.min(Math.max(x, 0), 1); return 1 - (1 - t) ** 3; };

/** Point de la surface du cerveau : φ autour de l'axe vertical depuis l'avant, θ en hauteur (degrés). */
function onBrain(phi, theta, k = 1) {
  const p = phi * Math.PI / 180, t = theta * Math.PI / 180;
  return [BRAIN[0] * Math.cos(t) * Math.sin(p) * k, BRAIN[1] * Math.sin(t) * k, BRAIN[2] * Math.cos(t) * Math.cos(p) * k];
}

/** Point de la face avant à (x, y), décollé de `lift` le long de la profondeur. */
function surface(x, y, lift) {
  const q = 1 - (x / BRAIN[0]) ** 2 - (y / BRAIN[1]) ** 2;
  return [x, y, BRAIN[2] * Math.sqrt(Math.max(q, 0)) + lift];
}

const VERT = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform vec3 color;
uniform vec3 keyDir;
uniform vec3 rimDir;
uniform float halftone;
uniform float cellPx;
varying vec3 vNormal;
void main() {
  vec3 nv = normalize(vNormal);
  vec3 n = normalize((vec4(nv, 0.0) * viewMatrix).xyz);
  float ndl = dot(n, keyDir);
  float tier = ndl > 0.2 ? 1.0 : (ndl > -0.3 ? 0.72 : 0.5);
  vec3 c = color * tier;
  if (tier < 0.99 && halftone > 0.5) {
    vec2 cell = fract(gl_FragCoord.xy / cellPx) - 0.5;
    float r = tier < 0.6 ? 0.3 : 0.2;
    float d = 1.0 - smoothstep(r - 0.08, r + 0.08, length(cell));
    c *= 1.0 - 0.22 * d;
  }
  float rim = smoothstep(0.55, 0.75, dot(n, rimDir)) * (1.0 - smoothstep(0.1, 0.5, nv.z));
  c += rim * 0.06;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function createPlio(THREE, opts = {}) {
  const pixelRatio = opts.pixelRatio || 1;
  const reducedMotion = !!opts.reducedMotion;
  const slotSize = opts.size || 160;
  const amp = reducedMotion ? 0.3 : 1;

  const toonMats = [];
  const toon = (hex, halftone) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        color: { value: new THREE.Color(hex) },
        keyDir: { value: new THREE.Vector3(1.6, 2.6, 2.4).normalize() },
        rimDir: { value: new THREE.Vector3(-2, 1.2, -1.5).normalize() },
        // Trame à 6,5 pt d'écart, seulement quand Plio est assez grand pour qu'elle se lise.
        halftone: { value: halftone && slotSize >= 72 ? 1 : 0 },
        cellPx: { value: 6.5 * pixelRatio },
      },
      side: THREE.DoubleSide,
    });
    m.userData.halftone = halftone;
    toonMats.push(m);
    return m;
  };
  const flat = (hex, extra = {}) => new THREE.MeshBasicMaterial({ color: hex, ...extra });

  const rose = toon(COLORS.rose, true);
  const sillon = toon(COLORS.sillon, true);
  const white = toon(COLORS.oeil, false);
  const ink = flat(COLORS.encre);
  const hullMat = flat(COLORS.encre, { side: THREE.BackSide });

  const unitSphere = new THREE.SphereGeometry(1, 40, 28);
  const sphere = (mat, s) => { const m = new THREE.Mesh(unitSphere, mat); m.scale.set(s[0], s[1], s[2]); return m; };

  // Contour : coque gonflée, faces avant masquées. Épaisseur = fraction du rayon, avec un minimum à l'écran.
  const worldPerPoint = 2 * 4.15 * Math.tan(13 * Math.PI / 180) / Math.max(slotSize, 1);
  const hulls = [];
  const outline = (mesh, radius, fraction = 0.016, minPoints = 1.3) => {
    const hull = new THREE.Mesh(mesh.geometry, hullMat);
    const width = Math.max(fraction * radius, minPoints * worldPerPoint);
    hull.scale.setScalar(1 + width / radius);
    mesh.add(hull);
    hulls.push(hull);
  };
  const eyeLine = [0.009, 0.9];

  /** Tourne l'objet pour que son axe z suive la normale de l'ellipsoïde. */
  const orient = (obj, p) => {
    const n = new THREE.Vector3(p[0] / BRAIN[0] ** 2, p[1] / BRAIN[1] ** 2, p[2] / BRAIN[2] ** 2).normalize();
    obj.rotation.set(-Math.asin(n.y), Math.atan2(n.x, n.z), 0, 'YXZ');
  };

  /** Tube fin le long d'une courbe, effilé aux deux bouts. */
  const tube = (pts, radius, sides = 6) => {
    const pos = [], nor = [], idx = [];
    const v = pts.map((p) => new THREE.Vector3(...p));
    v.forEach((p, i) => {
      const t = v[Math.min(i + 1, v.length - 1)].clone().sub(v[Math.max(i - 1, 0)]).normalize();
      const n1 = t.clone().cross(p.clone().normalize()).normalize();
      const n2 = n1.clone().cross(t);
      const f = i / (v.length - 1);
      const r = radius * Math.min(1, Math.sin(f * Math.PI) * 1.6 + 0.25);
      for (let s = 0; s < sides; s++) {
        const a = s / sides * 2 * Math.PI;
        const d = n1.clone().multiplyScalar(Math.cos(a)).add(n2.clone().multiplyScalar(Math.sin(a)));
        pos.push(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r);
        nor.push(d.x, d.y, d.z);
      }
    });
    for (let i = 0; i < v.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = i * sides + s, b = i * sides + (s + 1) % sides, c = a + sides, d = b + sides;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  };

  // ── Construction ──
  const root = new THREE.Group();
  const body = new THREE.Group();   // pivot aux pieds : saut, écrasement, rotation
  const torso = new THREE.Group();  // centre du cerveau : respiration
  body.rotation.order = 'YXZ';
  root.add(body);
  body.add(torso);

  // Jambes : moignons et pieds ovales.
  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.26, 24);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, rose);
    leg.position.set(side * 0.17, 0.19, 0);
    outline(leg, 0.06);
    body.add(leg);
    const foot = sphere(rose, [0.1, 0.055, 0.13]);
    foot.position.set(side * 0.17, 0.05, 0.04);
    outline(foot, 0.055);
    body.add(foot);
  }

  // Cerveau : ellipsoïde, 9 lobes par hémisphère, fissure centrale, 6 sillons par côté.
  const brainMesh = sphere(rose, BRAIN);
  outline(brainMesh, BRAIN[1]);
  torso.add(brainMesh);
  const lobes = [[40, 45, 0.17], [90, 45, 0.19], [140, 40, 0.18], [60, 75, 0.15], [140, 72, 0.15], [170, 50, 0.16], [75, 10, 0.17], [115, 5, 0.17], [160, 15, 0.16]];
  const sulci = [[[62, 20], [64, 66]], [[113, 12], [112, 62]], [[60, 27], [150, 26]], [[95, 62], [125, 60]], [[155, 25], [157, 62]], [[40, 62], [48, 76]]];
  for (const side of [-1, 1]) {
    for (const [phi, theta, r] of lobes) {
      const lobe = sphere(rose, [r, r, r]);
      lobe.position.set(...onBrain(side * phi, theta, 0.84));
      outline(lobe, r);
      torso.add(lobe);
    }
    for (const [from, to] of sulci) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14, wiggle = Math.sin(u * Math.PI * 3) * 4;
        pts.push(onBrain(side * (from[0] + (to[0] - from[0]) * u + wiggle), from[1] + (to[1] - from[1]) * u - wiggle * 0.5, 1.06));
      }
      torso.add(new THREE.Mesh(tube(pts, 0.019), sillon));
    }
  }
  const fissure = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20, alpha = (50 + 100 * u) * Math.PI / 180;
    fissure.push([Math.sin(u * Math.PI * 5) * 0.012, BRAIN[1] * Math.sin(alpha), BRAIN[2] * Math.cos(alpha)]);
  }
  torso.add(new THREE.Mesh(tube(fissure, 0.02), sillon));

  // Yeux, sourcils, joues, bras.
  const eyes = [], pupils = [], brows = [], cheeks = [], arms = [];
  const glint = flat(COLORS.oeil);
  const browGeo = new THREE.CapsuleGeometry(0.017, 0.12 - 0.034, 6, 12);
  const limbGeo = new THREE.CapsuleGeometry(0.05, 0.24 - 0.1, 8, 16);
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    const anchor = surface(side * EYE_X, EYE_Y, -0.02);
    eye.position.set(...anchor); orient(eye, anchor);
    const ball = sphere(white, [0.1, 0.11, 0.05]);
    outline(ball, 0.05, ...eyeLine);
    eye.add(ball);
    const pupil = new THREE.Group();
    pupil.add(sphere(ink, [0.05, 0.056, 0.02]));
    for (const [x, y, r] of [[0.02, 0.026, 0.017], [0.036, 0, 0.009]]) {
      const dot = sphere(glint, [r, r, r]); dot.position.set(x, y, 0.018); pupil.add(dot);
    }
    eye.add(pupil);
    torso.add(eye);
    eyes.push(eye); pupils.push(pupil);

    const brow = new THREE.Group();
    const bAnchor = surface(side * EYE_X, EYE_Y + 0.15, 0.005);
    brow.position.set(...bAnchor); orient(brow, bAnchor);
    const bar = new THREE.Mesh(browGeo, ink);
    brow.add(bar);
    torso.add(brow);
    brows.push({ node: brow, bar, side });

    const cheek = sphere(flat(COLORS.joue, { transparent: true, depthWrite: false }), [0.075, 0.045, 0.02]);
    const cAnchor = surface(side * 0.29, MOUTH_Y + 0.03, 0.002);
    cheek.position.set(...cAnchor); orient(cheek, cAnchor);
    torso.add(cheek);
    cheeks.push(cheek);

    // Bras courts, sans coude, main ronde ; pivot sur les flancs à mi-hauteur.
    const arm = new THREE.Group();
    arm.rotation.order = 'YXZ';
    arm.position.set(side * 0.56, -0.08, 0);
    const limb = new THREE.Mesh(limbGeo, rose);
    limb.position.y = -0.12;
    outline(limb, 0.05);
    arm.add(limb);
    const hand = sphere(rose, [0.07, 0.07, 0.07]);
    hand.position.y = -0.26;
    outline(hand, 0.07);
    arm.add(hand);
    torso.add(arm);
    arms.push({ node: arm, side });
  }

  // Bouche (géométrie selon l'humeur) et bouche qui parle.
  const mouth = new THREE.Group(), talkMouth = new THREE.Group();
  const mAnchor = surface(0, MOUTH_Y, 0.004);
  for (const node of [mouth, talkMouth]) { node.position.set(...mAnchor); orient(node, mAnchor); torso.add(node); }
  const fillMouth = (node, shape) => {
    for (const c of [...node.children]) { node.remove(c); c.geometry.dispose(); }
    const add = (geo, hex, z = 0) => { const m = new THREE.Mesh(geo, flat(hex, { side: THREE.DoubleSide })); m.position.z = z; node.add(m); };
    const stroke = (curve) => add(new THREE.TubeGeometry(curve, 24, 0.012, 8, false), COLORS.encre);
    const V = (x, y) => new THREE.Vector3(x, y, 0);
    switch (shape.kind) {
      case 'smile': case 'frown': {
        const sign = shape.kind === 'frown' ? 1 : -1;
        stroke(new THREE.QuadraticBezierCurve3(V(-shape.w / 2, 0), V(0, sign * shape.d * 2), V(shape.w / 2, 0)));
        break;
      }
      case 'line':
        stroke(new THREE.LineCurve3(V(-shape.w / 2 + 0.03, -shape.slant), V(shape.w / 2 + 0.03, shape.slant)));
        break;
      case 'open': {
        const s = new THREE.Shape();
        s.moveTo(-shape.w / 2, 0);
        s.quadraticCurveTo(0, 0.012, shape.w / 2, 0);
        s.quadraticCurveTo(0, -shape.h * 2, -shape.w / 2, 0);
        add(new THREE.ShapeGeometry(s, 24), COLORS.bouche);
        const tongue = new THREE.Shape();
        tongue.absellipse(0, -shape.h * 0.62, shape.w * 0.21, shape.h * 0.21, 0, Math.PI * 2);
        add(new THREE.ShapeGeometry(tongue, 24), COLORS.langue, 0.002);
        break;
      }
      case 'oval': {
        const s = new THREE.Shape();
        s.absellipse(0, 0, shape.w / 2, shape.h / 2, 0, Math.PI * 2);
        add(new THREE.ShapeGeometry(s, 24), COLORS.bouche);
        break;
      }
    }
  };
  fillMouth(talkMouth, { kind: 'open', w: 0.11, h: 0.06 });
  talkMouth.visible = false;

  // Larme.
  const tear = sphere(flat(COLORS.larme, { transparent: true }), [0.026, 0.038, 0.018]);
  tear.material.opacity = 0;
  torso.add(tear);

  // ── État ──
  let mood = 'neutre';
  let target = poseOf(mood), pose = clonePose(target);
  let time = 0, nextBlink = 2, blinkStart = -10, bounceStart = -10, lastStrong = -10;
  let anim = null, queued = null, gaze = null, talk = null, speech = null;

  function play(kind, delay = 0) {
    if (!(kind in DURATION)) return;
    if (STRONG.has(kind)) {
      if (time + delay - lastStrong < 3) return;
      if (reducedMotion) { bounceStart = time + delay; return; }
      lastStrong = time + delay;
    }
    if (kind === 'clin') { blinkStart = time + delay; return; }
    if (delay > 0) { queued = { kind, start: time + delay }; return; }
    anim = { kind, start: time };
  }

  function setMood(m, animate = true) {
    if (!MOODS.includes(m)) m = 'neutre';
    if (m === mood && animate) return;
    const old = mood;
    mood = m;
    target = poseOf(m);
    fillMouth(mouth, mouthOf(m));
    if (!animate) { pose = clonePose(target); apply(); return; }
    bounceStart = time;
    if (m === 'content') play('joie');
    else if (m === 'surpris') play('choc');
    else if (m === 'fier') play('victoire');
    else if (m === 'triste') play('triste');
    else if (m === 'endormi') play('dodo');
    else if (m === 'neutre' && old === 'endormi') play('reveil');
  }

  function apply() {
    const p = clonePose(pose);
    const a = amp;
    let jump = 0, squash = 0, spin = 0, eyeMul = 1, tearSlide = 0, recoil = 0, yaw = 0, giggle = false;
    let armRBlend = null;

    // Rebond de 320 ms à chaque changement d'humeur.
    const bp = (time - bounceStart) / 0.32;
    if (bp >= 0 && bp < 1) squash += 0.07 * Math.sin(2 * Math.PI * bp) * (1 - bp) * a;

    if (anim && time >= anim.start) {
      const q = (time - anim.start) / DURATION[anim.kind];
      const w = time - anim.start;
      switch (anim.kind) {
        case 'joie':
          if (q < 0.2) squash += 0.12 * Math.sin(q / 0.2 * Math.PI / 2);
          else if (q < 0.65) {
            const r = (q - 0.2) / 0.45;
            jump = 0.36 * Math.sin(r * Math.PI);
            squash -= 0.08 * Math.sin(r * Math.PI);
            p.armL[0] += 0.9 * Math.sin(r * Math.PI); p.armR[0] += 0.9 * Math.sin(r * Math.PI);
          } else {
            const r = (q - 0.65) / 0.35;
            squash += 0.12 * Math.exp(-4 * r) * Math.cos(r * 3 * Math.PI);
          }
          break;
        case 'victoire': {
          const env = Math.sin(q * Math.PI);
          p.tiltZ += 0.2 * Math.sin(2 * Math.PI * 3 * q) * env;
          jump = 0.06 * Math.abs(Math.sin(2 * Math.PI * 3 * q)) * env;
          spin = 2 * Math.PI * smoothstep(0.25, 0.75, q);
          p.armL[0] += 1.6 * env * (0.5 + 0.5 * Math.sin(6 * Math.PI * q));
          p.armR[0] += 1.6 * env * (0.5 - 0.5 * Math.sin(6 * Math.PI * q));
          break;
        }
        case 'reveil': {
          const e = q < 0.15 ? q / 0.15 : 1 - easeOut((q - 0.15) / 0.85);
          if (q < 0.15) jump = 0.14 * Math.sin(q / 0.15 * Math.PI);
          p.armL[0] += 2.2 * e; p.armR[0] += 2.2 * e; p.eyeOpen += 0.35 * e;
          break;
        }
        case 'triste': {
          const e = Math.sqrt(Math.max(Math.sin(q * Math.PI), 0));
          p.tiltX += 0.15 * e; p.drop += 0.04 * e; p.lookY -= 0.5 * e;
          tearSlide = smoothstep(0.15, 0.95, q);
          p.tear = Math.max(p.tear, q < 0.95 ? 1 : 0);
          break;
        }
        case 'reflexion': {
          const e = smoothstep(0, 0.15, q) * (1 - smoothstep(0.85, 1, q));
          armRBlend = [[2.5 + 0.15 * Math.sin(time * 2 * Math.PI * 5), 0.5], e];
          eyeMul *= 1 - 0.4 * e; p.tiltZ -= 0.08 * e;
          break;
        }
        case 'dodo': {
          const e = easeOut(q);
          p.tiltZ += 0.15 * e; eyeMul *= 1 - e;
          break;
        }
        case 'choc': {
          const e = q < 0.13 ? easeOut(q / 0.13) : 1 - easeOut((q - 0.13) / 0.87);
          recoil = 0.12 * e;
          p.tiltX -= 0.2 * e;
          p.tiltZ += 0.12 * Math.sin(2 * Math.PI * 6 * w) * (1 - q);
          p.eyeOpen += (1.5 - p.eyeOpen) * e; p.pupil += (0.5 - p.pupil) * e;
          p.browAngle += 0.4 * e; p.browY += 0.06 * e;
          p.armL[0] += 1.6 * e; p.armR[0] += 1.6 * e;
          if (q < 0.1) jump = 0.08 * Math.sin(q / 0.1 * Math.PI);
          break;
        }
        case 'poke':
          squash += 0.15 * Math.sin(q * Math.PI * 2) * (1 - q);
          if (q < 0.4) jump = 0.05 * Math.sin(q / 0.4 * Math.PI);
          giggle = q < 0.8;
          if (q > 0.1 && q < 0.4) eyeMul *= 0.1;
          p.cheek = Math.max(p.cheek, 0.8);
          break;
        case 'vol':
          if (q < 0.65) {
            const e = Math.sin(q / 0.65 * Math.PI);
            p.armL[0] += 1.3 * e + 0.25 * Math.sin(time * 2 * Math.PI * 4) * e;
            p.armR[0] += 1.3 * e - 0.25 * Math.sin(time * 2 * Math.PI * 4) * e;
            p.tiltX += 0.18 * e; squash -= 0.06 * e;
          } else {
            const r = (q - 0.65) / 0.35;
            squash += 0.13 * Math.exp(-4 * r) * Math.cos(r * 3 * Math.PI);
          }
          break;
        case 'etourdi': {
          const e = 1 - smoothstep(0.75, 1, q);
          if (q < 0.1) squash += 0.16 * Math.sin(q / 0.1 * Math.PI);
          p.tiltZ += 0.16 * Math.sin(2 * Math.PI * 1.4 * w) * e;
          p.tiltX += 0.1 * Math.cos(2 * Math.PI * 1.4 * w) * e;
          p.lookX = 0.85 * Math.cos(2 * Math.PI * 2.2 * w) * e;
          p.lookY = 0.85 * Math.sin(2 * Math.PI * 2.2 * w) * e;
          p.eyeOpen += (0.75 - p.eyeOpen) * e; p.browAngle += 0.25 * e;
          break;
        }
      }
    }

    // Regard : suit le pointeur, s'efface 0,8 s après le dernier mouvement.
    if (gaze) {
      const w = 1 - smoothstep(0.5, 0.8, time - gaze.time);
      p.lookX += (gaze.x - p.lookX) * w;
      p.lookY += (gaze.y - p.lookY) * w;
      yaw = 0.28 * gaze.x * w;
      if (w === 0) gaze = null;
    }
    if (armRBlend) { const [arm, w] = armRBlend; p.armR[0] += (arm[0] - p.armR[0]) * w; p.armR[1] += (arm[1] - p.armR[1]) * w; }

    // Repos vivant : respiration 2,3 s, balancement léger, clignement 180 ms.
    const breath = Math.sin(2 * Math.PI * time / 2.3) * a;
    const sway = Math.sin(2 * Math.PI * time / 4.6) * a;
    const bk = (time - blinkStart) / 0.18;
    if (bk >= 0 && bk < 1) eyeMul *= 1 - 0.94 * Math.sin(bk * Math.PI);

    jump *= a; squash *= a; spin *= a; recoil *= a;
    body.position.set(0, jump, -recoil);
    body.scale.set(1 + squash, 1 - squash, 1 + squash);
    body.rotation.set(p.tiltX, spin + yaw * a, p.tiltZ + 0.03 * sway);
    torso.position.set(0, TORSO_Y - p.drop, 0);
    torso.scale.set(1 + 0.01 * breath, 1 + 0.02 * breath, 1 + 0.01 * breath);

    const open = Math.max(p.eyeOpen * eyeMul, 0.06);
    const wide = 1 + Math.max(0, p.eyeOpen - 1) * 0.4;
    for (const eye of eyes) eye.scale.set(wide, open * wide, 1);
    for (const pupil of pupils) {
      pupil.scale.setScalar(p.pupil);
      pupil.position.set(p.lookX * 0.03, p.lookY * 0.03, 0.045);
    }
    for (const b of brows) {
      b.node.position.set(...surface(b.side * EYE_X, EYE_Y + 0.15 + p.browY, 0.005));
      b.bar.rotation.z = Math.PI / 2 + b.side * -p.browAngle;
    }
    for (const c of cheeks) c.material.opacity = Math.min(Math.max(p.cheek, 0), 1);
    for (const arm of arms) {
      const v = arm.side < 0 ? p.armL : p.armR;
      arm.node.rotation.set(-v[1], 0, arm.side * v[0]);
    }
    tear.material.opacity = Math.min(p.tear, 1);
    tear.visible = p.tear > 0.01;
    tear.position.set(...surface(-EYE_X - 0.02, EYE_Y - 0.1 - 0.12 * tearSlide, 0.01));

    if (giggle) {
      mouth.visible = false; talkMouth.visible = true;
      talkMouth.scale.set(1.1, 0.6 + 0.4 * Math.abs(Math.sin(time * 2 * Math.PI * 7)), 1);
    } else if (talk && time >= talk.start) {
      mouth.visible = false; talkMouth.visible = true;
      talkMouth.scale.set(1, 0.25 + 0.75 * Math.abs(Math.sin((time - talk.start) / 0.11 * Math.PI)), 1);
    } else {
      mouth.visible = true; talkMouth.visible = false;
    }
  }

  function update(dt) {
    time += dt;
    // Demi-vie de 90 ms vers la pose de l'humeur.
    approach(pose, target, 1 - Math.pow(0.5, dt / 0.09));
    if (dt > 0.001 && time >= nextBlink) { blinkStart = time; nextBlink = time + 2.4 + Math.random() * 3; }
    if (anim && time - anim.start > DURATION[anim.kind]) anim = null;
    if (queued && time >= queued.start) { anim = queued; queued = null; }
    if (talk && time - talk.start > talk.duration) talk = null;
    apply();
  }

  fillMouth(mouth, mouthOf(mood));
  apply();

  return {
    root,
    get mood() { return mood; },
    pose(m) { setMood(m, false); },
    setMood(m) { setMood(m, true); },
    play,
    look(x, y) { gaze = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), time }; },
    unlook() { gaze = null; },
    /** Bouche synchronisée à la bulle, environ 55 ms par caractère. */
    say(text) {
      if (text === speech) return;
      speech = text;
      talk = { start: time, duration: Math.min(text.length * 0.055, 3) };
    },
    update,
    setOutline(on) { for (const h of hulls) h.visible = on; },
    setHalftone(on) { for (const m of toonMats) if (m.userData.halftone) m.uniforms.halftone.value = on && slotSize >= 72 ? 1 : 0; },
  };
}
