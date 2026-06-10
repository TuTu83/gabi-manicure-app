import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

console.log(`[${new Date().toISOString()}] [API register-token] Starting...`);

let firebaseAdminInitialized = false;
let serviceAccountLoaded = false;
let db: FirebaseFirestore.Firestore | null = null;
if (!admin.apps.length) {
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '';
  console.log(`[${new Date().toISOString()}] [API register-token] FIREBASE_SERVICE_ACCOUNT_BASE64 exists:`, !!serviceAccountBase64);
  if (serviceAccountBase64) {
    try {
      const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));
      serviceAccountLoaded = true;
      const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      db = admin.firestore(app);
      firebaseAdminInitialized = true;
      console.log(`[${new Date().toISOString()}] [API register-token] Firebase Admin initialized ✅`);
    } catch (initError) {
      console.error(`[${new Date().toISOString()}] [API register-token] Error initializing Firebase Admin:`, initError);
    }
  } else {
    console.error(`[${new Date().toISOString()}] [API register-token] FIREBASE_SERVICE_ACCOUNT_BASE64 is not set!`);
  }
} else {
  firebaseAdminInitialized = true;
  serviceAccountLoaded = true;
  db = admin.firestore();
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // CORS Headers
  const allowedOrigins = [
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://gabi-manicure-app.vercel.app'
  ];
  const origin = request.headers.origin || '';
  if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('https://localhost') || origin.startsWith('capacitor://localhost')) {
    response.setHeader('Access-Control-Allow-Origin', origin);
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS preflight request
  if (request.method === 'OPTIONS') {
    console.log(`[${new Date().toISOString()}] [register-token] Handling OPTIONS preflight`);
    return response.status(200).end();
  }

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!firebaseAdminInitialized || !db) return response.status(500).json({ error: 'Firebase Admin not initialized' });

  try {
    const { userId, token } = request.body || {};
    if (!userId || !token) return response.status(400).json({ error: 'Missing userId or token' });

    const usersRef = db.collection('users').doc(String(userId));
    await usersRef.set({
      fcmTokens: admin.firestore.FieldValue.arrayUnion(token),
      fcmToken: token,
      updatedAt: Date.now(),
    }, { merge: true });

    return response.status(200).json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [API register-token] Error:`, error);
    return response.status(500).json({ error: String(error) });
  }
}
