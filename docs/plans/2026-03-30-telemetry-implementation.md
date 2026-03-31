# Telemetry-First Observability — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full observability to the analog routine tracker — distributed traces, structured logs, metrics, frontend error reporting, and Web Vitals — using a self-hosted LGTM stack.

**Architecture:** OpenTelemetry SDK in the Express API auto-instruments Express/pg/fetch and exports to an OTel Collector, which fans out to Loki (logs), Tempo (traces), and Prometheus (metrics). Frontend reports errors and Web Vitals via `POST /api/telemetry`. Grafana provides dashboards.

**Tech Stack:** OpenTelemetry Node.js SDK, OTel Collector Contrib, Grafana, Loki, Tempo, Prometheus, pino logger

**Design Doc:** `docs/plans/2026-03-30-telemetry-design.md`

---

## Task 1: Telemetry Infrastructure Configs

Create the configuration files for all telemetry containers.

**Files:**
- Create: `telemetry/otel-collector.yaml`
- Create: `telemetry/loki.yaml`
- Create: `telemetry/tempo.yaml`
- Create: `telemetry/prometheus.yaml`

**Step 1: Create telemetry directory**

```bash
mkdir -p telemetry
```

**Step 2: Write OTel Collector config**

Create `telemetry/otel-collector.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  resource:
    attributes:
      - key: service.namespace
        value: analog-routine-tracker
        action: upsert

exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: art

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [otlphttp/tempo]
    logs:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [loki]
    metrics:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [prometheus]
```

**Step 3: Write Loki config**

Create `telemetry/loki.yaml`:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  allow_structured_metadata: true

analytics:
  reporting_enabled: false
```

**Step 4: Write Tempo config**

Create `telemetry/tempo.yaml`:

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: 0.0.0.0:4318
        grpc:
          endpoint: 0.0.0.0:4317

storage:
  trace:
    backend: local
    local:
      path: /var/tempo/traces
    wal:
      path: /var/tempo/wal

metrics_generator:
  registry:
    external_labels:
      source: tempo
  storage:
    path: /var/tempo/generator/wal
    remote_write:
      - url: http://prometheus:9090/api/v1/write

overrides:
  defaults:
    metrics_generator:
      processors: [service-graphs, span-metrics]
```

**Step 5: Write Prometheus config**

Create `telemetry/prometheus.yaml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: otel-collector
    static_configs:
      - targets: ['otel-collector:8889']

  - job_name: loki
    static_configs:
      - targets: ['loki:3100']

  - job_name: tempo
    static_configs:
      - targets: ['tempo:3200']

# Enable remote write receiver for Tempo metrics generator
remote_write_receiver:
  enabled: true
```

Note: Prometheus remote write receiver is enabled via `--web.enable-remote-write-receiver` CLI flag in docker-compose.

**Step 6: Commit**

```bash
git add telemetry/
git commit -m "chore: add telemetry infrastructure configs (otel, loki, tempo, prometheus)"
```

---

## Task 2: Grafana Provisioning

Pre-provision Grafana datasources and dashboard stubs so it's ready on first boot.

**Files:**
- Create: `telemetry/grafana/provisioning/datasources/datasources.yaml`
- Create: `telemetry/grafana/provisioning/dashboards/dashboards.yaml`
- Create: `telemetry/grafana/provisioning/dashboards/api-overview.json`
- Create: `telemetry/grafana/provisioning/dashboards/frontend-health.json`

**Step 1: Create directory structure**

```bash
mkdir -p telemetry/grafana/provisioning/datasources
mkdir -p telemetry/grafana/provisioning/dashboards
```

**Step 2: Write datasources config**

Create `telemetry/grafana/provisioning/datasources/datasources.yaml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      httpMethod: POST

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: tempo
          matcherRegex: '"traceId":"(\w+)"'
          name: TraceID
          url: '$${__value.raw}'

  - name: Tempo
    type: tempo
    access: proxy
    uid: tempo
    url: http://tempo:3200
    jsonData:
      tracesToLogsV2:
        datasourceUid: loki
        filterByTraceID: true
      nodeGraph:
        enabled: true
      serviceMap:
        datasourceUid: prometheus
```

