(function(){'use strict';
/* ==========================================================================
   00 CORE: helpers, smooth scroll engine, text splitting, scroll reveals
   (This file and its siblings are joined in order inside one IIFE by tools/build/build.js)
   ========================================================================== */
const doc = document;
const root = doc.documentElement;
const $ = (s, c) => (c || doc).querySelector(s);
const $$ = (s, c) => Array.prototype.slice.call((c || doc).querySelectorAll(s));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hasGSAP = !!(window.gsap && window.ScrollTrigger);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const money = (n) => '$' + fmt(n);
const roundTo = (n, step) => Math.round(n / step) * step;
const hm = (h) => {
  const t = Math.round(h * 60);
  const hh = Math.floor(t / 60);
  const mm = t % 60;
  if (!hh) return mm + ' min';
  return mm ? hh + ' hr ' + mm + ' min' : hh + ' hr';
};
const safe = (name, fn) => {
  try {
    fn();
  } catch (e) {
    if (window.console) console.error('[site] ' + name, e);
  }
};
const dataEl = $('#skv-data');
const DATA = dataEl ? JSON.parse(dataEl.textContent) : null;

/** Analytics helper: pushes to dataLayer, gtag and the Meta pixel when present. */
function evt(name, params) {
  const p = params || {};
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name }, p));
    if (typeof window.gtag === 'function') window.gtag('event', name, p);
    if (typeof window.fbq === 'function' && name === 'generate_lead') window.fbq('track', 'Lead');
  } catch (_) {}
}

/* ---------------------------------------------------------------- scroll engine */
let lenis = null;
const scrollers = [];
const onScroll = (fn) => scrollers.push(fn);
const runScrollers = (y) => {
  for (let i = 0; i < scrollers.length; i++) scrollers[i](y);
};
const getY = () => (lenis ? lenis.scroll : window.scrollY);

function initScroll() {
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }
  if (!reduce && window.Lenis) {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    window.__lenis = lenis;
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => {
        lenis.raf(t);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
    lenis.on('scroll', (e) => runScrollers(e.scroll));
  } else {
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          runScrollers(window.scrollY);
        });
      },
      { passive: true }
    );
  }
  runScrollers(window.scrollY);
}

/** Smooth in-page anchor links (works with and without Lenis). */
function initAnchors() {
  doc.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = doc.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const hdr = parseInt(getComputedStyle(root).getPropertyValue('--hdr'), 10) || 76;
    if (lenis) lenis.scrollTo(target, { offset: -(hdr + 12), duration: 1.4 });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });
}

/* ---------------------------------------------------------------- text splitting */
function splitEl(el) {
  if (el.classList.contains('is-split')) return;
  let n = 0;
  const walk = (node) => {
    Array.prototype.slice.call(node.childNodes).forEach((ch) => {
      if (ch.nodeType === 3) {
        const parts = ch.textContent.split(/(\s+)/);
        const frag = doc.createDocumentFragment();
        parts.forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) {
            frag.appendChild(doc.createTextNode(' '));
            return;
          }
          const w = doc.createElement('span');
          w.className = 'w';
          const wi = doc.createElement('span');
          wi.className = 'wi';
          wi.style.setProperty('--i', n++);
          wi.textContent = p;
          w.appendChild(wi);
          frag.appendChild(w);
        });
        node.replaceChild(frag, ch);
      } else if (ch.nodeType === 1 && !ch.classList.contains('w')) {
        walk(ch);
      }
    });
  };
  walk(el);
  el.classList.add('is-split');
}

/* ---------------------------------------------------------------- scroll reveals */
function initReveal() {
  $$('[data-split]').forEach(splitEl);
  // sequence siblings that reveal together
  const groups = new Map();
  $$('[data-reveal],[data-split]').forEach((el) => {
    const p = el.parentElement;
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(el);
  });
  groups.forEach((list) => {
    if (list.length > 1) list.forEach((el, i) => el.style.setProperty('--d', (i * 0.09).toFixed(2) + 's'));
  });
  $$('[data-stagger]').forEach((c) => {
    Array.prototype.forEach.call(c.children, (ch, i) => ch.style.setProperty('--i', Math.min(i, 10)));
  });
  const targets = $$('[data-reveal],[data-split],[data-stagger],[data-bars]');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((t) => t.classList.add('is-in', 'is-settled'));
    return;
  }
  // a clip-path reveal starts fully clipped, so the element itself never "intersects":
  // watch its parent instead and reveal the clipped children together
  const proxy = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        io.unobserve(el);
        const list = proxy.get(el) || [el];
        list.forEach((t) => {
          t.classList.add('is-in');
          if (t.hasAttribute('data-stagger')) {
            const n = Math.min(t.children.length, 11);
            setTimeout(() => t.classList.add('is-settled'), 1000 + n * 90);
          }
        });
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.01 }
  );
  targets.forEach((t) => {
    if (t.getAttribute('data-reveal') === 'clip' && t.parentElement) {
      const p = t.parentElement;
      if (!proxy.has(p)) { proxy.set(p, []); io.observe(p); }
      proxy.get(p).push(t);
    } else io.observe(t);
  });
}

/** Pixel-accurate parallax for [data-parallax] layers. */
function sceneParallax() {
  if (!hasGSAP || reduce) return;
  $$('[data-parallax]').forEach((el) => {
    const s = parseFloat(el.getAttribute('data-parallax')) || 0.12;
    const parent = el.parentElement;
    const extra = s * 100 + 2;
    el.style.top = '-' + extra + '%';
    el.style.bottom = '-' + extra + '%';
    gsap.fromTo(
      el,
      { y: () => -parent.offsetHeight * s },
      {
        y: () => parent.offsetHeight * s,
        ease: 'none',
        scrollTrigger: { trigger: parent, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
      }
    );
  });
}

/* ==========================================================================
   10 SCENES: scroll-driven set pieces (hero take-off, fleet gallery, route map, steps, landing)
   ========================================================================== */
const DESKTOP = '(min-width: 901px)';
const mm = hasGSAP ? gsap.matchMedia() : null;

/* ---------------------------------------------------------------- hero: scroll to take off */
function sceneHero() {
  const hero = $('[data-hero]');
  if (!hero) return;
  const title = $('[data-hero-title]', hero);
  const ground = $('.hero-ground', hero);
  const sky = $('.hero-sky', hero);
  const inner = $('.hero-in', hero);
  const shade = $('.hero-shade', hero);
  const cue = $('.scroll-cue', hero);
  const altEl = $('[data-hud-alt]', hero);
  const spdEl = $('[data-hud-spd]', hero);
  const stEl = $('[data-hud-status]', hero);

  // intro: headline words rise, then the rest of the hero fades up
  if (title) {
    title.setAttribute('data-split', '');
    splitEl(title);
  }
  const go = () => {
    hero.classList.add('is-go');
    if (title) title.classList.add('is-in');
  };
  const groundImg = $('.hero-ground-img', hero);
  const ready = Promise.all([
    doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve(),
    groundImg && !groundImg.complete ? new Promise((r) => { groundImg.addEventListener('load', r, { once: true }); groundImg.addEventListener('error', r, { once: true }); }) : Promise.resolve(),
  ]);
  Promise.race([ready, new Promise((r) => setTimeout(r, 1800))]).then(() => requestAnimationFrame(go));

  const stages = [[0, 'Boarding'], [0.09, 'Taxiing'], [0.2, 'Take-off roll'], [0.34, 'Climbing'], [0.72, 'Cruising']];
  const setHud = (p) => {
    if (altEl) altEl.textContent = fmt(Math.round((35000 * easeInOut(clamp((p - 0.26) / 0.74, 0, 1))) / 100) * 100);
    if (spdEl) {
      const v = p < 0.09 ? 0 : p < 0.3 ? lerp(0, 160, (p - 0.09) / 0.21) : lerp(160, 480, (p - 0.3) / 0.7);
      spdEl.textContent = fmt(v);
    }
    if (stEl) {
      let label = stages[0][1];
      stages.forEach((s) => { if (p >= s[0]) label = s[1]; });
      if (stEl.textContent !== label) stEl.textContent = label;
    }
  };
  setHud(0);

  if (!mm || reduce) return;
  mm.add(DESKTOP, () => {
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: '+=180%',
        pin: true,
        scrub: 0.55,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => setHud(self.progress),
      },
    });
    tl.to(ground, { scale: 1.4, yPercent: 7, duration: 1 }, 0)
      .to(ground, { opacity: 0, duration: 0.55 }, 0.34)
      .fromTo(sky, { scale: 1.38 }, { scale: 1, duration: 1 }, 0)
      .to(inner, { yPercent: -24, opacity: 0, duration: 0.5 }, 0.08)
      .to(shade, { opacity: 0.6, duration: 1 }, 0);
    if (cue) tl.to(cue, { opacity: 0, duration: 0.15 }, 0);
    return () => setHud(0);
  });
  mm.add('(max-width: 900px)', () => {
    gsap.to(ground, { yPercent: 10, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  });
}

/** Loads the hero video lazily on capable desktop connections, and pauses it when off-screen. */
function sceneVideo() {
  const v = $('.hero-video');
  if (!v || reduce) return;
  const conn = navigator.connection || {};
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '') || window.innerWidth < 900) return;
  const start = () => {
    v.src = window.innerWidth > 1500 && v.dataset.srcHd ? v.dataset.srcHd : v.dataset.srcSd || v.dataset.srcHd;
    v.muted = true;
    const p = v.play();
    if (p && p.then) p.then(() => v.classList.add('is-playing')).catch(() => {});
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => {
        en.forEach((x) => (x.isIntersecting ? v.play().catch(() => {}) : v.pause()));
      }).observe(v.closest('.hero'));
    }
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 900));
  if (doc.readyState === 'complete') idle(start);
  else window.addEventListener('load', () => idle(start), { once: true });
}

