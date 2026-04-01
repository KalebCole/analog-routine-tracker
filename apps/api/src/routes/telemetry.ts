import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { trace, SpanStatusCode, metrics } from '@opentelemetry/api';

const router = Router();

// Dedicated rate limiter for telemetry — tighter than global
const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 requests/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many telemetry requests' },
});

const MAX_STRING_LEN = 2048;
const MAX_STACK_LEN = 8192;

const errorReportSchema = z.object({
  type: z.literal('error'),
  message: z.string().max(MAX_STRING_LEN),
  stack: z.string().max(MAX_STACK_LEN).optional(),
  pageUrl: z.string().max(MAX_STRING_LEN),
  userAgent: z.string().max(512),
  timestamp: z.string().max(64),
  componentStack: z.string().max(MAX_STACK_LEN).optional(),
  context: z.record(z.string(), z.string().max(512)).optional(),
});

const vitalReportSchema = z.object({
  type: z.literal('vital'),
  name: z.enum(['LCP', 'FID', 'CLS', 'TTFB', 'INP']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  pageUrl: z.string().max(MAX_STRING_LEN),
  userAgent: z.string().max(512),
  timestamp: z.string().max(64),
});

const telemetrySchema = z.discriminatedUnion('type', [
  errorReportSchema,
  vitalReportSchema,
]);

const telemetryBatchSchema = z.object({
  events: z.array(telemetrySchema).min(1).max(10),
});

// Metrics
const meter = metrics.getMeter('frontend');
const errorCounter = meter.createCounter('art_frontend_error_total', {
  description: 'Total frontend errors reported',
});
const vitalHistograms: Record<string, ReturnType<typeof meter.createHistogram>> = {};

function getVitalHistogram(name: string) {
  if (!vitalHistograms[name]) {
    vitalHistograms[name] = meter.createHistogram(`art_web_vital_${name.toLowerCase()}`, {
      description: `Web Vital: ${name}`,
    });
  }
  return vitalHistograms[name];
}

/** Normalize paths for Prometheus labels — replace IDs with :id */
function metricPageLabel(url: string): string {
  return safeParsePath(url)
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id');
}

// POST /api/telemetry — receives frontend errors and Web Vitals
// Mounted BEFORE auth middleware so it works without tokens
router.post('/telemetry', telemetryLimiter, (req: Request, res: Response) => {
  // Reject oversized payloads early
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 64 * 1024) {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }

  const parsed = telemetryBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid telemetry payload' });
    return;
  }

  const tracer = trace.getTracer('frontend-telemetry');

  for (const event of parsed.data.events) {
    if (event.type === 'error') {
      logger.error(
        {
          source: 'frontend',
          pageUrl: event.pageUrl,
          userAgent: event.userAgent,
          errorMessage: event.message,
          stack: event.stack,
          componentStack: event.componentStack,
          context: event.context,
        },
        `[Frontend Error] ${event.message}`
      );

      const span = tracer.startSpan('frontend.error', {
        attributes: {
          'error.message': event.message as string,
          'error.stack': (event.stack || '') as string,
          'page.url': event.pageUrl as string,
          'user_agent.original': event.userAgent as string,
        },
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: event.message as string });
      span.end();

      errorCounter.add(1, {
        page: metricPageLabel(event.pageUrl),
      });
    } else if (event.type === 'vital') {
      logger.info(
        {
          source: 'frontend',
          vital: event.name,
          value: event.value,
          rating: event.rating,
          pageUrl: event.pageUrl,
        },
        `[Web Vital] ${event.name}=${event.value}`
      );

      const histogram = getVitalHistogram(event.name);
      histogram.record(event.value, {
        page: metricPageLabel(event.pageUrl),
        rating: event.rating || 'unknown',
      });
    }
  }

  res.status(204).end();
});

function safeParsePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export default router;
