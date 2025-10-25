import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBaefGqZhOMjPww4Vsz2NNqXZ9A-bHqmc8",
  authDomain: "pong-multiplayer-15db2.firebaseapp.com",
  projectId: "pong-multiplayer-15db2",
  storageBucket: "pong-multiplayer-15db2.firebasestorage.app",
  messagingSenderId: "692134372863",
  appId: "1:692134372863:web:bc764a55b51bb8883f73ca",
  databaseURL: "https://pong-multiplayer-15db2-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);