/* ============================================================
   3P — Invention Explainer — interactions
   ============================================================ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------
   makePlaceholder is defined inline in index.html <head>
   so img onerror handlers can call it before this file loads.
   ---------------------------------------------------------- */

/* ============================================================
   Memory volume — fixed, mouse-reactive 3D background (v2)
   Frames live in 5 depth bands. Near frames are larger, brighter,
   and swing strongly with the cursor; far frames are tiny, dim,
   and barely move. The differential parallax across bands is
   what reads as 3D depth.
   ============================================================ */
(function initBgCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  // ---- depth bands (0 = foreground, 4 = distant) -----------
  const BANDS = [
    { scale: 1.40, alpha: 0.18, stroke: 1.5,  pxX: 60, pxY: 38, weight: 0.08, proxMul: 1.00 },
    { scale: 1.10, alpha: 0.13, stroke: 1.0,  pxX: 40, pxY: 26, weight: 0.14, proxMul: 0.85 },
    { scale: 0.85, alpha: 0.09, stroke: 0.75, pxX: 25, pxY: 16, weight: 0.20, proxMul: 0.65 },
    { scale: 0.60, alpha: 0.06, stroke: 0.5,  pxX: 12, pxY: 8,  weight: 0.26, proxMul: 0.45 },
    { scale: 0.40, alpha: 0.04, stroke: 0.4,  pxX:  4, pxY: 3,  weight: 0.32, proxMul: 0.25 },
  ];
  const BASE_FW = 110;          // nominal frame width at scale 1
  const BASE_FH = 70;
  const DENSITY = 6800;         // px² per frame
  const PROX_RADIUS = 240;
  const PROX_BOOST = 0.20;      // max additive alpha near cursor (scaled by band)
  const CONN_RADIUS = 210;
  const CONN_RATE = 0.34;
  const WARM = [255, 184, 107];

  // simple seeded PRNG so the constellation is stable across redraws
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- state -----------------------------------------------
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let frames = [];              // [{x,y,band,iconKind,jx,jy}]
  let bandIndex = [];           // [[idx,...], ...] frames grouped by band
  let edgesByBand = [];         // [[{a,b},...], ...] edges, keyed by nearer endpoint's band
  let mx = 0.5, my = 0.5;
  let smx = 0.5, smy = 0.5;
  let rafId = 0;
  let mobile = window.innerWidth < 720;
  let isStatic = reduceMotion || mobile;

  // ---- build (called on init and resize) -------------------
  function buildGrid() {
    const bleed = 100;
    const area = (W + bleed * 2) * (H + bleed * 2);
    const targetCount = Math.max(80, Math.floor(area / DENSITY));
    const rand = mulberry32(0x3F00);

    frames = [];
    bandIndex = BANDS.map(() => []);
    edgesByBand = BANDS.map(() => []);

    // cumulative weights for band sampling
    const cum = [];
    let acc = 0;
    for (const b of BANDS) { acc += b.weight; cum.push(acc); }

    for (let i = 0; i < targetCount; i++) {
      const r = rand();
      let band = 0;
      while (band < cum.length - 1 && r > cum[band]) band++;
      const x = -bleed + rand() * (W + bleed * 2);
      const y = -bleed + rand() * (H + bleed * 2);
      const iconKind = Math.floor(rand() * 5);
      const jx = (rand() - 0.5) * 2;
      const jy = (rand() - 0.5) * 1.5;
      frames.push({ x, y, band, iconKind, jx, jy });
      bandIndex[band].push(i);
    }

    // edges: for each frame, link up to 2 nearest others within CONN_RADIUS
    // with probability CONN_RATE. Bucket by the nearer endpoint's band so
    // we can render back-to-front with edges interleaved correctly.
    const seen = new Set();
    const erand = mulberry32(0xC0FFEE);
    for (let i = 0; i < frames.length; i++) {
      const a = frames[i];
      const cand = [];
      for (let j = 0; j < frames.length; j++) {
        if (j === i) continue;
        const b = frames[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < CONN_RADIUS * CONN_RADIUS) cand.push([d2, j]);
      }
      cand.sort((p, q) => p[0] - q[0]);
      const take = Math.min(2, cand.length);
      for (let k = 0; k < take; k++) {
        const j = cand[k][1];
        const key = i < j ? (i * 100000 + j) : (j * 100000 + i);
        if (seen.has(key)) continue;
        if (erand() < CONN_RATE) {
          seen.add(key);
          const nearerBand = Math.min(frames[i].band, frames[j].band);
          edgesByBand[nearerBand].push({ a: i, b: j });
        }
      }
    }
  }

  // ---- resize ----------------------------------------------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    mobile = W < 720;
    isStatic = reduceMotion || mobile;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
    if (isStatic) drawOnce();
  }

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(resize, 180);
  });

  // ---- mouse tracking --------------------------------------
  window.addEventListener('mousemove', (e) => {
    mx = e.clientX / W;
    my = e.clientY / H;
  }, { passive: true });

  // ---- per-frame alpha including proximity boost -----------
  function alphaForFrame(f, dx, dy) {
    const band = BANDS[f.band];
    const x = f.x + dx;
    const y = f.y + dy;
    if (x < -BASE_FW || x > W + BASE_FW || y < -BASE_FH || y > H + BASE_FH) return -1;
    const px = mx * W, py = my * H;
    const dxm = x - px, dym = y - py;
    const d2 = dxm * dxm + dym * dym;
    if (d2 > PROX_RADIUS * PROX_RADIUS) return band.alpha;
    const dist = Math.sqrt(d2);
    const boost = (1 - dist / PROX_RADIUS) * PROX_BOOST * band.proxMul;
    return band.alpha + boost;
  }

  // ---- icon drawing ----------------------------------------
  // iconKind: 0=aperture, 1=play, 2=hex, 3=glasses, 4=sensor-grid
  function drawFrame(f, dx, dy, alpha) {
    const band = BANDS[f.band];
    const x = f.x + dx;
    const y = f.y + dy;
    const fw = BASE_FW * band.scale;
    const fh = BASE_FH * band.scale;
    const fx = x - fw / 2;
    const fy = y - fh / 2;
    const a = Math.max(0, Math.min(1, alpha));
    const warm = `rgba(${WARM[0]},${WARM[1]},${WARM[2]},`;

    // soft inner fill (gives each frame a dim "image area" feel)
    ctx.fillStyle = `rgba(255,255,255,${a * 0.04})`;
    ctx.fillRect(fx, fy, fw, fh);

    // outer frame stroke
    ctx.strokeStyle = warm + (a * 0.9) + ')';
    ctx.lineWidth = band.stroke;
    ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);

    // L-corner accents — skip on tiny distant frames
    if (band.scale > 0.55) {
      const corn = 4 * band.scale;
      ctx.strokeStyle = warm + (a * 1.5) + ')';
      ctx.beginPath();
      ctx.moveTo(fx - 1, fy + corn); ctx.lineTo(fx - 1, fy - 1); ctx.lineTo(fx + corn, fy - 1);
      ctx.moveTo(fx + fw + 1, fy + fh - corn); ctx.lineTo(fx + fw + 1, fy + fh + 1); ctx.lineTo(fx + fw - corn, fy + fh + 1);
      ctx.stroke();
    }

    // inner icon — only on bands where it'll read
    if (band.scale > 0.5) {
      const ix = x, iy = y;
      const r = Math.min(fw, fh) * 0.18;
      ctx.strokeStyle = warm + (a * 1.15) + ')';
      ctx.fillStyle = warm + (a * 1.15) + ')';
      ctx.lineWidth = band.stroke;
      switch (f.iconKind) {
        case 0:
          ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(ix, iy, r * 0.45, 0, Math.PI * 2); ctx.stroke();
          break;
        case 1:
          ctx.beginPath();
          ctx.moveTo(ix - r * 0.7, iy - r);
          ctx.lineTo(ix + r, iy);
          ctx.lineTo(ix - r * 0.7, iy + r);
          ctx.closePath();
          ctx.fill();
          break;
        case 2:
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = (Math.PI / 3) * k - Math.PI / 6;
            const px = ix + Math.cos(ang) * r;
            const py = iy + Math.sin(ang) * r;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
          break;
        case 3:
          ctx.beginPath(); ctx.arc(ix - r * 0.6, iy, r * 0.55, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(ix + r * 0.6, iy, r * 0.55, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ix - r * 0.18, iy); ctx.lineTo(ix + r * 0.18, iy); ctx.stroke();
          break;
        case 4: {
          const off = r * 0.45;
          for (let dxk = -1; dxk <= 1; dxk += 2) {
            for (let dyk = -1; dyk <= 1; dyk += 2) {
              ctx.beginPath();
              ctx.arc(ix + dxk * off, iy + dyk * off, 1.2 * band.scale, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          break;
        }
      }
    }

    // center anchor dot — drawn even on distant band so it reads as a "star"
    ctx.fillStyle = warm + (a * 1.3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.7, 1.5 * band.scale), 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- draw loop -------------------------------------------
  function draw(time) {
    smx += (mx - smx) * 0.12;
    smy += (my - smy) * 0.12;

    ctx.clearRect(0, 0, W, H);

    const breathing = isStatic ? 0 : Math.sin((time || 0) * 0.0004) * 0.04;
    const cx = smx - 0.5;
    const cy = smy - 0.5;

    // back-to-front: distant band first, foreground last
    for (let bIdx = BANDS.length - 1; bIdx >= 0; bIdx--) {
      // 1) edges whose nearer endpoint is in this band
      for (const e of edgesByBand[bIdx]) {
        const A = frames[e.a], B = frames[e.b];
        const bA = BANDS[A.band], bB = BANDS[B.band];
        const dxA = -cx * bA.pxX * 2 + A.jx;
        const dyA = -cy * bA.pxY * 2 + A.jy;
        const dxB = -cx * bB.pxX * 2 + B.jx;
        const dyB = -cy * bB.pxY * 2 + B.jy;
        const aA = alphaForFrame(A, dxA, dyA);
        const aB = alphaForFrame(B, dxB, dyB);
        if (aA < 0 && aB < 0) continue;
        const baseLineA = Math.min(bA.alpha, bB.alpha) * 0.5;
        const boost = ((aA < 0 ? 0 : aA - bA.alpha) + (aB < 0 ? 0 : aB - bB.alpha)) * 0.55;
        const lineA = Math.max(0, baseLineA + boost + breathing * 0.3);
        ctx.strokeStyle = `rgba(${WARM[0]},${WARM[1]},${WARM[2]},${lineA})`;
        ctx.lineWidth = Math.min(bA.stroke, bB.stroke) * 0.7;
        ctx.beginPath();
        ctx.moveTo(A.x + dxA, A.y + dyA);
        ctx.lineTo(B.x + dxB, B.y + dyB);
        ctx.stroke();
      }

      // 2) frames in this band
      const band = BANDS[bIdx];
      const dxBase = -cx * band.pxX * 2;
      const dyBase = -cy * band.pxY * 2;
      for (const i of bandIndex[bIdx]) {
        const f = frames[i];
        const dx = dxBase + f.jx;
        const dy = dyBase + f.jy;
        const a = alphaForFrame(f, dx, dy);
        if (a < 0) continue;
        drawFrame(f, dx, dy, a + breathing);
      }
    }

    if (!isStatic) rafId = requestAnimationFrame(draw);
  }

  function drawOnce() {
    // static render: center mouse so the parallax is neutral
    smx = 0.5; smy = 0.5;
    cancelAnimationFrame(rafId);
    draw(0);
  }

  // ---- boot -----------------------------------------------
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
