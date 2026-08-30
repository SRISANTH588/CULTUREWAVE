import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCgNQy8EJLg7E-SA1cMePGetWLOR7WWMI",
  authDomain: "ogshootsluxe-36740.firebaseapp.com",
  projectId: "ogshootsluxe-36740",
  storageBucket: "ogshootsluxe-36740.firebasestorage.app",
  messagingSenderId: "5471814825",
  appId: "1:5471814825:web:07e84f2f88486da817d5b8"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Convert username → email (supports plain email too)
function toEmail(input) {
  return input.includes("@") ? input : `${input.toLowerCase()}@cityvibe.local`;
}

// Get current logged-in user with role from Firestore
// Uses authStateReady() to wait until Firebase has fully restored session
async function getCurrentUser() {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : {};
    return {
      uid: user.uid,
      email: user.email,
      name: data.name || user.displayName || user.email,
      role: data.role || "client",
      photoURL: user.photoURL || null,
    };
  } catch {
    return { uid: user.uid, email: user.email, name: user.displayName || user.email, role: "client" };
  }
}

// Redirect to login if not authenticated
async function requireAuth(adminOnly = false) {
  const user = await getCurrentUser();
  if (!user) { window.location.href = "login.html"; return null; }
  if (adminOnly && user.role !== "admin") { window.location.href = "login.html"; return null; }
  return user;
}

// Sign out
async function logout() {
  await signOut(auth);
  window.location.href = "login.html";
}

export {
  app, auth, db,
  toEmail, getCurrentUser, requireAuth, logout,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, updateProfile,
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, getDocs, onSnapshot, serverTimestamp
};
