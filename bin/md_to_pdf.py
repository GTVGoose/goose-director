#!/usr/bin/env python3
# md_to_pdf.py — phone-friendly markdown → PDF, no external markdown lib.
# Used by signal.mjs so Signal Brief / fork packet references land on Telegram
# as something a phone can actually open, instead of a bare .md filename.
#
# Usage: python3 md_to_pdf.py --in <source.md> --out <dest.pdf> [--title "Title"]

import argparse
import re
import sys

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from xml.sax.saxutils import escape

BODY = ParagraphStyle('body', fontName='Helvetica', fontSize=12.5, leading=18, spaceAfter=6)
H1 = ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=17, leading=22, spaceBefore=10, spaceAfter=8)
H2 = ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=14.5, leading=20, spaceBefore=8, spaceAfter=6)
BULLET = ParagraphStyle('bullet', parent=BODY, leftIndent=16, bulletIndent=4)


def strip_frontmatter(text):
    return re.sub(r'^---\n.*?\n---\n', '', text, count=1, flags=re.DOTALL)


def inline(text):
    # Minimal inline markdown → reportlab mini-HTML: bold, italic, code.
    text = escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    text = re.sub(r'`(.+?)`', r'<font face="Courier">\1</font>', text)
    return text


def build_story(text, title):
    story = []
    if title:
        story.append(Paragraph(escape(title), H1))
        story.append(Spacer(1, 6))
    for raw_line in strip_frontmatter(text).split('\n'):
        line = raw_line.rstrip()
        if not line.strip():
            story.append(Spacer(1, 6))
            continue
        h = re.match(r'^(#{1,6})\s+(.*)$', line)
        if h:
            level = len(h.group(1))
            style = H1 if level == 1 else H2
            story.append(Paragraph(inline(h.group(2)), style))
            continue
        b = re.match(r'^[\s]*[-*]\s+(.*)$', line)
        if b:
            story.append(Paragraph(f'&bull;&nbsp;&nbsp;{inline(b.group(1))}', BULLET))
            continue
        story.append(Paragraph(inline(line.strip()), BODY))
    return story


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='src', required=True)
    ap.add_argument('--out', dest='dst', required=True)
    ap.add_argument('--title', dest='title', default=None)
    args = ap.parse_args()

    with open(args.src, 'r', encoding='utf-8') as f:
        text = f.read()

    title = args.title
    if not title:
        m = re.search(r'^#\s+(.+)$', strip_frontmatter(text), flags=re.MULTILINE)
        title = m.group(1) if m else None

    doc = SimpleDocTemplate(
        args.dst, pagesize=LETTER,
        leftMargin=0.8 * inch, rightMargin=0.8 * inch,
        topMargin=0.8 * inch, bottomMargin=0.8 * inch,
    )
    doc.build(build_story(text, title))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'md_to_pdf: {e}', file=sys.stderr)
        sys.exit(1)
