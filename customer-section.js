(() => {
  const page = document.body.dataset.customerPage;
  const view = document.body.dataset.customerView;
  const title = document.body.dataset.customerTitle;
  const frame = document.getElementById('customerView');
  const heading = document.getElementById('customerTitle');
  const loader = document.getElementById('customerLoading');
  if (!page || !view || !frame || !heading) return;
  const hideLoader = () => {
    if (!loader) return;
    loader.hidden = true;
    loader.style.display = 'none';
  };

  document.title = `${title} | CultureWave`;
  heading.textContent = title;
  frame.title = title;
  frame.addEventListener('load', () => {
    try {
      const path = frame.contentWindow.location.pathname;
      if (path.endsWith('/login.html')) {
        location.replace(`login.html?next=${encodeURIComponent(page)}`);
        return;
      }
      hideLoader();
    } catch (_) {
      hideLoader();
    }
  });
  frame.src = `customer-dashboard.html?view=${encodeURIComponent(view)}&embedded=menu&section=account-premium-2`;
})();
