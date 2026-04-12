import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAqM48zxaYktx1VGy7cpH5k4MsoaNhrxwU",
  authDomain: "clocktzee.firebaseapp.com",
  projectId: "clocktzee",
  storageBucket: "clocktzee.firebasestorage.app",
  messagingSenderId: "525767267558",
  appId: "1:525767267558:web:f4678372fd64c9f3ccd727"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);