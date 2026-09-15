import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { firebaseConfig } from './firebaseConfig.js';

let app = null;
let authReady = null;

function assertConfig() {
  if (!firebaseConfig?.projectId || String(firebaseConfig.apiKey || '').startsWith('TODO')) {
    const err = new Error(
      'Firebase 設定未完成：請喺 src/live/firebaseConfig.js 填入 chilin-shadow-puppet 正式 web config。',
    );
    err.code = 'LIVE_CONFIG_MISSING';
    throw err;
  }
}

export function getFirebaseApp() {
  assertConfig();
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getLiveDatabase() {
  return getDatabase(getFirebaseApp());
}

export function getLiveAuth() {
  return getAuth(getFirebaseApp());
}

/** Ensure anonymous auth; resolves with Firebase User. */
export function ensureAnonAuth() {
  if (authReady) return authReady;
  authReady = new Promise((resolve, reject) => {
    try {
      const auth = getLiveAuth();
      const unsub = onAuthStateChanged(
        auth,
        async (user) => {
          try {
            if (user) {
              unsub();
              resolve(user);
              return;
            }
            const cred = await signInAnonymously(auth);
            unsub();
            resolve(cred.user);
          } catch (e) {
            unsub();
            reject(e);
          }
        },
        reject,
      );
    } catch (e) {
      reject(e);
    }
  });
  return authReady;
}
