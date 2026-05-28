const VERCEL_FUNCTION_URL = '/api/send-notification';

export interface SendOneSignalNotificationParams {
  title: string;
  body: string;
  playerIds: string[];
  data?: Record<string, any>;
}

export async function sendOneSignalNotification(params: SendOneSignalNotificationParams): Promise<boolean> {
  try {
    const response = await fetch(VERCEL_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.error('Failed to send OneSignal notification:', response.statusText);
      return false;
    }

    const result = await response.json();
    console.log('OneSignal notification sent:', result);
    return true;
  } catch (error) {
    console.error('Error calling send-notification function:', error);
    return false;
  }
}
