const depthSections = [...document.querySelectorAll(
  '.manifesto,.archive-section,.app-cta,.listing-intro,.discovery-tools,.clubs-feature,.club-section-head,.start-club-banner,.dashboard-main>*,.profile-columns>*,.login-art,.login-panel'
)];
const depthCards = [...document.querySelectorAll(
  '.stat-card,.admin-metrics>article,.admin-panel,.profile-card'
)];
let depthFramePending = false;

function updatePageDepth() {
  const compact = window.matchMedia('(max-width: 640px)').matches;
  const sectionAngle = compact ? 4.5 : 7;
  const cardAngle = compact ? 5 : 8;

  depthSections.forEach((section, index) => {
    section.classList.add('dynamic-depth');
    const rect = section.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight * 0.92)));
    const tilt = (1 - progress) * sectionAngle;
    const rise = (1 - progress) * (compact ? 17 : 28);
    const depth = (1 - progress) * -18;
    section.style.transform = `perspective(1450px) rotateX(${tilt}deg) translate3d(0, ${rise}px, ${depth}px) scale(${0.985 + progress * 0.015})`;
    section.style.opacity = String(0.78 + progress * 0.22);
    section.style.zIndex = String(index === 0 ? 1 : 0);
  });

  depthCards.forEach(card => {
    card.classList.add('dynamic-depth');
    const rect = card.getBoundingClientRect();
    const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight * 0.78)));
    const tilt = (1 - progress) * cardAngle;
    const rise = (1 - progress) * (compact ? 13 : 21);
    const depth = (1 - progress) * -24;
    card.style.transform = `perspective(900px) rotateX(${tilt}deg) translate3d(0, ${rise}px, ${depth}px) scale(${0.975 + progress * 0.025})`;
    card.style.opacity = String(0.75 + progress * 0.25);
  });
  depthFramePending = false;
}

function requestPageDepth() {
  if (depthFramePending) return;
  depthFramePending = true;
  window.requestAnimationFrame(updatePageDepth);
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  window.addEventListener('scroll', requestPageDepth, { passive: true });
  window.addEventListener('resize', requestPageDepth);
  updatePageDepth();
}
