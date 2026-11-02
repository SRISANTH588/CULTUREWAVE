import { db, doc, onSnapshot } from "./firebase.js";

// Public-site circuit breaker controlled from Admin Dashboard → Site Visibility.
const settingsRef = doc(db, "platformSettings", "siteVisibility");

const controlSelectors = {
  "nav-home": '.topnav a[href="index.html"],.mobile-nav a[href="index.html"],.mobile-bottom-nav a[href="index.html"]',
  "nav-events": '.topnav a[href="events.html"],.mobile-nav a[href="events.html"],.mobile-bottom-nav a[href="events.html"]',
  "nav-restaurants": '.topnav a[href="restaurants.html"],.mobile-nav a[href="restaurants.html"],.mobile-bottom-nav a[href="restaurants.html"]',
  "nav-how-it-works": '.topnav a[href="how-it-works.html"],.mobile-nav a[href="how-it-works.html"]',
  "home-hero": '[data-site-section="home-hero"]',
  "home-categories": '[data-site-section="home-categories"]',
  "home-popular": '[data-site-section="home-popular"]',
  "home-trending": '[data-site-section="home-trending"]',
  "home-weekend": '[data-site-section="home-weekend"]',
  "home-featured": '[data-site-section="home-featured"]',
  "home-partners": '[data-site-section="home-partners"]',
  "home-events": '[data-site-section="home-events"]',
  "site-footer": '[data-site-section="site-footer"]'
};

function applyContentVisibility(hiddenItems = {}) {
  Object.entries(controlSelectors).forEach(([key, selector]) => {
    document.querySelectorAll(selector).forEach(element => {
      element.hidden = hiddenItems[key] === true;
    });
  });
}

function showMaintenanceScreen(message) {
  if (document.getElementById("siteVisibilityOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "siteVisibilityOverlay";
  overlay.setAttribute("role", "alert");
  overlay.innerHTML = `
    <div class="site-visibility-card">
      <div class="site-visibility-mark">C</div>
      <span class="site-visibility-label">CultureWave</span>
      <h1>We’ll be back shortly</h1>
      <p>${message || "The site is temporarily unavailable while we make a few improvements."}</p>
      <a class="site-visibility-login" href="login.html">Login</a>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    #siteVisibilityOverlay{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 0,#244ebf 0,transparent 35%),linear-gradient(135deg,#07122f,#112b72);color:#fff;text-align:center;font-family:Inter,Arial,sans-serif}
    .site-visibility-card{max-width:460px;padding:42px 34px;border:1px solid rgba(255,255,255,.18);border-radius:28px;background:rgba(255,255,255,.08);box-shadow:0 28px 80px rgba(0,0,0,.35);backdrop-filter:blur(14px)}
    .site-visibility-mark{width:58px;height:58px;display:grid;place-items:center;margin:0 auto 14px;border-radius:18px;background:linear-gradient(135deg,#4d8cff,#1c46bc);font-weight:900;font-size:25px;box-shadow:0 12px 28px rgba(0,0,0,.25)}
    .site-visibility-label{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#b9ceff}.site-visibility-card h1{margin:16px 0 10px;font-size:clamp(28px,6vw,42px);letter-spacing:-.05em}.site-visibility-card p{margin:0;color:rgba(255,255,255,.74);line-height:1.6}.site-visibility-login{display:inline-flex;align-items:center;justify-content:center;margin-top:26px;min-height:46px;padding:0 24px;border-radius:14px;background:#fff;color:#12368f;text-decoration:none;font-weight:800;box-shadow:0 8px 22px rgba(0,0,0,.18)}
  `;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

function hideMaintenanceScreen() {
  document.getElementById("siteVisibilityOverlay")?.remove();
}

let currentSettings = {};
function applyDesktopMaintenance() {
  const isDesktop = window.matchMedia("(min-width: 769px)").matches;
  const isLoginPage = /\/login\.html$/i.test(location.pathname);
  if (currentSettings.publicSiteEnabled === false && isDesktop && !isLoginPage) showMaintenanceScreen(currentSettings.message);
  else hideMaintenanceScreen();
}

onSnapshot(settingsRef, (snapshot) => {
  currentSettings = snapshot.exists() ? snapshot.data() : {};
  applyContentVisibility(currentSettings.hiddenItems);
  applyDesktopMaintenance();
});

window.addEventListener("resize", applyDesktopMaintenance);
