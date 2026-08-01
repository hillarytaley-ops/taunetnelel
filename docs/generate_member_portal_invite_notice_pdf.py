"""Generate Taunet Nelel member portal invite notice PDF."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-MEMBER-PORTAL-INVITE-NOTICE.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
CREAM = (252, 247, 240)
MUTED = (90, 75, 60)
BOX = (245, 236, 224)


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
        .replace("•", "-")
    )


def centered(pdf: FlyerPDF, text: str, h: float = 6) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, h, safe(text), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def body(pdf: FlyerPDF, text: str, h: float = 5.2) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, h, safe(text), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def build() -> None:
    pdf = FlyerPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.set_margins(18, 14, 18)
    pdf.add_page()

    pdf.set_fill_color(*CREAM)
    pdf.rect(0, 0, pdf.w, pdf.h, style="F")

    pdf.set_fill_color(*BROWN)
    pdf.rect(0, 0, pdf.w, 7, style="F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 7, pdf.w, 2.2, style="F")

    y = 14
    if LOGO_FILE.exists():
        logo_w = 36
        logo_x = (pdf.w - logo_w) / 2
        pdf.image(str(LOGO_FILE), x=logo_x, y=y, w=logo_w)
        y = y + logo_w * (467 / 534) + 2
    else:
        y = 28

    pdf.set_y(y)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*ACCENT)
    centered(pdf, "MEMBER NOTICE", 5)
    pdf.ln(1.5)

    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BROWN)
    centered(pdf, "New Members Portal", 7)
    centered(pdf, "Invite Emails Have Been Sent", 7)
    pdf.ln(3)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "Dear members,",
    )
    pdf.ln(1)
    body(
        pdf,
        "Taunet Nelel has upgraded our website and members area. If you are already an Association or Welfare member, you should have received an email invitation to activate your login on the new portal.",
    )
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    body(pdf, "What to do")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    for line in (
        "1. Check your email inbox (and Spam / Junk folder).",
        "2. Open the invitation from Taunet Nelel.",
        "3. Set a new password when prompted.",
        "4. Sign in at the members portal using that password.",
    ):
        body(pdf, line)
    pdf.ln(2)

    pdf.set_fill_color(*BOX)
    x0 = pdf.l_margin
    y0 = pdf.get_y()
    pdf.set_font("Helvetica", "", 9.5)
    box_lines = [
        "Sign in:  https://taunetnelel.vercel.app/members/auth.html?tab=signin",
        "Join / activate:  https://taunetnelel.vercel.app/members/auth.html?tab=join",
    ]
    pdf.rect(x0, y0, pdf.epw, 16, style="F")
    pdf.set_xy(x0 + 3, y0 + 3)
    pdf.set_text_color(*BROWN)
    for i, line in enumerate(box_lines):
        pdf.set_x(x0 + 3)
        pdf.cell(pdf.epw - 6, 5, safe(line), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(y0 + 18)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    body(pdf, "Important")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "This does not change your membership status. The email only creates your login for the new website. Old website passwords will not work - please use the invite link to set a new password.",
    )
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    body(pdf, "Did not receive the email?")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "Confirm the committee has your current email address, or use Join with the same email we have on your membership record. For help, contact info@taunetnelel.org.",
    )
    pdf.ln(3)

    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(*MUTED)
    body(pdf, "Thank you for your patience as we improve our systems.")
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BROWN)
    body(pdf, "- Taunet Nelel IT team")

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
