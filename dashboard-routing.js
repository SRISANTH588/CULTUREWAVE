const VENDOR_LEGACY_DASHBOARDS = [
  'dashboard-nightlife.html',
  'dashboard-brunch.html',
  'dashboard-workshops.html',
  'dashboard-experiences.html',
  'dashboard-livemusic.html'
];

export function dashboardForAccount(profile) {
  if (!profile) return '';
  const role = String(profile.role || '').trim().toLowerCase();
  const roles = Array.isArray(profile.roles)
    ? profile.roles.map(value => String(value || '').trim().toLowerCase())
    : [];
  const dashboard = String(profile.dashboard || '').trim();
  const preferredDashboard = String(profile.preferredDashboard || '').trim();
  const accountType = String(profile.accountType || '').trim().toLowerCase();

  if (['shop', 'store'].includes(accountType) || ['shop', 'store'].includes(role) || roles.some(value => ['shop', 'store'].includes(value)) ||
      profile.shopId || profile.storeId || profile.shopOnboardingApplicationId || dashboard === 'dashboard-shops.html') {
    return 'dashboard-shops.html';
  }

  if (accountType === 'vendor') return 'vendordashboard.html';

  if (accountType === 'restaurant' || ['restaurant', 'dining'].includes(role) || roles.some(value => ['restaurant', 'dining'].includes(value)) ||
      profile.restaurantId || profile.restaurantOnboardingApplicationId ||
      dashboard === 'dashboard-restaurant.html' || preferredDashboard === 'dashboard-restaurant.html') {
    return 'dashboard-restaurant.html';
  }

  if (['lister', 'vendor', 'client'].includes(role) || roles.some(value => ['lister', 'vendor', 'client'].includes(value)) ||
      profile.onboardingApplicationId || VENDOR_LEGACY_DASHBOARDS.includes(dashboard) ||
      VENDOR_LEGACY_DASHBOARDS.includes(preferredDashboard)) {
    return 'vendordashboard.html';
  }

  return '';
}

export function redirectToAccountDashboard(profile) {
  const destination = dashboardForAccount(profile);
  const currentPage = (location.pathname.replace(/\/+$/, '').split('/').pop() || 'index.html').replace(/\.html$/i, '');
  const destinationPage = String(destination || '').replace(/\.html$/i, '');
  if (!destination || destinationPage === currentPage) return false;
  location.replace(destination);
  return true;
}
