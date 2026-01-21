import app from './app';
import { config, validateConfig } from './config';
import { checkConnection, closePool, isServerless } from './db/client';
import { startPhotoCleanupJob } from './jobs/photo-cleanup';

// Check if running in serverless environment (Azure Functions)
// In serverless, the Express app is handled by functions/api.ts
if (isServerless) {
  console.log('[API] Running in Azure Functions - HTTP server not started');
  console.log('[API] Photo cleanup handled by timer trigger');
} else {
  // Traditional server mode
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

async function start() {
  // Validate configuration
  validateConfig();

  // Check database connection
  const dbConnected = await checkConnection();
  if (!dbConnected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }
  console.log('Database connected');

  // Start server
  const server = app.listen(config.port, () => {
    console.log(`API server running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  });

  // Start background jobs (only in traditional server mode)
  if (config.nodeEnv === 'production') {
    startPhotoCleanupJob();
  } else {
    console.log('[Jobs] Photo cleanup job disabled in development mode');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(async () => {
      console.log('HTTP server closed');

      await closePool();
      console.log('Database pool closed');

      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Export app for testing
export { app };