/* ---------------------------------------------------------------- fleet: horizontal scroll */
function sceneFleet() {
  const sec = $('[data-fleet-h]');
  if (!sec || !mm || reduce) return;
  const track = $('[data-fleet-track]', sec);
  const bar = $('[data-fleet-bar]', sec);
  const idx = $('[data-fleet-idx]', sec);
  const cards = $$('.fcard', track).filter((c) => !c.classList.contains('fcard--end'));
  mm.add(DESKTOP, () => {
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: () => '+=' + dist(),
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (bar) bar.style.transform = 'scaleX(' + Math.max(0.04, self.progress).toFixed(3) + ')';
          if (idx) {
            const i = clamp(Math.round(self.progress * (cards.length - 1)) + 1, 1, cards.length);
            const s = '0' + i;
            if (idx.textContent !== s) idx.textContent = s;
          }
        },
      },
    });
    cards.forEach((card) => {
      const im = $('.fcard-media .ph', card);
      if (!im) return;
      gsap.set(im, { scale: 1.2 });
      gsap.fromTo(
        im,
        { xPercent: -6 },
        { xPercent: 6, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } }
      );
    });
  });
}

/* ---------------------------------------------------------------- route map scene */
function sceneMap() {
  const sc = $('[data-mapscene]');
  if (!sc || !hasGSAP) return;
  const svg = $('.route-map-svg', sc);
  const sweep = $('.map-sweep', sc);
  const items = $$('[data-route-i]', sc);
  const live = $('[data-map-live]', sc);
  const groups = $$('.map-route', sc);
  if (!svg || !groups.length) return;
  if (reduce) {
    items.forEach((i) => i.classList.add('is-done'));
    if (live) live.textContent = groups.length;
    return;
  }
  const W = parseFloat(sweep.getAttribute('width')) || 1000;
  const arcs = groups.map((g) => {
    const path = $('.map-arc', g);
    return { path, plane: $('.map-plane', g), len: path.getTotalLength() };
  });
  const place = (a, p) => {
    const L = a.len * p;
    const pt = a.path.getPointAtLength(L);
    const pt2 = a.path.getPointAtLength(Math.min(a.len, L + 1));
    const deg = (Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180) / Math.PI;
    a.plane.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ') rotate(' + deg.toFixed(1) + ')');
  };
  const N = arcs.length;
  const START = 1.1;
  const build = (tl) => {
    tl.fromTo(sweep, { attr: { width: 0 } }, { attr: { width: W }, ease: 'power1.inOut', duration: START });
    arcs.forEach((a, i) => {
      const t0 = START + i;
      const st = { p: 0 };
      tl.fromTo(a.path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', duration: 0.95 }, t0);
      tl.set(a.plane, { opacity: 1 }, t0);
      tl.to(st, { p: 1, ease: 'none', duration: 0.95, onUpdate: () => place(a, st.p) }, t0);
      tl.to(a.plane, { opacity: 0, duration: 0.12 }, t0 + 0.9);
    });
    tl.to({}, { duration: 0.6 });
    return tl;
  };
  const update = (tl) => {
    const i = clamp(Math.floor(tl.time() - START + 0.02), -1, N - 1);
    items.forEach((li, k) => {
      li.classList.toggle('is-active', k === i);
      li.classList.toggle('is-done', k < i);
    });
    if (live) live.textContent = String(Math.max(0, i + 1));
  };
  arcs.forEach((a) => place(a, 0));

  mm.add('(min-width: 1001px)', () => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: sc, start: 'top top', end: '+=330%', pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true },
      onUpdate: () => update(tl),
    });
    build(tl);
    return () => {
      items.forEach((li) => li.classList.remove('is-active', 'is-done'));
    };
  });
  mm.add('(max-width: 1000px)', () => {
    const tl = gsap.timeline({ paused: true, onUpdate: () => update(tl) });
    build(tl).timeScale(1.9);
    const st = ScrollTrigger.create({ trigger: sc, start: 'top 60%', once: true, onEnter: () => tl.play() });
    return () => st.kill();
  });
}

/* ---------------------------------------------------------------- how it works: sticky photo swaps with each step */
function sceneSteps() {
  const sec = $('[data-steps]');
  if (!sec) return;
  const steps = $$('[data-step]', sec);
  const imgs = $$('[data-steps-img]', sec);
  const num = $('[data-steps-n]', sec);
  let cur = -1;
  const set = (i) => {
    if (i === cur) return;
    cur = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    imgs.forEach((m, k) => m.classList.toggle('is-active', k === i));
    if (num) num.textContent = '0' + (i + 1);
  };
  set(0);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) set(steps.indexOf(en.target));
      });
    },
    { rootMargin: '-42% 0px -48% 0px', threshold: 0 }
  );
  steps.forEach((s) => io.observe(s));
}

/* ---------------------------------------------------------------- landing: descend, lights come on */
function sceneLanding() {
  const sec = $('[data-landing]');
  if (!sec) return;
  const altEl = $('[data-land-alt]', sec);
  const stEl = $('[data-land-status]', sec);
  const img = $('[data-landing-img]', sec);
  const lights = $$('.rw-light', sec);
  const line = $('.rw-line', sec);
  const stages = [[0, 'On approach'], [0.45, 'Final approach'], [0.8, 'Landing'], [0.97, 'Welcome']];
  const setAlt = (p) => {
    if (altEl) altEl.textContent = fmt(Math.round((3200 * (1 - easeInOut(clamp(p / 0.95, 0, 1)))) / 10) * 10);
    if (stEl) {
      let label = stages[0][1];
      stages.forEach((s) => { if (p >= s[0]) label = s[1]; });
      if (stEl.textContent !== label) stEl.textContent = label;
    }
    sec.classList.toggle('is-landed', p > 0.96);
  };
  setAlt(0);
  if (!hasGSAP || reduce) {
    setAlt(1);
    lights.forEach((l) => (l.style.opacity = 1));
    return;
  }
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: sec, start: 'top 85%', end: 'center 45%', scrub: 0.6, onUpdate: (self) => setAlt(self.progress) },
  });
  if (img) tl.fromTo(img, { scale: 1.4, yPercent: -4 }, { scale: 1, yPercent: 0, duration: 1 }, 0);
  if (lights.length) tl.fromTo(lights, { opacity: 0.12 }, { opacity: 1, stagger: { each: 0.045, from: 'end' }, duration: 0.2 }, 0.1);
  if (line) tl.fromTo(line, { backgroundPositionY: '0px' }, { backgroundPositionY: '320px', duration: 1 }, 0);
}

