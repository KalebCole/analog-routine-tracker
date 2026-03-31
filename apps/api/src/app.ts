import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import { authMiddleware } from './middleware/auth';
import telemetryRouter from './routes/telemetry';
import routes from './routes';

const app = express();

// Security middleware
app.use(helmet());

// CORS - configurable via CORS_ORIGIN env var
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : config.isDevelopment
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL]
      : [];

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Rate limiting (100 requests per minute)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'TooManyRequests', message: 'Rate limit exceeded. Try again later.' },
  })
);

// Request parsing
app.use(express.json({ limit: '10mb' })); // Larger limit for photo uploads
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Health check (before auth middleware)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Telemetry endpoint (no auth required — frontend reports here)
app.use('/api', telemetryRouter);

// Auth middleware (applied to all routes below)
app.use(authMiddleware);

// API routes
app.use('/api', routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'NotFound',
    message: 'The requested resource was not found',
  });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
