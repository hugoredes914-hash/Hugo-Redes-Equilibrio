import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, onSnapshot, serverTimestamp, initializeFirestore, memoryLocalCache, clearIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
}, (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId);

// Future sessions keep Firestore data in memory. Do not discard legacy pending writes.
export const firebaseReady = Promise.all([
  setPersistence(auth, browserSessionPersistence),
]);
export const loginWithGoogle = async () => {
    await firebaseReady;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        window.alert('No se pudo iniciar sesión con Google. Vuelve a intentarlo.');
    }
};

export const logout = () => signOut(auth);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(_error: unknown, _operationType: OperationType, _path: string | null) {
  window.alert('No se pudo guardar o cargar la información. Revisa la conexión y vuelve a intentarlo.');
}
