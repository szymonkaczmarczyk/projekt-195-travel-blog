import { gsap, ScrollTrigger, SplitText, getLenis, reduced } from './motion';

const lenis = getLenis();

function initHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      header.classList.toggle('is-scrolled', y > 40);
      if (header.dataset.menuOpen === 'true') return;
      header.classList.toggle('is-hidden', self.direction === 1 && y > 320);
    },
  });

  const toggle = header.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = header.querySelector<HTMLElement>('[data-menu]');
  if (!toggle || !menu) return;
  const links = menu.querySelectorAll('li');

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    header.dataset.menuOpen = String(open);
    if (open) {
      menu.hidden = false;
      header.classList.remove('is-hidden');
      lenis?.stop();
      document.body.style.overflow = 'hidden';
      if (!reduced) gsap.fromTo(links, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'expo.out' });
    } else {
      menu.hidden = true;
      lenis?.start();
      document.body.style.overflow = '';
    }
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.querySelectorAll('[data-menu-link]').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setOpen(false);
  });
}

function initReveals() {
  const items = gsap.utils.toArray<HTMLElement>('[data-reveal]');
  const clips = gsap.utils.toArray<HTMLElement>('[data-reveal-clip]');
  if (reduced) {
    if (items.length) gsap.set(items, { opacity: 1, y: 0 });
    if (clips.length) gsap.set(clips, { clipPath: 'none' });
    return;
  }
  ScrollTrigger.batch(items, {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08 }),
  });
  ScrollTrigger.batch(clips, {
    start: 'top 90%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { clipPath: 'inset(0% 0% 0% 0% round 12px)', duration: 1.3, ease: 'expo.out', stagger: 0.1 }),
  });
}

function initSplits() {
  const heads = gsap.utils.toArray<HTMLElement>('[data-split]');
  if (reduced || !heads.length) return;
  document.fonts.ready.then(() => {
    heads.forEach((el) => {
      const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
      gsap.from(split.lines, {
        yPercent: 105,
        duration: 1.2,
        ease: 'expo.out',
        stagger: 0.08,
        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      });
    });
  });
}

function initParallax() {
  if (reduced) return;
  gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
    const amount = Number(el.dataset.parallax || 12);
    gsap.fromTo(
      el,
      { yPercent: -amount / 2, scale: 1 + amount / 100 },
      {
        yPercent: amount / 2,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });
}

function initCounters() {
  gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const fmt = new Intl.NumberFormat('pl-PL');
    if (reduced) {
      el.textContent = fmt.format(target);
      return;
    }
    const state = { v: 0 };
    el.textContent = '0';
    gsap.to(state, {
      v: target,
      duration: 2,
      ease: 'expo.out',
      onUpdate: () => (el.textContent = fmt.format(Math.round(state.v))),
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });
}

function initAnchors() {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (location.pathname !== '/') return;
      const target = document.querySelector(a.hash);
      if (!target) return;
      e.preventDefault();
      history.pushState(null, '', a.hash);
      if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -20, duration: 1.6 });
      else target.scrollIntoView();
    });
  });
}

initHeader();
initReveals();
initSplits();
initParallax();
initCounters();
initAnchors();

window.addEventListener('load', () => ScrollTrigger.refresh());
