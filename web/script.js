/* ============================================================
   3P — Invention Explainer — interactions
   ============================================================ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------
   makePlaceholder is defined inline in index.html <head>
   so img onerror handlers can call it before this file loads.
   ---------------------------------------------------------- */

/* ============================================================
   Memory field — fixed background (v6)
   Three depth layers of POV thumbnails float gently on slow
   sine drift. A virtual cursor patrols the screen at ~25 px/s
   and softly brightens, adds a whitish-blue border, and tilts
   frames it passes (bottom layer fully; middle at half). The
   real mouse cursor does the same for the top layer (and
   middle at half). No parallax — only frames within range react.
   ============================================================ */
(function initBgCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  // ---- layers: 0 = top (user cursor), 2 = bottom (virtual) --
  const LAYERS = [
    { scale: 1.30, baseAlpha: 0.20, driftAmp: 4.0, count: 25 },
    { scale: 1.00, baseAlpha: 0.13, driftAmp: 3.0, count: 55 },
    { scale: 0.70, baseAlpha: 0.07, driftAmp: 2.0, count: 110 },
  ];
  const BASE_FS = 88;

  // ---- 4 staggered opacity oscillator groups -----------------
  const OSC = [
    { freq: 0.00028, phase: 0.0 },
    { freq: 0.00021, phase: 1.7 },
    { freq: 0.00035, phase: 3.1 },
    { freq: 0.00018, phase: 4.5 },
  ];

  // ---- cursor interaction params -----------------------------
  const INFLUENCE_R = 220;
  const ROT_MAX     = 0.07;   // ~4° max tilt under cursor
  const LERP_IN     = 0.045;  // speed approaching boosted state
  const LERP_OUT    = 0.025;  // speed receding (slower = soft linger)
  const GLOW_RGB    = '200,220,255';

  // ---- sprite sheet (color-graded once on load) -------------
  const SHEET_COLS = 9, SHEET_ROWS = 9;
  const sheet = new Image();
  let sheetReady = false;
  let sheetSrc = null;
  let cellPxW = 0, cellPxH = 0;
  sheet.onload = () => {
    if (!sheet.naturalWidth) return;
    cellPxW = sheet.naturalWidth  / SHEET_COLS;
    cellPxH = sheet.naturalHeight / SHEET_ROWS;
    try {
      const oc = document.createElement('canvas');
      oc.width = sheet.naturalWidth; oc.height = sheet.naturalHeight;
      const octx = oc.getContext('2d');
      if (octx && 'filter' in octx) {
        octx.filter = 'saturate(0.72) brightness(0.92) contrast(1.05)';
        octx.drawImage(sheet, 0, 0);
        sheetSrc = oc;
      } else { sheetSrc = sheet; }
    } catch (e) { sheetSrc = sheet; }
    sheetReady = true;
    if (isStatic) drawOnce();
  };
  sheet.src = 'images/pov-sheet.png';

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- state -------------------------------------------------
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let frames = [];
  let layerIndex = [];
  let mobile = window.innerWidth < 720;
  let isStatic = reduceMotion || mobile;
  let rafId = 0;

  // user cursor
  let umx = -1, umy = -1;
  let ucx = 0, ucy = 0;
  let userActive = false;

  // virtual cursor
  let vcx = 0, vcy = 0;
  let vcStartX = 0, vcStartY = 0;
  let vtx = 0, vty = 0;
  let vcStartT = 0, vcDurMs = 1;

  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

  // ---- build grid -------------------------------------------
  function buildGrid() {
    const bleed = 100;
    const rand = mulberry32(0x3F00);
    frames = [];
    layerIndex = LAYERS.map(() => []);

    for (let l = 0; l < LAYERS.length; l++) {
      const lay = LAYERS[l];
      for (let i = 0; i < lay.count; i++) {
        const x = -bleed + rand() * (W + bleed * 2);
        const y = -bleed + rand() * (H + bleed * 2);
        const spriteIdx = Math.floor(rand() * SHEET_COLS * SHEET_ROWS);
        const oscGroup  = Math.floor(rand() * OSC.length);
        const baseRot   = (rand() - 0.5) * 0.035;        // ±1° stable tilt
        const driftPhase = rand() * Math.PI * 2;
        const rotSign   = rand() < 0.5 ? 1 : -1;          // stable tilt direction
        const fi = frames.length;
        frames.push({
          x, y, layer: l, spriteIdx, oscGroup,
          baseRot, driftPhase, rotSign,
          driftAmp: lay.driftAmp,
          cAlphaBoost: 0, cGlow: 0, cRotOffset: 0,
        });
        layerIndex[l].push(fi);
      }
    }

    vcx = W / 2; vcy = H / 2;
    pickVcTarget(performance.now());
  }

  // ---- virtual cursor walk ----------------------------------
  function pickVcTarget(now) {
    vcStartX = vcx; vcStartY = vcy;
    vtx = W * 0.1 + Math.random() * W * 0.8;
    vty = H * 0.1 + Math.random() * H * 0.8;
    const dist = Math.sqrt((vtx - vcx) ** 2 + (vty - vcy) ** 2);
    vcDurMs = Math.max(2000, dist / 0.025);  // ~25 px/s
    vcStartT = now;
  }

  function stepVcursor(now) {
    const p = Math.min(1, (now - vcStartT) / vcDurMs);
    const ep = easeInOutSine(p);
    vcx = vcStartX + (vtx - vcStartX) * ep;
    vcy = vcStartY + (vty - vcStartY) * ep;
    if (p >= 1) pickVcTarget(now);
  }

  // ---- interaction lerp (fills cAlphaBoost/cGlow/cRotOffset)-
  function computeInteractions() {
    const ucOn = userActive;
    const invR = 1 / INFLUENCE_R;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      let tBoost = 0, tGlow = 0, tRot = 0;

      function apply(cx, cy, intensity) {
        const dx = f.x - cx, dy = f.y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= INFLUENCE_R) return;
        let k = 1 - d * invR; k *= k;  // softened falloff
        tBoost += k * 0.9  * intensity;
        tGlow  += k * 0.55 * intensity;
        tRot   += f.rotSign * k * intensity * ROT_MAX;
      }

      if (f.layer === 0) {
        if (ucOn) apply(ucx, ucy, 1.0);
      } else if (f.layer === 1) {
        if (ucOn) apply(ucx, ucy, 0.5);
        apply(vcx, vcy, 0.5);
      } else {
        apply(vcx, vcy, 1.0);
      }

      const bLerp = tBoost > f.cAlphaBoost ? LERP_IN : LERP_OUT;
      const gLerp = tGlow  > f.cGlow       ? LERP_IN : LERP_OUT;
      const rLerp = Math.abs(tRot) > Math.abs(f.cRotOffset) ? LERP_IN : LERP_OUT;
      f.cAlphaBoost += (tBoost - f.cAlphaBoost) * bLerp;
      f.cGlow       += (tGlow  - f.cGlow)        * gLerp;
      f.cRotOffset  += (tRot   - f.cRotOffset)   * rLerp;
    }
  }

  // ---- rounded-rect path helper -----------------------------
  function pathRoundRect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- resize -----------------------------------------------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    mobile = W < 720; isStatic = reduceMotion || mobile;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    buildGrid();
    if (isStatic) drawOnce();
  }

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 180); });

  // ---- mouse tracking ---------------------------------------
  window.addEventListener('mousemove', (e) => {
    umx = e.clientX; umy = e.clientY; userActive = true;
  }, { passive: true });
  window.addEventListener('mouseleave', () => { userActive = false; });
  window.addEventListener('blur',       () => { userActive = false; });

  // ---- draw loop --------------------------------------------
  function draw(time) {
    const t = time || performance.now();

    if (userActive) {
      ucx += (umx - ucx) * 0.08;
      ucy += (umy - ucy) * 0.08;
    }
    if (!isStatic) stepVcursor(t);
    computeInteractions();

    ctx.clearRect(0, 0, W, H);

    // draw bottom → top (layer 2 first, then 1, then 0)
    for (let l = LAYERS.length - 1; l >= 0; l--) {
      const lay = LAYERS[l];
      const list = layerIndex[l];
      for (let k = 0; k < list.length; k++) {
        const f = frames[list[k]];

        // cull frames well off-screen
        const hw = (BASE_FS * lay.scale) / 2;
        if (f.x < -hw * 3 || f.x > W + hw * 3 ||
            f.y < -hw * 3 || f.y > H + hw * 3) continue;

        // slow sine float (no translation from cursor)
        const floatX = Math.sin(t * 0.00040 + f.driftPhase) * f.driftAmp;
        const floatY = Math.cos(t * 0.00031 + f.driftPhase) * f.driftAmp * 0.7;

        // oscillation group breathing
        const osc = OSC[f.oscGroup];
        const oscM = 1 + Math.sin(t * osc.freq + osc.phase) * 0.30;

        const baseA = lay.baseAlpha * oscM;
        const a = Math.min(1, baseA * (1 + f.cAlphaBoost * 1.2));
        if (a < 0.005) continue;

        const px = f.x + floatX;
        const py = f.y + floatY;
        const s  = lay.scale;
        const fw = BASE_FS * s;
        const cornerR = Math.max(1, 3 * s);

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.translate(px, py);
        ctx.rotate(f.baseRot + f.cRotOffset);

        // thumbnail clipped to rounded rect
        if (sheetReady && sheetSrc) {
          const col = f.spriteIdx % SHEET_COLS;
          const row = (f.spriteIdx / SHEET_COLS) | 0;
          pathRoundRect(-fw / 2, -fw / 2, fw, fw, cornerR);
          ctx.save();
          ctx.clip();
          ctx.globalAlpha = a;
          ctx.drawImage(sheetSrc,
            col * cellPxW, row * cellPxH, cellPxW, cellPxH,
            -fw / 2, -fw / 2, fw, fw);
          ctx.restore();
        } else {
          pathRoundRect(-fw / 2, -fw / 2, fw, fw, cornerR);
          ctx.save();
          ctx.clip();
          ctx.globalAlpha = a * 0.12;
          ctx.fillStyle = '#fff';
          ctx.fillRect(-fw / 2, -fw / 2, fw, fw);
          ctx.restore();
        }

        // whitish-blue glow border — only when cursor is near
        if (f.cGlow > 0.01) {
          pathRoundRect(-fw / 2, -fw / 2, fw, fw, cornerR);
          ctx.globalAlpha = f.cGlow * 0.6;
          ctx.lineWidth = 1.5 * s;
          ctx.strokeStyle = `rgba(${GLOW_RGB},1)`;
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    if (!isStatic) rafId = requestAnimationFrame(draw);
  }

  function drawOnce() {
    cancelAnimationFrame(rafId);
    userActive = false;
    draw(performance.now());
  }

  resize();
  if (!isStatic) rafId = requestAnimationFrame(draw);
})();


/* ----------------------------------------------------------
   Smooth scroll — Lenis
   ---------------------------------------------------------- */
let lenis;
if (!reduceMotion && window.Lenis) {
  lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  if (window.ScrollTrigger && window.gsap) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
}

/* ----------------------------------------------------------
   Scroll progress bar + topbar state
   ---------------------------------------------------------- */
const progressBar = document.querySelector('.progress span');
const topbar = document.querySelector('.topbar');

function onScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, max)));
  if (progressBar) progressBar.style.width = (p * 100) + '%';
  if (topbar) topbar.classList.toggle('scrolled', window.scrollY > 8);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ----------------------------------------------------------
   Reveal on scroll (IntersectionObserver)
   ---------------------------------------------------------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.18 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* Special: trigger gap-frame overlay reveal */
