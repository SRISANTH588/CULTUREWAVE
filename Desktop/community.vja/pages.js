const searchInput = document.getElementById('listing-search');
const searchTrigger = document.querySelector('[data-search-open]');
const emptyState = document.querySelector('.empty-state');
const currentGrid = document.querySelector('#experience-grid, #club-grid');
let activeTag = 'all';

function updateListing() {
  if (!searchInput || !currentGrid) return;
  const query = searchInput.value.trim().toLowerCase();
  let visibleCount = 0;
  currentGrid.querySelectorAll('article').forEach(card => {
    const tags = (card.dataset.tags || '').split(/\s+/);
    const matchesTag = activeTag === 'all' || tags.includes(activeTag);
    const matchesQuery = (card.dataset.name || '').toLowerCase().includes(query);
    const visible = matchesTag && matchesQuery;
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  if (emptyState) emptyState.hidden = visibleCount > 0;
}

if (searchInput) searchInput.addEventListener('input', updateListing);
document.querySelectorAll('.listing-page .filter-pill').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.listing-page .filter-pill').forEach(pill => pill.classList.remove('selected'));
  button.classList.add('selected');
  activeTag = button.dataset.filter || 'all';
  updateListing();
}));
if (searchTrigger) searchTrigger.addEventListener('click', () => {
  if (searchInput) {
    searchInput.focus();
    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    window.location.href = 'explore.html';
  }
});
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-mode]').forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('.vibe-card').forEach(card => card.classList.toggle('genre-mode', button.dataset.mode === 'genre'));
}));
document.querySelectorAll('.vibe-card').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.vibe-card').forEach(card => card.classList.remove('chosen'));
  button.classList.add('chosen');
}));
document.querySelectorAll('[data-map-toggle]').forEach(button => button.addEventListener('click', () => {
  const active = button.classList.toggle('active');
  showPageToast(active ? 'Map view is available in the Communitie app.' : 'Showing all experiences.');
}));

function showPageToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showPageToast.timer);
  showPageToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2500);
}
