"""Generate committee UAT checklist PDF for go-live."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-COMMITTEE-UAT-CHECKLIST.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
CREAM = (252, 247, 240)
MUTED = (90, 75, 60)
WHITE = (255, 255, 255)

CHECKS = [
    ("Committee admin", "Sign in at members/auth.html?tab=admin with committee email"),
    ("Admin Overview", "Counts load (enquiries, members, list 540)"),
    ("Events (admin)", "Event list shows published events; board placement sensible"),
    ("Gallery (admin)", "Albums listed Site+DB; public gallery opens"),
    ("Business Hub (admin)", "Publish to site saves; public Community Hub updates"),
    ("Member sign-in", "Invited member can set password and open dashboard"),
    ("Member dashboard", "Profile / plan label looks correct for a known member"),
    ("Events (public)", "Upcoming / recent / past columns look correct"),
    ("Gallery (public)", "Album photos load; lightbox works"),
    ("Welfare page", "Page loads; welfare form submits without error"),
    ("Membership page", "Page loads; membership enquiry submits"),
    ("Contact / newsletter", "Contact form + newsletter subscribe work"),
    ("Password reset", "Reset email arrives (check spam) and link works"),
    ("Mobile check", "Home + members usable on a phone screen"),
    ("Auth URLs ready", "Supabase redirect list includes www.taunetnelel.org (GO-LIVE-DNS.md)"),
]


class ChecklistPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-16)
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.35)
        self.line(16, self.get_y(), self.w - 16, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 5, "Taunet Nelel  |  Committee UAT  |  Do not cut DNS until signed off", align="C")


def safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
    )


def build() -> None:
    pdf = ChecklistPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(16, 14, 16)
    pdf.add_page()

    pdf.set_fill_color(*CREAM)
    pdf.rect(0, 0, pdf.w, pdf.h, style="F")
    pdf.set_fill_color(*BROWN)
    pdf.rect(0, 0, pdf.w, 7, style="F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 7, pdf.w, 2, style="F")

    y = 14
    if LOGO_FILE.exists():
        w = 32
        pdf.image(str(LOGO_FILE), x=(pdf.w - w) / 2, y=y, w=w)
        y = y + w * 0.85 + 2
    pdf.set_y(y)

    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 5, "COMMITTEE USE", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 8, "Go-Live UAT Checklist", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0,
        5,
        safe(
            "Test on https://taunetnelel.vercel.app before pointing www.taunetnelel.org to Vercel. "
            "Tick each item. Do not change DNS until the sign-off at the bottom is complete."
        ),
        align="C",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(3)

    # Table header
    pdf.set_fill_color(*BROWN)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(12, 7, " #", fill=True)
    pdf.cell(42, 7, "Area", fill=True)
    pdf.cell(100, 7, "Check", fill=True)
    pdf.cell(20, 7, "Pass", fill=True, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("Helvetica", "", 8.5)
    for i, (area, check) in enumerate(CHECKS, start=1):
        fill = (248, 243, 236) if i % 2 else WHITE
        pdf.set_fill_color(*fill)
        pdf.set_text_color(*BROWN)
        y0 = pdf.get_y()
        pdf.cell(12, 9, f" {i}", fill=True)
        pdf.cell(42, 9, safe(area)[:28], fill=True)
        pdf.set_text_color(*MUTED)
        pdf.cell(100, 9, safe(check)[:62], fill=True)
        pdf.set_draw_color(*ACCENT)
        pdf.cell(20, 9, "[  ]", fill=True, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        if pdf.get_y() > 250:
            pdf.add_page()
            pdf.set_fill_color(*CREAM)
            pdf.rect(0, 0, pdf.w, pdf.h, style="F")

    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 6, "Sign-off", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MUTED)
    pdf.ln(2)
    for label in (
        "Tester name: ________________________________",
        "Date: ________________",
        "Ready for DNS cutover?   Yes [  ]    No [  ]",
        "Notes: _______________________________________________________________",
    ):
        pdf.cell(0, 7, label, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.ln(4)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.multi_cell(
        0,
        4.5,
        safe(
            "DNS steps: docs/supabase/GO-LIVE-DNS.md  |  "
            "After cutover change Supabase Site URL to https://www.taunetnelel.org"
        ),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
