"""Generate Taunet Nelel member email / inbox notice PDF (WhatsApp + committee)."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos


ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-EMAIL-INBOX-NOTICE.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
MUTED = (90, 75, 60)
BOX = (245, 236, 224)
HI_BG = (255, 243, 230)


class FlyerPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-18)
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.4)
        self.line(18, self.get_y(), self.w - 18, self.get_y())
        self.ln(3)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(
            0,
            5,
            "Taunet Nelel  |  members@taunetnelel.org  |  info@taunetnelel.org",
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
        .replace("•", "-")
    )


def body(pdf: FlyerPDF, text: str, h: float = 5.2) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, h, safe(text), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def highlight_box(pdf: FlyerPDF, title: str, text: str) -> None:
    x0 = pdf.l_margin
    start = pdf.get_y()
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(x0 + 4, start + 4)
    pdf.multi_cell(pdf.epw - 8, 5, safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(x0 + 4)
    pdf.multi_cell(pdf.epw - 8, 5, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    end = pdf.get_y() + 4
    box_h = end - start
    pdf.set_y(start)
    pdf.set_fill_color(*HI_BG)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.35)
    pdf.rect(x0, start, pdf.epw, box_h, style="FD")
    pdf.set_xy(x0 + 4, start + 4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(pdf.epw - 8, 5, safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(x0 + 4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(pdf.epw - 8, 5, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(start + box_h + 4)


def build() -> None:
    pdf = FlyerPDF()
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.set_margins(18, 16, 18)
    pdf.add_page()

    if LOGO_FILE.is_file():
        pdf.image(str(LOGO_FILE), x=(pdf.w - 28) / 2, y=14, w=28)
        pdf.set_y(46)
    else:
        pdf.set_y(20)

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(pdf.epw, 8, safe("Keep Taunet Nelel emails out of Spam"), align="C")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        pdf.epw,
        5.5,
        safe(
            "Member portal messages (password links, payment requests, confirmations) "
            "are sent from our official address. Please train your phone or Gmail once."
        ),
        align="C",
    )
    pdf.ln(4)

    highlight_box(
        pdf,
        "From address (save this)",
        "Taunet Nelel <members@taunetnelel.org>\n"
        "Reply-to: info@taunetnelel.org",
    )

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*BROWN)
    body(pdf, "What to do (takes under a minute)")
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(*MUTED)
    steps = [
        "1. Open the email from members@taunetnelel.org (check Spam / Junk if needed).",
        "2. Tap Not spam / Report not junk so future mail stays in Inbox.",
        "3. Add members@taunetnelel.org to Contacts (or your phone address book).",
        "4. Open the link in the email to set or reset your password on the new portal.",
    ]
    for step in steps:
        body(pdf, step, h=5.4)
    pdf.ln(2)

    pdf.set_fill_color(*BOX)
    pdf.set_draw_color(*ACCENT)
    y0 = pdf.get_y()
    pdf.rect(pdf.l_margin, y0, pdf.epw, 28, style="FD")
    pdf.set_xy(pdf.l_margin + 4, y0 + 3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 6, safe("WhatsApp copy-paste"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(pdf.l_margin + 4)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        pdf.epw - 8,
        4.6,
        safe(
            "Portal emails come from members@taunetnelel.org (Taunet Nelel). "
            "Please add that address to Contacts. If a message is in Spam, tap Not spam. "
            "Old website passwords do not work - use the link in the email."
        ),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )
    pdf.set_y(y0 + 32)

    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "Sign in / Forgot password: https://taunetnelel.vercel.app/members/auth.html"
        "  |  Help: info@taunetnelel.org",
        h=4.8,
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
