# Product Requirements Document: Analog Routine Tracker

## Overview

### Problem Statement

Kaleb wants to maintain structured morning and evening routines without phone dependency during those times. He values the cognitive benefits of analog completion (pen and paper) but needs digital tracking for data persistence, trend analysis, and accountability. Current solutions force a choice: either go fully digital (phone during routines) or fully analog (lose tracking capabilities).

### Solution

A mobile-first progressive web app that bridges analog and digital tracking through three core capabilities:

1. **Routine Builder** - Create routines with mixed data types (checkboxes, numbers, scales, notes)
2. **Print-to-PDF** - Generate printable cards optimized for bulk printing and OCR recognition, with layout options based on routine complexity
3. **Photo-to-Data** - Upload photos of completed cards via camera or photo library, OCR extracts data, user confirms, app tracks

The app also serves as a direct-completion fallback when printed cards aren't available.

---

## User Personas

**Primary User**: Kaleb - 22-year-old software engineer who:
- Wants phone-free mornings and evenings
- Values data and tracking for accountability
- Has multiple daily routines (morning, night, leaving work, arriving home)
- Tracks mixed data: binary tasks, numeric values (weight), subjective scales (1-5), and brief notes

---

## Core User Flows

### Flow 1: Create a Routine

1. User taps "New Routine"
2. Names the routine (e.g., "Morning Routine")
3. Adds items one by one, selecting type for each:
   - **Checkbox** - Binary yes/no (e.g., "Brush teeth")
   - **Number** - Numeric entry with optional unit (e.g., "Weight" in lbs)
   - **Scale 1-5** - Rating with optional notes line (e.g., "Energy level")
   - **Text** - Freeform short answer (e.g., "Daily highlight")
4. Reorders items via drag-and-drop
5. Saves routine

### Flow 2: Print Routine Cards

