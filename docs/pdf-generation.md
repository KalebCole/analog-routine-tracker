# PDF Generation for Routine Tracking Cards

## Summary

Implement a PDF generation service using **reportlab** (Python) to create printable routine tracking cards with OCR-optimized layouts, alignment markers, and cut guides.

## Recommended Approach: Python + reportlab

### Why reportlab?
- **Precise positioning** - Exact control over element placement (critical for OCR markers)
- **Programmatic layouts** - Easy to calculate card positions for multi-card pages
- **No external dependencies** - Pure Python, runs on Azure App Service
- **Vector graphics** - Clean lines for cut guides and alignment markers

### Alternative Considered
- **Puppeteer/HTML-to-PDF** - Easier styling but less precise positioning, heavier runtime
- **pdf-lib (JS)** - Good but lower-level API, more code for complex layouts

## Architecture

```
apps/api/src/services/pdf.service.ts
    │
    ├── Calls Python script via child_process
    │
    └── scripts/generate-card-pdf.py (reportlab)
            │
            ├── CardLayout class (positioning logic)
            ├── CardRenderer class (drawing logic)
            └── Outputs PDF to stdout or temp file
```

## Implementation Details

### 1. Layout Calculations

```
Page size: 8.5" x 11" (612 x 792 points at 72 DPI)

Quarter-letter (4 per page):
┌─────────┬─────────┐
│  Card   │  Card   │  Each: 306 x 396 pts (4.25" x 5.5")
│    1    │    2    │
├─────────┼─────────┤
│  Card   │  Card   │
│    3    │    4    │
└─────────┴─────────┘

Half-letter (2 per page):
┌─────────────────────┐
│       Card 1        │  Each: 612 x 396 pts (8.5" x 5.5")
├─────────────────────┤
│       Card 2        │
└─────────────────────┘

Full letter (1 per page):
┌─────────────────────┐
│                     │  Each: 612 x 792 pts (8.5" x 11")
│       Card 1        │
│                     │
└─────────────────────┘
```

### 2. Card Components

Each card contains (from top to bottom):

```
◉ ROUTINE NAME                    ___/___/___
─────────────────────────────────────────────
☐ Checkbox item 1
☐ Checkbox item 2

Number label: [________] unit

Scale label (1-5): [___]
Notes: _________________________________

Text label:
________________________________________
________________________________________

◉                                    v1 ◉ ◉
```

**Element sizes:**
| Element | Size | Notes |
|---------|------|-------|
| Alignment marker (◉) | 8pt diameter | Filled circle, corners |
| Checkbox (☐) | 18pt square | ~0.25", clear for pen marks |
| Number box | 72pt wide × 24pt tall | Fits 3-4 digits |
| Scale box | 24pt × 24pt | Single digit 1-5 |
| Text lines | Full width, 18pt spacing | 2-3 lines |
| Version text | 8pt font | Bottom right corner |

### 3. Python Script Structure

**File:** `apps/api/scripts/generate-card-pdf.py`

```python
#!/usr/bin/env python3
"""
Generate printable routine tracking cards as PDF.

Usage:
    python generate-card-pdf.py --routine <json> --layout <quarter|half|full> --quantity <n>

Input (--routine): JSON object with routine definition
Output: PDF bytes to stdout (or file path if --output specified)
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
import json
import sys
import argparse

# Constants
PAGE_WIDTH, PAGE_HEIGHT = letter  # 612 x 792 points
MARGIN = 0.25 * inch
MARKER_RADIUS = 4  # points

LAYOUTS = {
    'quarter': {'cols': 2, 'rows': 2, 'width': 4.25*inch, 'height': 5.5*inch},
    'half':    {'cols': 1, 'rows': 2, 'width': 8.5*inch,  'height': 5.5*inch},
    'full':    {'cols': 1, 'rows': 1, 'width': 8.5*inch,  'height': 11*inch},
}

class CardRenderer:
    """Renders a single routine card at a given position."""

    def __init__(self, canvas, x, y, width, height, routine, version):
        self.c = canvas
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.routine = routine
        self.version = version

    def draw(self):
        self._draw_alignment_markers()
        self._draw_header()
        self._draw_items()
        self._draw_version()

    def _draw_alignment_markers(self):
        """Draw corner dots for OCR alignment."""
        # Top-left, top-right, bottom-left, bottom-right
        positions = [
            (self.x + MARGIN, self.y + self.height - MARGIN),
            (self.x + self.width - MARGIN, self.y + self.height - MARGIN),
            (self.x + MARGIN, self.y + MARGIN),
            (self.x + self.width - MARGIN, self.y + MARGIN),
        ]
        for px, py in positions:
            self.c.circle(px, py, MARKER_RADIUS, fill=1)

    def _draw_header(self):
        """Draw routine name and date field."""
        # ... implementation

    def _draw_items(self):
        """Draw each item based on type."""
        # ... implementation for checkbox, number, scale, text

    def _draw_version(self):
        """Draw version number in bottom-right."""
        # ... implementation

def generate_pdf(routine, layout, quantity, output=None):
    """Generate PDF with specified number of cards."""
    layout_config = LAYOUTS[layout]
    cards_per_page = layout_config['cols'] * layout_config['rows']
    total_pages = (quantity + cards_per_page - 1) // cards_per_page

    # Create PDF
    if output:
        c = canvas.Canvas(output, pagesize=letter)
    else:
        import io
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)

    card_index = 0
    for page in range(total_pages):
        if page > 0:
            c.showPage()

        # Draw cut guides
        draw_cut_guides(c, layout_config)

        # Draw cards
        for row in range(layout_config['rows']):
            for col in range(layout_config['cols']):
                if card_index >= quantity:
                    break

                x = col * layout_config['width']
                y = PAGE_HEIGHT - (row + 1) * layout_config['height']

                renderer = CardRenderer(
                    c, x, y,
                    layout_config['width'],
                    layout_config['height'],
                    routine,
                    routine['version']
                )
                renderer.draw()
                card_index += 1

    c.save()

    if not output:
        return buffer.getvalue()

def draw_cut_guides(canvas, layout_config):
    """Draw dashed cut lines between cards."""
    canvas.setStrokeColorRGB(0.7, 0.7, 0.7)  # Light gray
    canvas.setDash(6, 3)  # Dashed line

    # Vertical guides
    for col in range(1, layout_config['cols']):
        x = col * layout_config['width']
        canvas.line(x, 0, x, PAGE_HEIGHT)

    # Horizontal guides
    for row in range(1, layout_config['rows']):
        y = PAGE_HEIGHT - row * layout_config['height']
        canvas.line(0, y, PAGE_WIDTH, y)

    canvas.setDash()  # Reset to solid
```

