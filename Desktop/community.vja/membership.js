const billingButtons = [...document.querySelectorAll('[data-billing]')];
const planPrices = [...document.querySelectorAll('[data-month][data-year]')];
const periodLabels = [...document.querySelectorAll('[data-period]')];

billingButtons.forEach(button => button.addEventListener('click', () => {
  const annual = button.dataset.billing === 'annual';
  billingButtons.forEach(item => item.classList.toggle('selected', item === button));
  planPrices.forEach(price => {
    const amount = Number(price.dataset[annual ? 'year' : 'month']);
    price.textContent = `₹${amount.toLocaleString('en-IN')}`;
  });
  periodLabels.forEach(label => { label.textContent = annual ? '/ month, billed yearly' : '/ month'; });
}));

document.querySelector('.menu-toggle')?.addEventListener('click', () => {
  document.querySelector('.main-nav')?.classList.toggle('open');
});