const gapFrame = document.querySelector('.gap-frame');
if (gapFrame) {
  const gio = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.isIntersecting && e.target.classList.add('in'));
  }, { threshold: 0.5 });
  gio.observe(gapFrame);
}

/* ----------------------------------------------------------
   1 — Hero spotlight follows cursor
   ---------------------------------------------------------- */
const hero = document.querySelector('.hero');
const spotlight = document.querySelector('.spotlight');
if (hero && spotlight && !reduceMotion) {
  hero.addEventListener('mousemove', (e) => {
    const rect = hero.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    spotlight.style.setProperty('--mx', x + '%');
    spotlight.style.setProperty('--my', y + '%');
  });
}

/* ----------------------------------------------------------
   3 — Promise (pinned pull-back)
   ---------------------------------------------------------- */
if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);

  const promise = document.querySelector('.promise');
  const pov = document.querySelector('.promise-img.pov');
  const exo = document.querySelector('.promise-img.exo');

  if (promise && pov && exo) {
    ScrollTrigger.create({
      trigger: promise,
      start: 'top top',
      end: '+=120%',
      pin: '.promise-pin',
      pinSpacing: true,
      scrub: 0.6,
      onUpdate: (self) => {
        const p = self.progress;
        // POV pulls back (scales down + drifts) and fades
        const povScale = 1 - p * 0.35;
        const povOpacity = 1 - Math.max(0, (p - 0.4) / 0.4);
        pov.style.transform = `scale(${povScale}) translateY(${p * 4}%)`;
        pov.style.opacity = Math.max(0, povOpacity);
        // EXO emerges
        const exoStart = 0.35;
        const exoP = Math.max(0, (p - exoStart) / (1 - exoStart));
        const exoScale = 1.06 - exoP * 0.06;
        exo.style.opacity = exoP;
        exo.style.transform = `scale(${exoScale})`;
      },
    });
  }
}