1. User selects routine to print
2. App suggests layout based on item count:
   - 1-8 items → Quarter-letter (4.25 x 5.5"), 4 per page
   - 9-15 items → Half-letter (5.5 x 8.5"), 2 per page
   - 16+ items → Full letter (8.5 x 11"), 1 per page
3. User can override suggested layout
4. User selects quantity (default: 30)
5. App generates PDF:
   - Cards arranged on 8.5x11 pages with cut guides
   - Each card has: routine name, date field, all items with appropriate input areas
   - Includes subtle markers for OCR alignment
   - Version number printed for mapping
6. User downloads PDF or taps "Print at CVS" / "Print at Walgreens" (opens their upload pages)
7. User confirms quantity printed
8. App increments paper inventory for that routine

### Flow 3: Complete Routine (Analog)

*Happens outside the app - user physically:*
1. Grabs a printed card
2. Writes today's date (optional - can confirm in app later)
3. Checks boxes, writes numbers, writes scale values (1-5), adds notes
4. Sets card aside for later upload

### Flow 4: Upload Completed Card

1. User taps "Upload" on routine
2. User chooses: **Take Photo** (opens camera) or **Choose from Library** (opens photo picker)
3. App sends image to OCR service
4. App shows confirmation screen:
   - Date field (pre-filled if detected, otherwise blank for user to enter)
   - All detected values with confidence indicators
   - Low-confidence fields highlighted for review
   - User can correct any field
5. User confirms
6. Data saved to that routine's history
7. App decrements paper inventory count
8. Photo stored temporarily (auto-deleted after 30 days)

### Flow 5: Complete Routine (Digital Fallback)

1. User taps routine
2. App shows card-like interface matching printed layout
3. User taps checkboxes, enters numbers, enters scale values, types notes
4. User taps "Complete"
5. Data saved (counts same as analog for streaks)

### Flow 6: View Progress

1. User taps routine to view history
2. Sees:
   - Current streak (consecutive days completed)
   - Completion rate (% of items completed per day, averaged)
   - Calendar view showing completed days (green if ≥80%, yellow if <80%, red/empty if missed)
   - Historical entries list (tap to view/edit)

### Flow 7: Edit Historical Entry

1. From history view, user taps a past entry
2. App shows the values recorded for that day
3. User can modify any value
4. User saves changes
5. Edit logged for audit trail

### Flow 8: Paper Inventory Alert

1. User uploads a card, inventory decrements
2. If `estimatedRemaining` ≤ threshold (default: 5):
   - App creates Todoist task in Inbox:
     - Content: `Print more "Morning Routine" cards`
     - Description: `You have ~3 cards left.`
     - Includes deep link: `https://[app-url]/routines/[id]/print`
   - App marks alert sent (won't re-alert until inventory increases)

---

## Data Model

### Routine
```
id: uuid (primary key)
name: string
items: Item[] (JSON)
version: integer (default 1)
created_at: timestamp
modified_at: timestamp
```

### Item (embedded in Routine.items JSON)
```
id: string (uuid)
name: string
type: "checkbox" | "number" | "scale" | "text"
unit: string | null (for number type, e.g., "lbs")
has_notes: boolean (for scale type)
order: integer
```

### RoutineVersion
```
id: uuid (primary key)
routine_id: uuid (foreign key → Routine)
version: integer
items_snapshot: Item[] (JSON, frozen copy)
created_at: timestamp
```

### CompletedRoutine
```
id: uuid (primary key)
routine_id: uuid (foreign key → Routine)
routine_version: integer
date: date
completed_at: timestamp
source: "analog" | "digital"
values: ItemValue[] (JSON)
photo_url: string | null (for analog uploads)
photo_expires_at: timestamp | null
```

### ItemValue (embedded in CompletedRoutine.values JSON)
```
item_id: string
value: boolean | number | string | null
notes: string | null (for scale type)
```

### PaperInventory
```
id: uuid (primary key)
routine_id: uuid (foreign key → Routine, unique)
printed_count: integer (default 0)
uploaded_count: integer (default 0)
alert_threshold: integer (default 5)
last_alert_sent_at: timestamp | null
last_printed_at: timestamp | null
```

### EditHistory (for audit trail)
```
id: uuid (primary key)
completed_routine_id: uuid (foreign key → CompletedRoutine)
previous_values: ItemValue[] (JSON)
edited_at: timestamp
```

---

## Printed Card Layouts

### Quarter-Letter (4.25" x 5.5") - For 1-8 items

```
┌─────────────────────────────────────────┐
│  ◉ MORNING ROUTINE          ___/___/___ │
│─────────────────────────────────────────│
│  ☐ Brush teeth                          │
│  ☐ Shower                               │
│  ☐ Cold plunge                          │
│  ☐ Take supplements                     │
│                                         │
│  Weight: [____] lbs                     │
│                                         │
│  Energy level (1-5): [__]               │
│  Notes: _____________________________   │
│                                         │
│  ◉                               v1 ◉ ◉ │
└─────────────────────────────────────────┘
```

### Half-Letter (5.5" x 8.5") - For 9-15 items

```
┌───────────────────────────────────────────────────────────────┐
│  ◉ MORNING ROUTINE                              ___/___/___   │
│───────────────────────────────────────────────────────────────│
│  ☐ Walk to bathroom              ☐ Shower                     │
│  ☐ Mouthwash                     ☐ Dry off                    │
│  ☐ Floss + water floss           ☐ Pushups + squats           │
│  ☐ Brush teeth                   ☐ Shave                      │
│  ☐ Tongue scraper                ☐ Skincare                   │
│  ☐ Put in contacts               ☐ Deodorant                  │
│  ☐ Use bathroom                                               │
│                                                               │
│  Weight: [____] lbs                                           │
│                                                               │
│  Energy level (1-5): [__]                                     │
│  Notes: ________________________________________________      │
│                                                               │
│  Daily highlight:                                             │
│  ___________________________________________________________  │
│  ___________________________________________________________  │
│                                                               │
│  ◉                                                     v1 ◉ ◉ │
└───────────────────────────────────────────────────────────────┘
```

### Full Letter (8.5" x 11") - For 16+ items

Similar structure, single card per page with more vertical space.

**Design principles:**
- Corner markers (◉) for OCR alignment/skew correction
- Version number printed small in corner
- Checkbox squares large enough for clear pen marks (~0.25")
- Number boxes sized for 3-4 digits
- Scale boxes sized for single digit (user writes 1-5)
- Notes lines ~2 lines worth of space
- Date format flexible (MM/DD/YY or written out)
- Cut guides on multi-card pages (light gray dashed lines)

---

## Versioning Logic

When a routine is modified (item added, removed, reordered, or type changed):

1. App increments `routine.version`
2. App creates new `RoutineVersion` record with snapshot of previous items
3. New prints use new version number
4. Old printed cards still work:
   - OCR detects version from printed marker
   - App loads `RoutineVersion` for that version
   - Maps values to that version's item IDs
   - Items that didn't exist in that version are not tracked for that entry
   - No prompting for "new" items - just accept what's on the card

**Streak calculation**: Uses items that existed at the version of each card. A day counts as "completed" if the card was submitted with at least one item marked.

---

## Technical Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│                    Next.js on Vercel                            │
│                                                                 │
│  Pages:                                                         │
│  ──────                                                         │
│  /                     → Routine list (home)                    │
│  /routines/new         → Create routine                         │
│  /routines/[id]        → View/complete routine                  │
│  /routines/[id]/edit   → Edit routine                           │
│  /routines/[id]/print  → Print settings + PDF preview           │
│  /routines/[id]/upload → Photo upload + OCR confirmation        │
│  /routines/[id]/history → Progress view + calendar              │
└────────┬────────────────────────────────────────────────────────┘
         │
         │ API calls (fetch)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
│              Node.js on Azure App Service                       │
│                                                                 │
│  API Endpoints:                                                 │
│  ──────────────                                                 │
│  POST   /routines                    Create routine             │
│  GET    /routines                    List routines              │
│  GET    /routines/:id                Get routine                │
│  PUT    /routines/:id                Update routine (triggers   │
│                                      versioning)                │
│  DELETE /routines/:id                Delete routine             │
│                                                                 │
│  POST   /routines/:id/complete       Digital completion         │
│  POST   /routines/:id/upload         Upload photo → OCR →       │
│                                      return extracted JSON      │
│  POST   /routines/:id/confirm        Save confirmed OCR data    │
│                                                                 │
│  GET    /routines/:id/history        Get completion history     │
│  GET    /routines/:id/history/:date  Get specific entry         │
│  PUT    /routines/:id/history/:date  Edit historical entry      │
│                                                                 │
│  GET    /routines/:id/print          Generate PDF, return URL   │
│         ?layout=quarter|half|full                               │
│         &quantity=30                                            │
│  POST   /routines/:id/print/confirm  Confirm print (update      │
│         ?quantity=30                 inventory)                 │
│                                                                 │
│  GET    /routines/:id/inventory      Get paper inventory        │
│  PUT    /routines/:id/inventory      Manually adjust inventory  │
│                                                                 │
│  Services:                                                      │
│  ─────────                                                      │
│  OCRService        → Azure OpenAI (GPT-4o with vision)          │
│  PDFService        → Custom script (Claude Code PDF skill)      │
│  TodoistService    → Todoist API (low inventory alerts)         │
│  StorageService    → Azure Blob Storage (photos, PDFs)          │
│  CleanupJob        → Scheduled: delete photos older than 30d    │
└────────┬──────────────────┬──────────────────┬──────────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Azure PostgreSQL│ │ Azure Blob      │ │ Azure OpenAI    │
│                 │ │ Storage         │ │ (GPT-4o)        │
│ - routines      │ │                 │ │                 │
│ - versions      │ │ - /photos/      │ │ OCR endpoint    │
│ - completions   │ │ - /pdfs/        │ │                 │
│ - inventory     │ │                 │ │                 │
│ - edit_history  │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### OCR Integration

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ User uploads    │     │ Backend sends   │     │ GPT-4o returns  │
│ photo of card   │ ──▶ │ to Azure OpenAI │ ──▶ │ structured JSON │
│                 │     │ with prompt     │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │ Response:       │
                                               │ {               │
                                               │   "date":       │
                                               │   "values":     │
                                               │   "confidence": │
                                               │ }               │
                                               └─────────────────┘
```

**OCR Prompt Template:**

```
You are extracting data from a photo of a handwritten routine tracking card.

Routine: "{routine_name}"
Version: {version}

Fields to extract:
{for each item in routine_version.items}
- {item.name} ({item.type}{if item.unit}, unit: {item.unit}{/if}{if item.has_notes}, has notes line{/if})
{/for}

Also extract:
- Date written on the card (format: YYYY-MM-DD, or null if not written/unreadable)

Return a JSON object with this exact structure:
{
  "date": "YYYY-MM-DD" or null,
  "values": {
    "{item_id}": {
      "value": <boolean for checkbox, number for number/scale, string for text, or null if blank/unreadable>,
      "notes": <string or null, only for scale type with has_notes=true>
    },
    ...
  },
  "low_confidence_fields": ["item_id1", "item_id2", ...]  // fields you're uncertain about
}

Rules:
- Empty checkbox = false
- Checked/marked checkbox = true
- Empty number/scale box = null (not 0)
- If you can't read something clearly, set value to null and add to low_confidence_fields
- Scale values should be integers 1-5 only
```

### PDF Generation Flow

1. Frontend calls `GET /routines/:id/print?layout=quarter&quantity=30`
2. Backend:
   - Loads routine definition
   - Calls PDF generation script (uses Claude Code PDF skill patterns)
   - Script generates:
     - Appropriate layout based on `layout` param
     - `quantity` cards arranged on 8.5x11 pages
     - Cut guides between cards
     - OCR alignment markers on each card
   - Uploads PDF to Azure Blob Storage with 24-hour expiry
   - Returns signed URL
3. Frontend shows:
   - PDF preview (embedded viewer)
   - "Download PDF" button
   - "Print at CVS" button (opens `https://www.cvs.com/photo/print-photos` in new tab)
   - "Print at Walgreens" button (opens `https://photo.walgreens.com/` in new tab)
   - "I printed them" button → calls `/print/confirm` with quantity

### Todoist Integration

```javascript
// When inventory check triggers alert
async function checkInventoryAlert(routineId) {
  const inventory = await getInventory(routineId);
  const routine = await getRoutine(routineId);

  const remaining = inventory.printed_count - inventory.uploaded_count;

  if (remaining <= inventory.alert_threshold && !recentlyAlerted(inventory)) {
    await todoistClient.addTask({
      content: `Print more "${routine.name}" routine cards`,
      description: `You have ~${remaining} cards left.\n\nPrint more: ${APP_URL}/routines/${routineId}/print`,
      project_id: null, // null = Inbox
      priority: 2
    });

    await updateInventory(routineId, {
      last_alert_sent_at: new Date()
    });
  }
}

function recentlyAlerted(inventory) {
  if (!inventory.last_alert_sent_at) return false;
  const hoursSinceAlert = (Date.now() - inventory.last_alert_sent_at) / (1000 * 60 * 60);
  return hoursSinceAlert < 24; // Don't re-alert within 24 hours
}
```

### Photo Cleanup Job

Azure Function on timer trigger (runs daily):

```javascript
// Runs daily at 3 AM
async function cleanupExpiredPhotos() {
  const expiredPhotos = await db.query(`
    SELECT id, photo_url
    FROM completed_routines
    WHERE photo_expires_at < NOW()
    AND photo_url IS NOT NULL
  `);

  for (const record of expiredPhotos) {
    await blobStorage.delete(record.photo_url);
    await db.update('completed_routines', record.id, {
      photo_url: null,
      photo_expires_at: null
    });
  }
}
```

---

## MVP Scope

### In Scope

- [ ] Create/edit/delete routines with 4 item types (checkbox, number, scale 1-5, text)
- [ ] Routine versioning (snapshot on edit, map old cards by version)
- [ ] Print PDF with layout options (quarter/half/full letter based on item count)
- [ ] Cut guides on multi-card pages
- [ ] Digital routine completion (card-like interface)
- [ ] Photo upload via camera or photo library
- [ ] OCR via Azure OpenAI GPT-4o
- [ ] Confirmation/correction screen with confidence indicators
- [ ] Date confirmation (always shown, pre-filled if detected)
- [ ] Paper inventory tracking (printed count, uploaded count, estimated remaining)
- [ ] Low inventory alert → Todoist task with deep link
- [ ] Streak display (consecutive days)
- [ ] Completion rate per day (% of items)
- [ ] Calendar view (green ≥80%, yellow <80%, empty = missed)
- [ ] Historical entry viewing and editing
- [ ] Photo storage with 30-day auto-deletion
- [ ] PWA installable on mobile

### Out of Scope (Future)

- [ ] Authentication/multi-user
- [ ] Direct CVS/Walgreens print API integration (auto-upload PDF)
- [ ] Advanced analytics (charts, trends over numeric data over time)
- [ ] Export to spreadsheet
- [ ] Weighted item importance for completion calculation
- [ ] Push notifications (using Todoist for now)
- [ ] Offline mode with sync
- [ ] Barcode/QR on cards for faster scanning

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| First print within 1 week | >90% of created routines | Time between routine creation and first print confirmation |
| 14-day streak achieved | Within first month of use | Streak data |
| OCR accuracy | <2 corrections per card average | Count of fields modified on confirmation screen |
| Analog vs digital completion | >80% analog | Source field on completed_routines |
| Inventory alerts useful | Reprint before running out | Cards remaining when reprint happens |

---

## Implementation Phases

### Phase 1: Core CRUD + Digital Completion (Week 1-2)
- [ ] Database schema setup (Azure PostgreSQL)
- [ ] Backend API: routines CRUD, versioning
- [ ] Backend API: digital completion
- [ ] Frontend: routine list, create/edit routine
- [ ] Frontend: digital completion flow (card-like UI)
- [ ] Frontend: basic history view

### Phase 2: PDF Generation + Printing (Week 2-3)
- [ ] PDF generation service (Claude Code PDF skill)
- [ ] Layout options (quarter/half/full)
- [ ] Print screen UI with preview
- [ ] CVS/Walgreens links
- [ ] Paper inventory tracking

### Phase 3: Photo Upload + OCR (Week 3-4)
- [ ] Azure Blob Storage setup for photos
- [ ] Photo upload endpoint (camera + library)
- [ ] Azure OpenAI integration for OCR
- [ ] Confirmation/correction screen
- [ ] Photo cleanup job (30-day TTL)

### Phase 4: Progress Tracking + Todoist (Week 4-5)
- [ ] Streak calculation logic
- [ ] Completion rate calculation
- [ ] Calendar view
- [ ] Historical entry editing
- [ ] Todoist integration for inventory alerts
- [ ] PWA manifest + service worker

### Phase 5: Polish + Testing (Week 5-6)
- [ ] Test OCR accuracy with real handwritten cards
- [ ] Test printing at CVS/Walgreens
- [ ] Mobile responsiveness polish
- [ ] Error handling and edge cases
- [ ] Performance optimization

---

## Open Items Resolved

| Question | Decision |
|----------|----------|
| Print service integration | MVP: links to CVS/Walgreens. Future: auto-upload via Claude for Chrome |
| Multiple routines same day | Truly independent, separate cards |
| Historical data editing | Yes, with edit history audit trail |
| Routine templates | Blank slate for MVP |
| Collaboration | Out of scope (single user) |
| Auth | Defer to later (single user for now) |
| Photo retention | 30 days, then auto-delete |

---

## Appendix: Azure Resources Needed

| Resource | SKU/Tier | Purpose | Est. Monthly Cost |
|----------|----------|---------|-------------------|
| Azure Static Web Apps | Free | Frontend hosting | $0 |
| Azure App Service | B1 | Backend API | ~$13 |
| Azure PostgreSQL | Burstable B1ms | Database | ~$15 |
| Azure Blob Storage | Hot tier | Photos, PDFs | ~$1-2 |
| Azure OpenAI | GPT-4o | OCR | ~$5-10 (depends on usage) |
| Azure Functions | Consumption | Cleanup job | <$1 |

**Estimated total: ~$35-40/month**
