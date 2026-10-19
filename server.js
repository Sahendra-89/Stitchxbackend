import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { apiApp } from './server/apiApp.js';
import { securityHeadersMiddleware } from './server/security/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Remove technology fingerprint
app.disable('x-powered-by');

// 2. Trust proxy configuration (supports AWS, Heroku, Render, Nginx)
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
} else {
  app.set('trust proxy', false);
}

// 3. Security headers on all responses
app.use(securityHeadersMiddleware);

// 4. Mount API and static uploads routes
app.use(apiApp);

// 5. Root status and health check
app.get('/', (req, res) => {
  res.json({
    name: 'StitchX Global Technology Backend API',
    status: 'online',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/api/health',
    timestamp: new Date().toISOString(),
  });
});

// 6. 404 handler for unmapped routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'API endpoint not found' });
});

export { app };

// Start listening if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(PORT, () => {
    console.log(`[StitchX Global Technology] Backend API server running at http://localhost:${PORT}`);
  });
}
