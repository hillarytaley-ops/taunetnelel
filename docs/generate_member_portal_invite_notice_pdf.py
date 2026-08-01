"""Generate Taunet Nelel member portal invite / password-reset notice PDF."""

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
APOLOGY_BG = (255, 243, 230)


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


def apology_box(pdf: FlyerPDF) -> None:
    x0 = pdf.l_margin
    title = "Our apology"
    text = (
        "We are sorry. Many members who opened the first portal invite hit a dead end: "
        "the link opened the sign-in page instead of a clear \"Choose a new password\" form. "
        "That was our mistake, not yours. The password-reset form is now fixed on the website. "
        "Please ignore the first invite email and use only the NEW password email we are sending."
    )

    # Measure
    start = pdf.get_y()
    pdf.set_font("Helvetica", "B", 10)
    title_h = 5
    pdf.set_font("Helvetica", "", 9.5)
    # rough height via multi_cell dry-run into a temp y
    y_probe = start + 3 + title_h
    pdf.set_xy(x0 + 3, y_probe)
    pdf.multi_cell(pdf.epw - 6, 4.8, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    end = pdf.get_y() + 3
    box_h = end - start

    pdf.set_y(start)
    pdf.set_fill_color(*APOLOGY_BG)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.35)
    pdf.rect(x0, start, pdf.epw, box_h, style="FD")
    pdf.set_xy(x0 + 3, start + 3)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BROWN)
    pdf.cell(pdf.epw - 6, title_h, safe(title), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(x0 + 3)
    pdf.set_font("Helvetica", "", 9.5)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(pdf.epw - 6, 4.8, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(start + box_h + 3)


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
    centered(pdf, "MEMBER NOTICE  |  SECOND INVITE", 5)
    pdf.ln(1.5)

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*BROWN)
    centered(pdf, "Members Portal - Fresh Password Links", 7)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    body(pdf, "Dear members,")
    pdf.ln(1)
    body(
        pdf,
        "Taunet Nelel has moved membership login to our new website. We are sending a second "
        "password email so every member can finish setting up their login on the new portal.",
    )
    pdf.ln(2)

    apology_box(pdf)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    body(pdf, "What to do now")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    for line in (
        "1. Check your inbox for a NEW email from members@taunetnelel.org (also check Spam / Junk).",
        "2. Use that NEW email only - do not reuse the first invite link.",
        "3. Tap \"Choose a new password\" or \"Set your password\".",
        "4. You should see the Choose a new password form - enter and confirm your password.",
        "5. Sign in at the members portal with that new password.",
    ):
        body(pdf, line)
    pdf.ln(2)

    pdf.set_fill_color(*BOX)
    x0 = pdf.l_margin
    y0 = pdf.get_y()
    box_lines = [
        "From:  Taunet Nelel <members@taunetnelel.org>",
        "Sign in:  https://taunetnelel.vercel.app/members/auth.html?tab=signin",
        "If the link expired: use Forgot password? on that page for a fresh link.",
    ]
    pdf.rect(x0, y0, pdf.epw, 20, style="F")
    pdf.set_xy(x0 + 3, y0 + 2.5)
    pdf.set_text_color(*BROWN)
    pdf.set_font("Helvetica", "", 9)
    for line in box_lines:
        pdf.set_x(x0 + 3)
        pdf.cell(pdf.epw - 6, 5, safe(line), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(y0 + 22)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    body(pdf, "Important")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "This does not change your membership status. Old website passwords will not work. "
        "If mail lands in Spam, mark it Not spam and add members@taunetnelel.org to Contacts. "
        "That helps future Taunet emails reach your Inbox.",
    )
    pdf.ln(2)

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    body(pdf, "Still stuck?")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "Confirm the committee has your current email, or write to info@taunetnelel.org "
        "and we will help you activate your login.",
    )
    pdf.ln(3)

    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(*MUTED)
    body(
        pdf,
        "Thank you for your patience - and again, we apologise for the dead end with the first invite.",
    )
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BROWN)
    body(pdf, "- Taunet Nelel Committee & IT")

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
