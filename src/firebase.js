import {initializeApp} from 'firebase/app';import {getFirestore} from 'firebase/firestore';import {getAuth} from 'firebase/auth';
const e=import.meta.env;
const app=initializeApp({apiKey:e.VITE_FIREBASE_API_KEY,authDomain:e.VITE_FIREBASE_AUTH_DOMAIN,projectId:e.VITE_FIREBASE_PROJECT_ID,appId:e.VITE_FIREBASE_APP_ID});
export const db=getFirestore(app);export const auth=getAuth(app);
