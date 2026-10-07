/* Vaibhav Mathur — portfolio interactions
   1. Optical bench: a laser steered by a MEMS mirror (hero)
   2. Timeline rail: active chapter + scroll progress
   3. Spatial dimming demo
   4. Old deep links (#ar-vr-glasses etc.) map to the new sections */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- 0. One screen per slide ----------
   On computers with a mouse/trackpad and a big enough window, every slide is exactly
   one screen tall. If a slide's content is taller than that, it is scaled down to fit
   (never up). Phones, tablets and very short windows fall back to normal scrolling. */
const slideQuery = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 900px) and (min-height: 540px)');
function fitSlides() {
  const on = slideQuery.matches;
  document.documentElement.classList.toggle('slides', on);
  document.querySelectorAll('.slide > .fit').forEach(fit => {
    fit.style.transform = ''; fit.style.width = ''; fit.style.marginBottom = '';
    if (!on) return;
    const avail = fit.parentElement.clientHeight;
    const maxUp = fit.parentElement.classList.contains('hero') ? 1 : 1.12;   // sparse slides grow a little
    const clamp = v => Math.max(.55, Math.min(maxUp, v));
    let s = clamp((avail * .96) / fit.offsetHeight);
    if (Math.abs(s - 1) < .02) return;
    for (let k = 0; k < 3; k++) {                       // changing width reflows the content, so re-measure
      fit.style.width = (100 / s) + '%';
      s = clamp((avail * .96) / fit.offsetHeight);
    }
    fit.style.width = (100 / s) + '%';
    fit.style.transform = `scale(${s})`;
    fit.style.marginBottom = (fit.offsetHeight * (s - 1)) + 'px';
  });
}
let fitTimer;
const refit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitSlides, 80); };
fitSlides();
addEventListener('resize', refit);
slideQuery.addEventListener?.('change', refit);
document.fonts?.ready.then(fitSlides);
document.querySelectorAll('.slide img, .slide video').forEach(m => m.addEventListener(m.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', refit, { once: true }));
addEventListener('load', fitSlides);

/* ---------- 1. Optical bench ----------
   Top view of a small optical table. A laser fires into a gimbaled MEMS
   micromirror, and the mirror steers the beam to write words on a screen,
   the way a laser projector draws (beam off while jumping between strokes).
   Hover (or touch) to steer the mirror yourself. Edit PHRASES to change the words. */
const PHRASES = [
  ['HELLO', 'WORLD'],
  ['ATOMS', '+ BITS'],
  ['AGI', 'SOON?'],
];
// Single-stroke vector font on a 4 × 6 grid (y down). Each glyph is a list of polylines.
const P = (s) => s.split(' ').map(p => p.split(',').map(Number));
const GLYPHS = {
  A: ['0,6 0,2 2,0 4,2 4,6', '0,3.5 4,3.5'], B: ['0,3 3,3 4,4 4,5 3,6 0,6 0,0 3,0 4,1 4,2 3,3'],
  C: ['4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5'], D: ['0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0'],
  E: ['4,0 0,0 0,6 4,6', '0,3 3,3'], F: ['4,0 0,0 0,6', '0,3 3,3'],
  G: ['4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.5 2.2,3.5'], H: ['0,0 0,6', '4,0 4,6', '0,3 4,3'],
  I: ['1,0 3,0', '2,0 2,6', '1,6 3,6'], K: ['0,0 0,6', '4,0 0,3.6', '1.4,2.7 4,6'],
  L: ['0,0 0,6 4,6'], M: ['0,6 0,0 2,3 4,0 4,6'], N: ['0,6 0,0 4,6 4,0'],
  O: ['1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0'], P: ['0,6 0,0 3,0 4,1 4,2 3,3 0,3'],
  R: ['0,6 0,0 3,0 4,1 4,2 3,3 0,3', '2,3 4,6'], S: ['4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5'],
  T: ['0,0 4,0', '2,0 2,6'], U: ['0,0 0,5 1,6 3,6 4,5 4,0'], V: ['0,0 2,6 4,0'],
  W: ['0,0 1,6 2,3 3,6 4,0'], Y: ['0,0 2,3 4,0', '2,3 2,6'],
  '?': ['0,1 1,0 3,0 4,1 4,2 2,3.5 2,4.4', '2,5.7 2,6'], '!': ['2,0 2,4.3', '2,5.7 2,6'],
  '+': ['2,1.6 2,4.4', '0.6,3 3.4,3'], '=': ['0.5,2 3.5,2', '0.5,4 3.5,4'], '.': ['2,5.7 2,6'],
};

(() => {
  const canvas = document.getElementById('bench'); if (!canvas) return;
  const box = canvas.parentElement, ctx = canvas.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const LASER = css.getPropertyValue('--laser').trim() || '#e4432b';
  const INK = css.getPropertyValue('--ink').trim() || '#0f1a2a';
  const MUTED = css.getPropertyValue('--muted').trim() || '#6a7588';
  let W = 0, H = 0, pointer = null, visible = true, trail = [];
  let phraseIdx = 0, segs = [], total = 0, dist = 0, phase = 'draw', clock = 0, tip = [0, 0];

  function geom() {
    const s = Math.max(40, W * .1), y = Math.min(H * .72, H - s - 50);
    return { laser: [W * .04, y], mirror: [W * .3, y], s, S: { x: W * .47, y: H * .08, w: W * .49, h: H * .56 } };
  }
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = box.clientWidth; H = box.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }
  // Turn a phrase into beam segments: pen-up jumps between strokes, pen-down along them.
  function build() {
    const { S } = geom(), lines = PHRASES[phraseIdx];
    const cols = Math.max(...lines.map(l => l.length));
    const unit = Math.min((S.w * .84) / (cols * 5.6 - 1.6), (S.h * .8) / (lines.length * 6 + (lines.length - 1) * 3.2));
    const top = S.y + (S.h - unit * (lines.length * 6 + (lines.length - 1) * 3.2)) / 2;
    segs = []; total = 0; let last = null;
    lines.forEach((line, li) => {
      const left = S.x + (S.w - unit * (line.length * 5.6 - 1.6)) / 2;
      [...line].forEach((ch, ci) => {
        (GLYPHS[ch] || []).forEach(str => {
          const pts = P(str).map(([x, y]) => [left + (ci * 5.6 + x) * unit, top + (li * 9.2 + y) * unit]);
          if (last) segs.push({ a: last, b: pts[0], pen: false });
          for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i], pen: true });
          last = pts[pts.length - 1];
        });
      });
    });
    segs.forEach(sg => { sg.len = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]); sg.cost = sg.pen ? sg.len : sg.len * .15; total += sg.cost; });
    dist = 0; phase = 'draw'; clock = 0; tip = segs.length ? [...segs[0].a] : [S.x, S.y];
  }
  size(); new ResizeObserver(size).observe(box);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(box);
  const setP = e => { const r = box.getBoundingClientRect(); pointer = [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  box.addEventListener('pointermove', setP); box.addEventListener('pointerdown', setP);
  box.addEventListener('pointerleave', () => { pointer = null; trail = []; build(); });

  const rrect = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  const label = (t, x, y, c = MUTED, al = 'left') => { ctx.font = '500 11px "Geist Mono", ui-monospace, monospace'; ctx.fillStyle = c; ctx.textAlign = al; ctx.fillText(t, x, y); };
  function glowLine(pts, alpha = 1) {
    if (pts.length < 2) return;
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = LASER;
    for (const [w, a] of [[7, .14], [2.2, 1]]) {
      ctx.globalAlpha = a * alpha; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...pts[0]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* A 2-axis gimbaled MEMS mirror in 3/4 view: ceramic package, silicon die, gimbal
     frame on torsion hinges (tilts about x), mirror plate on inner hinges (tilts about y). */
  function drawMirror(cx, cy, d, { tip: tA, tilt: tB }) {
    const rad = Math.PI / 180, ax = -tB * 1.5 * rad, ay = tA * 1.5 * rad;     // drawn ×1.5 so the motion reads
    const g = -18 * rad, e = 52 * rad, cg = Math.cos(g), sg = Math.sin(g);
    const proj = ([X, Y, Z]) => { const x1 = X * cg - Y * sg, y1 = X * sg + Y * cg; return [cx + x1 * d, cy - (y1 * Math.sin(e) + Z * Math.cos(e)) * d]; };
    const rx = ([X, Y, Z], a) => [X, Y * Math.cos(a) - Z * Math.sin(a), Y * Math.sin(a) + Z * Math.cos(a)];
    const ry = ([X, Y, Z], a) => [X * Math.cos(a) + Z * Math.sin(a), Y, -X * Math.sin(a) + Z * Math.cos(a)];
    const sq = (h, z = 0) => [[-h, -h, z], [h, -h, z], [h, h, z], [-h, h, z]];
    const poly = (pts, fill, stroke) => { ctx.beginPath(); pts.map(proj).forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } };
    const ring = (outer, inner, z, xf, fill, stroke) => {             // square frame with a hole
      const o = sq(outer, z).map(xf), i = sq(inner, z).map(xf);
      ctx.beginPath(); o.map(proj).forEach((p, k) => k ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
      i.reverse().map(proj).forEach((p, k) => k ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill('evenodd'); ctx.strokeStyle = stroke; ctx.lineWidth = .8; ctx.stroke();
    };
    const id = p => p;
    ctx.save(); ctx.globalAlpha = 1; ctx.lineJoin = 'round';
    // ceramic package (with visible thickness) and gold bond pads
    const pk = 1.0, th = .16;
    poly([[-pk, -pk, -th], [pk, -pk, -th], [pk, -pk, 0], [-pk, -pk, 0]], '#1b2330');
    poly([[pk, -pk, -th], [pk, pk, -th], [pk, pk, 0], [pk, -pk, 0]], '#232c3a');
    poly(sq(pk), '#33404f', '#1b2330');
    ctx.fillStyle = '#c9a64a';
    for (let k = -3; k <= 3; k++) for (const side of [-1, 1]) { const p = proj([k * .24, side * .9, 0]); ctx.fillRect(p[0] - 1.6, p[1] - 1.1, 3.2, 2.2); }
    // silicon die and etched cavity
    poly(sq(.8, .01), '#9aa4b2', '#6f7b8b');
    poly(sq(.66, .012), '#46505e');
    // outer torsion hinges (die → gimbal), along x
    const gx = p => rx(p, ax);
    ctx.strokeStyle = '#e4e9f0'; ctx.lineWidth = 2.6;
    for (const sgn of [-1, 1]) { const a2 = proj([sgn * .66, 0, .02]), b2 = proj(gx([sgn * .58, 0, .02])); ctx.beginPath(); ctx.moveTo(...a2); ctx.lineTo(...b2); ctx.stroke(); }
    // gimbal frame (tilts about x)
    ring(.58, .47, .02, gx, '#b9c2ce', '#7d8a9b');
    // inner hinges (gimbal → mirror), along y
    const mxf = p => rx(ry(p, ay), ax);
    for (const sgn of [-1, 1]) { const a2 = proj(gx([0, sgn * .47, .02])), b2 = proj(mxf([0, sgn * .4, .02])); ctx.beginPath(); ctx.moveTo(...a2); ctx.lineTo(...b2); ctx.stroke(); }
    // mirror plate: thickness edge, then mirror face shaded by its tilt
    poly(sq(.4, -.03).map(mxf), '#5c6878');
    const n = mxf([0, 0, 1]), L = [-.45, .55, .7], ln = Math.hypot(...L);
    const lit = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ln);
    const c1 = proj(mxf([-.4, .4, .02])), c2 = proj(mxf([.4, -.4, .02]));
    const gr = ctx.createLinearGradient(c1[0], c1[1], c2[0], c2[1]);
    const hi = Math.round(200 + 55 * lit), lo = Math.round(120 + 60 * lit);
    gr.addColorStop(0, `rgb(${hi},${hi + 2 > 255 ? 255 : hi + 2},${255})`); gr.addColorStop(.45, `rgb(${lo},${lo + 6},${lo + 16})`);
    gr.addColorStop(.55, `rgb(${hi - 10},${hi - 6},${Math.min(255, hi + 4)})`); gr.addColorStop(1, `rgb(${lo - 10},${lo - 4},${lo + 8})`);
    poly(sq(.4, .02).map(mxf), gr, '#59667a');
    ctx.restore();
  }

  function step() {
    if (pointer) return;
    if (phase === 'draw') {
      dist += total / 190;           // ~3 s per phrase
      if (dist >= total) { dist = total; phase = 'hold'; clock = 0; }
    } else if (phase === 'hold') { if (++clock > 110) { phase = 'fade'; clock = 0; } }
    else if (phase === 'fade') { if (++clock > 30) { phraseIdx = (phraseIdx + 1) % PHRASES.length; build(); } }
  }

  function draw() {
    const { laser, mirror, s, S } = geom();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#d3d9e2';                               // breadboard holes
    const st = Math.max(18, Math.round(W / 22));
    for (let x = st / 2; x < W; x += st) for (let y = st / 2; y < H; y += st) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 1; rrect(S.x, S.y, S.w, S.h, 8); ctx.fill(); ctx.stroke();
    label('PROJECTION SCREEN', S.x, S.y + S.h + 18);

    let beamOn = true;
    if (pointer) {
      tip = [Math.min(S.x + S.w - 4, Math.max(S.x + 4, pointer[0])), Math.min(S.y + S.h - 4, Math.max(S.y + 4, pointer[1]))];
      trail.push([...tip]); if (trail.length > 120) trail.shift();
      glowLine(trail, .9);
    } else {
      // persistent strokes up to the current distance along the path
      const alpha = phase === 'fade' ? 1 - clock / 30 : 1;
      let acc = 0, run = [];
      for (const sg of segs) {
        if (acc >= dist) break;
        const f = Math.min(1, (dist - acc) / sg.cost);
        const end = [sg.a[0] + (sg.b[0] - sg.a[0]) * f, sg.a[1] + (sg.b[1] - sg.a[1]) * f];
        if (sg.pen) { if (!run.length) run.push(sg.a); run.push(end); }
        else { glowLine(run, alpha); run = []; }
        tip = end; beamOn = sg.pen || f >= 1; acc += sg.cost;
      }
      glowLine(run, alpha);
      if (phase !== 'draw') beamOn = false;
    }

    // mirror angles from where the beam lands on the screen (±12°, like a DLP micromirror)
    const [mx, my] = mirror;
    const tilt = { tip: ((tip[0] - (S.x + S.w / 2)) / (S.w / 2)) * 12, tilt: ((tip[1] - (S.y + S.h / 2)) / (S.h / 2)) * 12 };
    drawMirror(mx, my, s, tilt);
    // beams: laser → mirror always on; mirror → screen only while writing
    const beam = (a, b) => { ctx.strokeStyle = LASER; ctx.globalAlpha = .12; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
    if (beamOn) {
      beam([laser[0] + 46, laser[1]], mirror); beam(mirror, tip);
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, s * .3); mg.addColorStop(0, 'rgba(255,120,90,.85)'); mg.addColorStop(1, 'rgba(228,67,43,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, s * .3, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 14); g.addColorStop(0, 'rgba(228,67,43,.6)'); g.addColorStop(1, 'rgba(228,67,43,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip[0], tip[1], 14, 0, 7); ctx.fill();
    }
    ctx.fillStyle = INK; rrect(laser[0] - 6, laser[1] - 13, 52, 26, 5); ctx.fill();   // laser module
    ctx.fillStyle = beamOn ? LASER : '#9aa5b5'; ctx.fillRect(laser[0] + 44, laser[1] - 3, 4, 6);
    label('LASER', laser[0] - 6, laser[1] + 32);

    const f = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '°';
    label('MEMS TIP-TILT MIRROR', mx - s, my + s * .95 + 22, INK);
    label(`tip ${f(tilt.tip)}  tilt ${f(tilt.tilt)}`, mx - s, my + s * .95 + 37);
    label(pointer ? 'YOU ARE STEERING' : 'WRITING · ' + (phraseIdx + 1) + '/' + PHRASES.length, W - 14, H - 14, pointer ? LASER : MUTED, 'right');
  }
  function loop() { if (visible) { step(); draw(); } requestAnimationFrame(loop); }
  loop();   // runs even with Reduce Motion on: it is small, slow and contained in its panel
})();

/* ---------- 1b. Photo reels (Beyond work) ----------
   Cross-fades through the figures inside each .reel; videos play while shown.
   Dots let visitors jump to a slide. A slide can set data-hold (ms). */
document.querySelectorAll('.reel').forEach(reel => {
  const slides = [...reel.querySelectorAll('figure')]; if (!slides.length) return;
  const dots = document.createElement('div'); dots.className = 'dots';
  let i = 0, timer = null, inView = false;
  slides.forEach((_, k) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Show photo ' + (k + 1)); b.addEventListener('click', () => { show(k); schedule(); }); dots.append(b); });
  if (slides.length > 1) reel.append(dots);
  function show(k) {
    slides[i].classList.remove('on'); slides[i].querySelector('video')?.pause();
    i = k; slides[i].classList.add('on');
    const v = slides[i].querySelector('video'); if (v && inView) { v.currentTime = 0; v.play().catch(() => {}); }
    [...dots.children].forEach((d, n) => d.setAttribute('aria-current', n === i));
  }
  function schedule() {
    clearTimeout(timer); if (!inView || slides.length < 2) return;
    const dur = +slides[i].dataset.hold || 3200;
    timer = setTimeout(() => { show((i + 1) % slides.length); schedule(); }, dur);
  }
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) { show(i); schedule(); } else { clearTimeout(timer); slides[i].querySelector('video')?.pause(); } }, { threshold: .15 }).observe(reel);
  show(0);
});

/* ---------- 2. Timeline rail: active chapter + scroll progress ----------
   Each slide carries data-nav="ai|ar|mems|…"; the matching menu stop lights up. */
const links = [...document.querySelectorAll('.stops .ch, .rail .btn')];
const chapters = [...document.querySelectorAll('.stops li')];
const slidesAll = [...document.querySelectorAll('.slide')];
let currentId = null;
function onScroll() {
  const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
  const probe = y + innerHeight * 0.45;
  let active = null;
  for (const s of slidesAll) if (s.getBoundingClientRect().top + y <= probe) active = s;
  if (y >= max - 4) active = slidesAll[slidesAll.length - 1];
  const id = active ? active.id : '';
  if (id === currentId) return;
  currentId = id;
  const nav = active ? active.dataset.nav : '';
  const ai = slidesAll.indexOf(active);
  links.forEach(a => {
    const on = !!nav && a.getAttribute('href') === '#' + nav;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  });
  // The timeline: every slide up to this one is lit; in the sidebar one laser line fills down to it.
  const stopsEl = document.querySelector('.stops'), top0 = stopsEl.getBoundingClientRect().top;
  const mid = t => { const r = t.getBoundingClientRect(); return r.top - top0 + r.height / 2 - 10; };
  let fill = 0;
  chapters.forEach(li => {
    const ticks = [...li.querySelectorAll('.subs a')];
    let on = false;
    ticks.forEach(t => {
      const si = slidesAll.indexOf(document.getElementById(t.getAttribute('href').slice(1)));
      const here = t.getAttribute('href') === '#' + id;
      t.classList.toggle('on', here);
      t.classList.toggle('past', ai >= 0 && si < ai);
      if (here) { on = true; t.setAttribute('aria-current', 'true'); fill = mid(t); }
      else t.removeAttribute('aria-current');
    });
    li.classList.toggle('on', on);
    if (on && stopsEl.scrollWidth > stopsEl.clientWidth + 2)   // top bar on phones scrolls sideways
      stopsEl.scrollTo({ left: li.offsetLeft - 16, behavior: 'smooth' });
  });
  const last = [...document.querySelectorAll('.subs a')].pop();
  if (last && ai > slidesAll.indexOf(document.getElementById(last.getAttribute('href').slice(1)))) fill = mid(last);
  stopsEl.style.setProperty('--fill', Math.max(0, fill) + 'px');
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { currentId = null; onScroll(); });
onScroll();

/* ---------- 3. Spatial dimming demo ---------- */
(() => {
  const root = document.getElementById('demo'); if (!root) return;
  const range = root.querySelector('#dim'), out = root.querySelector('#dimv'), hud = root.querySelector('#hud');
  const patch = root.querySelector('.patch'), global = root.querySelector('.global');
  const bS = root.querySelector('#m-spatial'), bG = root.querySelector('#m-global');
  let mode = 'spatial';
  function render() {
    const d = range.value / 100;
    out.textContent = range.value + '%';
    patch.style.opacity = mode === 'spatial' ? (d * .92).toFixed(2) : 0;
    global.style.opacity = mode === 'global' ? (d * .8).toFixed(2) : 0;
    hud.textContent = (mode === 'spatial' ? 'Spatial' : 'Global') + ' · ' + range.value + '% dimming' +
      (mode === 'global' && d > .4 ? ' · the whole world gets dark' : '');
    bS.setAttribute('aria-pressed', mode === 'spatial'); bG.setAttribute('aria-pressed', mode === 'global');
  }
  range.addEventListener('input', render);
  bS.addEventListener('click', () => { mode = 'spatial'; render(); });
  bG.addEventListener('click', () => { mode = 'global'; render(); });
  // a one-time sweep so visitors see what the slider does
  if (!reduceMotion) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      let v = 0; range.value = 0; render(); const id = setInterval(() => { v += 2; range.value = Math.min(v, 70); render(); if (v >= 70) clearInterval(id); }, 24);
    }, { threshold: .6 });
    io.observe(root);
  }
  render();
})();

