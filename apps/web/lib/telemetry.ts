const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
const TELEMETRY_ENDPOINT = apiOrigin
  ? `${apiOrigin}/api/telemetry`
  : '/api/telemetry';

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 10;

type TelemetryEvent =
  | {
      type: 'error';
      message: string;
      stack?: string;
      pageUrl: string;
      userAgent: string;
      timestamp: string;
      componentStack?: string;
      context?: Record<string, unknown>;
    }
  | {
      type: 'vital';
      name: 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'INP';
      value: number;
      rating?: 'good' | 'needs-improvement' | 'poor';
      pageUrl: string;
      userAgent: string;
      timestamp: string;
    };

let eventBuffer: TelemetryEvent[] = [];

function flush() {
  if (eventBuffer.length === 0) return;

  const events = [...eventBuffer];
  eventBuffer = [];

  const payload = JSON.stringify({ events });

  // Use sendBeacon for reliability (survives page unload)
  const sent = navigator.sendBeacon?.(
    TELEMETRY_ENDPOINT,
    new Blob([payload], { type: 'application/json' })
  );

  if (sent) return; // sendBeacon succeeded

  // Fallback to fetch if sendBeacon unavailable or fails
  fetch(TELEMETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) {
        // Re-enqueue events on server error
        eventBuffer = events.concat(eventBuffer);
      }
    })
    .catch(() => {
      // Re-enqueue on network failure (capped to avoid unbounded growth)
      if (eventBuffer.length < MAX_BUFFER_SIZE * 3) {
        eventBuffer = events.concat(eventBuffer);
      }
    });
}

function enqueue(event: TelemetryEvent) {
  eventBuffer.push(event);
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

// Auto-flush on interval + before page unload
if (typeof window !== 'undefined') {
  setInterval(flush, FLUSH_INTERVAL_MS);
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);
}

/**
 * Report a client-side error to the telemetry backend.
 */
export function reportError(
  error: Error | string,
  context?: Record<string, unknown> & { componentStack?: string }
) {
  const message = typeof error === 'string' ? error : error.message;
  const stack = typeof error === 'string' ? undefined : error.stack;

  enqueue({
    type: 'error',
    message,
    stack,
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString(),
    componentStack: context?.componentStack,
    context,
  });
}

/**
 * Report a Web Vital metric.
 * Compatible with Next.js useReportWebVitals callback signature.
 */
export function reportWebVital(metric: {
  name: string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
}) {
  const validNames = ['LCP', 'FID', 'CLS', 'TTFB', 'INP'] as const;
  if (!validNames.includes(metric.name as (typeof validNames)[number])) return;

  enqueue({
    type: 'vital',
    name: metric.name as (typeof validNames)[number],
    value: metric.value,
    rating: metric.rating,
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Install global unhandled error + rejection handlers.
 * Call once at app init.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error =
      event.reason instanceof Error ? event.reason : String(event.reason);
    reportError(error, { type: 'unhandledrejection' });
  });
}