**Step 3: Write dashboards provisioning config**

Create `telemetry/grafana/provisioning/dashboards/dashboards.yaml`:

```yaml
apiVersion: 1

providers:
  - name: Default
    orgId: 1
    folder: Analog Routine Tracker
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: false
```

**Step 4: Write API Overview dashboard**

Create `telemetry/grafana/provisioning/dashboards/api-overview.json` — a Grafana dashboard JSON with panels for:
- Request rate by route (Prometheus: `rate(art_http_server_duration_count[5m])`)
- Error rate by status (Prometheus: `rate(art_http_server_duration_count{http_status_code=~"4..|5.."}[5m])`)
- P50/P95/P99 response time (Prometheus: histogram quantiles on `art_http_server_duration`)
- Recent traces table (Tempo: `{}` query)
- Top errors log panel (Loki: `{service_name="api"} |= "error"`)

This file will be a standard Grafana dashboard JSON export. The implementing engineer should:
1. Create a minimal valid Grafana dashboard JSON structure
2. Add 5 panels with the queries listed above
3. Use `templating` variables for time range
4. Set auto-refresh to 30s

**Step 5: Write Frontend Health dashboard**

Create `telemetry/grafana/provisioning/dashboards/frontend-health.json` — panels for:
- Web Vitals gauges (Prometheus: `art_web_vital_lcp`, `art_web_vital_fid`, `art_web_vital_cls`, `art_web_vital_inp`)
- Client error count over time (Prometheus: `rate(art_frontend_error_total[5m])`)
- Error log stream (Loki: `{source="frontend"}`)

Same structure as above.

**Step 6: Commit**

```bash
git add telemetry/grafana/
git commit -m "chore: add grafana provisioning (datasources + dashboard stubs)"
```

---

## Task 3: Docker Compose — Add Telemetry Services

Add all 5 telemetry containers to docker-compose.yml.

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add telemetry services to docker-compose.yml**

Add after the existing `caddy` service:

```yaml
  # --- Telemetry Stack ---
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    restart: unless-stopped
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./telemetry/otel-collector.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8889:8889"   # Prometheus metrics
    depends_on:
      - loki
      - tempo

  loki:
    image: grafana/loki:3.0.0
    restart: unless-stopped
    command: -config.file=/etc/loki/loki.yaml
    volumes:
      - ./telemetry/loki.yaml:/etc/loki/loki.yaml:ro
      - loki-data:/loki
    ports:
      - "3100:3100"

  tempo:
    image: grafana/tempo:latest
    restart: unless-stopped
    command: ["-config.file=/etc/tempo/tempo.yaml"]
    volumes:
      - ./telemetry/tempo.yaml:/etc/tempo/tempo.yaml:ro
      - tempo-data:/var/tempo
    ports:
      - "3200:3200"

  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --web.enable-remote-write-receiver
    volumes:
      - ./telemetry/prometheus.yaml:/etc/prometheus/prometheus.yml:ro
      - prom-data:/prometheus
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
    volumes:
      - grafana-data:/var/lib/grafana
      - ./telemetry/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./telemetry/grafana/provisioning/dashboards:/var/lib/grafana/dashboards:ro
    ports:
      - "3002:3000"
    depends_on:
      - prometheus
      - loki
      - tempo
```

**Step 2: Add volumes**

Add to the existing `volumes:` section:

```yaml
  loki-data:
  tempo-data:
  prom-data:
  grafana-data:
```

**Step 3: Add OTel env vars to API service**

Add to the `api` service's `environment` section:

```yaml
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317
      OTEL_SERVICE_NAME: api
      OTEL_RESOURCE_ATTRIBUTES: service.version=1.0.0,deployment.environment=production
```

And add `depends_on`:

```yaml
    depends_on:
      db:
        condition: service_healthy
      otel-collector:
        condition: service_started
```

**Step 4: Verify compose file is valid**

```bash
docker compose config --quiet
```

Expected: no output (valid)

**Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add telemetry stack to docker-compose (otel, loki, tempo, prometheus, grafana)"
```

---

## Task 4: API — OpenTelemetry SDK Instrumentation

Add OTel auto-instrumentation to the Express API.

**Files:**
- Create: `apps/api/src/instrumentation.ts`
- Modify: `apps/api/package.json` — add OTel dependencies
- Modify: `apps/api/Dockerfile` — add `--require` flag
- Modify: `apps/api/tsconfig.json` — ensure instrumentation.ts is included

**Step 1: Install OTel dependencies**

Add to `apps/api/package.json` dependencies:

```json
"@opentelemetry/sdk-node": "^0.57.0",
"@opentelemetry/auto-instrumentations-node": "^0.56.0",
"@opentelemetry/exporter-trace-otlp-grpc": "^0.57.0",
"@opentelemetry/exporter-logs-otlp-grpc": "^0.57.0",
"@opentelemetry/exporter-metrics-otlp-grpc": "^0.57.0",
"@opentelemetry/api": "^1.9.0",
"@opentelemetry/resources": "^1.30.0",
"@opentelemetry/semantic-conventions": "^1.28.0"
```

Run: `cd apps/api && npm install`

**Step 2: Create instrumentation bootstrap file**

Create `apps/api/src/instrumentation.ts`:

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'api',
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
});

const sdk = new NodeSDK({
  resource,
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 15000,
  }),
  logRecordProcessor: new BatchLogRecordProcessor(new OTLPLogExporter()),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      // Disable noisy/unnecessary instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  ],
});

sdk.start();
console.log('[OTel] Instrumentation started');

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(
    () => console.log('[OTel] Shut down successfully'),
    (err) => console.error('[OTel] Shutdown error', err)
  );
});
```

**Step 3: Update Dockerfile to load instrumentation before app**

In `apps/api/Dockerfile`, change the CMD/entrypoint to:

```dockerfile
CMD ["node", "--require", "./dist/instrumentation.js", "dist/index.js"]
```

If the current CMD is something like `CMD ["node", "dist/index.js"]`, just add the `--require` flag.

**Step 4: Verify it compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors

**Step 5: Commit**

```bash
git add apps/api/src/instrumentation.ts apps/api/package.json apps/api/Dockerfile
git commit -m "feat: add OpenTelemetry auto-instrumentation to API"
```

---

## Task 5: API — Replace Morgan with Structured Logging (pino)

Replace morgan with pino for structured JSON logging with OTel trace context.

**Files:**
- Modify: `apps/api/package.json` — add pino, pino-http; remove morgan
- Create: `apps/api/src/lib/logger.ts` — pino logger instance
- Modify: `apps/api/src/middleware/request-logger.ts` — replace morgan with pino-http
- Modify: `apps/api/src/middleware/error-handler.ts` — use pino logger, always log
- Modify: `apps/api/src/app.ts` — update imports

**Step 1: Install pino deps, keep morgan for now (remove later)**

Add to `apps/api/package.json` dependencies:

```json
"pino": "^9.0.0",
"pino-http": "^10.0.0"
```

Add to devDependencies:

```json
"@types/pino-http": "^5.8.4"
```

Run: `cd apps/api && npm install`

**Step 2: Create logger module**

Create `apps/api/src/lib/logger.ts`:

```typescript
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

// Custom mixin to inject trace context into every log line
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
```

**Step 3: Replace request-logger middleware**

Replace contents of `apps/api/src/middleware/request-logger.ts`:

```typescript
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/api/health',
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, _res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
      },
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
```

**Step 4: Update error handler — always log, add trace context**

Replace contents of `apps/api/src/middleware/error-handler.ts`:

```typescript
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export class APIError extends Error {
  public statusCode: number;
  public details?: Record<string, string[]>;

  constructor(message: string, statusCode: number = 500, details?: Record<string, string[]>) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const NotFoundError = (resource: string) =>
  new APIError(`${resource} not found`, 404);

export const BadRequestError = (message: string, details?: Record<string, string[]>) =>
  new APIError(message, 400, details);

export const ConflictError = (message: string) =>
  new APIError(message, 409);

function formatZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!details[path]) details[path] = [];
    details[path].push(issue.message);
  }
  return details;
}

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // ALWAYS log errors — this was the bug that hid the print page failure
  if (err instanceof ZodError) {
    logger.warn({ err, url: req.url, method: req.method }, 'Validation error');
    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data',
      details: formatZodError(err),
    });
    return;
  }

  if (err instanceof APIError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    logger[level]({ err, statusCode: err.statusCode, url: req.url, method: req.method }, err.message);
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
    return;
  }

  // Unknown errors — always log at error level
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
  });
};
```

