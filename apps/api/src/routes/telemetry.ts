import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { trace, SpanStatusCode, metrics } from '@opentelemetry/api';

const router = Router();

const errorReportSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  stack: z.string().optional(),
  pageUrl: z.string(),
  userAgent: z.string(),
  timestamp: z.string(),
  componentStack: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

const vitalReportSchema = z.object({
  type: z.literal('vital'),
  name: z.enum(['LCP', 'FID', 'CLS', 'TTFB', 'INP']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  pageUrl: z.string(),
  userAgent: z.string(),
  timestamp: z.string(),
});

const telemetrySchema = z.discriminatedUnion('type', [
  errorReportSchema,
  vitalReportSchema,
]);

const telemetryBatchSchema = z.object({
  events: z.array(telemetrySchema).min(1).max(50),
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

// POST /api/telemetry — receives frontend errors and Web Vitals
// Mounted BEFORE auth middleware so it works without tokens
router.post('/telemetry', (req: Request, res: Response) => {
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
          'error.message': event.message,
          'error.stack': event.stack || '',
          'page.url': event.pageUrl,
          'user_agent.original': event.userAgent,
        },
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: event.message });
      span.end();

      errorCounter.add(1, {
        page: safeParsePath(event.pageUrl),
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
        page: safeParsePath(event.pageUrl),
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