/* ==========================================================================
   20 UI: header, menus, flight tracker, accordion, filters, cursor, tilt, counters, transitions
   ========================================================================== */

/* ---------------------------------------------------------------- header */
function initHeader() {
  const header = $('[data-header]');
  if (!header) return;
  const burger = $('.burger', header);
  const menu = $('#mmenu');
  let lastY = 0;
  let menuOpen = false;
  let closeTimer = 0;

  // stuck + hide on scroll down, show on scroll up
  onScroll((y) => {
    header.classList.toggle('is-stuck', y > 28);
    if (menuOpen) return;
    const dy = y - lastY;
    if (y < 200) header.classList.remove('is-hidden');
    else if (dy > 6) {
      if (!header.querySelector('.has-mega.is-open')) header.classList.add('is-hidden');
    } else if (dy < -6) header.classList.remove('is-hidden');
    if (Math.abs(dy) > 6) lastY = y;
  });
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));

  // mega menus (hover is pure CSS; the chevron button makes it work for touch and keyboard)
  const megas = $$('.has-mega', header);
  const closeMegas = (except) => {
    megas.forEach((m) => {
      if (m === except) return;
      m.classList.remove('is-open');
      const t = $('.mega-toggle', m);
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  };
  megas.forEach((m) => {
    const t = $('.mega-toggle', m);
    if (!t) return;
    t.addEventListener('click', (e) => {
      e.preventDefault();
      const open = !m.classList.contains('is-open');
      closeMegas(m);
      m.classList.toggle('is-open', open);
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    m.addEventListener('mouseenter', () => closeMegas(m));
  });
  doc.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.has-mega')) closeMegas();
  });

  // mobile menu
  const setMenu = (open) => {
    if (!menu || !burger || open === menuOpen) return;
    menuOpen = open;
    clearTimeout(closeTimer);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    root.classList.toggle('menu-open', open);
    if (open) {
      header.classList.remove('is-hidden');
      menu.hidden = false;
      void menu.offsetWidth; // let the browser register the closed state first
      menu.classList.add('is-open');
      if (lenis) lenis.stop();
      root.style.overflow = 'hidden';
    } else {
      menu.classList.remove('is-open');
      if (lenis) lenis.start();
      root.style.overflow = '';
      closeTimer = setTimeout(() => {
        if (!menuOpen) menu.hidden = true;
      }, 520);
    }
  };
  if (burger) burger.addEventListener('click', () => setMenu(!menuOpen));
  if (menu) menu.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) setMenu(false); });
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (menuOpen) { setMenu(false); if (burger) burger.focus(); }
    closeMegas();
  });
  const wide = window.matchMedia('(min-width: 1081px)');
  const onWide = () => { if (wide.matches) setMenu(false); };
  if (wide.addEventListener) wide.addEventListener('change', onWide);
}

/* ---------------------------------------------------------------- flight tracker + progress bar */
function initTracker() {
  const tracker = $('.tracker');
  const bar = $('.progress-top');
  if (!tracker && !bar) return;
  const stopsEl = $('.tracker-stops', tracker || doc);
  const altEl = $('[data-alt]', tracker || doc);
  let stops = []; // { top, p, label, li }
  let total = 1;
  let active = -1;
  let lastP = -1;

  const docTop = (el) => {
    let y = 0;
    let n = el;
    while (n) {
      y += n.offsetTop || 0;
      n = n.offsetParent;
    }
    return y;
  };

  const measure = () => {
    total = Math.max(1, root.scrollHeight - window.innerHeight);
    const hero = $('[data-hero]');
    const sp = hero && hero.parentElement;
    heroPin = sp && sp.classList.contains('pin-spacer') ? Math.max(0, sp.offsetHeight - hero.offsetHeight) : 0;
    const found = [];
    $$('[data-waypoint]').forEach((el) => {
      if (el.hasAttribute('data-nowp')) return;
      // a pinned element is position:fixed while pinned, so measure its pin-spacer instead
      const host = el.parentElement && el.parentElement.classList.contains('pin-spacer') ? el.parentElement : el;
      found.push({ label: el.getAttribute('data-waypoint'), top: docTop(host), el });
    });
    found.sort((a, b) => a.top - b.top);
    const keep = [];
    found.forEach((f, i) => {
      f.p = clamp(f.top / total, 0, 1);
      const prev = keep[keep.length - 1];
      const isLast = i === found.length - 1;
      if (prev && (prev.label === f.label || f.p - prev.p < 0.055)) {
        if (isLast) keep[keep.length - 1] = f; // always keep the final stop (the footer)
        return;
      }
      keep.push(f);
    });
    return keep;
  };

  const build = () => {
    const keep = measure();
    // rebuild the DOM only when the set of stops changes; otherwise just move them
    const same = keep.length === stops.length && keep.every((k, i) => k.label === stops[i].label);
    if (same) {
      keep.forEach((k, i) => {
        stops[i].top = k.top;
        stops[i].p = k.p;
        if (stops[i].li) stops[i].li.style.setProperty('--y', k.p.toFixed(4));
      });
    } else {
      stops = keep;
      if (stopsEl) {
        stopsEl.innerHTML = '';
        stops.forEach((s) => {
          const li = doc.createElement('li');
          li.style.setProperty('--y', s.p.toFixed(4));
          li.innerHTML = '<i></i><span></span>';
          li.lastChild.textContent = s.label;
          stopsEl.appendChild(li);
          s.li = li;
        });
      }
      active = -1;
    }
    update(getY(), true);
  };

  let heroPin = 0; // pixels the home hero stays pinned for; its HUD and this readout use one curve
  const altitude = (p, y) => {
    // climb out, cruise with a gentle drift, then descend into the footer
    let a;
    if (heroPin > 0 && y < heroPin) a = 35000 * easeInOut(clamp(((y / heroPin) - 0.26) / 0.74, 0, 1));
    else if (heroPin > 0 && p < 0.86) a = 35000 + Math.sin(p * 22) * 600;
    else if (p < 0.1) a = 35000 * easeInOut(p / 0.1);
    else if (p < 0.86) a = 35000 + Math.sin(p * 22) * 600;
    else a = 35000 * (1 - easeInOut((p - 0.86) / 0.14));
    return Math.max(0, Math.round(a / 100) * 100);
  };

  function update(y, force) {
    const p = clamp(y / total, 0, 1);
    if (!force && Math.abs(p - lastP) < 0.0004) return;
    lastP = p;
    const v = p.toFixed(4);
    if (tracker) {
      tracker.style.setProperty('--p', v);
      tracker.classList.toggle('is-visible', y > 260);
      if (altEl) altEl.textContent = fmt(altitude(p, y));
    }
    if (bar) bar.style.setProperty('--p', v);
    if (!stops.length) return;
    const line = y + window.innerHeight * 0.45;
    let idx = -1;
    for (let i = 0; i < stops.length; i++) if (stops[i].top <= line) idx = i;
    if (y >= total - 4) idx = stops.length - 1;
    if (idx !== active) {
      active = idx;
      stops.forEach((s, i) => {
        if (!s.li) return;
        s.li.classList.toggle('is-active', i === idx);
        s.li.classList.toggle('is-passed', i < idx);
      });
    }
  }

  onScroll((y) => update(y));
  build();
  if (hasGSAP) ScrollTrigger.addEventListener('refresh', build);
  let t = 0;
  const later = () => {
    clearTimeout(t);
    t = setTimeout(build, 280);
  };
  window.addEventListener('resize', later);
  window.addEventListener('load', later);
  if ('ResizeObserver' in window) new ResizeObserver(later).observe(doc.body);
}

