// Shared Firebase bootstrap for pages that only need the client SDK.
(function () {
  if (!window.firebase || firebase.apps.length) return;
  firebase.initializeApp({
    apiKey: "AIzaSyBCgNQy8EJLg7E-SA1cMePGetWLOR7WWMI",
    authDomain: "ogshootsluxe-36740.firebaseapp.com",
    projectId: "ogshootsluxe-36740",
    storageBucket: "ogshootsluxe-36740.firebasestorage.app",
    messagingSenderId: "5471814825",
    appId: "1:5471814825:web:07e84f2f88486da817d5b8"
  });
})();
