#!/usr/bin/env python3
"""
Generate printable routine tracking cards as PDF.

Usage:
    python generate-card-pdf.py --input <json> --output <pdf>

Input: JSON file with routine definition including name, items, version, quantity
Output: PDF file
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

# Layout configurations
LAYOUTS = {
    'quarter': {'cols': 2, 'rows': 2, 'width': 4.25*inch, 'height': 5.5*inch},
    'half':    {'cols': 1, 'rows': 2, 'width': 8.5*inch,  'height': 5.5*inch},
    'full':    {'cols': 1, 'rows': 1, 'width': 8.5*inch,  'height': 11*inch},
}

# Element sizes
CHECKBOX_SIZE = 18  # points (~0.25")
NUMBER_BOX_WIDTH = 72  # points (1")
NUMBER_BOX_HEIGHT = 24  # points
SCALE_BOX_SIZE = 24  # points
LINE_HEIGHT = 18  # points for text items

# Colors
GRAY = Color(0.7, 0.7, 0.7)


def suggest_layout(item_count):
    """Determine layout based on item count."""
    if item_count <= 8:
        return 'quarter'
    elif item_count <= 15:
        return 'half'
    return 'full'


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
        self.current_y = y + height - MARGIN

    def draw(self):
        self._draw_alignment_markers()
        self._draw_header()
        self._draw_items()
        self._draw_version()

    def _draw_alignment_markers(self):
        """Draw corner dots for OCR alignment."""
        self.c.setFillColor(black)
        positions = [
            (self.x + MARGIN, self.y + self.height - MARGIN),  # Top-left
            (self.x + self.width - MARGIN, self.y + self.height - MARGIN),  # Top-right
            (self.x + MARGIN, self.y + MARGIN),  # Bottom-left
            (self.x + self.width - MARGIN, self.y + MARGIN),  # Bottom-right
        ]
        for px, py in positions:
            self.c.circle(px, py, MARKER_RADIUS, fill=1, stroke=0)

    def _draw_header(self):
        """Draw routine name and date field."""
        self.c.setFont("Helvetica-Bold", 14)
        self.c.setFillColor(black)

        content_x = self.x + MARGIN + MARKER_RADIUS * 2
        self.current_y -= 14

        self.c.drawString(content_x, self.current_y, self.routine['name'])

        # Date field on the right
        self.c.setFont("Helvetica", 10)
        date_x = self.x + self.width - MARGIN - 80
        self.c.drawString(date_x, self.current_y + 2, "___/___/___")

        # Separator line
        self.current_y -= 10
        self.c.setStrokeColor(GRAY)
        self.c.setLineWidth(0.5)
        self.c.line(content_x, self.current_y, self.x + self.width - MARGIN - MARKER_RADIUS * 2, self.current_y)
        self.c.setStrokeColor(black)

        self.current_y -= 15

    def _draw_items(self):
        """Draw each item based on type."""
        content_x = self.x + MARGIN + MARKER_RADIUS * 2
        content_width = self.width - (2 * MARGIN) - (MARKER_RADIUS * 4)
        min_y = self.y + MARGIN + 20  # Leave room for version

        for item in sorted(self.routine.get('items', []), key=lambda x: x.get('order', 0)):
            if self.current_y < min_y:
                break

            item_type = item['type']

            if item_type == 'checkbox':
                self._draw_checkbox_item(content_x, item)
            elif item_type == 'number':
                self._draw_number_item(content_x, item)
            elif item_type == 'scale':
                self._draw_scale_item(content_x, content_width, item)
            elif item_type == 'text':
                self._draw_text_item(content_x, content_width, item)

    def _draw_checkbox_item(self, x, item):
        """Draw a checkbox item."""
        self.c.setStrokeColor(black)
        self.c.setLineWidth(1.5)
        self.c.rect(x, self.current_y - CHECKBOX_SIZE + 4, CHECKBOX_SIZE, CHECKBOX_SIZE, fill=0, stroke=1)

        self.c.setFont("Helvetica", 11)
        self.c.setFillColor(black)
        self.c.drawString(x + CHECKBOX_SIZE + 8, self.current_y - 8, item['name'])

        self.current_y -= (CHECKBOX_SIZE + 8)

    def _draw_number_item(self, x, item):
        """Draw a number input item."""
        self.c.setFont("Helvetica", 11)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8, item['name'])

        self.current_y -= 18

        # Number box
        self.c.setStrokeColor(black)
        self.c.setLineWidth(1)
        self.c.rect(x, self.current_y - NUMBER_BOX_HEIGHT, NUMBER_BOX_WIDTH, NUMBER_BOX_HEIGHT, fill=0, stroke=1)

        # Unit label
        unit = item.get('unit')
        if unit:
            self.c.setFont("Helvetica", 9)
            self.c.setFillColor(GRAY)
            self.c.drawString(x + NUMBER_BOX_WIDTH + 6, self.current_y - NUMBER_BOX_HEIGHT + 6, unit)
            self.c.setFillColor(black)

        self.current_y -= (NUMBER_BOX_HEIGHT + 12)

    def _draw_scale_item(self, x, content_width, item):
        """Draw a scale (1-5) input item."""
        self.c.setFont("Helvetica", 11)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8, item['name'])

        self.current_y -= 22

        # Scale boxes (1-5)
        self.c.setStrokeColor(black)
        self.c.setLineWidth(1)
        self.c.setFont("Helvetica", 9)

        for i in range(5):
            box_x = x + (i * (SCALE_BOX_SIZE + 6))
            self.c.rect(box_x, self.current_y - SCALE_BOX_SIZE, SCALE_BOX_SIZE, SCALE_BOX_SIZE, fill=0, stroke=1)
            # Number label
            self.c.setFillColor(GRAY)
            self.c.drawCentredString(box_x + SCALE_BOX_SIZE / 2, self.current_y + 3, str(i + 1))
            self.c.setFillColor(black)

        self.current_y -= (SCALE_BOX_SIZE + 8)

        # Notes line if requested
        if item.get('hasNotes'):
            self.c.setFont("Helvetica", 9)
            self.c.setFillColor(GRAY)
            self.c.drawString(x, self.current_y - 8, "Notes:")
            self.c.setFillColor(black)

            # Line for notes
            self.c.setStrokeColor(GRAY)
            self.c.setLineWidth(0.5)
            self.c.line(x + 35, self.current_y - 10, x + content_width, self.current_y - 10)
            self.c.setStrokeColor(black)

            self.current_y -= 16

    def _draw_text_item(self, x, content_width, item):
        """Draw a text input item."""
        self.c.setFont("Helvetica", 11)
        self.c.setFillColor(black)
        self.c.drawString(x, self.current_y - 8, item['name'])

        self.current_y -= 18

        # Two lines for text input
        self.c.setStrokeColor(GRAY)
        self.c.setLineWidth(0.5)
        for _ in range(2):
            self.c.line(x, self.current_y - 4, x + content_width, self.current_y - 4)
            self.current_y -= LINE_HEIGHT
        self.c.setStrokeColor(black)

    def _draw_version(self):
        """Draw version number in bottom-right corner."""
        self.c.setFont("Helvetica", 8)
        self.c.setFillColor(GRAY)
        version_text = f"v{self.version}"
        self.c.drawRightString(
            self.x + self.width - MARGIN - MARKER_RADIUS * 2,
            self.y + MARGIN + MARKER_RADIUS,
            version_text
        )
        self.c.setFillColor(black)


def draw_cut_guides(c, layout_config):
    """Draw dashed cut lines between cards."""
    c.setStrokeColor(GRAY)
    c.setLineWidth(0.5)
    c.setDash(6, 3)  # Dashed line

    # Vertical guides
    for col in range(1, layout_config['cols']):
        x = col * layout_config['width']
        c.line(x, 0, x, PAGE_HEIGHT)

    # Horizontal guides
    for row in range(1, layout_config['rows']):
        y = PAGE_HEIGHT - row * layout_config['height']
        c.line(0, y, PAGE_WIDTH, y)

    c.setDash()  # Reset to solid


def generate_pdf(routine, layout, quantity, output_path=None):
    """Generate PDF with specified number of cards."""
    layout_config = LAYOUTS[layout]
    cards_per_page = layout_config['cols'] * layout_config['rows']
    total_pages = (quantity + cards_per_page - 1) // cards_per_page

    # Create PDF
    if output_path:
        c = canvas.Canvas(output_path, pagesize=letter)
    else:
        buffer = BytesIO()
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
                    routine.get('version', 1)
                )
                renderer.draw()
                card_index += 1

    c.save()

    if not output_path:
        buffer.seek(0)
        return buffer.getvalue()

    return {
        'layout': layout,
        'cards_per_page': cards_per_page,
        'pages_generated': total_pages,
        'cards_generated': quantity
    }


def main():
    parser = argparse.ArgumentParser(description='Generate routine card PDF')
    parser.add_argument('--input', '-i', required=True, help='JSON input file or "-" for stdin')
    parser.add_argument('--output', '-o', required=True, help='Output PDF file path')
    parser.add_argument('--layout', '-l', choices=['quarter', 'half', 'full', 'auto'],
                        default='auto', help='Card layout (default: auto)')

    args = parser.parse_args()

    # Read input
    if args.input == '-':
        data = json.load(sys.stdin)
    else:
        with open(args.input, 'r') as f:
            data = json.load(f)

    routine_name = data['name']
    items = data['items']
    version = data.get('version', 1)
    quantity = data.get('quantity', 1)

    # Determine layout
    layout = args.layout
    if layout == 'auto':
        layout = suggest_layout(len(items))

    # Build routine object
    routine = {
        'name': routine_name,
        'items': items,
        'version': version
    }

    # Generate PDF
    result = generate_pdf(routine, layout, quantity, args.output)

    # Output result as JSON
    print(json.dumps(result))


if __name__ == '__main__':
    main()