/* ---------------------------------------------------------------- accordion (Web Animations, one open at a time) */
function initAccordion() {
  $$('[data-accordion]').forEach((acc) => {
    const items = $$('details', acc);
    const state = new Map();
    const finish = (d) => {
      const s = state.get(d);
      if (s && s.anim) s.anim.cancel();
    };
    const closeItem = (d) => {
      const body = $('.acc-body', d);
      finish(d);
      if (!body || reduce || !body.animate) {
        d.removeAttribute('open');
        return;
      }
      const h = body.offsetHeight;
      const anim = body.animate({ height: [h + 'px', '0px'], opacity: [1, 0] }, { duration: 460, easing: 'cubic-bezier(.22,1,.36,1)' });
      state.set(d, { anim });
      anim.onfinish = anim.oncancel = () => {
        d.removeAttribute('open');
        state.set(d, {});
        if (hasGSAP) ScrollTrigger.refresh();
      };
    };
    const openItem = (d) => {
      const body = $('.acc-body', d);
      finish(d);
      d.setAttribute('open', '');
      if (!body || reduce || !body.animate) return;
      const h = body.offsetHeight;
      const anim = body.animate({ height: ['0px', h + 'px'], opacity: [0, 1] }, { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)' });
      state.set(d, { anim });
      anim.onfinish = anim.oncancel = () => {
        state.set(d, {});
        if (hasGSAP) ScrollTrigger.refresh();
      };
    };
    items.forEach((d) => {
      const sum = $('summary', d);
      if (!sum) return;
      sum.addEventListener('click', (e) => {
        e.preventDefault();
        if (d.open) closeItem(d);
        else {
          items.forEach((o) => { if (o !== d && o.open) closeItem(o); });
          openItem(d);
        }
      });
    });
  });
}

/* ---------------------------------------------------------------- filters (routes, guides, empty legs) */
function initFilters() {
  $$('[data-filters]').forEach((bar) => {
    const scope = bar.parentElement;
    const grid = $('[data-filter-grid],[data-legs]', scope);
    if (!grid) return;
    const items = $$('[data-region]', grid);
    const buttons = $$('[data-filter]', bar);
    buttons.forEach((b) => b.setAttribute('aria-pressed', b.classList.contains('is-active') ? 'true' : 'false'));
    buttons.forEach((b) => {
      b.addEventListener('click', () => {
        const val = b.getAttribute('data-filter');
        buttons.forEach((x) => {
          const on = x === b;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        let shown = 0;
        items.forEach((it) => {
          const show = val === 'All' || it.getAttribute('data-region') === val;
          const was = !it.hidden;
          it.hidden = !show;
          if (show) {
            // content that was filtered out before it ever revealed must not stay invisible
            it.classList.add('is-in');
            if (!was && !reduce && it.animate) {
              it.animate({ opacity: [0, 1], translate: ['0 22px', '0 0'] }, { duration: 700, delay: Math.min(shown, 8) * 55, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
            }
            shown++;
          }
        });
        grid.classList.add('is-in', 'is-settled');
        $$('[data-stagger] > *', grid).forEach((c) => c.classList.add('is-in'));
        if (hasGSAP) setTimeout(() => ScrollTrigger.refresh(), 60);
      });
    });
  });
}

/* ---------------------------------------------------------------- misc small behaviours */
function initLegDates() {
  const dayMs = 86400000;
  $$('[data-leg-date]').forEach((el) => {
    const n = parseInt(el.getAttribute('data-day'), 10);
    if (!n) return;
    const d = new Date(Date.now() + n * dayMs);
    const when = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    el.textContent = when + ' · ' + (n === 1 ? 'tomorrow' : 'in ' + n + ' days');
  });
}

function initCounters() {
  const els = $$('[data-count]');
  if (!els.length) return;
  const final = (el) => {
    el.textContent = fmt(parseFloat(el.getAttribute('data-count')) || 0);
  };
  if (reduce || !('IntersectionObserver' in window)) {
    els.forEach(final);
    return;
  }
  els.forEach((el) => (el.textContent = '0'));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        io.unobserve(el);
        const target = parseFloat(el.getAttribute('data-count')) || 0;
        const dur = 1900;
        const t0 = performance.now();
        const tick = (t) => {
          const k = clamp((t - t0) / dur, 0, 1);
          el.textContent = fmt(target * (1 - Math.pow(1 - k, 4)));
          if (k < 1) requestAnimationFrame(tick);
          else final(el);
        };
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.4 }
  );
  els.forEach((el) => io.observe(el));
}

/** The trust marquee speeds up with scroll velocity. */
function initMarquee() {
  const track = $('[data-marquee]');
  if (!track || reduce || !track.getAnimations) return;
  let lastY = getY();
  let rate = 1;
  let target = 1;
  onScroll((y) => {
    target = 1 + Math.min(Math.abs(y - lastY) * 0.35, 7);
    lastY = y;
  });
  const loop = () => {
    rate = lerp(rate, target, 0.08);
    target = lerp(target, 1, 0.06);
    const a = track.getAnimations()[0];
    if (a) a.playbackRate = rate;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** Highlights the current heading in an article's table of contents. */
function initToc() {
  const links = $$('.toc a[href^="#"]');
  if (!links.length) return;
  const heads = links
    .map((a) => doc.getElementById(a.getAttribute('href').slice(1)))
    .filter(Boolean);
  if (!heads.length) return;
  let tops = [];
  const measure = () => {
    const y = window.scrollY;
    tops = heads.map((h) => h.getBoundingClientRect().top + y);
  };
  measure();
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  let cur = -1;
  onScroll((y) => {
    const line = y + 170;
    let idx = -1;
    for (let i = 0; i < tops.length; i++) if (tops[i] <= line) idx = i;
    if (idx === cur) return;
    cur = idx;
    links.forEach((a, i) => a.classList.toggle('is-active', i === idx));
  });
}

/** Analytics for tagged links. */
function initEvents() {
  doc.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-evt]');
    if (!el) return;
    evt(el.getAttribute('data-evt'), { link_url: el.getAttribute('href') || '', page: location.pathname });
  });
}

/* ---------------------------------------------------------------- pointer effects */
function initCursor() {
  if (!finePointer || reduce || window.innerWidth < 1000) return;
  const c = doc.createElement('div');
  c.className = 'cursor';
  c.setAttribute('aria-hidden', 'true');
  c.innerHTML = '<span></span>';
  doc.body.appendChild(c);
  const label = c.firstChild;
  let x = -100, y = -100, tx = -100, ty = -100;
  let on = false;
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      tx = e.clientX;
      ty = e.clientY;
      if (!on) {
        on = true;
        x = tx;
        y = ty;
        c.classList.add('is-on');
      }
    },
    { passive: true }
  );
  doc.addEventListener('mouseleave', () => { on = false; c.classList.remove('is-on'); });
  doc.addEventListener('mouseover', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const lab = t.closest('[data-cursor]');
    if (lab) {
      label.textContent = lab.getAttribute('data-cursor');
      c.classList.add('is-label');
      c.classList.remove('is-link');
      return;
    }
    c.classList.remove('is-label');
    c.classList.toggle('is-link', !!t.closest('a,button,summary,label,input,select,textarea,[role="button"]'));
  });
  const loop = () => {
    x = lerp(x, tx, 0.22);
    y = lerp(y, ty, 0.22);
    c.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function initTilt() {
  if (!finePointer || reduce) return;
  $$('[data-tilt]').forEach((el) => {
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
        el.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
      });
    });
    el.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--rx', '0deg');
    });
  });
}

