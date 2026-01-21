import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { requestLogger } from './middleware/request-logger';
import { errorHandler } from './middleware/error-handler';
import routes from './routes';

const app = express();

// Security middleware
app.use(helmet());

// CORS - allow frontend origin
app.use(
  cors({
    origin: config.isDevelopment
      ? ['http://localhost:3000', 'http://127.0.0.1:3000']
      : process.env.FRONTEND_URL,
    credentials: true,
  })
);

// Request parsing
app.use(express.json({ limit: '10mb' })); // Larger limit for photo uploads
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

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
