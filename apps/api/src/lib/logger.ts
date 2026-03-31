import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

function traceContextMixin() {
  const span = trace.getSpan(context.active());
  if (!span) return {};

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  mixin: traceContextMixin,
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});
