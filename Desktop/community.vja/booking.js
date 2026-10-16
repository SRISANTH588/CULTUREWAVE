(() => {
  const events = {
    'school-volunteering': { title: 'School volunteering online or offline', short: 'VOLUNTEER<br>& TEACH', category: 'COMMUNITY · VOLUNTEERING', time: 'Wednesday, Oct 28 · 10:00 AM', place: 'Online', price: 0, art: 'booking-art-school' },
    'acting-workshop': { title: 'Acting Workshop · Two Months', short: 'ACTING<br>WORKSHOP', category: 'ARTS · WORKSHOP', time: 'Monday, Oct 5 · 8:00 AM', place: 'Kalpataru By Vandana Badruka', price: 23500, art: 'booking-art-theatre' },
    'she-fights': { title: 'She fights, She defence workshop', short: 'SHE<br>FIGHTS', category: 'WELLNESS · COMMUNITY', time: 'Saturday, Oct 17 · 8:00 AM', place: 'BCUBE Boxing kickboxing MMA Gym', price: 299, art: 'booking-art-fight' },
    'hot-wheels': { title: 'Hot Wheels Collector Meet', short: 'HOT<br>WHEELS', category: 'COLLECTING · COMMUNITY', time: 'Saturday, Oct 17 · 4:00 PM', place: 'CEMNT Cafe · BNR Hills', price: 499, art: 'booking-art-wheels' },
    'mint-fest': { title: 'The Mint Fest 2026', short: 'THE MINT<br>FEST', category: 'WELLNESS · LIFESTYLE', time: 'Friday, Oct 30 · 11:00 AM', place: 'RMZ Nexity, Hyderabad', price: 0, art: 'booking-art-mint' },
    'ride-together': { title: 'Ride Together · 10 kms', short: 'RIDE<br>TOGETHER', category: 'FITNESS · OUTDOORS', time: 'Sunday, Nov 1 · 5:30 AM', place: 'Thrill City, Hyderabad', price: 100, art: 'booking-art-ride' },
    sushi: { title: 'Sushi Making Masterclass', short: 'SUSHI<br>MASTERCLASS', category: 'FOOD · WORKSHOP', time: 'Friday, Oct 16 · 1:00 PM', place: 'Broadway Hyderabad', price: 999, art: 'booking-art-food' },
    pizza: { title: 'Pizza Making Workshop', short: 'PIZZA<br>MASTERCLASS', category: 'FOOD · WORKSHOP', time: 'Friday, Oct 16 · 1:00 PM', place: 'Broadway Hyderabad', price: 999, art: 'booking-art-food' }
  };
  const select = document.getElementById('booking-event');
  const quantity = document.getElementById('ticket-count');
  const form = document.getElementById('booking-form');
  const notify = message => {
    const toast = document.getElementById('toast');
    toast.textContent = message; toast.classList.add('show');
    clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove('show'), 3000);
  };
  const update = () => {
    const event = events[select.value] || events['she-fights'];
    const count = Number(quantity.value);
    document.getElementById('summary-title').textContent = event.title;
    document.getElementById('summary-art-title').innerHTML = event.short;
    document.getElementById('summary-category').textContent = event.category;
    document.getElementById('summary-time').textContent = event.time;
    document.getElementById('summary-place').textContent = event.place;
    document.getElementById('summary-art').className = `summary-art ${event.art}`;
    document.getElementById('price-label').textContent = `${count} ${count === 1 ? 'ticket' : 'tickets'} × ₹${event.price}`;
    document.getElementById('ticket-price').textContent = `₹${event.price * count}`;
    document.getElementById('total-price').textContent = `₹${event.price * count}`;
  };
  const requested = new URLSearchParams(location.search).get('event');
  if (requested && events[requested]) select.value = requested;
  select.addEventListener('change', update); quantity.addEventListener('change', update); update();
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    notify('Your details are ready. Payment setup is coming soon.');
  });
})();
