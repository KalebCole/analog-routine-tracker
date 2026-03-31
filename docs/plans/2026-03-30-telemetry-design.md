# Telemetry-First Observability — Design Document

**Date:** 2026-03-30
**Status:** Approved
**Author:** Pieter (agent)

---

## Problem

The app has zero observability. When the print page broke on mobile, no errors appeared in any log. The API error handler only logs in development mode. The frontend catches errors and shows a UI message but reports nothing remotely. Debugging requires physical access to the phone's browser console.

## Decision

Self-hosted LGTM stack (Loki, Grafana, Tempo, Prometheus) with OpenTelemetry instrumentation on the API and a lightweight error/vitals reporter on the frontend. No external SaaS dependencies. No alerting for now — dashboard-only.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Docker Compose                                      │
│                                                      │
│  ┌─────────┐   OTLP/gRPC   ┌──────────────────┐    │
│  │   API   │ ──────────────→│  OTel Collector  │    │
│  │ (Express│                │                  │    │
│  │ + OTel) │                └────────┬─────────┘    │
│  └─────────┘                    ┌────┼────┐         │
│       ↑                         ↓    ↓    ↓         │
│  ┌─────────┐              ┌─────┐ ┌────┐ ┌─────┐   │
│  │   Web   │  POST        │Loki │ │Tempo│ │Prom │   │
│  │ (Next.js│  /api/telemetry│    │ │    │ │     │   │
│  │ + vitals│──→ API ──→   └──┬──┘ └──┬─┘ └──┬──┘   │
│  └─────────┘                 └───────┼──────┘       │
│                              ┌───────┴──────┐       │
│                              │   Grafana    │       │
│                              │  :3002       │       │
│                              └──────────────┘       │
└─────────────────────────────────────────────────────┘
```

## Components

### 1. OpenTelemetry Collector
- Single container, receives OTLP from the API (gRPC on :4317)
- Fans out to Loki (logs), Tempo (traces), Prometheus (metrics via remote write)
- Decouples app from storage backends

### 2. Grafana + Loki + Tempo + Prometheus (LGTM stack)
- **Loki** — log aggregation (replaces `docker compose logs` for debugging)
- **Tempo** — distributed traces (request waterfall: Express → Postgres → Azure OpenAI)
- **Prometheus** — metrics (request rate, error rate, response times, Web Vitals)
- **Grafana** — unified dashboard UI on `:3002`

### 3. API Instrumentation
- OpenTelemetry Node.js SDK with auto-instrumentation (Express, pg, fetch)
- Structured JSON logging via pino (replaces morgan)
- Request IDs on every request (propagated via W3C trace context)
- Error handler always logs (remove `isDevelopment` guard)
- Custom spans for OCR and PDF generation

### 4. Frontend Error + Vitals Reporting
- `POST /api/telemetry` endpoint receives client errors and Web Vitals
- Payload: page URL, user agent, timestamp, error stack, vitals metrics
- API forwards as OTel spans/logs to the Collector
- Next.js `reportWebVitals` for LCP, FID, CLS, TTFB, INP

### 5. Error Boundary Wiring
- `global-error.tsx` and `upload/error.tsx` report to telemetry endpoint
- `api.ts` request wrapper reports failures with route context

## New Containers (5)

| Container | Image | Port | Volume |
|---|---|---|---|
| `otel-collector` | `otel/opentelemetry-collector-contrib` | 4317, 4318 | — |
| `loki` | `grafana/loki:3.0` | 3100 | `loki-data` |
| `tempo` | `grafana/tempo:latest` | 3200 | `tempo-data` |
| `prometheus` | `prom/prometheus:latest` | 9090 | `prom-data` |
| `grafana` | `grafana/grafana:latest` | 3002 | `grafana-data` |

## Files Changed

### API (`apps/api`)
- **New:** `src/instrumentation.ts` — OTel SDK bootstrap
- **New:** `src/routes/telemetry.ts` — `POST /api/telemetry` frontend ingestion
- **Modify:** `src/middleware/request-logger.ts` — replace morgan with pino + OTel
- **Modify:** `src/middleware/error-handler.ts` — always log, add trace context
- **Modify:** `src/app.ts` — mount telemetry route (before auth)
- **Modify:** `Dockerfile` — `--require ./dist/instrumentation.js`
- **Modify:** `package.json` — add OTel + pino deps

### Web (`apps/web`)
- **New:** `lib/telemetry.ts` — error reporter + Web Vitals reporter
- **Modify:** `app/layout.tsx` — register Web Vitals
- **Modify:** `app/global-error.tsx` — report before render
- **Modify:** `app/upload/error.tsx` — report before render
- **Modify:** `lib/api.ts` — report API failures

### Infra
- **New:** `telemetry/otel-collector.yaml`
- **New:** `telemetry/loki.yaml`
- **New:** `telemetry/tempo.yaml`
- **New:** `telemetry/prometheus.yaml`
- **New:** `telemetry/grafana/provisioning/datasources/datasources.yaml`
- **New:** `telemetry/grafana/provisioning/dashboards/dashboards.yaml`
- **New:** `telemetry/grafana/provisioning/dashboards/api-overview.json`
- **New:** `telemetry/grafana/provisioning/dashboards/frontend-health.json`
- **Modify:** `docker-compose.yml` — 5 new services + 4 volumes

## Grafana Dashboards (pre-provisioned)

### API Overview
- Request rate by route
- Error rate (4xx, 5xx) by route
- P50/P95/P99 response time
- Trace search (click to waterfall)

### Frontend Health
- Web Vitals gauges (LCP, FID, CLS, INP)
- Client error count over time
- Error list with stack traces, page URL, user agent

## What This Solves

Print page fails on mobile → frontend reports JS error to `/api/telemetry` → API logs to Loki with stack trace, page URL, user agent → open Grafana → see "TypeError on /routines/[id]/print, iPhone Safari" — no Web Inspector needed.
