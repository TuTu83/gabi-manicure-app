import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  // We need the service account JSON from environment variable
  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '';
  if (serviceAccountBase64) {
    const serviceAccount = JSON.parse(
      Buffer.from(serviceAccountBase64, 'base64').toString('utf-8')
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, body: messageBody, fcmTokens, data = {} } = body;

    if (!fcmTokens || fcmTokens.length === 0) {
      return NextResponse.json(
        { error: 'No FCM tokens provided' },
        { status: 400 }
      );
    }

    const messages = fcmTokens.map(token => ({
      token,
      notification: {
        title,
        body: messageBody
      },
      data,
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'gabi_manicure_channel_high_importance',
          sound: 'default'
        }
      }
    }));

    const results = await Promise.all(
      messages.map(msg => 
        admin.messaging().send(msg).catch(error => {
          console.error('Error sending individual message:', error);
          return { error: String(error) };
        })
      )
    );

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
