import type { VercelRequest, VercelResponse } from '@vercel/node';
import admin from 'firebase-admin';

console.log(`[${new Date().toISOString()}] [send-notification] Serverless function initialized`);

// Initialize Firebase Admin (singleton)
let firebaseReady = false;
if (!admin.apps.length) {
  try {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (serviceAccountBase64) {
      const serviceAccount = JSON.parse(
        Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseReady = true;
      console.log(`[${new Date().toISOString()}] [send-notification] Firebase Admin initialized successfully`);
    } else {
      console.error(`[${new Date().toISOString()}] [send-notification] FIREBASE_SERVICE_ACCOUNT_BASE64 is missing`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [send-notification] Firebase Admin init error:`, e);
  }
} else {
  firebaseReady = true;
  console.log(`[${new Date().toISOString()}] [send-notification] Firebase Admin already initialized`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] [send-notification] Request received - Method: ${req.method}`);

  // 1. Only allow POST
  if (req.method !== 'POST') {
    console.log(`[${new Date().toISOString()}] [send-notification] Method not allowed: ${req.method}`);
    return res.status(405).json({
      error: "Method not allowed. Use POST"
    });
  }

  try {
    // 2. Validate request body
    const { title, body, fcmTokens } = req.body || {};

    console.log(`[${new Date().toISOString()}] [send-notification] Payload received:`, {
      title,
      body: body?.substring?.(0, 50) + '...',
      tokenCount: fcmTokens?.length
    });

    if (!title || typeof title !== 'string') {
      console.log(`[${new Date().toISOString()}] [send-notification] Invalid title`);
      return res.status(400).json({
        error: "Title is required and must be a string"
      });
    }

    if (!body || typeof body !== 'string') {
      console.log(`[${new Date().toISOString()}] [send-notification] Invalid body`);
      return res.status(400).json({
        error: "Body is required and must be a string"
      });
    }

    if (!fcmTokens || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
      console.log(`[${new Date().toISOString()}] [send-notification] Invalid fcmTokens`);
      return res.status(400).json({
        error: "fcmTokens is required and must be a non-empty array of strings"
      });
    }

    for (const token of fcmTokens) {
      if (typeof token !== 'string') {
        console.log(`[${new Date().toISOString()}] [send-notification] Invalid token type`);
        return res.status(400).json({
          error: "All fcmTokens must be strings"
        });
      }
    }

    // 3. Check if Firebase is ready
    if (!firebaseReady) {
      console.error(`[${new Date().toISOString()}] [send-notification] Firebase is not ready`);
      return res.status(500).json({
        error: "Internal server error - Firebase not initialized"
      });
    }

    // 4. Prepare and send notifications
    const messages = fcmTokens.map((token: string) => ({
      token,
      notification: { title, body },
      data: { click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          vibrate: [100, 50, 100],
          requireInteraction: true,
          tag: 'gabi_manicure_notification',
          renotify: true
        }
      },
      android: {
        priority: 'high' as const,
        ttl: 3600 * 1000,
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default',
          tag: 'gabi_manicure_notification',
          color: '#e8558f',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            alert: { title, body },
            badge: 1
          }
        }
      }
    }));

    console.log(`[${new Date().toISOString()}] [send-notification] Sending ${messages.length} notifications...`);
    const fcmResult = await admin.messaging().sendEach(messages);

    console.log(`[${new Date().toISOString()}] [send-notification] Notifications sent - Success: ${fcmResult.successCount}, Failed: ${fcmResult.failureCount}`);

    // 5. Return success response (EXACT format as required)
    return res.status(200).json({
      success: true,
      sent: fcmResult.successCount,
      message: "Notifications processed successfully"
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] [send-notification] Unhandled error:`, error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
