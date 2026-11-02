import { auth, db } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  collection, query, where, getDocs, setDoc, doc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const toast = document.getElementById('toast');
let toastTimer;

function showMessage(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// Redirect if already logged in
onAuthStateChanged(auth, user => {
  if (user) window.location.href = 'index.html';
});

// Resolve username → email via Firestore
async function resolveEmail(identifier) {
  if (identifier.includes('@') && identifier.includes('.')) return identifier;
  const username = identifier.replace(/^@/, '').toLowerCase();
  const snap = await getDocs(query(collection(db, 'users'), where('username', '==', username)));
  if (snap.empty) throw { code: 'auth/user-not-found' };
  return snap.docs[0].data().email;
}

// Toggle password visibility
document.getElementById('toggle-password').addEventListener('click', e => {
  const input = document.getElementById('login-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Hide' : 'Show';
});

// Toggle signup / login mode
let isSignup = false;

function toggleMode(e) {
  e.preventDefault();
  isSignup = !isSignup;
  document.getElementById('submit-label').textContent = isSignup ? 'Create account' : 'Continue';
  document.getElementById('login-identifier').placeholder = isSignup ? 'you@example.com' : 'you@example.com or @handle';
  document.querySelector('[autocomplete="current-password"]').autocomplete = isSignup ? 'new-password' : 'current-password';
  showMessage(isSignup ? 'Fill in your details to join.' : 'Welcome back!');
}

document.getElementById('signup-link').addEventListener('click', toggleMode);
document.getElementById('signup-link-2').addEventListener('click', toggleMode);

// Main form submit
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;

  const errorMap = {
    'auth/user-not-found': 'No account found. Check your email or username.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.'
  };

  try {
    if (isSignup) {
      const cred = await createUserWithEmailAndPassword(auth, identifier, password);
      // Store username derived from email prefix
      const username = identifier.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
      await setDoc(doc(db, 'users', cred.user.uid), { email: identifier, username });
      await updateProfile(cred.user, { displayName: username });
      showMessage('Account created! Welcome to Community.');
    } else {
      const email = await resolveEmail(identifier);
      await signInWithEmailAndPassword(auth, email, password);
      showMessage('Logged in! Redirecting…');
    }
    setTimeout(() => window.location.href = 'index.html', 1200);
  } catch (err) {
    showMessage(errorMap[err.code] || 'Something went wrong. Please try again.');
  }
});

// Google Sign-in
document.querySelector('[data-social-login]').addEventListener('click', async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    showMessage('Signed in with Google! Redirecting…');
    setTimeout(() => window.location.href = 'index.html', 1200);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showMessage('Google sign-in failed. Please try again.');
    }
  }
});

// Forgot password
document.getElementById('forgot-password').addEventListener('click', async e => {
  e.preventDefault();
  const identifier = document.getElementById('login-identifier').value.trim();
  if (!identifier) {
    document.getElementById('login-identifier').focus();
    showMessage('Enter your email address first.');
    return;
  }
  try {
    const email = await resolveEmail(identifier);
    await sendPasswordResetEmail(auth, email);
    showMessage('Password reset email sent! Check your inbox.');
  } catch {
    showMessage('Could not send reset email. Check the address and try again.');
  }
});
