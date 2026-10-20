// Keep public page account controls and header styling consistent with index.html.
(function () {
  function setAccountNavigation(user) {
    const accountLinks = document.querySelectorAll('.auth-actions .nav-link, .auth-actions .nav-cta, .mobile-nav-ctas .nav-link, .mobile-nav-ctas .nav-cta');
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
    document.querySelectorAll('.auth-actions .nav-link, .mobile-nav-ctas .nav-link').forEach((link) => {
      link.href = 'customer-dashboard.html';
      link.textContent = 'My Account';
      link.setAttribute('aria-label', 'Open my account');
    });
    document.querySelectorAll('.auth-actions .nav-cta, .mobile-nav-ctas .nav-cta').forEach((link) => {
      link.href = 'customer-dashboard.html';
      link.textContent = 'My Bookings';
      link.setAttribute('aria-label', 'View my bookings');
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
  `;
  document.head.appendChild(style);

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
