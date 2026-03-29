#!/usr/bin/env python3
"""
Generate printable routine tracking cards as PDF — B2 "Boxed Groups" two-column layout.

Usage:
    python generate-card-pdf.py --input <json> --output <pdf>

Input: JSON file with routine definition including name, items, version
Output: PDF file (one full-page card per routine)

Design: Two balanced columns with group items rendered in light gray rounded boxes.
Bold left-aligned title with thick underline. Rounded square checkboxes.
Corner dot alignment markers for OCR.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import black, Color
from reportlab.pdfgen import canvas
import json
import sys
import argparse
from io import BytesIO

# Constants
PAGE_WIDTH, PAGE_HEIGHT = letter  # 612 x 792 points
MARGIN = 0.4 * inch
MARKER_RADIUS = 2.5  # corner dot radius

# Colors
DARK = Color(0.1, 0.1, 0.1)
LIGHT = Color(0.65, 0.65, 0.65)
BG = Color(0.93, 0.93, 0.93)
BORDER = Color(0.8, 0.8, 0.8)

# Row heights
ROW_CHECKBOX = 16
ROW_GROUP_HEADER = 18
ROW_GROUP_CHILD = 14
ROW_GROUP_PAD = 8  # top + bottom padding in group box
ROW_NUMBER = 26
ROW_SCALE = 38
ROW_SCALE_NOTES = 16
ROW_TEXT = 54
ROW_GROUP_GAP = 4  # gap after group box


def build_struct(items):
    """Convert items list to structured column-splittable list."""
    struct = []
    for item in sorted(items, key=lambda x: x.get('order', 0)):
        item_type = item.get('type', 'checkbox')
        if item_type == 'group':
            children = sorted(item.get('children', []), key=lambda x: x.get('order', 0))
            n = len(children)
            h = ROW_GROUP_HEADER + n * ROW_GROUP_CHILD + ROW_GROUP_PAD + ROW_GROUP_GAP
            struct.append(('group', item['name'], children, h))
        elif item_type == 'number':
            struct.append(('number', item['name'], item.get('unit'), ROW_NUMBER))
        elif item_type == 'scale':
            h = ROW_SCALE
            if item.get('hasNotes'):
                h += ROW_SCALE_NOTES
            struct.append(('scale', item['name'], item.get('hasNotes', False), h))
        elif item_type == 'text':
            struct.append(('text', item['name'], None, ROW_TEXT))
        else:
            struct.append(('checkbox', item['name'], None, ROW_CHECKBOX))
    return struct


def balance_columns(struct):
    """Split structured items into two balanced columns."""
    total_h = sum(s[-1] for s in struct)
    half = total_h / 2
    col1, col2 = [], []
    running = 0
    for s in struct:
        h = s[-1]
        if running + h / 2 <= half:
            col1.append(s)
            running += h
        else:
            col2.append(s)
    return col1, col2


def draw_checkbox(c, x, y, label, indent=0, size=8):
    """Draw a rounded square checkbox with label."""
    c.setStrokeColor(DARK)
    c.setLineWidth(0.7)
    c.roundRect(x + indent, y - 1, size, size, 1.5, fill=0, stroke=1)
    c.setFont("Helvetica", 9)
    c.setFillColor(DARK)
    c.drawString(x + indent + size + 5, y, label)


def draw_column(c, items, x, start_y, col_width):
    """Render a list of structured items in a single column."""
    y = start_y
    for s in items:
        kind = s[0]

        if kind == 'group':
            name, children, h = s[1], s[2], s[-1]
            box_h = h - ROW_GROUP_GAP
            gy = y - box_h + 8
            # Rounded gray box
            c.setFillColor(BG)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.6)
            c.roundRect(x - 2, gy, col_width, box_h, 4, fill=1, stroke=1)
            # Group header
            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(DARK)
            c.drawString(x + 6, y - 4, name)
            # Children
            cy = y - 20
            for ch in children:
                child_type = ch.get('type', 'checkbox')
                if child_type == 'number':
                    c.setFont("Helvetica", 8.5)
                    c.setFillColor(DARK)
                    c.drawString(x + 10, cy, ch['name'])
                    c.setStrokeColor(DARK)
                    c.setLineWidth(0.5)
                    c.roundRect(x + 10, cy - 13, 44, 10, 2, fill=0, stroke=1)
                    unit = ch.get('unit')
                    if unit:
                        c.setFont("Helvetica", 7)
                        c.setFillColor(LIGHT)
                        c.drawString(x + 58, cy - 12, unit)
                        c.setFillColor(DARK)
                    cy -= ROW_GROUP_CHILD
                else:
                    draw_checkbox(c, x, cy, ch['name'], indent=10, size=7)
                    cy -= ROW_GROUP_CHILD
            y -= h

        elif kind == 'number':
            name, unit = s[1], s[2]
            c.setFont("Helvetica", 9)
            c.setFillColor(DARK)
            c.drawString(x, y, name)
            c.setStrokeColor(DARK)
            c.setLineWidth(0.6)
            c.roundRect(x, y - 14, 48, 11, 2, fill=0, stroke=1)
            if unit:
                c.setFont("Helvetica", 7)
                c.setFillColor(LIGHT)
                c.drawString(x + 52, y - 13, unit)
                c.setFillColor(DARK)
            y -= ROW_NUMBER

        elif kind == 'scale':
            name, has_notes = s[1], s[2]
            c.setFont("Helvetica", 9)
            c.setFillColor(DARK)
            c.drawString(x, y, name)
            box_size = 16
            scale_y = y - 20
            c.setStrokeColor(DARK)
            c.setLineWidth(0.6)
            c.setFont("Helvetica", 7)
            for i in range(5):
                bx = x + (i * (box_size + 4))
                c.rect(bx, scale_y, box_size, box_size, fill=0, stroke=1)
                c.setFillColor(LIGHT)
                c.drawCentredString(bx + box_size / 2, scale_y + box_size + 2, str(i + 1))
                c.setFillColor(DARK)
            extra = 0
            if has_notes:
                c.setFont("Helvetica", 7)
                c.setFillColor(LIGHT)
                c.drawString(x, scale_y - 12, "Notes:")
                c.setStrokeColor(LIGHT)
                c.setLineWidth(0.4)
                c.line(x + 30, scale_y - 14, x + col_width - 8, scale_y - 14)
                c.setStrokeColor(DARK)
                c.setFillColor(DARK)
                extra = ROW_SCALE_NOTES
            y -= ROW_SCALE + extra

        elif kind == 'text':
            name = s[1]
            c.setFont("Helvetica", 9)
            c.setFillColor(DARK)
            c.drawString(x, y, name)
            c.setStrokeColor(LIGHT)
            c.setLineWidth(0.4)
            c.line(x, y - 14, x + col_width - 8, y - 14)
            c.line(x, y - 30, x + col_width - 8, y - 30)
            c.setStrokeColor(DARK)
            y -= ROW_TEXT

        else:  # checkbox
            draw_checkbox(c, x, y, s[1])
            y -= ROW_CHECKBOX


def generate_pdf(routine, output_path=None):
    """Generate a B2 two-column PDF for the given routine."""
    items = routine.get('items', [])
    version = routine.get('version', 1)
    name = routine.get('name', 'Routine')

    struct = build_struct(items)
    col1, col2 = balance_columns(struct)

    if output_path:
        c = canvas.Canvas(output_path, pagesize=letter)
    else:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)

    W, H = PAGE_WIDTH, PAGE_HEIGHT

    # --- Corner dot alignment markers ---
    c.setFillColor(DARK)
    for cx, cy in [(MARGIN, H - MARGIN), (W - MARGIN, H - MARGIN),
                   (MARGIN, MARGIN), (W - MARGIN, MARGIN)]:
        c.circle(cx, cy, MARKER_RADIUS, fill=1, stroke=0)

    # --- Header ---
    y = H - MARGIN - 22
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(DARK)
    c.drawString(MARGIN + 6, y, name)
    c.setFont("Helvetica", 9)
    c.setFillColor(LIGHT)
    c.drawRightString(W - MARGIN - 6, y + 2, "Date: ___ / ___ / ___")
    y -= 8
    c.setStrokeColor(DARK)
    c.setLineWidth(2)
    c.line(MARGIN + 4, y, W - MARGIN - 4, y)

    # --- Columns ---
    col_gap = 18
    col_w = (W - 2 * MARGIN - col_gap) / 2
    c1x = MARGIN + 6
    c2x = MARGIN + 6 + col_w + col_gap
    start_y = y - 14

    draw_column(c, col1, c1x, start_y, col_w)
    draw_column(c, col2, c2x, start_y, col_w)

    # --- Version ---
    c.setFont("Helvetica", 6)
    c.setFillColor(LIGHT)
    c.drawRightString(W - MARGIN - 4, MARGIN + 2, f"v{version}")

    c.save()

    if not output_path:
        buffer.seek(0)
        return buffer.getvalue()

    return {
        'layout': 'full',
        'cards_per_page': 1,
        'pages_generated': 1,
        'cards_generated': 1
    }


def main():
    parser = argparse.ArgumentParser(description='Generate routine card PDF (B2 two-column layout)')
    parser.add_argument('--input', '-i', required=True, help='JSON input file or "-" for stdin')
    parser.add_argument('--output', '-o', required=True, help='Output PDF file path')
    parser.add_argument('--layout', '-l', choices=['quarter', 'half', 'full', 'auto'],
                        default='full', help='Card layout (ignored — always full-page two-column)')

    args = parser.parse_args()

    if args.input == '-':
        data = json.load(sys.stdin)
    else:
        with open(args.input, 'r') as f:
            data = json.load(f)

    routine = {
        'name': data['name'],
        'items': data['items'],
        'version': data.get('version', 1)
    }

    result = generate_pdf(routine, args.output)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
