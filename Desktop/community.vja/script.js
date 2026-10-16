const views = [...document.querySelectorAll('[data-view]')];
const links = [...document.querySelectorAll('[data-view-link]')];
const toast = document.getElementById('toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setView(name) {
  const view = views.find(item => item.dataset.view === name) || views[0];
  views.forEach(item => item.classList.toggle('active', item === view));
  links.forEach(link => link.classList.toggle('active', link.dataset.viewLink === view.dataset.view));
  document.querySelector('.main-nav').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

links.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  setView(link.dataset.viewLink);
}));
document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => setView(button.dataset.go)));
document.querySelector('.menu-toggle').addEventListener('click', () => document.querySelector('.main-nav').classList.toggle('open'));

const cards = [...document.querySelectorAll('.community-card')];
let selectedFilter = 'all';
function filterCommunities() {
  const query = document.getElementById('community-search').value.trim().toLowerCase();
  cards.forEach(card => {
    const matchesCategory = selectedFilter === 'all' || card.dataset.category === selectedFilter;
    const matchesQuery = card.dataset.name.toLowerCase().includes(query);
    card.classList.toggle('hidden', !(matchesCategory && matchesQuery));
  });
}
document.querySelectorAll('.filter-pill').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('selected'));
  button.classList.add('selected');
  selectedFilter = button.dataset.filter;
  filterCommunities();
}));
document.getElementById('community-search').addEventListener('input', filterCommunities);

document.querySelectorAll('.save-button').forEach(button => button.addEventListener('click', () => {
  button.classList.toggle('saved');
  button.textContent = button.classList.contains('saved') ? '♥' : '♡';
  showToast(button.classList.contains('saved') ? 'Saved for later. Good choice.' : 'Removed from your saved communities.');
}));
document.querySelectorAll('[data-join]').forEach(button => button.addEventListener('click', () => {
  const joined = button.dataset.joined === 'true';
  button.dataset.joined = String(!joined);
  button.innerHTML = joined ? 'Join <span>↗</span>' : 'Joined ✓';
  showToast(joined ? `You left ${button.dataset.join}.` : `You’re in! Welcome to ${button.dataset.join}.`);
}));
document.querySelectorAll('.rsvp-button').forEach(button => button.addEventListener('click', () => {
  const going = button.classList.toggle('going');
  button.textContent = going ? 'Going ✓' : 'RSVP ↗';
  button.classList.toggle('outline', !going);
  showToast(going ? 'You’re on the list. See you there!' : 'RSVP removed.');
}));
document.querySelectorAll('.activity-item>button').forEach(button => button.addEventListener('click', () => {
  const liked = button.dataset.liked === 'true';
  button.dataset.liked = String(!liked);
  button.textContent = liked ? '♡' : '♥';
  button.style.color = liked ? '' : '#df7861';
}));

const dialog = document.getElementById('create-dialog');
document.querySelectorAll('[data-open-create]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
document.querySelectorAll('[data-app-promo]').forEach(button => button.addEventListener('click', () => showToast('Get the Communitie app — coming soon.')));
const createSubmit = document.getElementById('create-submit');
if (createSubmit) createSubmit.addEventListener('click', event => {
  const input = document.getElementById('new-community-name');
  if (!input.value.trim()) { event.preventDefault(); input.focus(); return; }
  const name = input.value.trim();
  setTimeout(() => showToast(`“${name}” is ready for its first members.`), 50);
  input.value = '';
});

document.getElementById('load-more')?.addEventListener('click', () => showToast('You’re all caught up. More good things are on the way.'));
document.getElementById('review-reports')?.addEventListener('click', () => showToast('Two reports are ready for your review.'));
document.getElementById('edit-profile')?.addEventListener('click', () => showToast('Profile editing is ready to connect to your account.'));
document.getElementById('about-edit')?.addEventListener('click', () => showToast('Your intro is ready to edit.'));
document.querySelectorAll('.notification,.add-event,.more-button').forEach(button => button.addEventListener('click', () => showToast('You’re all caught up.')));
document.querySelector('.hero-pause')?.addEventListener('click', event => {
  const hero = document.getElementById('home');
  const paused = hero.classList.toggle('motion-paused');
  event.currentTarget.textContent = paused ? '▶' : 'Ⅱ';
  event.currentTarget.setAttribute('aria-label', paused ? 'Resume hero motion' : 'Pause hero motion');
});

// Allow page links to open a specific view, such as index.html#admin.
const initialView = location.hash.replace('#', '');
if (['community', 'member', 'profile', 'admin'].includes(initialView)) setView(initialView);
