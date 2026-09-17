// Keeps the public navigation aligned with the Firebase session on every page
// that includes this script after Firebase has been initialized.
(function () {
  if (!window.firebase || !firebase.auth) return;

  function setAccountNavigation(user) {
    document.querySelectorAll('a[href="login.html"]').forEach((link) => {
      if (!user) return;
      link.href = 'customer-dashboard.html';
      link.textContent = 'My Account';
      link.setAttribute('aria-label', 'Open my account');
    });

    // The mobile secondary action should take a signed-in customer to the
    // bookings they already own instead of asking them to get started again.
    if (user) {
      document.querySelectorAll('.mobile-nav-ctas .nav-cta').forEach((link) => {
        link.href = 'customer-dashboard.html';
        link.textContent = 'My Bookings';
      });
    }
  }

  firebase.auth().onAuthStateChanged(setAccountNavigation);
}());
