# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A mobile-first PWA that bridges analog and digital routine tracking. Users create routines, print physical cards, complete them by hand, then photograph and OCR the results back into the app.

**Tech Stack:**
- Frontend: Next.js 14+ (App Router) deployed to Azure Static Web Apps
- Backend: Node.js/Express on Azure App Service
- Database: Azure PostgreSQL
- Storage: Azure Blob Storage (photos, PDFs)
- OCR: Azure OpenAI GPT-4o with vision
- Notifications: Todoist API

## Repository Structure

```
analog-routine-tracker/
├── apps/
│   ├── web/                      # Next.js frontend (Azure Static Web Apps)
│   │   ├── app/
│   │   │   ├── page.tsx                    # / - Routine list
│   │   │   ├── routines/
│   │   │   │   ├── new/page.tsx            # /routines/new
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx            # /routines/[id] - View/complete
│   │   │   │       ├── edit/page.tsx       # /routines/[id]/edit
│   │   │   │       ├── print/page.tsx      # /routines/[id]/print
│   │   │   │       ├── upload/page.tsx     # /routines/[id]/upload
│   │   │   │       └── history/page.tsx    # /routines/[id]/history
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                         # Shadcn/ui components
│   │   │   ├── routine-card.tsx
│   │   │   ├── item-editor.tsx
│   │   │   ├── completion-form.tsx
│   │   │   ├── photo-uploader.tsx
│   │   │   ├── ocr-confirmation.tsx
│   │   │   ├── calendar-view.tsx
│   │   │   └── pdf-preview.tsx
│   │   ├── lib/
│   │   │   ├── api.ts                      # API client
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   │   └── use-routines.ts
│   │   ├── public/
│   │   │   └── manifest.json               # PWA manifest
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   └── api/                      # Node.js/Express backend (Azure)
│       ├── src/
│       │   ├── index.ts                    # Express app entry
│       │   ├── routes/
│       │   │   ├── routines.ts             # CRUD + versioning
│       │   │   ├── completions.ts          # Digital + OCR completions
│       │   │   ├── history.ts              # View/edit history
│       │   │   ├── print.ts                # PDF generation
│       │   │   └── inventory.ts            # Paper inventory
│       │   ├── services/
│       │   │   ├── ocr.service.ts          # Azure OpenAI integration
│       │   │   ├── pdf.service.ts          # PDF generation
│       │   │   ├── storage.service.ts      # Azure Blob Storage
│       │   │   ├── todoist.service.ts      # Inventory alerts
│       │   │   └── versioning.service.ts   # Routine version snapshots
│       │   ├── db/
│       │   │   ├── client.ts               # PostgreSQL client
│       │   │   ├── schema.sql              # Database schema
│       │   │   └── migrations/
│       │   ├── jobs/
│       │   │   └── photo-cleanup.ts        # 30-day photo deletion
│       │   ├── types/
│       │   │   └── index.ts                # Shared TypeScript types
│       │   └── utils/
│       │       └── confidence.ts           # OCR confidence helpers
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                   # Shared types and utilities
│       ├── types.ts                        # Routine, Item, CompletedRoutine
│       └── validation.ts                   # Zod schemas
│
├── docs/
│   └── PRD.md                    # Product requirements document
├── .env.example
├── turbo.json                    # Turborepo config
└── package.json                  # Root workspace package
```

## Common Commands

```bash
# Install dependencies (from root)
npm install

# Development
npm run dev              # Run both frontend and backend
npm run dev:web          # Frontend only (http://localhost:3000)
npm run dev:api          # Backend only (http://localhost:3001)

# Build
npm run build            # Build all packages
npm run build:web        # Build frontend
npm run build:api        # Build backend

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Seed test data

# Testing
npm run test             # Run all tests
npm run test:web         # Frontend tests
npm run test:api         # Backend tests
npm run test -- --watch  # Watch mode

# Linting
npm run lint             # Lint all packages
npm run lint:fix         # Auto-fix lint issues

# Type checking
npm run typecheck        # Check all TypeScript
```

## Architecture Notes

### Data Flow for OCR Upload
1. User uploads photo via `/routines/[id]/upload`
2. Frontend sends image to `POST /routines/:id/upload`
3. Backend uploads to Azure Blob Storage, calls Azure OpenAI GPT-4o
4. OCR returns structured JSON with values and confidence scores
5. Frontend shows confirmation screen with low-confidence fields highlighted
6. User confirms/corrects, frontend calls `POST /routines/:id/confirm`
7. Backend saves CompletedRoutine, decrements paper inventory

### Routine Versioning
When a routine is edited, the backend:
1. Increments `routine.version`
2. Creates a `RoutineVersion` snapshot of previous items
3. Old printed cards (with version marker) map to their snapshot

### PDF Generation
Cards include OCR alignment markers (corner dots) and version number. Three layouts:
- Quarter-letter (4.25x5.5") for 1-8 items
- Half-letter (5.5x8.5") for 9-15 items
- Full letter for 16+ items

### Item Types
- `checkbox`: boolean (checked/unchecked)
- `number`: numeric with optional unit (e.g., "lbs")
- `scale`: integer 1-5 with optional notes line
- `text`: freeform short answer

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER_PHOTOS=photos
AZURE_STORAGE_CONTAINER_PDFS=pdfs

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://...openai.azure.com
AZURE_OPENAI_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-4o

# Todoist
TODOIST_API_TOKEN=...

# App
API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Key Files to Understand

- `apps/api/src/services/ocr.service.ts` - GPT-4o vision prompt and response parsing
- `apps/api/src/services/pdf.service.ts` - Card layout generation with OCR markers
- `apps/api/src/services/versioning.service.ts` - Snapshot creation on routine edit
- `apps/web/components/ocr-confirmation.tsx` - User correction UI with confidence indicators
- `packages/shared/types.ts` - Core data types (Routine, Item, CompletedRoutine)
