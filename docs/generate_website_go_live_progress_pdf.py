"""Short go-live progress brief for the Taunet Nelel Committee (1-2 pages)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-WEBSITE-GO-LIVE-PROGRESS.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
CREAM = (252, 247, 240)
LIGHT = (248, 243, 236)
DARK = (35, 28, 22)
MUTED = (90, 75, 60)
WHITE = (255, 255, 255)
GREEN = (46, 125, 50)
AMBER = (180, 100, 20)

REPORT_DATE = date(2026, 8, 1)


def safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )


class BriefPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(
            0,
            5,
            safe(
                f"Taunet Nelel  |  Go-Live Brief  |  {REPORT_DATE.strftime('%d %b %Y')}  |  "
                "Confidential - Committee"
            ),
            align="C",
        )


def hbar(pdf: BriefPDF, title: str) -> None:
    pdf.ln(2)
    pdf.set_fill_color(*BROWN)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 7, f"  {safe(title)}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)
    pdf.set_text_color(*DARK)


def row(pdf: BriefPDF, status: str, text: str, status_rgb: tuple[int, int, int]) -> None:
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*status_rgb)
    pdf.cell(22, 5, safe(status), new_x=XPos.END, new_y=YPos.TOP)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(pdf.epw - 22, 5, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def build() -> None:
    pdf = BriefPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(16, 12, 16)
    pdf.add_page()

    pdf.set_fill_color(*CREAM)
    pdf.rect(0, 0, pdf.w, pdf.h, style="F")

    # Header strip
    pdf.set_fill_color(*BROWN)
    pdf.rect(0, 0, pdf.w, 22, style="F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 22, pdf.w, 2, style="F")

    if LOGO_FILE.exists():
        pdf.image(str(LOGO_FILE), x=16, y=3, h=16)

    pdf.set_xy(40, 4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 6, "WEBSITE GO-LIVE BRIEF", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(40)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(
        0,
        5,
        safe(f"Committee update  |  {REPORT_DATE.strftime('%d %B %Y')}  |  Taunet Nelel IT Team"),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    pdf.set_y(28)

    # One-line status
    pdf.set_fill_color(*LIGHT)
    pdf.set_draw_color(*ACCENT)
    pdf.rect(16, pdf.get_y(), pdf.epw, 14, style="DF")
    pdf.set_xy(18, pdf.get_y() + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(
        pdf.epw - 4,
        5,
        safe(
            "Status: New website LIVE on preview. Member password access IN PROGRESS. "
            "Domain cutover NOT started (www still on WordPress)."
        ),
    )
    pdf.ln(3)

    # Links
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(
        0,
        4.5,
        safe(
            "Preview site:  https://taunetnelel.vercel.app\n"
            "Members login:  https://taunetnelel.vercel.app/members/auth.html\n"
            "Current live site (WordPress):  https://www.taunetnelel.org"
        ),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    hbar(pdf, "DONE")
    for line in (
        ("DONE", "Public website rebuilt on Vercel + Supabase (forms, events, sponsors, gallery)"),
        ("DONE", "Members portal: Sign in / Join / Committee + member dashboard"),
        ("DONE", "Committee admin portal live"),
        ("DONE", "540 member records imported"),
        ("DONE", "Password reset form fixed (Choose a new password)"),
        ("DONE", "Emails send from members@taunetnelel.org via Resend"),
        ("DONE", "Second-wave password emails: 100 members sent (1 Aug) - 0 failures"),
        ("DONE", "Member notice PDF with apology for first-invite dead end (for WhatsApp)"),
    ):
        row(pdf, line[0], line[1], GREEN)

    hbar(pdf, "REMAINING (before domain cutover)")
    for line in (
        ("NOW", "Finish second-wave password emails for remaining members"),
        ("NOW", "Share member notice PDF on WhatsApp; ask members to use NEW email only"),
        ("NEXT", "IT Team UAT sign-off (checklist PDF in docs/)"),
        ("LATER", "Payments decision (or keep bank transfer for launch)"),
        ("LAST", "DNS cutover: point www.taunetnelel.org to Vercel"),
        ("AFTER", "Retire WordPress after 2-4 weeks if stable"),
    ):
        colour = AMBER if line[0] in ("NOW", "NEXT") else MUTED
        row(pdf, line[0], line[1], colour)

    hbar(pdf, "ASK OF COMMITTEE")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(
        0,
        5,
        safe(
            "1. Note progress above.\n"
            "2. Approve finishing remaining password emails + WhatsApp notice.\n"
            "3. IT Team completes UAT checklist, then committee approves DNS cutover "
            "in writing (do not switch www until that approval)."
        ),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.ln(2)

    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*BROWN)
    y = pdf.get_y()
    pdf.rect(16, y, pdf.epw, 22, style="DF")
    pdf.set_xy(18, y + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 5, safe("Member message (one line)"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(18)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(
        pdf.epw - 4,
        4,
        safe(
            "Ignore the first invite if it failed. Use the NEW email from "
            "members@taunetnelel.org, open from Inbox, set a new password, then sign in. "
            "Help: info@taunetnelel.org"
        ),
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
