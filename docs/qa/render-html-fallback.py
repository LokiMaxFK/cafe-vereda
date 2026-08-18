#!/usr/bin/env python3
"""Respaldo sencillo para generar las fichas QA cuando Chrome headless no puede arrancar."""

from __future__ import annotations

import html
import sys
from pathlib import Path

from bs4 import BeautifulSoup, Tag
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def text(node: Tag) -> str:
    return " ".join(node.get_text(" ", strip=True).split())


def paragraph(value: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(html.escape(value), style)


def render(source: Path, target: Path) -> None:
    soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.2, leading=11, textColor=colors.HexColor("#1b1b1f"), spaceAfter=3)
    small = ParagraphStyle("small", parent=body, fontSize=7.2, leading=9, textColor=colors.HexColor("#55525a"))
    title = ParagraphStyle("title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=17, leading=20, alignment=TA_CENTER, textColor=colors.HexColor("#1b1b1f"), spaceAfter=6)
    heading = ParagraphStyle("heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=colors.HexColor("#6b4423"), spaceBefore=9, spaceAfter=5)
    cell = ParagraphStyle("cell", parent=body, fontSize=6.9, leading=8.6, spaceAfter=0)
    cell_head = ParagraphStyle("cell-head", parent=cell, fontName="Helvetica-Bold", textColor=colors.HexColor("#55525a"))
    alert = ParagraphStyle("alert", parent=body, fontSize=7.7, leading=10, leftIndent=7, rightIndent=5, borderColor=colors.HexColor("#b3261e"), borderWidth=0, borderPadding=5, backColor=colors.HexColor("#fdf0ef"))
    box = ParagraphStyle("box", parent=alert, borderColor=colors.HexColor("#6b4423"), backColor=colors.HexColor("#f7f4f0"))

    document = SimpleDocTemplate(str(target), pagesize=LETTER, rightMargin=14 * mm, leftMargin=14 * mm, topMargin=14 * mm, bottomMargin=17 * mm, title=soup.title.string if soup.title else source.stem, author="Vereda Café QA")
    footer_node = soup.body.find("footer", recursive=False)
    footer_text = text(footer_node) if footer_node else "Vereda Café · Revisión QA"

    def draw_footer(canvas, _document):
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, 0, LETTER[0], LETTER[1], fill=1, stroke=0)
        canvas.setStrokeColor(colors.HexColor("#dcd7d1"))
        canvas.setLineWidth(0.35)
        canvas.line(14 * mm, 12 * mm, LETTER[0] - 14 * mm, 12 * mm)
        canvas.setFillColor(colors.HexColor("#7a767e"))
        canvas.setFont("Helvetica", 6.5)
        canvas.drawString(14 * mm, 8.5 * mm, footer_text[:145])
        canvas.drawRightString(LETTER[0] - 14 * mm, 8.5 * mm, str(canvas.getPageNumber()))
        canvas.restoreState()
    story = []
    header = soup.body.find("header", recursive=False)
    if header:
        eyebrow = header.select_one(".eyebrow")
        if eyebrow:
            story.append(paragraph(text(eyebrow), small))
        h1 = header.find("h1")
        if h1:
            story.append(paragraph(text(h1), title))
        meta = header.select(".meta span")
        if meta:
            story.append(paragraph(" · ".join(text(item) for item in meta), small))
        story.append(Spacer(1, 4 * mm))

    for node in soup.body.children:
        if not isinstance(node, Tag) or node.name == "header":
            continue
        if node.name == "h2":
            story.append(paragraph(text(node), heading))
        elif node.name == "ul":
            items = [ListItem(paragraph(text(item), body), leftIndent=9) for item in node.find_all("li", recursive=False)]
            story.append(ListFlowable(items, bulletType="bullet", leftIndent=14, bulletFontSize=5, spaceAfter=3))
        elif node.name == "table":
            rows = []
            for row_index, row in enumerate(node.find_all("tr")):
                values = row.find_all(["th", "td"], recursive=False)
                rows.append([paragraph(text(value), cell_head if value.name == "th" else cell) for value in values])
            if rows:
                column_count = max(len(row) for row in rows)
                if column_count == 3:
                    widths = [50 * mm, 78 * mm, 28 * mm]
                elif column_count == 2:
                    widths = [52 * mm, 104 * mm]
                else:
                    widths = [156 * mm / column_count] * column_count
                table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
                table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4efe9")),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#dcd7d1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.extend([table, Spacer(1, 2 * mm)])
        elif node.name == "div" and ("alert" in (node.get("class") or []) or "box" in (node.get("class") or [])):
            chosen = alert if "alert" in (node.get("class") or []) else box
            contents = []
            for item in node.find_all(["p", "li", "pre"]):
                contents.append(paragraph(("• " if item.name == "li" else "") + text(item), chosen))
            if contents:
                story.append(KeepTogether(contents))
        elif node.name == "footer":
            continue

    target.parent.mkdir(parents=True, exist_ok=True)
    document.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: render-html-fallback.py entrada.html salida.pdf")
    render(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