function initMagnetic() {
  if (!finePointer || reduce) return;
  $$('[data-magnetic]').forEach((el) => {
    let tx = 0, ty = 0, x = 0, y = 0, run = false;
    const loop = () => {
      x = lerp(x, tx, 0.16);
      y = lerp(y, ty, 0.16);
      el.style.translate = x.toFixed(2) + 'px ' + y.toFixed(2) + 'px';
      if (Math.abs(x - tx) > 0.05 || Math.abs(y - ty) > 0.05) requestAnimationFrame(loop);
      else { run = false; if (!tx && !ty) el.style.translate = ''; }
    };
    const kick = () => { if (!run) { run = true; requestAnimationFrame(loop); } };
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * 0.28;
      ty = (e.clientY - (r.top + r.height / 2)) * 0.4;
      kick();
    });
    el.addEventListener('pointerleave', () => { tx = 0; ty = 0; kick(); });
  });
}

/* ---------------------------------------------------------------- page transitions */
let curtainEl = null;

/** Navigate with the ink-curtain wipe (falls back to a plain navigation). */
function navigateTo(url) {
  let went = false;
  const go = () => {
    if (went) return;
    went = true;
    location.href = url;
  };
  if (!curtainEl || !curtainEl.animate) return go();
  try { sessionStorage.setItem('skv-t', '1'); } catch (_) {}
  if (lenis) lenis.stop();
  curtainEl.classList.add('is-on');
  const an = curtainEl.animate({ transform: ['translateY(102%)', 'translateY(0%)'] }, { duration: 620, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' });
  an.onfinish = go;
  setTimeout(go, 900);
}

function initTransitions() {
  if (reduce) return;
  curtainEl = doc.createElement('div');
  curtainEl.className = 'curtain';
  curtainEl.setAttribute('aria-hidden', 'true');
  curtainEl.innerHTML = '<svg viewBox="0 0 24 24"><use href="#logo-mark"/></svg>';
  doc.body.appendChild(curtainEl);
  setTimeout(() => root.classList.remove('is-arriving'), 1500);

  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    curtainEl.style.transform = '';
    curtainEl.getAnimations().forEach((a) => a.cancel());
    curtainEl.classList.remove('is-on');
    root.classList.remove('is-arriving');
    if (lenis) lenis.start();
  });

  doc.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|sms:|javascript:)/i.test(href)) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (a.protocol !== location.protocol || a.host !== location.host) return;
    if (a.pathname === location.pathname && a.search === location.search) return; // same page (maybe a hash)
    e.preventDefault();
    navigateTo(a.href);
  });
}

/* ==========================================================================
   30 FORMS: airport resolver, estimator, route search, quote wizard, lead forms, calculators
   The estimator formula below mirrors tools/build/lib/estimate.js. Keep the two in sync.
   ========================================================================== */
const APTS = DATA ? DATA.airports : [];
const CLASSES = DATA ? DATA.classes : [];
const byCode = {};
APTS.forEach((a) => { byCode[a.c] = a; });
const classById = {};
CLASSES.forEach((c) => { classById[c.id] = c; });
const CLASS_ORDER = ['turboprop', 'light', 'midsize', 'super-midsize', 'heavy', 'ultra-long-range'];
const CLASS_FLOOR = { ASE: 'midsize', JAC: 'midsize', SJD: 'midsize' }; // mountain and resort airports: never suggest a light jet
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const label = (a) => a.city + ' (' + a.c + ')';
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/** "TEB", "New York (TEB)", "new york", "Teterboro" -> airport record or null. */
function resolveAirport(q) {
  q = String(q || '').trim();
  if (!q) return null;
  const m = q.match(/\(([A-Za-z]{3,4})\)\s*$/);
  if (m && byCode[m[1].toUpperCase()]) return byCode[m[1].toUpperCase()];
  if (byCode[q.toUpperCase()]) return byCode[q.toUpperCase()];
  const n = norm(q);
  if (!n) return null;
  let hit = APTS.find((a) => norm(a.city) === n) || APTS.find((a) => norm(a.n) === n);
  if (hit) return hit;
  hit = APTS.find((a) => norm(a.city).indexOf(n) === 0) || APTS.find((a) => norm(a.n).indexOf(n) !== -1);
  return hit || null;
}

function haversine(a, b) {
  const R = 3958.8;
  const rad = Math.PI / 180;
  const dLat = (b.la - a.la) * rad;
  const dLon = (b.lo - a.lo) * rad;
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.la * rad) * Math.cos(b.la * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

function estimateTrip(a, b, cls) {
  const miles = haversine(a, b);
  const intl = !!(a.i || b.i);
  const flight = miles / cls.speed + DATA.taxi;
  const hours = Math.max(1, flight);
  const tax = intl ? 0 : DATA.fet;
  return {
    miles: Math.round(miles),
    hours: flight,
    low: (hours * cls.rate[0] + DATA.fees[0]) * (1 + tax),
    high: (hours * cls.rate[1] + DATA.fees[1]) * (1 + tax),
    fuelStop: miles > cls.range * 0.9,
    intl,
  };
}

function recommendClass(a, b, pax) {
  const miles = haversine(a, b);
  const ranked = CLASS_ORDER.map((id) => classById[id]).filter(Boolean);
  const floor = Math.max(CLASS_ORDER.indexOf(CLASS_FLOOR[a.c] || ''), CLASS_ORDER.indexOf(CLASS_FLOOR[b.c] || ''));
  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    if (CLASS_ORDER.indexOf(c.id) < floor) continue;
    if (c.id === 'turboprop' && (miles > 450 || pax > 7)) continue;
    if (pax <= c.pax[1] && miles <= c.range * 0.9) return c;
  }
  return classById['ultra-long-range'] || ranked[ranked.length - 1];
}

const priceRange = (e, mult) => money(roundTo(e.low * mult, 500)) + ' to ' + money(roundTo(e.high * mult, 500));