/* ---------- 4. Old deep links ---------- */
const aliases = { 'ai-physical-world': 'ai', 'neural-surrogates': 'ai', 'cad-visual-search': 'ai', 'hardware-manufacturing': 'ai', 'ar-vr-glasses': 'ar', 'mems-medical-imaging': 'mems', 'phd-mems-research': 'phd', 'beyond-work': 'interests', 'optical-tweezers': 'iisc', 'journey': 'top' };
const h = location.hash.slice(1);
if (aliases[h]) document.getElementById(aliases[h])?.scrollIntoView();

/* ---------- 4b. AI CAD player ----------
   Plays a silent 20-second highlight on loop with step labels; the button swaps in
   the full 2:39 demo with sound and controls, and back again. */
(() => {
  const fig = document.getElementById('cad-player'); if (!fig) return;
  const v = fig.querySelector('video'), step = document.getElementById('cad-step'),
        bar = document.getElementById('cad-progress'), btn = document.getElementById('cad-full'), cap = document.getElementById('cad-cap');
  const STEPS = [[0, '1 · Describe the part in plain words'], [4, '2 · AI builds an editable 3D model'],
    [8, '3 · Point at a face: "add a USB-C slot"'], [12, '4 · Add vents by voice'], [16, '5 · Adjust wall thickness by voice']];
  const highlight = v.innerHTML, poster = v.poster;
  let full = false;
  v.addEventListener('timeupdate', () => {
    if (full) return;
    const t = v.currentTime; let label = STEPS[0][1];
    for (const [s, l] of STEPS) if (t >= s) label = l;
    if (step.textContent !== label) step.textContent = label;
    if (v.duration) bar.style.width = (t / v.duration * 100) + '%';
  });
  // play the highlight only while it is on screen
  new IntersectionObserver(([e]) => { if (full) return; if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: .25 }).observe(fig);
  btn.addEventListener('click', () => {
    full = !full; fig.classList.toggle('full', full);
    if (full) {
      v.innerHTML = '<source src="assets/ai-cad-demo.mp4" type="video/mp4">';
      v.poster = 'assets/cad-poster.jpg'; v.loop = false; v.muted = false; v.controls = true;
      btn.textContent = '↺ Back to the 20-second highlight'; cap.textContent = 'Full demo · 2:39 · with sound';
    } else {
      v.innerHTML = highlight; v.poster = poster; v.loop = true; v.muted = true; v.controls = false;
      btn.textContent = '▶ Watch the full demo · 2:39'; cap.textContent = '20-second highlight · real session, sped up';
    }
    v.load(); v.play().catch(() => {});
  });
})();

