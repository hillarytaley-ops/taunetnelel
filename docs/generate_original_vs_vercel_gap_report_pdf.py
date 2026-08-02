"""Generate Taunet Nelel original vs Vercel UI gap report PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

DOCS_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-ORIGINAL-VS-VERCEL-GAP-REPORT.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
DARK = (30, 30, 30)
MUTED = (80, 80, 80)


class ReportPDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "Taunet Nelel - Original vs Vercel Gap Report", align="L")
        self.ln(10)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2192", "->")
        .replace("\u2022", "-")
    )


def write_block(pdf: ReportPDF, text: str, height: float = 5.5) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, height, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def add_section(pdf: ReportPDF, title: str) -> None:
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*BROWN)
    write_block(pdf, title, 7)
    pdf.set_draw_color(*ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)


def add_body(pdf: ReportPDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(pdf, text)
    pdf.ln(2)


def add_bullets(pdf: ReportPDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    for item in items:
        write_block(pdf, f"-  {item}")
    pdf.ln(2)


def add_numbered(pdf: ReportPDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    for i, item in enumerate(items, start=1):
        write_block(pdf, f"{i}.  {item}")
    pdf.ln(2)


def build_pdf() -> None:
    pdf = ReportPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_left_margin(16)
    pdf.set_right_margin(16)
    pdf.add_page()

    pdf.ln(16)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BROWN)
    write_block(pdf, "Original Site vs Vercel Clone", 9)
    write_block(pdf, "UI Gap Report", 9)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    write_block(pdf, "What exists on the live WordPress site but is not on the Vercel rebuild", 6)
    write_block(pdf, "(excluding deliberate redesign changes)", 6)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(
        pdf,
        f"Prepared: {date.today().strftime('%d %B %Y')}\n"
        "Original (live): https://www.taunetnelel.org/\n"
        "Clone (Vercel): https://taunetnelel.vercel.app/\n"
        "Organisation: Taunet Nelel - Victoria",
        6,
    )

    add_section(pdf, "1. Purpose")
    add_body(
        pdf,
        "This report compares the original Taunet Nelel WordPress website with the "
        "static Vercel rebuild. It lists content and features that appear to be "
        "missing from the clone, while excluding changes that were made deliberately "
        "(new layout, merged pages, added sections, and the new members area).",
    )

    add_section(pdf, "2. Gaps still missing on Vercel")
    add_numbered(
        pdf,
        [
            "Site search - The original has a header search box (\"Search ...\"). The Vercel site has no site-wide search.",
            "Google Analytics / Tag Manager - The original loads Google tag ID GT-KV6C4FXF. The Vercel site does not include equivalent tracking. Analytics will not continue after cutover unless this is added.",
            "Visible \"DONATE\" CTA - RESOLVED: Vercel header now has a Donate button linking to sponsorship.html (same destination as the original top-bar DONATE).",
            "Member login destination - Original LOG IN goes to https://members.taunetnelel.org/ (separate members subdomain). Vercel uses members/login.html on the same site. If the old members portal still has live features (payments, welfare claims, documents, etc.), those may not yet be fully mirrored on Vercel.",
        ],
    )

    add_section(pdf, "3. Recommended follow-up for the gaps")
    add_bullets(
        pdf,
        [
            "Add site search (simple page index search, or later Supabase/content search).",
            "Add Google Analytics / Tag Manager (reuse GT-KV6C4FXF or a new GA4 property).",
            "Optionally restore a Donate CTA that links to Sponsorship or a future donation flow.",
            "Audit members.taunetnelel.org and list any live member features that still need rebuilding on Vercel + Supabase.",
        ],
    )

    add_section(pdf, "4. Not missing (deliberate or already covered)")
    add_body(
        pdf,
        "These differences were treated as intentional redesign or already covered on Vercel:",
    )
    add_bullets(
        pdf,
        [
            "Separate Culture / Language / Women / Men / Youth / Sports / Mental Health pages on WordPress -> merged into community.html on Vercel (core content largely present).",
            "Separate /team/ page -> about.html#team (team cards present).",
            "No public Contact page on original nav -> Contact page added on Vercel.",
            "No Business Hub on original -> Business Hub added on Vercel.",
            "Original social mainly Facebook/Instagram -> Vercel also includes TikTok, YouTube, and WhatsApp.",
            "Rich original home (membership plans, events blurb, sponsorship CTA) -> simplified home with section link grid on Vercel.",
            "Header / footer / hero visual redesign on Vercel.",
            "Welfare elevated to top-level navigation on Vercel.",
            "New members area on Vercel replacing the old WordPress-style login entry point (structure deliberate; feature parity still to confirm).",
        ],
    )

    add_section(pdf, "5. Page coverage summary")
    add_body(pdf, "Main public areas present on both sides (with different structure where noted):")
    add_bullets(
        pdf,
        [
            "Home",
            "About / Team",
            "Events",
            "Gallery",
            "Community programs (Culture, Language, Mental Health, Women, Men, Youth, Sports)",
            "Welfare",
            "Membership (including Basic $50 and Welfare Plus $300)",
            "Sponsorship",
            "Privacy Policy and Terms & Conditions",
            "Member Login / Join Us (different destinations; see gap 4 above)",
        ],
    )

    add_section(pdf, "6. Bottom line")
    add_body(
        pdf,
        "Core pages are covered on the Vercel rebuild. The real omissions to put back "
        "before or during cutover are:",
    )
    add_numbered(
        pdf,
        [
            "Site search",
            "Analytics / Tag Manager",
            "Optional Donate CTA (currently maps to Sponsorship on the original site)",
            "Confirmation that anything still live on members.taunetnelel.org is rebuilt on Vercel",
        ],
    )
    add_body(
        pdf,
        "Everything else reviewed in this pass falls under deliberate redesign or is "
        "already represented on the Vercel site.",
    )

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_pdf()
    print(f"Created: {OUTPUT_FILE}")