/** Tween a number into an element (keeps its own state on the element). */
function tweenNumber(el, to, render) {
  const from = typeof el._n === 'number' ? el._n : to;
  el._n = to;
  if (reduce || from === to) { el.textContent = render(to); return; }
  const id = (el._tw = (el._tw || 0) + 1);
  const t0 = performance.now();
  const tick = (t) => {
    if (el._tw !== id) return;
    const k = clamp((t - t0) / 650, 0, 1);
    el.textContent = render(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------- steppers */
function initSteppers() {
  doc.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-stepper] [data-dec],[data-stepper] [data-inc]');
    if (!b) return;
    const wrap = b.closest('[data-stepper]');
    const input = $('input', wrap);
    if (!input) return;
    const min = parseInt(input.min, 10) || 1;
    const max = parseInt(input.max, 10) || 99;
    const cur = parseInt(input.value, 10) || min;
    const next = clamp(cur + (b.hasAttribute('data-inc') ? 1 : -1), min, max);
    if (next === cur) return;
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/* ---------------------------------------------------------------- range sliders */
function paintRange(r) {
  const min = parseFloat(r.min) || 0;
  const max = parseFloat(r.max) || 100;
  r.style.setProperty('--fill', (((parseFloat(r.value) - min) / (max - min)) * 100).toFixed(1) + '%');
}

/* ---------------------------------------------------------------- estimator */
function initEstimators() {
  if (!DATA) return;
  $$('[data-estimator]').forEach((est) => {
    const form = $('form', est);
    if (!form) return;
    const f = form.elements;
    const out = {
      cls: $('[data-est-class]', est),
      price: $('[data-est-price]', est),
      miles: $('[data-est-miles]', est),
      time: $('[data-est-time]', est),
      range: $('[data-est-range]', est),
      note: $('[data-est-note]', est),
      cta: $('[data-est-cta]', est),
      photo: $('[data-est-photo]', est),
    };
    const ctaBase = out.cta ? out.cta.getAttribute('href') : '';
    let lastClass = '';

    const showPhoto = (cls) => {
      if (!out.photo || lastClass === cls.id) return;
      lastClass = cls.id;
      let img = $('img[data-cls="' + cls.id + '"]', out.photo);
      if (!img) {
        img = doc.createElement('img');
        img.setAttribute('data-cls', cls.id);
        img.alt = '';
        img.decoding = 'async';
        img.src = cls.photo;
        out.photo.appendChild(img);
      }
      $$('img', out.photo).forEach((i) => i.classList.toggle('is-on', i === img));
      void img.offsetWidth;
      img.classList.add('is-on');
    };

    const run = () => {
      const a = byCode[f.from.value];
      const b = byCode[f.to.value];
      const pax = clamp(parseInt(f.pax.value, 10) || 1, 1, 16);
      const round = f.trip && f.trip.value === 'round';
      if (!a || !b) return;
      if (a === b) {
        if (out.note) out.note.textContent = 'Choose two different airports to see an estimate.';
        return;
      }
      const cls = recommendClass(a, b, pax);
      const e = estimateTrip(a, b, cls);
      const mult = round ? 2 : 1;
      if (out.cls) out.cls.textContent = cls.name;
      if (out.price) {
        // tween both ends of the range; the final text is always exact
        const final = priceRange(e, mult);
        const lo = roundTo(e.low * mult, 500);
        const hi = roundTo(e.high * mult, 500);
        const from = typeof out.price._lo === 'number' ? out.price._lo : lo;
        const fromHi = typeof out.price._hi === 'number' ? out.price._hi : hi;
        out.price._lo = lo;
        out.price._hi = hi;
        const id = (out.price._id = (out.price._id || 0) + 1);
        if (reduce || (from === lo && fromHi === hi)) out.price.textContent = final;
        else {
          const t0 = performance.now();
          const tick = (t) => {
            if (out.price._id !== id) return;
            const k = clamp((t - t0) / 650, 0, 1);
            const ease = 1 - Math.pow(1 - k, 3);
            out.price.textContent = money(roundTo(lerp(from, lo, ease), 100)) + ' to ' + money(roundTo(lerp(fromHi, hi, ease), 100));
            if (k < 1) requestAnimationFrame(tick);
            else out.price.textContent = final;
          };
          requestAnimationFrame(tick);
        }
      }
      if (out.miles) out.miles.textContent = fmt(e.miles * mult) + ' mi' + (round ? ' round trip' : '');
      if (out.time) out.time.textContent = hm(e.hours) + (round ? ' each way' : '');
      if (out.range) out.range.textContent = fmt(cls.range) + ' mi';
      if (out.note) {
        const bits = [];
        bits.push(cls.name.replace(/s$/, '') + ' seat ' + cls.pax[0] + ' to ' + cls.pax[1] + ' passengers. ' + cls.bags + '.');
        if (e.fuelStop) bits.push('This trip is close to the aircraft’s range, so a fuel stop is likely.');
        if (e.intl) bits.push('International trips have no 7.5% federal excise tax but add customs, handling and permit costs.');
        if (round) bits.push('Round trips are estimated as two legs. Overnight stays add crew costs.');
        out.note.textContent = bits.join(' ');
      }
      showPhoto(cls);
      if (out.cta && ctaBase) {
        const q = 'from=' + a.c + '&to=' + b.c + '&pax=' + pax + (round ? '&trip=round' : '');
        out.cta.setAttribute('href', ctaBase + (ctaBase.indexOf('?') === -1 ? '?' : '&') + q);
      }
    };

    let timer = 0;
    form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 60); });
    form.addEventListener('change', run);
    form.addEventListener('submit', (e) => e.preventDefault());
    if (out.cta) out.cta.addEventListener('click', () => evt('estimator_cta', { from: f.from.value, to: f.to.value }));
    run();
  });
}

