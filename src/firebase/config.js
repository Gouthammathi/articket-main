import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  // Replace with your Firebase config
  apiKey: "AIzaSyA5atsWG-tRpSJLMHSqiVUG5let0sb87Uo",
  authDomain: "ticketing-9965a.firebaseapp.com",
  projectId: "ticketing-9965a",
  storageBucket: "ticketing-9965a.appspot.com",
  messagingSenderId: "751610285833",
  appId: "1:751610285833:web:2bb70e7b22577eb5760dd8",
  measurementId: "G-MLEGHPGYT5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);