const cityChoices = [
  { name: 'Vijayawada', image: 'https://images.unsplash.com/photo-1606293926075-69a00dbfde81?auto=format&fit=crop&w=1100&q=85', alt: 'Colorful Indian temple tower' },
  { name: 'Bangalore', image: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1100&q=85', alt: 'Bangalore city street' },
  { name: 'Hyderabad', image: 'https://images.unsplash.com/photo-1572445271230-a78b5944a659?auto=format&fit=crop&w=1100&q=85', alt: 'Historic Hyderabad architecture' },
  { name: 'Vizag', image: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1100&q=85', alt: 'Coastal beach in Vizag' }
];

const cityDialog = document.createElement('dialog');
cityDialog.className = 'city-dialog';
cityDialog.setAttribute('aria-labelledby', 'city-dialog-title');
cityDialog.innerHTML = `
  <section class="city-chooser">
    <header class="city-chooser-header">
      <button class="city-back" type="button" aria-label="Back">‹</button>
      <div><h1 id="city-dialog-title">Choose your city</h1><p>Select the city you are in</p></div>
    </header>
    <div class="city-card-grid"></div>
  </section>`;
document.body.append(cityDialog);

const cityGrid = cityDialog.querySelector('.city-card-grid');
const savedCity = localStorage.getItem('community-vja-city') || 'Hyderabad';

function chooseCity(city) {
  localStorage.setItem('community-vja-city', city);
  document.querySelectorAll('[data-active-city]').forEach(label => { label.textContent = city; });
  document.querySelectorAll('[data-city-name]').forEach(label => { label.textContent = city; });
  cityGrid.querySelectorAll('.city-card').forEach(card => {
    const active = card.dataset.city === city;
    card.classList.toggle('selected', active);
    card.setAttribute('aria-pressed', String(active));
    card.querySelector('.city-check').textContent = active ? '✓' : '';
  });
}

cityChoices.forEach(({ name, image, alt }) => {
  const card = document.createElement('button');
  card.className = 'city-card';
  card.type = 'button';
  card.dataset.city = name;
  card.setAttribute('aria-label', `Choose ${name}`);
  card.setAttribute('aria-pressed', 'false');
  card.innerHTML = `<img src="${image}" alt="${alt}" loading="lazy"><span class="city-card-name">${name}</span><span class="city-check" aria-hidden="true"></span>`;
  card.addEventListener('click', () => {
    chooseCity(name);
    cityDialog.close();
  });
  cityGrid.append(card);
});

chooseCity(savedCity);
document.querySelectorAll('[data-city-open]').forEach(button => button.addEventListener('click', () => cityDialog.showModal()));
cityDialog.querySelector('.city-back').addEventListener('click', () => cityDialog.close());
cityDialog.addEventListener('click', event => {
  if (event.target === cityDialog) cityDialog.close();
});