**Step 5: Update app.ts imports**

In `apps/api/src/app.ts`, the import `import { requestLogger } from './middleware/request-logger'` stays the same — the export name hasn't changed, just the implementation.

Remove `morgan` from `package.json` dependencies and `@types/morgan` from devDependencies if desired (optional cleanup).

**Step 6: Verify it compiles**

```bash
cd apps/api && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add apps/api/src/lib/logger.ts apps/api/src/middleware/ apps/api/package.json
git commit -m "feat: replace morgan with pino structured logging + OTel trace context"
```

---

## Task 6: API — Frontend Telemetry Ingestion Endpoint

Create `POST /api/telemetry` to receive client-side errors and Web Vitals.

**Files:**
- Create: `apps/api/src/routes/telemetry.ts`
- Modify: `apps/api/src/routes/index.ts` — mount telemetry router
- Modify: `apps/api/src/app.ts` — mount telemetry route before auth middleware

**Step 1: Create telemetry route**

Create `apps/api/src/routes/telemetry.ts`:

```typescript
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
// Mounted BEFORE auth middleware so it works without auth tokens in the frontend
router.post('/telemetry', (req: Request, res: Response) => {
  const parsed = telemetryBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid telemetry payload' });
    return;
  }

  const tracer = trace.getTracer('frontend-telemetry');

  for (const event of parsed.data.events) {
    if (event.type === 'error') {
      // Log the error
      logger.error({
        source: 'frontend',
        pageUrl: event.pageUrl,
        userAgent: event.userAgent,
        errorMessage: event.message,
        stack: event.stack,
        componentStack: event.componentStack,
        context: event.context,
      }, `[Frontend Error] ${event.message}`);

      // Create a span for the error
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

      // Increment counter
      errorCounter.add(1, {
        page: new URL(event.pageUrl, 'http://localhost').pathname,
      });

    } else if (event.type === 'vital') {
      // Log the vital
      logger.info({
        source: 'frontend',
        vital: event.name,
        value: event.value,
        rating: event.rating,
        pageUrl: event.pageUrl,
      }, `[Web Vital] ${event.name}=${event.value}`);

      // Record histogram
      const histogram = getVitalHistogram(event.name);
      histogram.record(event.value, {
        page: new URL(event.pageUrl, 'http://localhost').pathname,
        rating: event.rating || 'unknown',
      });
    }
  }

  res.status(204).end();
});

export default router;
```

**Step 2: Mount telemetry route BEFORE auth middleware in app.ts**

In `apps/api/src/app.ts`, add the telemetry route after the health check but BEFORE the auth middleware:

```typescript
import telemetryRouter from './routes/telemetry';

// ... after health check, before auth middleware:

// Telemetry endpoint (no auth required — frontend reports here)
app.use('/api', telemetryRouter);

// Auth middleware (applied to all routes below)
app.use(authMiddleware);
```

**Step 3: Verify it compiles**

```bash
cd apps/api && npx tsc --noEmit
```

**Step 4: Test the endpoint manually**

```bash
curl -s -X POST http://localhost:3001/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{"events":[{"type":"error","message":"test error","pageUrl":"http://localhost:3000/test","userAgent":"test","timestamp":"2026-01-01T00:00:00Z"}]}'
```

Expected: HTTP 204 No Content

**Step 5: Commit**

```bash
git add apps/api/src/routes/telemetry.ts apps/api/src/app.ts
git commit -m "feat: add POST /api/telemetry endpoint for frontend error + Web Vitals ingestion"
```

---

## Task 7: Frontend — Telemetry Client Library

Create the client-side telemetry reporter.

**Files:**
- Create: `apps/web/lib/telemetry.ts`

**Step 1: Create telemetry client**

Create `apps/web/lib/telemetry.ts`:

```typescript
const TELEMETRY_ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/telemetry`;

// Buffer events and flush periodically or when buffer is full
let eventBuffer: TelemetryEvent[] = [];
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