/* ---------------------------------------------------------------- hero route search */
function initRouteSearch() {
  $$('[data-route-search]').forEach((form) => {
    const from = form.elements.from;
    const to = form.elements.to;
    const date = form.elements.date;
    const swap = $('[data-swap]', form);
    if (date) date.min = todayISO();
    if (swap) {
      swap.addEventListener('click', () => {
        const t = from.value;
        from.value = to.value;
        to.value = t;
        if (swap.animate && !reduce) swap.animate({ transform: ['rotate(0deg)', 'rotate(180deg)'] }, { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' });
      });
    }
    const tidy = (input) => {
      const a = resolveAirport(input.value);
      if (a) input.value = label(a);
      input.setCustomValidity('');
    };
    [from, to].forEach((i) => {
      i.addEventListener('change', () => tidy(i));
      i.addEventListener('input', () => i.setCustomValidity(''));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const a = resolveAirport(from.value);
      const b = resolveAirport(to.value);
      if (!from.value.trim()) { from.setCustomValidity('Where are you flying from?'); from.reportValidity(); return; }
      if (!to.value.trim()) { to.setCustomValidity('Where are you flying to?'); to.reportValidity(); return; }
      const params = new URLSearchParams();
      params.set('from', a ? a.c : from.value.trim());
      params.set('to', b ? b.c : to.value.trim());
      if (date && date.value) params.set('date', date.value);
      params.set('pax', form.elements.pax.value);
      evt('route_search', { from: params.get('from'), to: params.get('to') });
      navigateTo(form.getAttribute('action') + '?' + params.toString());
    });
  });
}

/* ---------------------------------------------------------------- sending helpers (endpoint or WhatsApp / email fallback) */
function payloadText(title, p) {
  const lines = [title];
  Object.keys(p).forEach((k) => {
    if (p[k] === '' || p[k] == null || k === 'website' || k === 'consent') return;
    const v = Array.isArray(p[k]) ? p[k].join(', ') : p[k];
    lines.push(k.charAt(0).toUpperCase() + k.slice(1) + ': ' + v);
  });
  return lines.join('\n');
}

function fallbackLinks(title, p) {
  const text = payloadText(title, p);
  const wrap = doc.createElement('div');
  wrap.className = 'cta-row';
  const wa = doc.createElement('a');
  wa.className = 'btn btn-gold';
  wa.target = '_blank';
  wa.rel = 'noopener';
  wa.href = 'https://wa.me/' + DATA.wa + '?text=' + encodeURIComponent(text);
  wa.innerHTML = '<span>Send on WhatsApp</span>';
  wa.addEventListener('click', () => evt('generate_lead', { method: 'whatsapp', form: title }));
  const mail = doc.createElement('a');
  mail.className = 'btn btn-ghost';
  mail.href = 'mailto:' + DATA.email + '?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text);
  mail.innerHTML = '<span>Send by email</span>';
  mail.addEventListener('click', () => evt('generate_lead', { method: 'email', form: title }));
  wrap.appendChild(wa);
  wrap.appendChild(mail);
  return wrap;
}

/** Resolves true when delivered to the endpoint, false when there is none (fallback), rejects on failure. */
function sendPayload(p) {
  if (!DATA || !DATA.endpoint) return Promise.resolve(false);
  return fetch(DATA.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(p),
  }).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return true;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const validField = (input) => {
  const v = input.value.trim();
  if (input.type === 'checkbox') return input.checked;
  if (input.required && !v) return false;
  if (input.type === 'email' && v && !EMAIL_RE.test(v)) return false;
  if (input.type === 'tel' && v && v.replace(/\D/g, '').length < 7) return false;
  return true;
};
const markField = (input, ok) => {
  const f = input.closest('.field') || input.closest('.check');
  if (f) f.classList.toggle('is-invalid', !ok);
  input.setAttribute('aria-invalid', ok ? 'false' : 'true');
};

/* ---------------------------------------------------------------- quote wizard */
function initQuoteForm() {
  const form = $('[data-quote-form]');
  if (!form || !DATA) return;
  const panes = $$('.qf-pane', form);
  const stepLis = $$('.qf-steps li', form);
  const bar = $('[data-qf-bar]', form);
  const prev = $('[data-prev]', form);
  const next = $('[data-next]', form);
  const submit = $('[data-submit]', form);
  const err = $('[data-qf-error]', form);
  const live = $('[data-qf-live]', form);
  const livePrice = $('[data-qf-live-price]', form);
  const liveNote = $('[data-qf-live-note]', form);
  const done = $('[data-qf-done]', form);
  const doneText = $('[data-qf-done-text]', form);
  const ret = $('[data-return]', form);
  const f = form.elements;
  let step = 0;
  let started = false;

  f.date.min = todayISO();
  if (f.return) f.return.min = todayISO();

  // prefill from ?from=&to=&pax=&date=&trip=
  try {
    const q = new URLSearchParams(location.search);
    const setAirport = (input, v) => {
      if (!v) return;
      const a = resolveAirport(v);
      input.value = a ? label(a) : v;
    };
    setAirport(f.from, q.get('from'));
    setAirport(f.to, q.get('to'));
    if (q.get('pax')) f.pax.value = clamp(parseInt(q.get('pax'), 10) || 4, 1, 16);
    if (q.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(q.get('date'))) f.date.value = q.get('date');
    const trip = (q.get('trip') || '').toLowerCase();
    if (trip) {
      const want = trip === 'round' ? 'Round trip' : trip === 'multi' ? 'Multi-city' : 'One way';
      $$('input[name="trip"]', form).forEach((r) => { r.checked = r.value === want; });
    }
  } catch (_) {}

  const tripValue = () => ($$('input[name="trip"]', form).filter((r) => r.checked)[0] || {}).value || 'One way';

  const syncReturn = () => {
    if (ret) ret.hidden = tripValue() !== 'Round trip';
  };

  const updateLive = () => {
    if (!live) return;
    const a = resolveAirport(f.from.value);
    const b = resolveAirport(f.to.value);
    if (!a || !b || a === b) { live.hidden = true; return; }
    const pax = clamp(parseInt(f.pax.value, 10) || 1, 1, 16);
    const cls = recommendClass(a, b, pax);
    const e = estimateTrip(a, b, cls);
    const mult = tripValue() === 'Round trip' ? 2 : 1;
    live.hidden = false;
    livePrice.textContent = priceRange(e, mult);
    liveNote.textContent = cls.name + ' · ' + fmt(e.miles) + ' mi · about ' + hm(e.hours) + (mult === 2 ? ' each way' : '') + '. Indicative only. A firm quote follows.';
  };

  const showError = (msg) => {
    if (!err) return;
    err.textContent = msg || '';
    err.hidden = !msg;
  };

  const validateStep = (n) => {
    let ok = true;
    let msg = '';
    const check = (input, cond, text) => {
      const good = cond === undefined ? validField(input) : cond;
      markField(input, good);
      if (!good) { ok = false; if (!msg) msg = text; }
    };
    if (n === 0) {
      check(f.from, f.from.value.trim().length > 1, 'Tell us where you are flying from.');
      check(f.to, f.to.value.trim().length > 1, 'Tell us where you are flying to.');
      const a = resolveAirport(f.from.value);
      const b = resolveAirport(f.to.value);
      if (ok && a && b && a === b) { markField(f.to, false); ok = false; msg = 'Departure and arrival airports are the same.'; }
      check(f.date, !!f.date.value && f.date.value >= todayISO(), 'Choose a departure date that is today or later.');
      const pax = parseInt(f.pax.value, 10);
      check(f.pax, pax >= 1 && pax <= 16, 'We can seat between 1 and 16 passengers.');
      if (tripValue() === 'Round trip' && f.return) check(f.return, !!f.return.value && f.return.value >= f.date.value, 'Choose a return date on or after your departure.');
    }
    if (n === 2) {
      check(f.name, f.name.value.trim().length > 1, 'Please add your name.');
      check(f.email, EMAIL_RE.test(f.email.value.trim()), 'Enter a valid email address.');
      check(f.phone, f.phone.value.replace(/\D/g, '').length >= 7, 'Enter a mobile number so we can reach you about the flight.');
      check(f.consent, f.consent.checked, 'Please agree to be contacted so we can reply to your request.');
    }
    showError(ok ? '' : msg);
    return ok;
  };

  const go = (n) => {
    step = clamp(n, 0, panes.length - 1);
    panes.forEach((p, i) => {
      const on = i === step;
      p.hidden = !on;
      p.classList.toggle('is-active', on);
    });
    stepLis.forEach((li, i) => {
      li.classList.toggle('is-active', i === step);
      li.classList.toggle('is-done', i < step);
    });
    if (bar) bar.style.transform = 'scaleX(' + ((step + 1) / panes.length).toFixed(3) + ')';
    prev.hidden = step === 0;
    next.hidden = step === panes.length - 1;
    submit.hidden = step !== panes.length - 1;
    showError('');
    const h = $('.qf-h', panes[step]);
    if (h) { h.setAttribute('tabindex', '-1'); if (started) h.focus({ preventScroll: true }); }
    if (started) {
      const top = form.getBoundingClientRect().top;
      if (top < 80) {
        const hdr = parseInt(getComputedStyle(root).getPropertyValue('--hdr'), 10) || 76;
        if (lenis) lenis.scrollTo(form, { offset: -(hdr + 20), duration: 0.9 });
        else window.scrollTo({ top: window.scrollY + top - hdr - 20, behavior: reduce ? 'auto' : 'smooth' });
      }
      evt('quote_step', { step: step + 1 });
    }
    started = true;
  };

  next.addEventListener('click', () => {
    if (validateStep(step)) go(step + 1);
  });
  prev.addEventListener('click', () => go(step - 1));
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.is-invalid')) {
      if (validField(t)) markField(t, true);
    }
    if (['from', 'to', 'pax', 'trip'].indexOf(t.name) !== -1) updateLive();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'trip') { syncReturn(); updateLive(); }
    if (e.target.name === 'from' || e.target.name === 'to') {
      const a = resolveAirport(e.target.value);
      if (a) e.target.value = label(a);
      updateLive();
    }
  });
  // Enter advances the wizard instead of submitting early
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && step < panes.length - 1) {
      e.preventDefault();
      next.click();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (step < panes.length - 1) { next.click(); return; }
    if (!validateStep(0)) { go(0); validateStep(0); return; }
    if (!validateStep(2)) return;
    const a = resolveAirport(f.from.value);
    const b = resolveAirport(f.to.value);
    const extras = $$('input[name="extras"]', form).filter((c) => c.checked).map((c) => c.value);
    const aircraft = ($$('input[name="aircraft"]', form).filter((r) => r.checked)[0] || {}).value || 'Best fit';
    const payload = {
      type: 'Quote request',
      trip: tripValue(),
      from: a ? label(a) : f.from.value.trim(),
      to: b ? label(b) : f.to.value.trim(),
      date: f.date.value + (f.time && f.time.value ? ' ' + f.time.value : ''),
      return: tripValue() === 'Round trip' && f.return ? f.return.value : '',
      passengers: f.pax.value,
      aircraft,
      extras,
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      phone: f.phone.value.trim(),
      company: f.company.value.trim(),
      notes: f.notes.value.trim(),
      estimate: live && !live.hidden ? livePrice.textContent : '',
      page: location.href,
      sent: new Date().toISOString(),
    };
    if (f.website.value) { finishQuote(false, payload, true); return; } // honeypot: pretend success, send nothing
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    sendPayload(payload)
      .then((delivered) => finishQuote(delivered, payload, false))
      .catch(() => {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        showError('We could not send your request just now. Please try again, or use the buttons on the next screen.');
        finishQuote(false, payload, false, true);
      });
  });

  function finishQuote(delivered, payload, silent, failed) {
    $$('.qf-pane,.qf-steps,.qf-bar,.qf-nav', form).forEach((n) => { n.hidden = true; });
    showError('');
    done.hidden = false;
    const old = $('.cta-row[data-fallback]', done);
    if (old) old.remove();
    if (delivered || silent) {
      doneText.textContent = 'Thank you, ' + (payload.name.split(' ')[0] || 'and welcome aboard') + '. An advisor will reply to ' + payload.email + ' with firm options, usually within minutes.';
      if (!silent) evt('generate_lead', { form: 'quote', method: 'endpoint', route: payload.from + ' > ' + payload.to });
    } else {
      doneText.textContent = (failed ? 'Our form could not be reached. ' : 'Your request is ready. ') + 'Send it to the flight desk in one tap and an advisor will reply right away.';
      const links = fallbackLinks('Quote request: ' + payload.from + ' to ' + payload.to, payload);
      links.setAttribute('data-fallback', '');
      done.insertBefore(links, $('.cta-row', done));
    }
    done.focus({ preventScroll: true });
    const top = form.getBoundingClientRect().top;
    if (top < 0) {
      if (lenis) lenis.scrollTo(form, { offset: -100, duration: 0.8 });
      else form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  syncReturn();
  go(0);
  updateLive();
  // if the page was opened with a full route already filled in, say so
  if (f.from.value && f.to.value && !live.hidden) evt('quote_prefilled', { from: f.from.value, to: f.to.value });
}

/* ---------------------------------------------------------------- lead and alert forms */
function initSimpleForms() {
  if (!DATA) return;
  const bind = (form, cfg) => {
    const msg = $(cfg.msg, form);
    const btn = $('button[type="submit"]', form);
    const setMsg = (text, kind) => {
      if (!msg) return;
      msg.textContent = text || '';
      msg.classList.toggle('is-ok', kind === 'ok');
      msg.classList.toggle('is-error', kind === 'error');
      msg.hidden = !text;
    };
    form.addEventListener('input', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.is-invalid') && validField(t)) markField(t, true);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      let first = null;
      $$('input,select,textarea', form).forEach((inp) => {
        if (inp.name === 'website' || inp.type === 'hidden' || inp.type === 'submit') return;
        const good = validField(inp);
        if (inp.required || inp.value) markField(inp, good);
        if (!good) { ok = false; if (!first) first = inp; }
      });
      if (!ok) {
        setMsg(first && first.type === 'checkbox' ? 'Please agree to be contacted so we can reply.' : first && first.type === 'email' ? 'Enter a valid email address.' : 'Please complete the highlighted fields.', 'error');
        if (first && first.focus) first.focus();
        return;
      }
      const payload = { type: cfg.title(form), page: location.href, sent: new Date().toISOString() };
      $$('input,select,textarea', form).forEach((inp) => {
        if (!inp.name || inp.type === 'checkbox') return;
        payload[inp.name] = inp.value.trim();
      });
      if (payload.website) { form.reset(); setMsg(cfg.success(form), 'ok'); return; } // honeypot
      delete payload.website;
      if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
      sendPayload(payload)
        .then((delivered) => {
          if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
          if (delivered) {
            form.reset();
            setMsg(cfg.success(form), 'ok');
            evt('generate_lead', { form: payload.type, method: 'endpoint' });
          } else {
            setMsg('', '');
            msg.hidden = false;
            msg.classList.add('is-ok');
            msg.textContent = 'Almost done. Send your details to the flight desk in one tap:';
            const old = $('.cta-row[data-fallback]', form);
            if (old) old.remove();
            const links = fallbackLinks(payload.type, payload);
            links.setAttribute('data-fallback', '');
            links.style.marginTop = '14px';
            msg.insertAdjacentElement('afterend', links);
          }
        })
        .catch(() => {
          if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
          setMsg('Sorry, that did not send. Please try again or call ' + DATA.phone + '.', 'error');
        });
    });
  };
  $$('[data-lead-form]').forEach((form) =>
    bind(form, {
      msg: '[data-lead-msg]',
      title: (fm) => fm.getAttribute('data-topic') || 'Website enquiry',
      success: (fm) => fm.getAttribute('data-success') || 'Thank you. We will be in touch shortly.',
    })
  );
  $$('[data-alert-form]').forEach((form) =>
    bind(form, {
      msg: '[data-alert-msg]',
      title: () => 'Empty leg alert signup',
      success: () => 'You are on the list. We will email deals that match your routes.',
    })
  );
}

