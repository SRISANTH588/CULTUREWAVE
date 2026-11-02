const loginToast = document.getElementById('toast');
let loginToastTimer;

function showLoginMessage(message) {
  loginToast.textContent = message;
  loginToast.classList.add('show');
  window.clearTimeout(loginToastTimer);
  loginToastTimer = window.setTimeout(() => loginToast.classList.remove('show'), 2800);
}

document.getElementById('login-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  showLoginMessage('Sign in is not connected yet. Your details were not sent.');
});

document.getElementById('toggle-password').addEventListener('click', event => {
  const input = document.getElementById('login-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  event.currentTarget.textContent = show ? 'Hide' : 'Show';
  event.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

document.querySelector('[data-social-login]').addEventListener('click', () => showLoginMessage('Google sign in is not connected yet.'));
document.getElementById('forgot-password').addEventListener('click', event => {
  event.preventDefault();
  const email = document.getElementById('login-email');
  if (!email.value) {
    email.focus();
    showLoginMessage('Enter your email address to reset your password.');
    return;
  }
  showLoginMessage('Password reset is not connected yet.');
});
document.getElementById('signup-link').addEventListener('click', event => {
  event.preventDefault();
  showLoginMessage('Account creation is coming soon.');
});
