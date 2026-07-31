"""Generate Taunet Nelel website maintenance notice flyer (PDF)."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-WEBSITE-MAINTENANCE-NOTICE.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
CREAM = (252, 247, 240)
DARK = (35, 28, 22)
MUTED = (90, 75, 60)
WHITE = (255, 255, 255)

START_DATE = "Saturday, 25 July 2026"
END_DATE = "Friday, 7 August 2026"
DURATION = "Two weeks"

# Keep all body text above this Y so it never collides with footer bars
CONTENT_BOTTOM = 258


class FlyerPDF(FPDF):
    def footer(self) -> None:
        # Contact line sits above the bottom colour bars (bars start ~ h-8)
        self.set_y(-22)
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.4)
        self.line(18, self.get_y(), self.w - 18, self.get_y())
        self.ln(3)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(
            0,
            5,
            "Taunet Nelel  |  www.taunetnelel.org  |  info@taunetnelel.org",
            align="C",
        )


def safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


def centered(pdf: FlyerPDF, text: str, h: float = 6) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, h, safe(text), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def build_flyer() -> None:
    pdf = FlyerPDF(format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.set_margins(18, 14, 18)
    pdf.add_page()

    pdf.set_fill_color(*CREAM)
    pdf.rect(0, 0, pdf.w, pdf.h, style="F")

    pdf.set_fill_color(*BROWN)
    pdf.rect(0, 0, pdf.w, 7, style="F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 7, pdf.w, 2.2, style="F")

    y = 16
    if LOGO_FILE.exists():
        logo_w = 44
        logo_x = (pdf.w - logo_w) / 2
        pdf.image(str(LOGO_FILE), x=logo_x, y=y, w=logo_w)
        y = y + logo_w * (467 / 534) + 4
    else:
        y = 34

    pdf.set_y(y)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*ACCENT)
    centered(pdf, "MEMBER NOTICE", 5)
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*BROWN)
    centered(pdf, "Website Planned Maintenance", 8)
    centered(pdf, "& System Update", 8)
    pdf.ln(3)

    mid = pdf.w / 2
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.7)
    pdf.line(mid - 24, pdf.get_y(), mid + 24, pdf.get_y())
    pdf.ln(5)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    centered(pdf, "Dear Taunet Nelel members,", 5)
    pdf.ln(1)
    centered(pdf, "Please be advised that our website will undergo planned", 5)
    centered(pdf, "maintenance and updates to improve performance,", 5)
    centered(pdf, "security, and member services.", 5)
    pdf.ln(6)

    box_x = 28
    box_w = pdf.w - 56
    box_y = pdf.get_y()
    box_h = 44
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.6)
    pdf.rect(box_x, box_y, box_w, box_h, style="DF")

    pdf.set_fill_color(*BROWN)
    pdf.rect(box_x, box_y, 3.2, box_h, style="F")

    pdf.set_xy(box_x + 10, box_y + 5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*ACCENT)
    pdf.cell(box_w - 16, 5, "MAINTENANCE WINDOW", align="C")
    pdf.ln(7)

    pdf.set_x(box_x + 10)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(box_w - 16, 6, f"Starts:  {START_DATE}", align="C")
    pdf.ln(6)

    pdf.set_x(box_x + 10)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(box_w - 16, 6, f"Ends:    {END_DATE}", align="C")
    pdf.ln(6)

    pdf.set_x(box_x + 10)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*MUTED)
    pdf.cell(box_w - 16, 5, f"Duration: {DURATION}", align="C")

    pdf.set_y(box_y + box_h + 7)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    centered(pdf, "What to expect", 6)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*DARK)
    points = [
        "The website may be unavailable or intermittent at times.",
        "Member login and some online forms may be temporarily offline.",
        "Online payments and submissions may be delayed during the window.",
        "Normal service will resume once the update is complete.",
    ]
    for point in points:
        pdf.set_x(pdf.l_margin + 8)
        pdf.multi_cell(
            pdf.epw - 16,
            5,
            safe(f"-  {point}"),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        pdf.ln(1)

    pdf.ln(4)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    centered(pdf, "We apologise for any inconvenience and thank you", 5)
    centered(pdf, "for your patience and continued support.", 5)
    pdf.ln(6)

    # Closing for the whole association (not welfare-only branding)
    if pdf.get_y() > CONTENT_BOTTOM - 18:
        pdf.set_y(CONTENT_BOTTOM - 18)

    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(*ACCENT)
    centered(pdf, "Ongebe Tai Tugul", 5)
    pdf.ln(3)

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*BROWN)
    centered(pdf, "Taunet Nelel - Victoria", 5)

    # Bottom colour bars only (contact is in footer, above these)
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, pdf.h - 8, pdf.w, 2.5, style="F")
    pdf.set_fill_color(*BROWN)
    pdf.rect(0, pdf.h - 5.5, pdf.w, 5.5, style="F")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_flyer()
    print(f"Created: {OUTPUT_FILE}")
