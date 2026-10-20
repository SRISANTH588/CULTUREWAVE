// Keep public page account controls and header styling consistent with index.html.
(function () {
  function buildUnifiedMobileMenu() {
    const header = document.querySelector('.topbar');
    const navWrap = header?.querySelector('.nav-wrap');
    let hamburger = header?.querySelector('.hamburger');
    let menu = document.querySelector('.mobile-nav');
    if (!menu && !navWrap) return;

    if (!hamburger && navWrap) {
      hamburger = document.createElement('button');
      hamburger.className = 'hamburger';
      hamburger.type = 'button';
      hamburger.setAttribute('aria-label', 'Open menu');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.innerHTML = '<span></span><span></span><span></span>';
      navWrap.appendChild(hamburger);
    }
    if (!menu) {
      menu = document.createElement('nav');
      menu.className = 'mobile-nav';
      menu.id = 'mobileNav';
      menu.setAttribute('aria-label', 'Main menu');
      header.insertAdjacentElement('afterend', menu);
    }

    menu.querySelectorAll('.mobile-nav-group').forEach((group) => {
      const heading = group.querySelector('.mobile-nav-group-title');
      if (heading?.textContent.trim().toLowerCase() === 'account') group.remove();
    });

    // Add the shared profile card to existing page-specific menus as well.
    if (!menu.querySelector('.mobile-profile-card')) {
      const profileCard = document.createElement('a');
      profileCard.className = 'mobile-profile-card';
      profileCard.href = 'customer-dashboard.html';
      profileCard.setAttribute('aria-label', 'View your profile');
      profileCard.innerHTML = '<span class="mobile-profile-main"><span class="mobile-profile-avatar" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="22" r="11"/><path d="M12 57c1-12 9-19 20-19s19 7 20 19"/></svg></span><span class="mobile-profile-info"><strong class="mobile-profile-name">CultureWave member</strong><span class="mobile-profile-contact"></span><span class="mobile-profile-progress">0 / 4 steps done</span></span></span><span class="mobile-profile-divider"></span><span class="mobile-profile-prompt"><span>Complete your profile, so we can surprise you on your special days!</span><span class="mobile-profile-arrow" aria-hidden="true">↗</span></span>';
      const menuHead = menu.querySelector('.mobile-nav-head');
      if (menuHead) menuHead.insertAdjacentElement('afterend', profileCard);
      else menu.insertBefore(profileCard, menu.firstChild);
    }

    // The homepage and some other pages have their own menu contents and behavior.
    if (menu.querySelector('.mobile-nav-group')) return;

    menu.setAttribute('aria-label', 'Profile and site navigation');
    menu.innerHTML = `
      <div class="mobile-nav-head"><button class="mobile-nav-close" type="button" aria-label="Close menu">&#8249;</button><span>Profile</span></div>
      <div class="mobile-organizer-prompt"><span>For organisers</span><strong>Want to organise an event?</strong><p>Bring your event to CultureWave and connect with more people.</p><a href="vendor-onboarding.html">List your event&nbsp; →</a></div>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">Discover</h2><div class="mobile-nav-card">
        <a href="events.html"><span class="mobile-nav-icon">◷</span><span>Explore events</span><span class="mobile-nav-arrow">›</span></a>
        <a href="restaurants.html"><span class="mobile-nav-icon">♧</span><span>Restaurants</span><span class="mobile-nav-arrow">›</span></a>
        <a href="category-experiences.html"><span class="mobile-nav-icon">✧</span><span>Experiences</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">Deals and vouchers</h2><div class="mobile-nav-card">
        <a href="events.html"><span class="mobile-nav-icon">◇</span><span>Explore current events</span><span class="mobile-nav-arrow">›</span></a>
        <a href="restaurants.html"><span class="mobile-nav-icon">♧</span><span>Discover dining offers</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">Gift Cards</h2><div class="mobile-nav-card">
        <a href="customer-service.html"><span class="mobile-nav-icon">▱</span><span>Ask about CultureWave gift cards</span><span class="mobile-nav-arrow">›</span></a>
        <a href="events.html"><span class="mobile-nav-icon">＋</span><span>Browse experiences to gift</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">Manage</h2><div class="mobile-nav-card">
        <a href="customer-dashboard.html"><span class="mobile-nav-icon">▤</span><span>Your bookings</span><span class="mobile-nav-arrow">›</span></a>
        <a href="customer-dashboard.html"><span class="mobile-nav-icon">☆</span><span>Upcoming events</span><span class="mobile-nav-arrow">›</span></a>
        <a href="customer-dashboard.html"><span class="mobile-nav-icon">♙</span><span>Account profile</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">For organisers</h2><div class="mobile-nav-card">
        <a href="features.html"><span class="mobile-nav-icon">✦</span><span>Organizer tools</span><span class="mobile-nav-arrow">›</span></a>
        <a href="pricing.html"><span class="mobile-nav-icon">₹</span><span>Pricing</span><span class="mobile-nav-arrow">›</span></a>
        <a href="how-it-works.html"><span class="mobile-nav-icon">↗</span><span>How it works</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">Support</h2><div class="mobile-nav-card">
        <a href="customer-service.html"><span class="mobile-nav-icon">ⓘ</span><span>Frequently asked questions</span><span class="mobile-nav-arrow">›</span></a>
        <a href="mailto:support.culturewave@gmail.com"><span class="mobile-nav-icon">✉</span><span>Chat with us</span><span class="mobile-nav-arrow">›</span></a>
        <a href="customer-service.html"><span class="mobile-nav-icon">✎</span><span>Share feedback</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      <section class="mobile-nav-group"><h2 class="mobile-nav-group-title">More</h2><div class="mobile-nav-card">
        <a href="customer-dashboard.html"><span class="mobile-nav-icon">♙</span><span>Account settings</span><span class="mobile-nav-arrow">›</span></a>
        <a href="how-it-works.html"><span class="mobile-nav-icon">ⓘ</span><span>About CultureWave</span><span class="mobile-nav-arrow">›</span></a>
      </div></section>
      `;

    hamburger?.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
    hamburger?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    }, true);
    menu.querySelector('.mobile-nav-close')?.addEventListener('click', () => {
      menu.classList.remove('open');
      hamburger?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
    menu.addEventListener('click', (event) => {
      if (!event.target.closest('a')) return;
      menu.classList.remove('open');
      hamburger?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !menu.classList.contains('open')) return;
      menu.classList.remove('open');
      hamburger?.classList.remove('open');
      hamburger?.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  }

  async function setAccountNavigation(user) {
    const profileName = document.querySelector('.mobile-profile-name');
    const profileContact = document.querySelector('.mobile-profile-contact');
    const profileProgress = document.querySelector('.mobile-profile-progress');
    if (profileName) profileName.textContent = user?.displayName || user?.email?.split('@')[0] || 'CultureWave member';
    if (profileContact) profileContact.textContent = user?.phoneNumber || user?.email || '';
    if (profileProgress) profileProgress.textContent = user ? '3 / 4 steps done' : 'Complete your profile';
    if (user && profileContact) {
      try {
        if (typeof firebase.firestore !== 'function') await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');
        const profileDoc = await firebase.firestore().collection('users').doc(user.uid).get();
        const profileData = profileDoc.exists ? profileDoc.data() : {};
        profileContact.textContent = profileData.whatsapp || profileData.phone || user.phoneNumber || user.email || '';
        const filledSteps = [Boolean(user.displayName || profileData.name), Boolean(profileData.whatsapp || profileData.phone || user.phoneNumber), Boolean(user.email), Boolean(user.photoURL || profileData.photoURL || profileData.photoUrl)].filter(Boolean).length;
        if (profileProgress) profileProgress.textContent = `${filledSteps} / 4 steps done`;
      } catch (error) {
        console.warn('Could not load profile details for mobile menu:', error);
      }
    }
    const accountLinks = document.querySelectorAll('.auth-actions .nav-link, .auth-actions .nav-cta');
    accountLinks.forEach((link) => {
      if (!link.dataset.defaultAccountHref) link.dataset.defaultAccountHref = link.getAttribute('href') || '';
      if (!link.dataset.defaultAccountText) link.dataset.defaultAccountText = link.textContent.trim();
    });
    if (!user) {
      accountLinks.forEach((link) => {
        link.href = link.dataset.defaultAccountHref;
        link.textContent = link.dataset.defaultAccountText;
        link.removeAttribute('aria-label');
      });
      return;
    }
    document.querySelectorAll('.auth-actions .nav-link').forEach((link) => {
      link.href = 'customer-dashboard.html';
      link.textContent = 'My Account';
      link.setAttribute('aria-label', 'Open my account');
    });
    document.querySelectorAll('.auth-actions .nav-cta').forEach((link) => {
      link.href = link.dataset.defaultAccountHref || 'login.html';
      link.textContent = link.dataset.defaultAccountText || 'Get Started';
      link.setAttribute('aria-label', 'Get started');
    });
  }

  const style = document.createElement('style');
  style.id = 'culturewave-shared-account-navigation';
  style.textContent = `
    .auth-actions{display:flex!important;align-items:center!important;gap:.5rem!important;padding:.3rem!important;border:1px solid #333!important;border-radius:999px!important;background:#111!important;}
    .auth-actions .nav-link{padding:.6rem .95rem!important;border:0!important;border-radius:999px!important;background:transparent!important;color:#aaa!important;font-size:.82rem!important;box-shadow:none!important;}
    .auth-actions .nav-link:hover{background:#222!important;color:#fff!important;}
    .auth-actions .nav-cta{margin:0!important;padding:.65rem 1.1rem!important;border:0!important;border-radius:999px!important;background:#fff!important;color:#000!important;font-size:.82rem!important;font-weight:800!important;box-shadow:none!important;}
    .auth-actions .nav-cta:hover{background:#e8e8e8!important;color:#000!important;}
    .mobile-nav-ctas{display:flex!important;align-items:center!important;gap:.65rem!important;}
    .mobile-nav-ctas .nav-link{padding:.78rem 1.15rem!important;border:0!important;border-radius:999px!important;background:transparent!important;color:#aaa!important;font-size:1rem!important;box-shadow:none!important;}
    .mobile-nav-ctas .nav-link:hover{background:#222!important;color:#fff!important;}
    .mobile-nav-ctas .nav-cta{margin:0!important;padding:.78rem 1.15rem!important;border:0!important;border-radius:999px!important;background:#fff!important;color:#000!important;font-size:1rem!important;font-weight:800!important;box-shadow:none!important;}
    .mobile-nav-ctas .nav-cta:hover{background:#e8e8e8!important;color:#000!important;}
    @media(max-width:960px){
      .mobile-nav{position:fixed!important;inset:0!important;top:0!important;left:0!important;right:0!important;width:100vw!important;max-width:none!important;height:100vh!important;height:100dvh!important;max-height:none!important;overflow-y:auto!important;box-sizing:border-box!important;align-items:stretch!important;justify-content:flex-start!important;gap:0!important;padding:calc(env(safe-area-inset-top) + 1rem) 1.25rem calc(env(safe-area-inset-bottom) + 1.25rem)!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#111!important;transform:translateX(100%)!important;z-index:1000!important;}
      .mobile-nav.open{transform:translateX(0)!important;}
      .mobile-nav::before{display:none!important;}
      .mobile-nav-head{display:flex;align-items:center;justify-content:flex-start;gap:.8rem;min-height:54px;margin-bottom:1rem;color:#fff;font-size:1.05rem;font-weight:800;}
      .mobile-nav-close{display:grid;place-items:center;width:46px;height:46px;flex:none;border:1px solid #353535;border-radius:50%;background:#1b1b1d;color:#fff;font-size:2rem;line-height:1;cursor:pointer;}
      .mobile-profile-card{display:grid;grid-template-columns:1fr;gap:14px;margin:0 0 1.5rem;padding:1rem;border:1px solid #39343f;border-radius:20px;background:linear-gradient(120deg,#291e3b,#1b1b20 78%);color:#fff!important;text-decoration:none!important;}
      .mobile-profile-main{display:grid;grid-template-columns:102px 1fr;align-items:center;gap:14px;}
      .mobile-profile-avatar{display:grid;place-items:center;width:100px;height:100px;border:5px solid #b99cff;border-radius:50%;background:#333;box-shadow:inset 0 0 0 3px #25252a;}
      .mobile-profile-avatar svg{width:72px;height:72px;fill:none;stroke:#777;stroke-width:2;}
      .mobile-profile-info{display:grid;gap:4px;min-width:0;}
      .mobile-profile-name{overflow:hidden;color:#fff;font-size:1rem;font-weight:800;text-overflow:ellipsis;white-space:nowrap;}
      .mobile-profile-contact,.mobile-profile-progress{color:#aaa;font-size:.8rem;}
      .mobile-profile-progress{color:#c7afff;}
      .mobile-profile-divider{display:block;width:100%;height:1px;background:#403a48;}
      .mobile-profile-prompt{display:grid;grid-template-columns:1fr 28px;align-items:center;gap:12px;color:#f1edf7;font-size:.87rem;line-height:1.35;}
      .mobile-profile-arrow{display:grid;place-items:center;width:26px;height:26px;border:2px solid #c7afff;border-radius:50%;color:#c7afff;font-size:1rem;line-height:1;}
      .mobile-organizer-prompt{display:grid;grid-template-columns:1fr auto;align-items:center;gap:.5rem 1rem;margin:0 0 1.55rem;padding:1.1rem;border:1px solid #39343f;border-radius:20px;background:linear-gradient(120deg,#251b35,#1b1b20 75%);color:#fff;}
      .mobile-organizer-prompt span{grid-column:1/-1;color:#b8a5d2;font-size:.66rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;}
      .mobile-organizer-prompt strong{font-size:1rem;line-height:1.35;}
      .mobile-organizer-prompt p{grid-column:1/-1;margin:0;color:#aaa;font-size:.78rem;line-height:1.45;}
      .mobile-organizer-prompt a{grid-column:1/-1;display:inline-flex;justify-self:start;margin-top:.25rem;padding:.62rem .9rem;border-radius:999px;background:#fff;color:#111;font-size:.78rem;font-weight:800;}
      .mobile-nav-group{margin-bottom:1.25rem;}
      .mobile-nav-group-title{margin:0 0 .65rem;color:#f4f4f5;font-size:.95rem;font-weight:800;}
      .mobile-nav-card{overflow:hidden;border:1px solid #303033;border-radius:20px;background:#1d1d1f;padding:0 .9rem;}
      .mobile-nav-card>a{display:flex;align-items:center;gap:.85rem;min-height:58px;padding:.65rem .15rem;border:0!important;border-bottom:1px solid #343437!important;border-radius:0!important;background:transparent!important;color:#f4f4f5!important;font-size:.9rem!important;font-weight:700;box-shadow:none!important;}
      .mobile-nav-card>a:last-child{border-bottom:0!important;}
      .mobile-nav-card>a::before,.mobile-nav-card>a::after{display:none!important;}
      .mobile-nav-icon{display:grid;place-items:center;width:25px;flex:none;color:#aaa;font-size:1.1rem;}
      .mobile-nav-arrow{margin-left:auto;color:#777;font-size:1.4rem;font-weight:400;}
      .mobile-nav-ctas{display:grid!important;grid-template-columns:1fr 1fr;gap:.55rem!important;margin:0!important;padding:0!important;border:0!important;}
      .mobile-nav-ctas::before{display:none!important;}
      .mobile-nav-ctas .nav-link,.mobile-nav-ctas .nav-cta{display:flex;align-items:center;justify-content:center;min-height:48px;padding:.6rem!important;border:1px solid #38383b!important;border-radius:14px!important;background:#222!important;color:#fff!important;font-size:.8rem!important;font-weight:800!important;}
      body:has(.mobile-nav.open)>header,body:has(.mobile-nav.open)>main,body:has(.mobile-nav.open)>footer,body:has(.mobile-nav.open)>.mobile-bottom-nav{transform:none!important;}
    }
  `;
  document.head.appendChild(style);
  buildUnifiedMobileMenu();

  const firebaseConfig = {
    apiKey: 'AIzaSyBCgNQy8EJLg7E-SA1cMePGetWLOR7WWMI',
    authDomain: 'ogshootsluxe-36740.firebaseapp.com',
    projectId: 'ogshootsluxe-36740',
    storageBucket: 'ogshootsluxe-36740.firebasestorage.app',
    messagingSenderId: '5471814825',
    appId: '1:5471814825:web:07e84f2f88486da817d5b8'
  };
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }
  async function startAccountSync() {
    const sdk = 'https://www.gstatic.com/firebasejs/9.23.0/';
    if (!window.firebase) await loadScript(sdk + 'firebase-app-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    if (typeof firebase.auth !== 'function') await loadScript(sdk + 'firebase-auth-compat.js');
    firebase.auth().onAuthStateChanged(setAccountNavigation);
  }
  startAccountSync().catch(error => console.warn('Could not sync account navigation:', error));
}());
