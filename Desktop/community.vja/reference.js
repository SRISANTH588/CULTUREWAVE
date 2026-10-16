(() => {
  const body = document.body;
  const qr = document.querySelector('.qr-code');
  if (qr) {
    const isFinder = (x, y) => (x < 8 && y < 8) || (x > 20 && y < 8) || (x < 8 && y > 20);
    let seed = 93471;
    for (let y = 0; y < 29; y++) for (let x = 0; x < 29; x++) {
      seed = (seed * 16807) % 2147483647;
      if (!isFinder(x, y) && seed % 100 < 54) { const module = document.createElement('i'); module.className = 'qr-module'; module.style.gridColumn = String(x + 1); module.style.gridRow = String(y + 1); qr.append(module); }
    }
  }
  const themeButtons = document.querySelectorAll('[data-theme]');
  const toast = message => {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); body.append(el); }
    el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
  };
  if (localStorage.getItem('community-theme') === 'light') body.classList.add('light');
  themeButtons.forEach(button => button.addEventListener('click', () => {
    body.classList.toggle('light'); localStorage.setItem('community-theme', body.classList.contains('light') ? 'light' : 'dark');
  }));
  document.querySelectorAll('[data-city]').forEach(button => button.addEventListener('click', () => {
    const cities = ['Hyderabad', 'Vizag', 'Vijayawada', 'Odisha'];
    const label = button.querySelector('span'); const current = cities.indexOf(label.textContent);
    label.textContent = cities[(current + 1) % cities.length];
    toast(`Showing ${label.textContent}`);
  }));
  const hero = document.querySelector('.host-hero');
  const slideDots = [...document.querySelectorAll('[data-slide-to]')];
  if (hero && slideDots.length) {
    const slides = [
      { title: 'Find your people', cta: 'Explore clubs', href: 'clubs.html', art: 'COMMUNITY', caption: 'MEET THE PEOPLE WHO GET YOU' },
      { title: 'Make a day of it', cta: 'Explore experiences', href: 'explore.html', art: 'EXPERIENCES', caption: 'YOUR CITY HAS MORE GOING ON' },
      { title: 'Come host with us', cta: 'Learn more', href: 'clubs.html', art: 'CREATORS', caption: 'BUILT FOR CREATORS WHO MOVE CULTURE' },
      { title: 'Bring your community together', cta: 'Get the app', href: 'app.html', art: 'CONNECTION', caption: 'GOOD THINGS HAPPEN WHEN WE SHOW UP' },
      { title: 'Find your kind of scene', cta: 'Explore now', href: 'explore.html', art: 'CULTURE', caption: 'DISCOVER WHAT YOUR CITY IS INTO' }
    ];
    const title = document.getElementById('hero-title');
    const cta = document.getElementById('hero-cta');
    const artTitle = document.getElementById('hero-art-title');
    const artCaption = document.getElementById('hero-art-caption');
    let active = 2, updateTimer;
    const goTo = (index, animate = true) => {
      active = (index + slides.length) % slides.length;
      const render = () => {
        const slide = slides[active];
        title.textContent = slide.title; cta.textContent = slide.cta; cta.href = slide.href;
        artTitle.textContent = slide.art; artCaption.textContent = slide.caption;
        slideDots.forEach((dot, i) => {
          const selected = i === active;
          dot.classList.toggle('active', selected);
          if (selected) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current');
        });
        hero.classList.remove('is-changing');
      };
      clearTimeout(updateTimer);
      if (animate) { hero.classList.add('is-changing'); updateTimer = setTimeout(render, 100); } else render();
    };
    document.querySelector('[data-slide-prev]')?.addEventListener('click', () => goTo(active - 1));
    document.querySelector('[data-slide-next]')?.addEventListener('click', () => goTo(active + 1));
    slideDots.forEach(dot => dot.addEventListener('click', () => goTo(Number(dot.dataset.slideTo))));
    hero.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(active - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); goTo(active + 1); }
    });
    let touchStart = null;
    hero.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') touchStart = event.clientX; });
    hero.addEventListener('pointerup', event => {
      if (touchStart === null) return;
      const delta = event.clientX - touchStart; touchStart = null;
      if (Math.abs(delta) > 45) goTo(active + (delta < 0 ? 1 : -1));
    });
    goTo(active, false);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.setInterval(() => {
        if (document.visibilityState === 'visible' && !hero.matches(':hover') && !hero.contains(document.activeElement)) goTo(active + 1);
      }, 6500);
    }
  }
  document.querySelectorAll('.section-actions .round').forEach((button, index) => button.addEventListener('click', () => {
    const strip = button.closest('.section-actions').parentElement.nextElementSibling;
    strip?.scrollBy({ left: (index ? 1 : -1) * strip.clientWidth * .78, behavior: 'smooth' });
  }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.vibe-card').forEach((card, index) => {
      const labels = button.dataset.mode === 'genre' ? ['Arts & culture', 'Fitness', 'Wellness', 'Food & drink'] : ['Meet new people', 'Break a sweat', 'Unwind', 'Try something new'];
      card.querySelector('span').textContent = labels[index];
    });
  }));
  document.querySelectorAll('[data-club-mode]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-club-mode]').forEach(item => item.classList.toggle('active', item === button));
    const canvas = document.querySelector('.sticker-canvas');
    if (canvas) { canvas.classList.toggle('category-mode', button.dataset.clubMode === 'categories'); canvas.querySelector('h2').textContent = button.dataset.clubMode === 'categories' ? 'Explore by interest.' : 'Find Your Tribe.'; }
  }));
  document.querySelectorAll('.sticker-row span').forEach(sticker => sticker.addEventListener('click', () => sticker.classList.toggle('picked')));
  document.querySelectorAll('.filter-pill[data-filter]').forEach(button => button.addEventListener('click', () => {
    const parent = button.closest('.all-experiences');
    if (!parent) return;
    const active = button.classList.contains('active');
    parent.querySelectorAll('.filter-pill').forEach(item => item.classList.remove('active'));
    if (!active || button.dataset.filter !== 'all') button.classList.add('active');
    const filter = button.classList.contains('active') ? button.dataset.filter : 'all';
    let visible = 0;
    parent.querySelectorAll('.experience-card').forEach(card => {
      const show = filter === 'all' || (card.dataset.tags || '').split(' ').includes(filter);
      card.hidden = !show; if (show) visible++;
    });
    let empty = parent.querySelector('.empty-results');
    if (!empty) { empty = document.createElement('p'); empty.className = 'empty-results'; empty.textContent = 'No experiences match this filter.'; parent.append(empty); }
    empty.hidden = visible > 0;
  }));
  document.querySelectorAll('.map-button').forEach(button => button.addEventListener('click', () => toast('Map view is available in the Community app.')));
  const form = document.getElementById('phone-login');
  form?.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) toast('Verification codes are not connected in this preview.'); });
})();
