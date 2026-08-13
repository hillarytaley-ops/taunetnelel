"""Short WhatsApp notice: member portal invitation email is coming."""

from __future__ import annotations

from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos


ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-MEMBER-INVITE-ALERT.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
MUTED = (90, 75, 60)
HI_BG = (255, 243, 230)
BOX = (245, 236, 224)


class NotePDF(FPDF):
    def footer(self) -> None:
        self.set_y(-16)
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.35)
        self.line(16, self.get_y(), self.w - 16, self.get_y())
        self.ln(2.5)
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


def body(pdf: NotePDF, text: str, h: float = 5.0) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, h, safe(text), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def box(pdf: NotePDF, title: str, text: str, fill=HI_BG) -> None:
    x0 = pdf.l_margin
    start = pdf.get_y()
    pdf.set_xy(x0 + 4, start + 3.5)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(pdf.epw - 8, 5, safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(x0 + 4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(pdf.epw - 8, 4.8, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    end = pdf.get_y() + 3.5
    height = end - start
    pdf.set_y(start)
    pdf.set_fill_color(*fill)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.35)
    pdf.rect(x0, start, pdf.epw, height, style="FD")
    pdf.set_xy(x0 + 4, start + 3.5)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(pdf.epw - 8, 5, safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(x0 + 4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(pdf.epw - 8, 4.8, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(start + height + 4)


def build() -> None:
    pdf = NotePDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(16, 14, 16)
    pdf.add_page()

    if LOGO_FILE.is_file():
        pdf.image(str(LOGO_FILE), x=(pdf.w - 24) / 2, y=12, w=24)
        pdf.set_y(40)
    else:
        pdf.set_y(16)

    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(pdf.epw, 7.5, safe("Member portal invitation"), align="C")
    pdf.ln(1)
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        pdf.epw,
        5.2,
        safe(
            "Dear members, Taunet Nelel has moved login to our new website. "
            "You will shortly receive an official email so you can set your password "
            "and open the member portal."
        ),
        align="C",
    )
    pdf.ln(3)

    box(
        pdf,
        "What this email is for",
        "It is not marketing and not a request for money.\n\n"
        "Purpose: invite you to the new member portal at www.taunetnelel.org "
        "and let you choose a new password.\n\n"
        "From: Taunet Nelel <members@taunetnelel.org>\n"
        "Subject: Set your Taunet Nelel member password\n"
        "(or Reset your Taunet Nelel member password)\n\n"
        "Old website passwords will not work. Use the button in this email.",
    )

    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*BROWN)
    body(pdf, "What to do")
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(*MUTED)
    for line in [
        "1. Check Inbox first, then Spam / Junk.",
        "2. Open the email from members@taunetnelel.org.",
        "3. Tap Set your password / Choose a new password.",
        "4. Add members@taunetnelel.org to Contacts. If it was in Spam, tap Not spam.",
        "5. Sign in at www.taunetnelel.org/members/auth.html",
    ]:
        body(pdf, line, h=5.3)
    pdf.ln(2)

    box(
        pdf,
        "Questions / IT help",
        "Do not reply on WhatsApp with password links.\n\n"
        "Live IT chat (no login needed):\n"
        "https://www.taunetnelel.org/help.html\n"
        "A chat button is also on the Sign in page.\n\n"
        "IT sees your message in Admin -> IT Help chat and replies "
        "in the same conversation. Do not share your password link.",
        fill=BOX,
    )

    pdf.set_fill_color(*HI_BG)
    pdf.set_draw_color(*ACCENT)
    y0 = pdf.get_y()
    pdf.rect(pdf.l_margin, y0, pdf.epw, 36, style="FD")
    pdf.set_xy(pdf.l_margin + 4, y0 + 3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 6, safe("WhatsApp copy-paste"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(pdf.l_margin + 4)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        pdf.epw - 8,
        4.5,
        safe(
            "Dear members - Taunet Nelel is sending portal invite emails from "
            "members@taunetnelel.org (Set / Reset your password). Check Inbox then Spam. "
            "Old passwords will not work. Need help? Live IT chat at "
            "www.taunetnelel.org/help.html (IT replies in Admin). www.taunetnelel.org"
        ),
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
