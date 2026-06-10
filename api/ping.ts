import type { VercelRequest, VercelResponse } from '@vercel/node';

console.log(`[${new Date().toISOString()}] [ping] Serverless function initialized`);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log(`[${new Date().toISOString()}] [ping] Request received - Method: ${req.method} - Origin: ${req.headers.origin || 'N/A'}`);

  // CORS Headers
  const allowedOrigins = [
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://gabi-manicure-app.vercel.app'
  ];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('https://localhost') || origin.startsWith('capacitor://localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    console.log(`[${new Date().toISOString()}] [ping] Handling OPTIONS preflight`);
    return res.status(200).end();
  }

  const response = {
    success: true,
    timestamp: Date.now()
  };

  console.log(`[${new Date().toISOString()}] [ping] Returning response:`, JSON.stringify(response));

  return res.status(200).json(response);
}