/* ---------------------------------------------------------------- calculators */
function initCalculators() {
  $$('input[type="range"]').forEach((r) => {
    paintRange(r);
    r.addEventListener('input', () => paintRange(r));
  });

  $$('[data-hours-calc]').forEach((box) => {
    const range = $('[data-hours]', box);
    const val = $('[data-hours-val]', box);
    const opts = $$('[data-opt]', box);
    if (!range) return;
    const update = () => {
      const h = parseInt(range.value, 10) || 0;
      if (val) val.textContent = h;
      const best = h <= 25 ? 'charter' : h <= 100 ? 'card' : 'fractional';
      opts.forEach((o) => o.classList.toggle('is-best', o.getAttribute('data-opt') === best));
    };
    range.addEventListener('input', update);
    update();
  });

  $$('[data-roi]').forEach((box) => {
    const n = $('[data-roi-n]', box);
    const rate = $('[data-roi-rate]', box);
    const hrs = $('[data-roi-hrs]', box);
    const out = $('[data-roi-out]', box);
    if (!n || !rate || !hrs || !out) return;
    const update = () => {
      const total = Math.max(0, parseFloat(n.value) || 0) * Math.max(0, parseFloat(rate.value) || 0) * Math.max(0, parseFloat(hrs.value) || 0);
      tweenNumber(out, total, (v) => money(v));
    };
    [n, rate, hrs].forEach((i) => i.addEventListener('input', update));
    update();
  });
}

/* ==========================================================================
   99 INIT: start everything. Each piece is isolated so one failure never breaks the page.
   ========================================================================== */
function boot() {
  if (reduce) root.classList.add('no-anim');
  if (history.scrollRestoration && $('[data-hero]')) history.scrollRestoration = 'manual';

  safe('scroll', initScroll);
  safe('anchors', initAnchors);
  safe('reveal', initReveal);
  safe('header', initHeader);
  safe('accordion', initAccordion);
  safe('filters', initFilters);
  safe('steppers', initSteppers);
  safe('estimators', initEstimators);
  safe('route-search', initRouteSearch);
  safe('quote-form', initQuoteForm);
  safe('simple-forms', initSimpleForms);
  safe('calculators', initCalculators);
  safe('leg-dates', initLegDates);
  safe('counters', initCounters);
  safe('toc', initToc);
  safe('events', initEvents);

  if (hasGSAP) {
    safe('scene:hero', sceneHero);
    safe('scene:video', sceneVideo);
    safe('scene:fleet', sceneFleet);
    safe('scene:map', sceneMap);
    safe('scene:steps', sceneSteps);
    safe('scene:landing', sceneLanding);
    safe('scene:parallax', sceneParallax);
    safe('scroll:sort', () => ScrollTrigger.sort());
  } else {
    // no GSAP: still run the parts that do not need it so the hero text appears
    safe('scene:hero', sceneHero);
    safe('scene:steps', sceneSteps);
  }

  // these read layout, so they run after the pins exist
  safe('tracker', initTracker);
  safe('marquee', initMarquee);
  safe('cursor', initCursor);
  safe('tilt', initTilt);
  safe('magnetic', initMagnetic);
  safe('transitions', initTransitions);

  root.classList.add('is-ready');

  const refresh = () => {
    if (hasGSAP) ScrollTrigger.refresh();
    if (lenis) lenis.resize();
  };
  window.addEventListener('load', () => {
    refresh();
    // honour a #hash now that pinned sections have added their spacing
    if (location.hash && location.hash.length > 1) {
      const t = doc.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) {
        const hdr = parseInt(getComputedStyle(root).getPropertyValue('--hdr'), 10) || 76;
        setTimeout(() => (lenis ? lenis.scrollTo(t, { offset: -(hdr + 12), immediate: true }) : t.scrollIntoView()), 80);
      }
    }
  });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refresh);
  let rt = 0;
  window.addEventListener('orientationchange', () => { clearTimeout(rt); rt = setTimeout(refresh, 300); });
}

if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
else boot();

})();
