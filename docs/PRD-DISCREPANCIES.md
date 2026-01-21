# PRD vs Implementation: Discrepancy Report

This document tracks differences between the [Product Requirements Document](./PRD.md) and the actual implementation.

**Last Updated:** 2026-01-20

---

## Missing Features

### 1. PWA Icons

**PRD Reference:** `manifest.json` configuration in Phase 4

**Issue:** The `apps/web/public/manifest.json` references icon files that don't exist:
- `/icons/icon-192.png` (192x192)
- `/icons/icon-512.png` (512x512)

**Impact:** PWA installation will work but show default/broken icons on home screens.

**Fix Required:** Create icon files at `apps/web/public/icons/`

---

### 2. Service Worker

**PRD Reference:** Phase 4 scope - "PWA manifest + service worker"

**Issue:** No service worker file exists in the codebase.

**Impact:**
- No offline capability
- No background sync
- Limited PWA functionality

**Fix Required:** Add service worker for caching and offline support.

---

## Implementation Differences

### 1. Duplicate Date Handling

**PRD Says (Design Decisions table):**
> "Prompt user: overwrite or keep both" - Let user decide; prevents accidental data loss

**Implementation Does:**
Returns `409 Conflict` error with message: "A completion already exists for this date. Edit the existing entry instead."

**Location:** `apps/api/src/routes/completions.ts:104` and `:203`

**Impact:** User cannot choose to overwrite - must manually navigate to edit the existing entry.

**Recommendation:** Either:
- Update frontend to catch 409 and offer "Edit existing" or "Replace" options
- Or accept current behavior as simpler UX (document as intentional deviation)

---

### 2. OCR Response Format

**PRD Says:**
```json
{
  "values": { ... },
  "low_confidence_fields": ["item_id1", "item_id2"]
}
```

**Implementation Does:**
```json
{
  "values": [
    { "itemId": "...", "value": ..., "confidence": 0.85, "needsReview": false },
    { "itemId": "...", "value": ..., "confidence": 0.65, "needsReview": true }
  ]
}
```

**Location:** `apps/api/src/services/ocr.service.ts`, `packages/shared/src/types.ts`

**Impact:** None - functionally equivalent. The `needsReview` boolean per item is actually more flexible than a separate array.

**Recommendation:** Keep current implementation (improvement over PRD).

---

### 3. Calendar Colors

**PRD Says (Flow 6: View Progress):**
> "Calendar view showing completed days (green if ≥80%, yellow if <80%, red/empty if missed)"

**Implementation Does:**
- Green: ≥80% completion
- Yellow: <80% completion
- Empty/gray: No entry

**Location:** `apps/web/components/calendar-view.tsx`

**Impact:** No visual distinction between "missed" days and days with no expected entry.

**Recommendation:** Add red color for missed days (requires defining what "missed" means - perhaps days before today with no entry since routine creation).

---

### 4. Completion Rate Period

**PRD Says (Design Decisions table):**
> "Completion rate period: Last 30 days - Reasonable window for progress view"

**Implementation Does:**
- Stats service calculates completion rate over last 30 days ✓
- History page fetches 50 entries regardless of date (`pageSize: 50`)

**Location:**
- `apps/api/src/services/stats.service.ts` - correctly uses 30 days
- `apps/web/app/routines/[id]/history/page.tsx:60` - fetches 50 entries

**Impact:** Minor - the stats are correct, but history list might show more/fewer than 30 days of data.

**Recommendation:** Keep current behavior - pagination is appropriate for history view.

---

## Correctly Implemented Features

All of the following PRD requirements are fully implemented:

### Database Schema
- [x] `routines` table with JSONB items, version tracking
- [x] `routine_versions` table for snapshots
- [x] `completed_routines` table with source, photo_url, expiry
- [x] `paper_inventory` table with alert tracking
- [x] `edit_history` table for audit trail
- [x] Proper indexes and constraints

### API Endpoints
- [x] Routines CRUD (`POST/GET/PUT/DELETE /routines`)
- [x] Digital completion (`POST /routines/:id/complete`)
- [x] Photo upload + OCR (`POST /routines/:id/upload`)
- [x] OCR confirmation (`POST /routines/:id/confirm`)
- [x] History viewing/editing (`GET/PUT /routines/:id/history`)
- [x] PDF generation (`GET/POST /routines/:id/print`)
- [x] Print confirmation (`POST /routines/:id/print/confirm`)
- [x] Inventory management (`GET/PUT /routines/:id/inventory`)
- [x] Stats endpoint (`GET /routines/:id/stats`)

### Services
- [x] OCR with Azure OpenAI GPT-4o vision
- [x] PDF generation with all 3 layouts (quarter/half/full)
- [x] OCR alignment markers on cards
- [x] Version numbers printed on cards
- [x] Cut guides between cards
- [x] Todoist integration with 24-hour cooldown
- [x] Routine versioning with snapshots
- [x] Photo storage with 30-day expiry
- [x] Photo cleanup cron job

### Frontend
- [x] All required routes/pages
- [x] Routine creation with drag-drop item editor
- [x] Digital completion (card-like UI)
- [x] Photo upload (camera + library)
- [x] OCR confirmation with confidence highlighting
- [x] History with calendar and list views
- [x] Stats display (streaks, completion rate)
- [x] Print options with PDF preview
- [x] PWA manifest (icons missing, but manifest exists)

### Business Logic
- [x] Streak calculation (current + longest)
- [x] Completion rate (% of items per day)
- [x] Inventory tracking (printed - uploaded = remaining)
- [x] Low inventory alerts via Todoist
- [x] Edit history audit trail
- [x] Backward compatibility with old card versions

---

## Environment Requirements

The following must be configured for full functionality:

```bash
# Required
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Required for OCR (falls back to mock without)
AZURE_OPENAI_ENDPOINT=https://....openai.azure.com
AZURE_OPENAI_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-4o

# Required for production storage (uses mock without)
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER_PHOTOS=photos
AZURE_STORAGE_CONTAINER_PDFS=pdfs

# Optional - enables inventory alerts
TODOIST_API_TOKEN=...

# Optional - customize cleanup schedule (default: 3 AM daily)
PHOTO_CLEANUP_SCHEDULE=0 3 * * *
```

---

## Summary

| Category | Status |
|----------|--------|
| Missing features | 2 (PWA icons, service worker) |
| Implementation differences | 4 (see details above) |
| Correctly implemented | ~95% of PRD requirements |

**Overall:** The implementation is substantially complete and production-ready once environment variables are configured and a PostgreSQL database is available.
