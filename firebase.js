// firebase.js — paste your real config values where indicated
const firebaseConfig = {
  apiKey: "PASTE_YOUR_REAL_API_KEY_HERE",
  authDomain: "playpal-4eb17.firebaseapp.com",
  projectId: "playpal-4eb17",
  storageBucket: "playpal-4eb17.appspot.com",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db   = firebase.firestore();

