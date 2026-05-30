import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(request: VercelRequest, response: VercelResponse) {
  console.log('[API test] Received request');
  response.status(200).json({
    success: true,
    message: 'Test API route working!',
    timestamp: new Date().toISOString()
  });
}
