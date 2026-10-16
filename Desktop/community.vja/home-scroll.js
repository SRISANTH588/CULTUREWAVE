const scrollStory = document.querySelector('.scroll-story');
if (scrollStory) {
  const storyPin = scrollStory.querySelector('.scroll-story-pin');
  const columns = [...scrollStory.querySelectorAll('.mosaic-column')];
  const welcome = scrollStory.querySelector('.story-welcome');
  const hero = document.querySelector('.hero#home');
  const depthTargets = [...document.querySelectorAll('.manifesto-inner,.manifesto-side,.archive-copy,.app-cta-copy')];
  const baseOffsets = [-160, -35, -220, -85, -175];
  let frameRequested = false;

  const updateScrollStory = () => {
    const travel = Math.max(1, scrollStory.offsetHeight - storyPin.offsetHeight);
    const progress = Math.min(1, Math.max(0, (window.scrollY - scrollStory.offsetTop) / travel));
    columns.forEach((column, index) => {
      const speed = Number(column.dataset.speed || 0.7);
      const distanceFromCenter = index - (columns.length - 1) / 2;
      const y = baseOffsets[index] - progress * 280 * speed;
      const z = -Math.abs(distanceFromCenter) * 48 + progress * 105 * speed;
      const rotateY = distanceFromCenter * -5 * (1 - progress * 0.55);
      const rotateX = 7 * (1 - progress);
      column.style.transform = `translate3d(0, ${y}px, ${z}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${1.08 - progress * 0.08})`;
    });
    welcome.style.opacity = String(Math.min(1, Math.max(0, (progress - 0.12) * 2.7)));
    welcome.style.transform = `translate3d(0, ${20 - progress * 20}px, 90px) scale(${0.82 + progress * 0.18})`;
    scrollStory.style.setProperty('--story-progress', progress.toFixed(3));

    if (hero) {
      const heroProgress = Math.min(1, Math.max(0, window.scrollY / Math.max(1, hero.offsetHeight)));
      hero.style.transform = `perspective(1500px) rotateX(${-heroProgress * 5}deg) scale(${1 - heroProgress * 0.045}) translateY(${-heroProgress * 26}px)`;
      hero.style.opacity = String(1 - heroProgress * 0.2);
    }
    depthTargets.forEach(target => {
      const rect = target.getBoundingClientRect();
      const targetProgress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight * 0.78)));
      target.style.setProperty('--entry-depth', targetProgress.toFixed(3));
      target.style.transform = `perspective(1100px) rotateX(${(1 - targetProgress) * 7}deg) translateY(${(1 - targetProgress) * 28}px)`;
    });
    frameRequested = false;
  };

  const requestStoryUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(updateScrollStory);
  };

  window.addEventListener('scroll', requestStoryUpdate, { passive: true });
  window.addEventListener('resize', requestStoryUpdate);
  updateScrollStory();
}

const revealTargets = document.querySelectorAll('.manifesto-inner,.manifesto-side,.archive-copy,.app-cta-copy');
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('scroll-revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  revealTargets.forEach(target => {
    target.classList.add('scroll-reveal');
    revealObserver.observe(target);
  });
}
