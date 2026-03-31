# Telemetry & Observability

The app ships with a self-hosted LGTM stack (Loki, Grafana, Tempo, Prometheus) for full observability.

## Architecture

```
API (Express + OTel SDK) → OTel Collector → Loki (logs) + Tempo (traces) + Prometheus (metrics)
Frontend (Next.js) → POST /api/telemetry → same pipeline
Grafana → queries all three backends, dashboards pre-provisioned
```

## Accessing Grafana

**URL:** `http://localhost:3002` (or via Tailscale: `https://kalebs-mac-mini.tail6ac27c.ts.net:3002`)

**Default credentials:** `admin` / value of `GRAFANA_PASSWORD` env var (default: `admin`)

Anonymous read access is enabled by default.

## Pre-Provisioned Dashboards

### API Overview (`art-api-overview`)
- Request rate by route
- Error rate (4xx, 5xx) by route
- P50/P95/P99 response times
- Recent traces (click to drill into waterfall)
- Top errors from logs

### Frontend Health (`art-frontend-health`)
- Web Vitals gauges (LCP, FID, CLS, INP) with green/yellow/red thresholds
- Frontend error count over time
- Web Vitals rating distribution
- Frontend error log stream

## Querying Logs (Loki)

In Grafana → Explore → select **Loki** datasource.

```logql
# All API errors
{service_name="api"} | json | level = "error"

# Frontend errors only
{source="frontend"} | json

# Errors on a specific route
{service_name="api"} | json | url =~ "/api/routines/.*/upload"

# Filter by trace ID
{service_name="api"} | json | traceId = "abc123..."
```

## Finding Traces (Tempo)

In Grafana → Explore → select **Tempo** datasource.

- Search by service name: `api`
- Filter by status: `error`
- Filter by duration: `> 1s`

Click any trace to see the full waterfall — Express middleware → route handler → Postgres queries → external API calls (OCR, Todoist).

## Checking Metrics (Prometheus)

In Grafana → Explore → select **Prometheus** datasource.

```promql
# Request rate
sum(rate(http_server_request_duration_seconds_count{service_namespace="analog-routine-tracker"}[5m]))

# Error rate
sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m]))

# P95 response time
histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))

# Frontend errors
art_frontend_error_total

# Web Vitals
art_web_vital_lcp
art_web_vital_cls
```

## Adding Custom Spans

In any API route or service:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-module');

async function doWork() {
  return tracer.startActiveSpan('my-operation', async (span) => {
    try {
      span.setAttribute('key', 'value');
      const result = await someOperation();
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

## Adding Frontend Error Reporting

In any component:

```typescript
import { reportError } from '@/lib/telemetry';

try {
  await riskyOperation();
} catch (err) {
  reportError(err, { component: 'MyComponent', action: 'riskyOperation' });
}
```

Error boundaries (`global-error.tsx`, `upload/error.tsx`) automatically report errors.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4317` | OTel Collector gRPC endpoint |
| `OTEL_SERVICE_NAME` | `api` | Service name in traces/logs |
| `OTEL_RESOURCE_ATTRIBUTES` | — | Additional resource attributes |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |
| `LOG_LEVEL` | `info` | Pino log level (trace/debug/info/warn/error) |

## Ports

| Service | Port | Access |
|---|---|---|
| Grafana | 3002 | Dashboard UI |
| Loki | 3100 | Log queries |
| Tempo | 3200 | Trace queries |
| Prometheus | 9090 | Metrics queries |
| OTel Collector (gRPC) | 4317 | OTLP ingestion |
| OTel Collector (HTTP) | 4318 | OTLP ingestion |
| OTel Collector (metrics) | 8889 | Prometheus scrape target |

## Troubleshooting

**OTel Collector not receiving data:**
```bash
docker compose logs otel-collector --tail 50
```
Check for connection errors to Loki/Tempo/Prometheus.

**No traces in Tempo:**
```bash
curl -s http://localhost:3200/ready
```
Should return `ready`. Check Tempo logs for storage errors.

**No logs in Loki:**
```bash
curl -s http://localhost:3100/ready
```
Should return `ready`. Check Loki logs for ingestion errors.

**API not sending telemetry:**
Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is set and the collector is reachable from the API container.

## Data Retention

- **Loki:** Rejects samples older than 7 days (`reject_old_samples_max_age: 168h`)
- **Tempo:** Default retention (configurable in `telemetry/tempo.yaml`)
- **Prometheus:** Default 15-day retention
- **Volumes:** `loki-data`, `tempo-data`, `prom-data`, `grafana-data` — persist across restarts