/* ----------------------------------------------------------
   4 — How it works (pinned stepper)
   ---------------------------------------------------------- */
if (window.gsap && window.ScrollTrigger) {
  const how = document.querySelector('.how');
  const steps = document.querySelectorAll('.how-steps .step');
  const visuals = document.querySelectorAll('.how-visual .hv');

  if (how && steps.length === visuals.length && steps.length > 0) {
    const total = steps.length; // 6

    ScrollTrigger.create({
      trigger: how,
      start: 'top top',
      end: '+=' + (total * 80) + '%',
      pin: '.how-pin',
      pinSpacing: true,
      scrub: false,
      onUpdate: (self) => {
        const idx = Math.min(total - 1, Math.floor(self.progress * total));
        steps.forEach((s, i)   => s.classList.toggle('active', i === idx));
        visuals.forEach((v, i) => v.classList.toggle('active', i === idx));
      },
    });
  }

  /* Frame counter ticking on visual 1 */
  const counterEl = document.querySelector('[data-counter]');
  if (counterEl) {
    let t = 0;
    setInterval(() => {
      const hv1 = document.querySelector('.hv-1');
      if (!hv1 || !hv1.classList.contains('active')) return;
      t += 1;
      const h = String(Math.floor(t / 3600)).padStart(2, '0');
      const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
      const s = String(t % 60).padStart(2, '0');
      counterEl.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }
}

/* ----------------------------------------------------------
   4 — Buffer SVG frames (visuals 2 & 3)
   ---------------------------------------------------------- */
function drawBufferFrames(groupSelector, options) {
  const group = document.querySelector(groupSelector);
  if (!group) return;
  const count = 24, cx = 100, cy = 100, r = 68;
  const ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', x.toFixed(2));
    c.setAttribute('cy', y.toFixed(2));
    c.setAttribute('r', '2.2');
    const isSaved = options.savedRange &&
                    i >= options.savedRange[0] && i <= options.savedRange[1];
    c.setAttribute('fill', isSaved ? 'var(--warm)' : 'var(--cool)');
    c.setAttribute('opacity', isSaved ? '1' : (0.2 + (i / count) * 0.6).toFixed(2));
    if (isSaved) c.style.filter = 'drop-shadow(0 0 4px var(--warm))';
    group.appendChild(c);
  }
}
drawBufferFrames('.buffer-frames', {});
drawBufferFrames('.buffer-frames-saved', { savedRange: [8, 16] });

/* ----------------------------------------------------------
   4 — Timeline segments (visual 4)
   ---------------------------------------------------------- */
(function () {
  const segs = document.querySelector('.tl-segs');
  if (!segs) return;
  const ns = 'http://www.w3.org/2000/svg';
  const segments = [
    { x: 30,  w: 25,  remarkable: false },
    { x: 60,  w: 35,  remarkable: false },
    { x: 100, w: 20,  remarkable: true },
    { x: 125, w: 45,  remarkable: false },
    { x: 175, w: 30,  remarkable: true },
    { x: 210, w: 25,  remarkable: false },
    { x: 240, w: 35,  remarkable: true },
    { x: 280, w: 18,  remarkable: false },
  ];
  segments.forEach((s) => {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', s.x);
    r.setAttribute('y', s.remarkable ? 30 : 36);
    r.setAttribute('width', s.w);
    r.setAttribute('height', s.remarkable ? 20 : 8);
    r.setAttribute('rx', 1.5);
    r.setAttribute('fill', s.remarkable ? 'var(--warm)' : 'rgba(255,255,255,0.22)');
    if (s.remarkable) r.style.filter = 'drop-shadow(0 0 6px var(--warm))';
    segs.appendChild(r);
  });
})();

/* ----------------------------------------------------------
   4 — Angle visual (visual 5)
   ---------------------------------------------------------- */
(function () {
  const cams = document.querySelector('.angle-cams');
  const rays = document.querySelector('.angle-rays');
  if (!cams) return;
  const ns = 'http://www.w3.org/2000/svg';
  const cx = 120, cy = 120, r = 88;
  const n = 9, winner = 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', i === winner ? 7 : 4);
    dot.setAttribute('fill', i === winner ? 'var(--warm)' : 'var(--cool)');
    dot.setAttribute('opacity', i === winner ? '1' : '0.55');
    if (i === winner) dot.style.filter = 'drop-shadow(0 0 8px var(--warm))';
    cams.appendChild(dot);

    if (rays && i === winner) {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', cx); line.setAttribute('y1', cy);
      line.setAttribute('x2', x);  line.setAttribute('y2', y);
      line.setAttribute('stroke', 'var(--warm)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '2 4');
      line.setAttribute('opacity', '0.7');
      rays.appendChild(line);
    }
  }
})();

/* ----------------------------------------------------------
   5 — Trigger hover/tap reveals
   ---------------------------------------------------------- */
(function () {
  const ring = document.querySelector('.trigger-ring');
  const detailEl = document.querySelector('.trigger-detail');
  if (!ring || !detailEl) return;

  const detail = {
    motion: 'A sudden burst of movement. Dancing. A hug.',
    audio:  'Laughter. A raised voice. Music starting.',
    face:   'Someone new walking into the moment.',
    place:  'A location you haven’t been to before.',
    heart:  'A spike in heart rate. Something stirred you.',
    time:   'An anomaly in your day’s rhythm.',
  };
  const def = 'Hover a signal to see what it listens for.';

  const trigs = ring.querySelectorAll('.trig');
  trigs.forEach((t) => {
    const key = t.dataset.trig;
    t.addEventListener('mouseenter', () => {
      ring.classList.add('dim');
      trigs.forEach((x) => x.classList.toggle('focus', x === t));
      detailEl.textContent = detail[key] || def;
    });
    t.addEventListener('mouseleave', () => {
      ring.classList.remove('dim');
      trigs.forEach((x) => x.classList.remove('focus'));
      detailEl.textContent = def;
    });
    t.addEventListener('click', () => {
      ring.classList.add('dim');
      trigs.forEach((x) => x.classList.toggle('focus', x === t));
      detailEl.textContent = detail[key] || def;
    });
  });
})();

/* ----------------------------------------------------------
   6 — Novelty fingerprint
   ---------------------------------------------------------- */
(function () {
  const baselineG = document.querySelector('.fp-baseline');
  const todayG    = document.querySelector('.fp-today');
  if (!baselineG || !todayG) return;
  const ns = 'http://www.w3.org/2000/svg';

  function rand(seed) {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function drawRing(group, values, innerR, minLen) {
    group.innerHTML = '';
    const n = values.length;
    values.forEach((v, i) => {
      if (v <= 0) return; // skip empty (lets baseline show through)
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r1 = innerR;
      const r2 = innerR + minLen + v * 36;
      const x1 = Math.cos(a) * r1, y1 = Math.sin(a) * r1;
      const x2 = Math.cos(a) * r2, y2 = Math.sin(a) * r2;
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1.toFixed(2));
      l.setAttribute('y1', y1.toFixed(2));
      l.setAttribute('x2', x2.toFixed(2));
      l.setAttribute('y2', y2.toFixed(2));
      group.appendChild(l);
    });
  }

  function dayData(seed, novelty) {
    const r = rand(seed);
    const base = Array.from({ length: 48 }, () => 0.2 + r() * 0.4);
    // today: only show bars where there's a real deviation from baseline.
    const today = base.map(() => 0);
    if (novelty.length) {
      novelty.forEach((idx) => { today[idx] = 0.7 + Math.random() * 0.3; });
    }
    return { base, today };
  }

  const days = {
    mon: { seed: 11, spikes: [6, 22] },
    tue: { seed: 17, spikes: [14] },
    wed: { seed: 23, spikes: [10, 30, 41] },
    thu: { seed: 29, spikes: [] },
    fri: { seed: 31, spikes: [38, 44] },
    sat: { seed: 37, spikes: [3, 12, 26, 33] },
  };

  function show(key) {
    const d = days[key];
    const { base, today } = dayData(d.seed, d.spikes);
    drawRing(baselineG, base,  46, 6);
    drawRing(todayG,    today, 46, 14);
  }

  show('mon');

  document.querySelectorAll('.fp-toggle button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.fp-toggle button').forEach((x) => x.classList.toggle('active', x === b));
      show(b.dataset.day);
    });
  });
})();

