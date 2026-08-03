"""Generate fillable PDF request for Taunet Nelel PayID / bank details."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

DOCS_DIR = Path(__file__).resolve().parent
ROOT = DOCS_DIR.parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-BANK-PAYID-DETAILS-REQUEST.pdf"

BROWN = HexColor("#5C2E10")
ACCENT = HexColor("#C4621C")
CREAM = HexColor("#FCF7F0")
DARK = HexColor("#231C16")
MUTED = HexColor("#5A4B3C")
FIELD_BG = HexColor("#FFFFFF")
FIELD_BORDER = HexColor("#B8A08A")
SECTION_BG = HexColor("#F5EDE3")

LEFT = 18 * mm
RIGHT_MARGIN = 18 * mm
FIELD_H = 8.5 * mm
GAP = 3.2 * mm
FOOTER_TOP = 22 * mm


def page_width() -> float:
    return A4[0] - LEFT - RIGHT_MARGIN


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, width: float, size: float = 9.5) -> float:
    c.setFont("Helvetica", size)
    c.setFillColor(DARK)
    words = text.split()
    line = ""
    leading = size + 2.8
    for word in words:
        trial = f"{line} {word}".strip()
        if c.stringWidth(trial, "Helvetica", size) <= width:
            line = trial
        else:
            c.drawString(x, y, line)
            y -= leading
            line = word
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y


def section_band(c: canvas.Canvas, title: str, y: float) -> float:
    band_h = 7.5 * mm
    c.setFillColor(SECTION_BG)
    c.roundRect(LEFT - 1 * mm, y - 5 * mm, page_width() + 2 * mm, band_h, 2 * mm, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(BROWN)
    c.drawString(LEFT + 1.5 * mm, y - 2.2 * mm, title)
    return y - band_h - 2 * mm


def text_field(
    c: canvas.Canvas,
    form,
    name: str,
    x: float,
    y_top: float,
    w: float,
    h: float = FIELD_H,
) -> None:
    form.textfield(
        name=name,
        tooltip=name,
        x=x,
        y=y_top - h,
        width=w,
        height=h,
        borderWidth=0.8,
        borderColor=FIELD_BORDER,
        fillColor=FIELD_BG,
        textColor=DARK,
        forceBorder=True,
        fontSize=10,
    )


def labeled_field(
    c: canvas.Canvas,
    form,
    label: str,
    name: str,
    y: float,
    *,
    required: bool = True,
    hint: str = "",
    field_w: float | None = None,
) -> float:
    w = field_w if field_w is not None else page_width()
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(BROWN)
    c.drawString(LEFT, y, label + (" *" if required else " (optional)"))
    y -= 3.2 * mm
    if hint:
        c.setFont("Helvetica", 7.5)
        c.setFillColor(MUTED)
        c.drawString(LEFT, y, hint)
        y -= 3.2 * mm
    text_field(c, form, name, LEFT, y + 1.5 * mm, w)
    return y - FIELD_H - GAP


def two_col_fields(
    c: canvas.Canvas,
    form,
    left_label: str,
    left_name: str,
    left_hint: str,
    right_label: str,
    right_name: str,
    right_hint: str,
    y: float,
    *,
    left_required: bool = True,
    right_required: bool = True,
) -> float:
    col_gap = 6 * mm
    col_w = (page_width() - col_gap) / 2
    right_x = LEFT + col_w + col_gap

    # Labels
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(BROWN)
    c.drawString(LEFT, y, left_label + (" *" if left_required else " (optional)"))
    c.drawString(right_x, y, right_label + (" *" if right_required else " (optional)"))
    y -= 3.2 * mm

    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    if left_hint:
        c.drawString(LEFT, y, left_hint)
    if right_hint:
        c.drawString(right_x, y, right_hint)
    y -= 3.2 * mm

    text_field(c, form, left_name, LEFT, y + 1.5 * mm, col_w)
    text_field(c, form, right_name, right_x, y + 1.5 * mm, col_w)
    return y - FIELD_H - GAP


def build_pdf() -> Path:
    c = canvas.Canvas(str(OUTPUT_FILE), pagesize=A4)
    width, height = A4
    form = c.acroForm

    c.setFillColor(CREAM)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    c.setFillColor(BROWN)
    c.rect(0, height - 7 * mm, width, 7 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(0, height - 9 * mm, width, 2 * mm, fill=1, stroke=0)

    y = height - 18 * mm
    if LOGO_FILE.exists():
        c.drawImage(
            str(LOGO_FILE),
            LEFT,
            y - 12 * mm,
            width=34 * mm,
            height=14 * mm,
            preserveAspectRatio=True,
            mask="auto",
        )

    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(BROWN)
    c.drawRightString(width - RIGHT_MARGIN, y, "Taunet Nelel")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawRightString(width - RIGHT_MARGIN, y - 4.5 * mm, "IT Team  ·  request to leadership")

    y -= 22 * mm
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(BROWN)
    c.drawString(LEFT, y, "PayID & bank details request")

    y -= 6 * mm
    y = draw_wrapped(
        c,
        "Please type the official Taunet Nelel association payment details "
        "(not personal accounts) into the boxes below. Open in Chrome or Edge, "
        "complete the form, save, and return to the IT Team. Details are used "
        "only for member invoices on the website.",
        LEFT,
        y,
        page_width(),
        9,
    )

    y -= 2 * mm
    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.7)
    c.line(LEFT, y, width - RIGHT_MARGIN, y)
    y -= 8 * mm

    y = section_band(c, "Required — Taunet Nelel association account", y)
    y = labeled_field(
        c,
        form,
        "PayID",
        "payid",
        y,
        hint="Email, mobile, or ABN PayID linked to the Taunet Nelel bank account",
    )
    y = labeled_field(
        c,
        form,
        "Bank name",
        "bank_name",
        y,
        hint="e.g. Commonwealth Bank, NAB, Westpac",
    )
    y = two_col_fields(
        c,
        form,
        "BSB",
        "bank_bsb",
        "6 digits",
        "Account number",
        "bank_account_number",
        "",
        y,
    )
    y = labeled_field(
        c,
        form,
        "Account name",
        "bank_account_name",
        y,
        hint="Exact name on the Taunet Nelel bank account",
    )

    y -= 1 * mm
    y = section_band(c, "Optional — for the invoice PDF", y)
    y = two_col_fields(
        c,
        form,
        "Legal entity name",
        "org_legal_name",
        "If different from Taunet Nelel Incorporated",
        "ABN",
        "org_abn",
        "",
        y,
        left_required=False,
        right_required=False,
    )

    y -= 1 * mm
    y = section_band(c, "Completed by", y)
    y = two_col_fields(
        c,
        form,
        "Your name / role",
        "completed_by",
        "",
        "Date",
        "completed_date",
        "DD / MM / YYYY",
        y,
        left_required=False,
        right_required=False,
    )

    # Keep content clear of footer
    if y < FOOTER_TOP + 8 * mm:
        y = FOOTER_TOP + 8 * mm

    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(LEFT, FOOTER_TOP + 4 * mm, "* Required fields")

    c.setStrokeColor(ACCENT)
    c.setLineWidth(0.4)
    c.line(LEFT, 14 * mm, width - RIGHT_MARGIN, 14 * mm)
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawCentredString(
        width / 2,
        9 * mm,
        "Taunet Nelel  |  www.taunetnelel.org  |  Return completed form to IT Team",
    )
    c.setFont("Helvetica-Oblique", 7)
    c.drawCentredString(
        width / 2,
        5 * mm,
        "Fill in browser (Chrome / Edge), save the PDF, and email it back — no print needed.",
    )

    c.save()
    return OUTPUT_FILE


if __name__ == "__main__":
    out = build_pdf()
    print(f"Wrote {out}")