/* ---------- 5. Spring transitions between chapters ----------
   a) Clicking any in-page link glides there with a damped spring (small overshoot, settle).
   b) With a mouse wheel or trackpad, each scroll gesture springs to the next stop:
      the start of the next section, or the next screenful inside a tall section.
      Arrow keys, Page Up/Down and Space do the same. Touch screens keep normal scrolling.
   c) When a chapter arrives, its blocks spring up into place, staggered. */
(() => {
  const html = document.documentElement;
  const railH = () => { const r = document.querySelector('.rail'); return !r || getComputedStyle(r).position === 'fixed' ? 0 : r.offsetHeight; };
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  /* One spring drives all programmatic scrolling. It keeps its position and velocity,
     so a new target set mid-flight (a second swipe, a menu click) bends the motion
     smoothly instead of restarting it. */
  const spring = { x: 0, v: 0, goal: 0, k: 150, c: 17, raf: 0 };
  function springTo(targetY, k = 150, c = 17) {
    const max = html.scrollHeight - innerHeight;
    spring.goal = Math.max(0, Math.min(max, Math.round(targetY)));
    spring.k = k; spring.c = c;
    if (spring.raf) return;                                   // already moving: just retarget
    spring.x = scrollY; spring.v = 0;
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(.032, (now - last) / 1000); last = now;
      const max2 = html.scrollHeight - innerHeight;
      const a = spring.k * (spring.goal - spring.x) - spring.c * spring.v;
      spring.v += a * dt; spring.x += spring.v * dt;
      scrollTo(0, Math.max(0, Math.min(max2, spring.x)));
      if (Math.abs(spring.goal - spring.x) < .5 && Math.abs(spring.v) < 5) {
        scrollTo(0, spring.goal); spring.raf = 0; return;
      }
      spring.raf = requestAnimationFrame(tick);
    };
    spring.raf = requestAnimationFrame(tick);
  }
  const stopSpring = () => { if (spring.raf) { cancelAnimationFrame(spring.raf); spring.raf = 0; } };
  addEventListener('touchstart', stopSpring, { passive: true });
  addEventListener('mousedown', e => { if (e.target === html) stopSpring(); });   // grabbing the scrollbar

  // Stops: the top of every slide (plus screenful stops if a slide is ever taller than the screen).
  function stops() {
    const off = railH(), view = innerHeight - off, max = html.scrollHeight - innerHeight;
    const tops = slidesAll.map(el => Math.round(el.getBoundingClientRect().top + scrollY - off)).filter(y => y >= 0 && y <= max + 2);
    const out = [];
    tops.concat([max]).forEach((y, i, arr) => {
      y = Math.min(y, max);
      if (!out.length || y - out[out.length - 1] > 40) out.push(y);
      const next = arr[i + 1];
      if (next !== undefined) for (let s = y + view * .85; s < next - view * .3; s += view * .85) out.push(Math.round(s));
    });
    return [...new Set(out)].sort((p, q) => p - q);
  }
  // Step one stop from where we are heading (not where we happen to be mid-glide).
  function page(dir) {
    const list = stops();
    const from = spring.raf ? spring.goal : scrollY;
    const target = dir > 0 ? list.find(s => s > from + 8) : [...list].reverse().find(s => s < from - 8);
    if (target === undefined) return;
    springTo(target);
  }

  /* Trackpads send a burst of wheel events per swipe, then a long "inertia" tail of
     shrinking deltas. One swipe must equal one step, yet a new swipe made while the
     tail is still arriving must count too. A wheel event starts a new gesture when:
       - it follows a quiet gap (> 120 ms), or
       - it reverses direction, or
       - its size jumps well above the decaying tail (a fresh swipe on top of inertia).
     Mouse wheels (one big notch per event) naturally pass the first test. */
  let lastT = 0, lastDir = 0, prevMag = 0, recent = [], lastStep = -1e9, armed = false, acc = 0;
  function onWheel(dy) {
    const now = performance.now(), dir = Math.sign(dy), mag = Math.abs(dy);
    if (!dir) return;
    const gap = now - lastT; lastT = now;
    if (gap > 120) recent = [];
    const floor = recent.length ? Math.min(...recent) : 0;
    const surge = recent.length >= 3 && now - lastStep > 350 && mag > 12 && mag > prevMag * 1.4 && mag > floor * 3;
    if (gap > 120 || dir !== lastDir || surge) { armed = true; acc = 0; }
    recent.push(mag); if (recent.length > 6) recent.shift();
    prevMag = mag; lastDir = dir;
    if (!armed) return;
    acc += mag;
    if (acc < 6 || now - lastStep < 220) return;            // tiny brushes don't count; no double steps
    armed = false; lastStep = now;
    page(dir);
  }

  if (finePointer) {
    addEventListener('wheel', e => {
      if (!html.classList.contains('slides')) return;                              // normal scrolling on small windows
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;           // pinch-zoom, sideways scroll
      if (e.target.closest && e.target.closest('.stops')) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);   // Firefox reports lines
      onWheel(dy);
    }, { passive: false });
    addEventListener('keydown', e => {
      if (!html.classList.contains('slides')) return;
      if (e.target.closest('input, textarea, select, video, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const down = ['ArrowDown', 'PageDown', ' '].includes(e.key) && !e.shiftKey;
      const up = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); springTo(e.key === 'Home' ? 0 : html.scrollHeight); return; }
      if (!down && !up) return;
      e.preventDefault(); page(down ? 1 : -1);
    });
    // If the page is ever left between slides (scrollbar drag, resize), settle onto the nearest one.
    let settle;
    addEventListener('scroll', () => {
      if (spring.raf || !html.classList.contains('slides')) return;
      clearTimeout(settle);
      settle = setTimeout(() => {
        if (spring.raf || performance.now() - lastT < 300) return;
        const list = stops(), y = scrollY;
        const near = list.reduce((p, q) => Math.abs(q - y) < Math.abs(p - y) ? q : p, list[0]);
        if (Math.abs(near - y) > 2) springTo(near);
      }, 220);
    }, { passive: true });
    addEventListener('resize', () => setTimeout(() => {
      if (!html.classList.contains('slides')) return;
      const list = stops(), y = scrollY;
      const near = list.reduce((p, q) => Math.abs(q - y) < Math.abs(p - y) ? q : p, list[0]);
      if (Math.abs(near - y) > 2) scrollTo(0, near);
    }, 200));
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const el = id === 'top' ? document.body : document.getElementById(id); if (!el) return;
    e.preventDefault();
    springTo(id === 'top' ? 0 : el.getBoundingClientRect().top + scrollY - railH());
    history.replaceState(null, '', '#' + id);
  });

  // c) staggered spring entrance for each chapter's blocks
  const blocks = sec => sec.querySelectorAll(':scope > .fit > .wrap > *');
  const secs = document.querySelectorAll('.slide:not(.hero)');
  secs.forEach(sec => [...blocks(sec)].filter(b => !b.classList.contains('origin')).forEach((b, i) => { b.classList.add('spring'); b.style.setProperty('--i', Math.min(i, 6)); }));
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.remove('arrive'); void e.target.offsetWidth; e.target.classList.add('arrive'); }
    else if (e.boundingClientRect.top > 0) e.target.classList.remove('arrive');   // replay when it comes back from below
  }), { threshold: .12 });
  secs.forEach(s => io.observe(s));
})();