/* ----------------------------------------------------------
   7 — Privacy flow particles
   ---------------------------------------------------------- */
(function () {
  const particles = document.querySelector('.flow-particles');
  const saved = document.querySelector('.flow-saved');
  if (!particles || !saved) return;
  const ns = 'http://www.w3.org/2000/svg';

  // continuous stream around glasses (these never leave)
  const ringFrames = [];
  for (let i = 0; i < 12; i++) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', '1.8');
    c.setAttribute('cx', '0'); c.setAttribute('cy', '0');
    particles.appendChild(c);
    ringFrames.push(c);
  }

  // savedDot — fires occasionally and travels to phone
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('r', '3.4');
  dot.setAttribute('cx', '80'); dot.setAttribute('cy', '110');
  dot.style.opacity = '0';
  saved.appendChild(dot);

  if (reduceMotion) return;

  let start = performance.now();
  function tick(now) {
    const t = (now - start) / 1000;

    // animate ring frames around glasses
    ringFrames.forEach((c, i) => {
      const phase = t * 0.6 + (i / ringFrames.length) * Math.PI * 2;
      const radius = 56 + Math.sin(phase * 2) * 6;
      const x = 80 + Math.cos(phase) * radius;
      const y = 110 + Math.sin(phase) * radius;
      c.setAttribute('cx', x.toFixed(2));
      c.setAttribute('cy', y.toFixed(2));
      c.setAttribute('opacity', (0.2 + (Math.sin(phase * 1.5) + 1) * 0.2).toFixed(2));
    });

    // savedDot — fire every ~4 seconds
    const cycle = (t % 4) / 4;
    if (cycle < 0.6) {
      const p = cycle / 0.6;
      const x = 80 + (640 - 80) * p;
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', 110);
      dot.style.opacity = (p < 0.1 ? p * 10 : (p > 0.85 ? (1 - p) / 0.15 : 1)).toFixed(2);
    } else {
      dot.style.opacity = 0;
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* ----------------------------------------------------------
   8 — Confidence torch (cursor-driven)
   ---------------------------------------------------------- */
(function () {
  const torch = document.querySelector('.torch');
  if (!torch) return;
  function move(e) {
    const rect = torch.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    torch.style.setProperty('--tx', x + '%');
    torch.style.setProperty('--ty', y + '%');
  }
  torch.addEventListener('mousemove', move);
  torch.addEventListener('touchmove', (e) => {
    if (e.touches[0]) move(e.touches[0]);
  }, { passive: true });
})();

/* ----------------------------------------------------------
   9 — Angle picker
   ---------------------------------------------------------- */
(function () {
  const picker = document.querySelector('.angle-picker');
  if (!picker) return;
  const ring = picker.querySelector('.ap-ring');
  const imgs = picker.querySelectorAll('.ap-img');
  const scoreEl = picker.querySelector('.ap-score');
  const nameEl  = picker.querySelector('.ap-name');

  // 9 angles arranged in a circle around the central stage.
  // 3 are 'real' (mapped to images a/b/c), the rest are silhouettes.
  const angles = [
    { angle: null, score: 0.41 },
    { angle: 'b',  score: 0.62 },
    { angle: null, score: 0.33 },
    { angle: 'c',  score: 0.71 },
    { angle: null, score: 0.28 },
    { angle: null, score: 0.47 },
    { angle: 'a',  score: 0.84, winner: true },
    { angle: null, score: 0.39 },
    { angle: null, score: 0.55 },
  ];

  angles.forEach((a, i) => {
    const cam = document.createElement('button');
    cam.className = 'ap-cam' + (a.winner ? ' winner' : '');
    cam.setAttribute('aria-label', `angle ${i + 1}, score ${a.score}`);
    cam.innerHTML = `<span class="cam-score">${a.score.toFixed(2)}</span>`;
    // position on a circle, 50% radius
    const theta = (i / angles.length) * Math.PI * 2 - Math.PI / 2;
    const radius = 46; // % of container
    const left = 50 + Math.cos(theta) * radius;
    const top  = 50 + Math.sin(theta) * radius;
    cam.style.left = `calc(${left}% - 22px)`;
    cam.style.top  = `calc(${top}% - 22px)`;

    cam.addEventListener('mouseenter', () => {
      imgs.forEach((im) => im.classList.toggle('active', im.dataset.angle === a.angle));
      if (scoreEl) scoreEl.textContent = a.score.toFixed(2);
      if (nameEl)  nameEl.textContent  = a.winner ? 'selected' : `candidate · ${i + 1}`;
    });
    cam.addEventListener('mouseleave', () => {
      // restore winner
      const winnerIdx = angles.findIndex((x) => x.winner);
      const w = angles[winnerIdx];
      imgs.forEach((im) => im.classList.toggle('active', im.dataset.angle === w.angle));
      if (scoreEl) scoreEl.textContent = w.score.toFixed(2);
      if (nameEl)  nameEl.textContent  = 'selected';
    });
    ring.appendChild(cam);
  });
})();
