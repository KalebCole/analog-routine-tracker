#!/usr/bin/env python3
"""
Generate printable routine tracking cards as PDF.

Usage:
    python generate-card-pdf.py --input <json> --output <pdf>

Input: JSON file with routine definition including name, items, version
Output: PDF file (one full-page card per routine)
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
MARGIN = 0.25 * inch
MARKER_RADIUS = 4  # points (8pt diameter)

# Colors
GRAY = Color(0.7, 0.7, 0.7)


def count_total_items(items):
    """Count total items including children of groups."""
    total = 0
    for item in items:
        if item.get('type') == 'group':
            total += 1 + len(item.get('children', []))
        else:
            total += 1
    return total


def estimate_item_height(item, scale=1.0):
    """Estimate height needed for a single item at given scale."""
    s = scale
    item_type = item.get('type', 'checkbox')
    if item_type == 'group':
        # Group header
        h = 20 * s
        for child in item.get('children', []):
            h += estimate_item_height(child, scale)
        return h
    elif item_type == 'checkbox':
        return (18 * s + 8 * s)
    elif item_type == 'number':
        return (18 * s + 24 * s + 12 * s)
    elif item_type == 'scale':
        h = 22 * s + 24 * s + 8 * s
        if item.get('hasNotes'):
            h += 16 * s
        return h
    elif item_type == 'text':
        return (18 * s + 2 * 18 * s)
    return 26 * s


def estimate_total_height(items, scale=1.0):
    """Estimate total height for all items."""
    total = 0
    for item in sorted(items, key=lambda x: x.get('order', 0)):
        total += estimate_item_height(item, scale)
    return total


class CardRenderer:
    """Renders a single routine card at a given position."""

    def __init__(self, canvas, x, y, width, height, routine, version, scale=1.0):
        self.c = canvas
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.routine = routine
        self.version = version
        self.scale = scale
        self.current_y = y + height - MARGIN

    def draw(self):
        self._draw_alignment_markers()
        self._draw_header()
        self._draw_items()
        self._draw_version()

    def _draw_alignment_markers(self):
        self.c.setFillColor(black)
        positions = [
            (self.x + MARGIN, self.y + self.height - MARGIN),
            (self.x + self.width - MARGIN, self.y + self.height - MARGIN),
            (self.x + MARGIN, self.y + MARGIN),
            (self.x + self.width - MARGIN, self.y + MARGIN),
        ]
        for px, py in positions:
            self.c.circle(px, py, MARKER_RADIUS, fill=1, stroke=0)

    def _draw_header(self):
        s = self.scale
        header_font = max(10, 14 * s)
        self.c.setFont("Helvetica-Bold", header_font)
        self.c.setFillColor(black)

        content_x = self.x + MARGIN + MARKER_RADIUS * 2
        self.current_y -= header_font

        self.c.drawString(content_x, self.current_y, self.routine['name'])

        self.c.setFont("Helvetica", max(8, 10 * s))
        date_x = self.x + self.width - MARGIN - 80
        self.c.drawString(date_x, self.current_y + 2, "___/___/___")

        self.current_y -= 10 * s
        self.c.setStrokeColor(GRAY)
        self.c.setLineWidth(0.5)
        self.c.line(content_x, self.current_y, self.x + self.width - MARGIN - MARKER_RADIUS * 2, self.current_y)
        self.c.setStrokeColor(black)

        self.current_y -= 15 * s

    def _draw_items(self):
        content_x = self.x + MARGIN + MARKER_RADIUS * 2
        content_width = self.width - (2 * MARGIN) - (MARKER_RADIUS * 4)

        for item in sorted(self.routine.get('items', []), key=lambda x: x.get('order', 0)):
            item_type = item['type']
            if item_type == 'group':
                self._draw_group_item(content_x, content_width, item)
            elif item_type == 'checkbox':
                self._draw_checkbox_item(content_x, item)
            elif item_type == 'number':
                self._draw_number_item(content_x, item)
            elif item_type == 'scale':
                self._draw_scale_item(content_x, content_width, item)
            elif item_type == 'text':
                self._draw_text_item(content_x, content_width, item)

    def _draw_group_item(self, x, content_width, item):
        s = self.scale
        font_size = max(8, 11 * s)
        self.c.setFont("Helvetica-Bold", font_size)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8 * s, item['name'])

        self.c.setStrokeColor(GRAY)
        self.c.setLineWidth(0.5)
        self.c.line(x, self.current_y - 12 * s, x + content_width, self.current_y - 12 * s)
        self.c.setStrokeColor(black)

        self.current_y -= 20 * s

        indent = 16 * s
        indented_x = x + indent
        indented_width = content_width - indent

        for child in sorted(item.get('children', []), key=lambda x: x.get('order', 0)):
            child_type = child['type']
            if child_type == 'checkbox':
                self._draw_checkbox_item(indented_x, child)
            elif child_type == 'number':
                self._draw_number_item(indented_x, child)
            elif child_type == 'scale':
                self._draw_scale_item(indented_x, indented_width, child)
            elif child_type == 'text':
                self._draw_text_item(indented_x, indented_width, child)

    def _draw_checkbox_item(self, x, item):
        s = self.scale
        box_size = max(12, 18 * s)
        font_size = max(8, 11 * s)
        self.c.setStrokeColor(black)
        self.c.setLineWidth(1.5 * s)
        self.c.rect(x, self.current_y - box_size + 4 * s, box_size, box_size, fill=0, stroke=1)

        self.c.setFont("Helvetica", font_size)
        self.c.setFillColor(black)
        self.c.drawString(x + box_size + 8 * s, self.current_y - 8 * s, item['name'])

        self.current_y -= (box_size + 8 * s)

    def _draw_number_item(self, x, item):
        s = self.scale
        font_size = max(8, 11 * s)
        box_w = 72 * s
        box_h = 24 * s

        self.c.setFont("Helvetica", font_size)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8 * s, item['name'])
        self.current_y -= 18 * s

        self.c.setStrokeColor(black)
        self.c.setLineWidth(1)
        self.c.rect(x, self.current_y - box_h, box_w, box_h, fill=0, stroke=1)

        unit = item.get('unit')
        if unit:
            self.c.setFont("Helvetica", max(7, 9 * s))
            self.c.setFillColor(GRAY)
            self.c.drawString(x + box_w + 6 * s, self.current_y - box_h + 6 * s, unit)
            self.c.setFillColor(black)

        self.current_y -= (box_h + 12 * s)

    def _draw_scale_item(self, x, content_width, item):
        s = self.scale
        font_size = max(8, 11 * s)
        box_size = max(16, 24 * s)

        self.c.setFont("Helvetica", font_size)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8 * s, item['name'])
        self.current_y -= 22 * s

        self.c.setStrokeColor(black)
        self.c.setLineWidth(1)
        self.c.setFont("Helvetica", max(7, 9 * s))

        for i in range(5):
            box_x = x + (i * (box_size + 6 * s))
            self.c.rect(box_x, self.current_y - box_size, box_size, box_size, fill=0, stroke=1)
            self.c.setFillColor(GRAY)
            self.c.drawCentredString(box_x + box_size / 2, self.current_y + 3 * s, str(i + 1))
            self.c.setFillColor(black)

        self.current_y -= (box_size + 8 * s)

        if item.get('hasNotes'):
            self.c.setFont("Helvetica", max(7, 9 * s))
            self.c.setFillColor(GRAY)
            self.c.drawString(x, self.current_y - 8 * s, "Notes:")
            self.c.setFillColor(black)
            self.c.setStrokeColor(GRAY)
            self.c.setLineWidth(0.5)
            self.c.line(x + 35 * s, self.current_y - 10 * s, x + content_width, self.current_y - 10 * s)
            self.c.setStrokeColor(black)
            self.current_y -= 16 * s

    def _draw_text_item(self, x, content_width, item):
        s = self.scale
        font_size = max(8, 11 * s)
        line_h = 18 * s

        self.c.setFont("Helvetica", font_size)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8 * s, item['name'])
        self.current_y -= 18 * s

        self.c.setStrokeColor(GRAY)
        self.c.setLineWidth(0.5)
        for _ in range(2):
            self.c.line(x, self.current_y - 4 * s, x + content_width, self.current_y - 4 * s)
            self.current_y -= line_h
        self.c.setStrokeColor(black)

    def _draw_version(self):
        self.c.setFont("Helvetica", 8)
        self.c.setFillColor(GRAY)
        version_text = f"v{self.version}"
        self.c.drawRightString(
            self.x + self.width - MARGIN - MARKER_RADIUS * 2,
            self.y + MARGIN + MARKER_RADIUS,
            version_text
        )
        self.c.setFillColor(black)


def generate_pdf(routine, output_path=None):
    """Generate PDF with one full-page card. Auto-scales to fit all items."""
    width = PAGE_WIDTH
    height = PAGE_HEIGHT

    # Calculate available height for items (after header ~50pt and version ~20pt)
    header_space = 50
    footer_space = 25
    available = height - 2 * MARGIN - header_space - footer_space

    items = routine.get('items', [])
    
    # Find the right scale: start at 1.0 and shrink until items fit
    scale = 1.0
    needed = estimate_total_height(items, scale)
    if needed > available:
        scale = max(0.5, available / needed)  # Don't go below 0.5

    if output_path:
        c = canvas.Canvas(output_path, pagesize=letter)
    else:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)

    renderer = CardRenderer(
        c, 0, 0, width, height, routine,
        routine.get('version', 1), scale=scale
    )
    renderer.draw()
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
    parser = argparse.ArgumentParser(description='Generate routine card PDF')
    parser.add_argument('--input', '-i', required=True, help='JSON input file or "-" for stdin')
    parser.add_argument('--output', '-o', required=True, help='Output PDF file path')
    parser.add_argument('--layout', '-l', choices=['quarter', 'half', 'full', 'auto'],
                        default='full', help='Card layout (ignored, always full)')

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
