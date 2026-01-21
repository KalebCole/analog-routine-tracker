import morgan from 'morgan';
import { config } from '../config';

// Custom token for response time in a cleaner format
morgan.token('response-time-ms', (_req, res) => {
  const time = res.getHeader('X-Response-Time');
  return time ? `${time}ms` : '-';
});

// Development format: colored, verbose
const devFormat = ':method :url :status :response-time ms - :res[content-length]';

// Production format: JSON-like for log aggregation
const prodFormat = JSON.stringify({
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time',
  contentLength: ':res[content-length]',
  userAgent: ':user-agent',
});

export const requestLogger = morgan(config.isDevelopment ? devFormat : prodFormat, {
  skip: (req) => {
    // Skip health check logs
    return req.url === '/health';
  },
});
