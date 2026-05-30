module.exports = (req, res) => {
  console.log('[Hello API] Received request!');
  res.json({
    success: true,
    message: 'Hello from Vercel Functions!',
    timestamp: new Date().toISOString()
  });
};