function flush() {
  if (eventBuffer.length === 0) return;

  const events = [...eventBuffer];
  eventBuffer = [];

  // Use sendBeacon for reliability (survives page unload)
  const payload = JSON.stringify({ events });
  const sent = navigator.sendBeacon?.(TELEMETRY_ENDPOINT, new Blob([payload], { type: 'application/json' }));

  // Fallback to fetch if sendBeacon unavailable or fails
  if (!sent) {
    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Telemetry should never break the app — swallow errors
    });
  }
}

function enqueue(event: TelemetryEvent) {
  eventBuffer.push(event);
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

// Auto-flush on interval
if (typeof window !== 'undefined') {
  setInterval(flush, FLUSH_INTERVAL_MS);
  // Flush before page unload
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
 * Report a Web Vital metric to the telemetry backend.
 * Compatible with Next.js reportWebVitals callback signature.
 */
export function reportWebVital(metric: {
  name: string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
}) {
  const validNames = ['LCP', 'FID', 'CLS', 'TTFB', 'INP'] as const;
  if (!validNames.includes(metric.name as typeof validNames[number])) return;

  enqueue({
    type: 'vital',
    name: metric.name as typeof validNames[number],
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
    const error = event.reason instanceof Error
      ? event.reason
      : String(event.reason);
    reportError(error, { type: 'unhandledrejection' });
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/lib/telemetry.ts
git commit -m "feat: add frontend telemetry client (error reporter + Web Vitals)"
```

---

## Task 8: Frontend — Wire Telemetry Into App

Connect the telemetry client to error boundaries, API client, and Web Vitals.

**Files:**
- Modify: `apps/web/app/layout.tsx` — install global handlers + Web Vitals
- Modify: `apps/web/app/global-error.tsx` — report error
- Modify: `apps/web/app/upload/error.tsx` — report error
- Modify: `apps/web/lib/api.ts` — report API failures
- Create: `apps/web/components/telemetry-provider.tsx` — client component for init

**Step 1: Create TelemetryProvider component**

Create `apps/web/components/telemetry-provider.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';
import { installGlobalErrorHandlers, reportWebVital } from '@/lib/telemetry';

export function TelemetryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  useReportWebVitals((metric) => {
    reportWebVital(metric);
  });

  return <>{children}</>;
}
```

Note: `useReportWebVitals` is from `next/web-vitals` (Next.js 14+). Check if it's available; if not, use `web-vitals` package directly with `onCLS`, `onFID`, `onLCP`, `onTTFB`, `onINP`.

**Step 2: Add TelemetryProvider to root layout**

In `apps/web/app/layout.tsx`, wrap children:

```tsx
import { TelemetryProvider } from '@/components/telemetry-provider';

// Inside the RootLayout return:
<body>
  <TelemetryProvider>
    {children}
  </TelemetryProvider>
</body>
```

**Step 3: Wire global-error.tsx**

In `apps/web/app/global-error.tsx`, add at the top of the component (before the return):

```tsx
import { reportError } from '@/lib/telemetry';

// Inside the component:
useEffect(() => {
  reportError(error, { componentStack: error.digest });
}, [error]);
```

**Step 4: Wire upload/error.tsx**

Same pattern as global-error.tsx:

```tsx
import { reportError } from '@/lib/telemetry';

useEffect(() => {
  reportError(error, { componentStack: error.digest, page: '/upload' });
}, [error]);
```

**Step 5: Wire API client**

In `apps/web/lib/api.ts`, in the `request()` method's catch path, add:

```typescript
import { reportError } from './telemetry';

// In the request method, after catching errors:
if (!response.ok) {
  const apiError = new ApiError(status, message, details);
  reportError(apiError, { endpoint, method: options.method || 'GET', statusCode: status });
  throw apiError;
}
```

Be careful to not double-report: only report in the `request()` method, not in individual component catch blocks (those already catch the same error).

**Step 6: Verify build**

```bash
cd apps/web && npm run build
```

Expected: builds successfully

**Step 7: Commit**

```bash
git add apps/web/components/telemetry-provider.tsx apps/web/app/ apps/web/lib/
git commit -m "feat: wire telemetry into error boundaries, API client, and Web Vitals"
```

---

## Task 9: Integration Test — End-to-End Telemetry Flow

Verify the full pipeline works: frontend error → API → OTel Collector → Loki/Tempo.

**Files:**
- No new files — this is a verification task

**Step 1: Build and start everything**

```bash
docker compose build
docker compose up -d
```

Wait for all containers to be healthy:

```bash
docker compose ps
```

Expected: 10 containers running (db, api, web, caddy, otel-collector, loki, tempo, prometheus, grafana)

**Step 2: Verify OTel Collector is receiving data**

```bash
docker compose logs otel-collector --tail 20
```

Expected: logs showing pipeline started, no errors

**Step 3: Verify Grafana is accessible**

```bash
curl -s http://localhost:3002/api/health | python3 -m json.tool
```

Expected: `{"commit":"...","database":"ok","version":"..."}`

**Step 4: Send a test error from the frontend telemetry endpoint**

```bash
curl -s -X POST http://localhost:3001/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{"events":[{"type":"error","message":"Integration test error","stack":"Error: test\n    at test.js:1:1","pageUrl":"http://localhost:3000/test","userAgent":"curl/test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}]}'
```

Expected: HTTP 204

**Step 5: Verify the error appears in Loki (via Grafana)**

Open `http://localhost:3002` → Explore → Loki datasource → query: `{source="frontend"}`

Expected: see the "Integration test error" log entry

**Step 6: Verify API traces appear in Tempo**

Make a real API call:

```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:3001/api/routines
```

Then in Grafana → Explore → Tempo → search for service `api`

Expected: see a trace for the GET /api/routines request with spans for Express handler and pg query

**Step 7: Verify Prometheus metrics**

In Grafana → Explore → Prometheus → query: `art_frontend_error_total`

Expected: counter shows 1 (from the test error)

**Step 8: Add Tailscale serve for Grafana**

```bash
tailscale serve --bg --https=3002 3002
```

This makes Grafana accessible at `https://kalebs-mac-mini.tail6ac27c.ts.net:3002`

**Step 9: Commit any fixups needed during testing**

```bash
git add -A
git commit -m "fix: telemetry integration fixups from end-to-end testing"
```

---

## Task 10: Documentation

Update project docs to cover the telemetry stack.

**Files:**
- Create: `docs/TELEMETRY.md`
- Modify: `DEPLOYMENT.md` — add telemetry section
- Modify: `docker-compose.yml` — add comments

**Step 1: Create TELEMETRY.md**

Document:
- Architecture overview (link to design doc)
- How to access Grafana (URL, default credentials)
- How to query logs (Loki query examples)
- How to find traces (Tempo search)
- How to check metrics (Prometheus queries)
- How to add custom spans in new routes
- How to add new frontend error reporting
- Troubleshooting (OTel Collector not receiving, Loki/Tempo not storing)

**Step 2: Update DEPLOYMENT.md**

Add section for telemetry:
- New env vars (`GRAFANA_PASSWORD`, `OTEL_*`)
- New ports (3002, 3100, 3200, 4317, 4318, 8889, 9090)
- Volume persistence
- Tailscale serve setup for Grafana

**Step 3: Commit**

```bash
git add docs/TELEMETRY.md DEPLOYMENT.md
git commit -m "docs: add telemetry documentation and update deployment guide"
```

---

## Summary

| Task | What | Files | Effort |
|------|------|-------|--------|
| 1 | Telemetry infra configs | 4 new | 15 min |
| 2 | Grafana provisioning | 4 new | 20 min |
| 3 | Docker Compose updates | 1 modify | 10 min |
| 4 | OTel SDK instrumentation | 2 new, 1 modify | 15 min |
| 5 | Structured logging (pino) | 1 new, 2 modify | 20 min |
| 6 | Telemetry ingestion endpoint | 1 new, 1 modify | 15 min |
| 7 | Frontend telemetry client | 1 new | 15 min |
| 8 | Wire telemetry into app | 1 new, 4 modify | 20 min |
| 9 | Integration test | 0 | 30 min |
| 10 | Documentation | 1 new, 1 modify | 15 min |

**Total estimate: ~3 hours**