### 4. TypeScript Service Wrapper

**File:** `apps/api/src/services/pdf.service.ts`

```typescript
import { spawn } from 'child_process';
import path from 'path';
import { Routine } from '@analog-routine-tracker/shared';
import { storageService } from './storage.service';

type Layout = 'quarter' | 'half' | 'full';

interface GeneratePdfOptions {
  routine: Routine;
  layout: Layout;
  quantity: number;
}

export function suggestLayout(itemCount: number): Layout {
  if (itemCount <= 8) return 'quarter';
  if (itemCount <= 15) return 'half';
  return 'full';
}

export async function generateRoutinePdf(
  options: GeneratePdfOptions
): Promise<string> {
  const { routine, layout, quantity } = options;

  // Call Python script
  const scriptPath = path.join(__dirname, '../../scripts/generate-card-pdf.py');
  const pdfBuffer = await runPythonScript(scriptPath, {
    routine: JSON.stringify(routine),
    layout,
    quantity: quantity.toString(),
  });

  // Upload to Azure Blob Storage with 24h expiry
  const blobName = `pdfs/${routine.id}/${Date.now()}.pdf`;
  const url = await storageService.uploadWithExpiry(
    blobName,
    pdfBuffer,
    'application/pdf',
    24 * 60 * 60 // 24 hours
  );

  return url;
}

function runPythonScript(
  scriptPath: string,
  args: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const argList = Object.entries(args).flatMap(([k, v]) => [`--${k}`, v]);
    const proc = spawn('python3', [scriptPath, ...argList]);

    const chunks: Buffer[] = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (data) => console.error(data.toString()));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
  });
}
```

### 5. API Route

**File:** `apps/api/src/routes/print.ts`

```typescript
import { Router } from 'express';
import { generateRoutinePdf, suggestLayout } from '../services/pdf.service';
import { getRoutine, updateInventory } from '../db/client';

const router = Router();

// GET /routines/:id/print?layout=quarter&quantity=30
router.get('/:id/print', async (req, res) => {
  const { id } = req.params;
  const layout = req.query.layout as string || 'auto';
  const quantity = parseInt(req.query.quantity as string) || 30;

  const routine = await getRoutine(id);
  if (!routine) {
    return res.status(404).json({ error: 'Routine not found' });
  }

  const finalLayout = layout === 'auto'
    ? suggestLayout(routine.items.length)
    : layout;

  const pdfUrl = await generateRoutinePdf({
    routine,
    layout: finalLayout as any,
    quantity,
  });

  res.json({
    url: pdfUrl,
    layout: finalLayout,
    quantity,
    expiresIn: '24 hours'
  });
});

// POST /routines/:id/print/confirm?quantity=30
router.post('/:id/print/confirm', async (req, res) => {
  const { id } = req.params;
  const quantity = parseInt(req.query.quantity as string) || 30;

  await updateInventory(id, {
    printed_count: { increment: quantity },
    last_printed_at: new Date(),
  });

  res.json({ success: true });
});

export default router;
```

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/scripts/generate-card-pdf.py` | Create | Python script for PDF generation |
| `apps/api/src/services/pdf.service.ts` | Create | TypeScript wrapper service |
| `apps/api/src/routes/print.ts` | Create | API routes for print endpoints |
| `apps/api/requirements.txt` | Create | Python dependencies (reportlab) |

## Dependencies

**Python (apps/api/requirements.txt):**
```
reportlab>=4.0.0
```

**Install on Azure App Service:**
- Add Python to App Service configuration
- Or use Azure Functions for PDF generation (isolated)

## Verification

1. **Unit test** - Generate a test PDF with sample routine data
2. **Visual check** - Open PDF, verify:
   - Alignment markers in corners
   - Cut guides between cards
   - All item types render correctly
   - Version number visible
3. **Print test** - Print at actual size, verify:
   - Cards are correct dimensions
   - Checkboxes are ~0.25" (writable)
   - Cut guides align for easy cutting
4. **OCR test** - Fill out printed card, photograph, verify OCR can read it

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js + Python script | Simpler deployment, single App Service |
| Font | Helvetica | Clean sans-serif, universally available in PDFs |
