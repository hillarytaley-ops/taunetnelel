"""Generate Taunet Nelel website migration status PDF for committee presentation."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-WEBSITE-MIGRATION-STATUS.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
GOLD = (184, 134, 11)
CREAM = (252, 247, 240)
LIGHT = (248, 243, 236)
DARK = (35, 28, 22)
MUTED = (90, 75, 60)
WHITE = (255, 255, 255)
GREEN = (46, 125, 50)
RED = (160, 50, 40)

REPORT_DATE = date(2026, 7, 28)


def safe(text: str) -> str:
    return (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2022", "-")
        .replace("\u2713", "Yes")
        .replace("\u2717", "No")
    )


class StatusPDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_fill_color(*BROWN)
        self.rect(0, 0, self.w, 10, style="F")
        self.set_fill_color(*ACCENT)
        self.rect(0, 10, self.w, 1.5, style="F")
        self.set_y(4)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*WHITE)
        self.cell(0, 4, "Taunet Nelel  |  Website Migration Status Report", align="L")
        self.ln(12)

    def footer(self) -> None:
        self.set_y(-14)
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.3)
        self.line(18, self.get_y(), self.w - 18, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(70, 5, "Confidential - Committee use", align="L")
        self.cell(0, 5, f"Page {self.page_no()}/{{nb}}", align="R")


def section_title(pdf: StatusPDF, text: str) -> None:
    pdf.ln(3)
    pdf.set_fill_color(*BROWN)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, f"  {safe(text)}", fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(3)
    pdf.set_text_color(*DARK)


def subsection(pdf: StatusPDF, text: str) -> None:
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 6, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*DARK)


def body(pdf: StatusPDF, text: str, size: int = 10) -> None:
    pdf.set_font("Helvetica", "", size)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(0, 5, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(1)


def bullet(pdf: StatusPDF, text: str, indent: float = 4) -> None:
    pdf.set_x(pdf.l_margin + indent)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(
        pdf.epw - indent,
        5,
        f"- {safe(text)}",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )


def status_pill(pdf: StatusPDF, label: str, ok: bool = True) -> None:
    colour = GREEN if ok else RED
    pdf.set_fill_color(*colour)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(28, 6, label, align="C", fill=True)
    pdf.set_text_color(*DARK)


def draw_table(
    pdf: StatusPDF,
    headers: list[str],
    rows: list[list[str]],
    col_widths: list[float],
) -> None:
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(*BROWN)
    pdf.set_text_color(*WHITE)
    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 7, safe(header), border=0, fill=True, align="C")
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*DARK)
    for r_i, row in enumerate(rows):
        pdf.set_fill_color(*(LIGHT if r_i % 2 == 0 else WHITE))
        # Estimate row height from longest wrapped cell
        line_h = 4.2
        max_lines = 1
        for i, cell in enumerate(row):
            lines = pdf.multi_cell(
                col_widths[i],
                line_h,
                safe(cell),
                dry_run=True,
                output="LINES",
            )
            max_lines = max(max_lines, len(lines))
        row_h = max(7.0, max_lines * line_h + 1.5)
        if pdf.get_y() + row_h > pdf.h - 20:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_fill_color(*BROWN)
            pdf.set_text_color(*WHITE)
            for i, header in enumerate(headers):
                pdf.cell(col_widths[i], 7, safe(header), border=0, fill=True, align="C")
            pdf.ln()
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*DARK)
            pdf.set_fill_color(*(LIGHT if r_i % 2 == 0 else WHITE))

        x0 = pdf.get_x()
        y0 = pdf.get_y()
        for i, cell in enumerate(row):
            pdf.set_xy(x0 + sum(col_widths[:i]), y0)
            pdf.rect(x0 + sum(col_widths[:i]), y0, col_widths[i], row_h, style="F")
            pdf.set_xy(x0 + sum(col_widths[:i]) + 1, y0 + 1)
            pdf.multi_cell(col_widths[i] - 2, line_h, safe(cell), align="L")
        pdf.set_xy(x0, y0 + row_h)


def build() -> None:
    pdf = StatusPDF(format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 16, 18)

    # ----- Cover -----
    pdf.add_page()
    pdf.set_fill_color(*CREAM)
    pdf.rect(0, 0, pdf.w, pdf.h, style="F")
    pdf.set_fill_color(*BROWN)
    pdf.rect(0, 0, pdf.w, 28, style="F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 28, pdf.w, 3, style="F")

    if LOGO_FILE.exists():
        pdf.image(str(LOGO_FILE), x=(pdf.w - 42) / 2, y=38, w=42)

    pdf.set_y(88)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(0, 9, "WEBSITE MIGRATION STATUS REPORT", align="C")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(0, 7, "WordPress to Vercel + Supabase", align="C")
    pdf.ln(6)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0,
        6,
        safe(
            "Prepared for the Taunet Nelel Committee\n"
            f"Report date: {REPORT_DATE.strftime('%d %B %Y')}\n"
            "Organisation: Taunet Nelel Incorporated - Victoria"
        ),
        align="C",
    )
    pdf.ln(10)

    # Summary box
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.6)
    box_y = pdf.get_y()
    pdf.rect(22, box_y, pdf.w - 44, 52, style="DF")
    pdf.set_xy(28, box_y + 4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 6, "Executive snapshot", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(28)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    snapshot = [
        "Public website clone is live on Vercel",
        "Contact and enquiry forms are saving to Supabase",
        "Event Photos gallery curated (6 albums; 38 photos on site)",
        "Gala 2026 full set: 1,400+ photos on Pixieset (24 preview on site)",
        "Members portal / BuddyBoss login not migrated yet",
        "Recommended next step: Member Auth + BuddyBoss import",
    ]
    for line in snapshot:
        pdf.set_x(28)
        pdf.cell(0, 5, safe(f"- {line}"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_y(-28)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0,
        5,
        safe('Motto: "Together We Stand, Divided We Fall."'),
        align="C",
    )

    # ----- Page 2: Migrated -----
    pdf.add_page()
    section_title(pdf, "1. What has been migrated")

    subsection(pdf, "1.1 Public website (Vercel)")
    bullet(pdf, "Live clone: https://taunetnelel.vercel.app")
    bullet(pdf, "Public pages rebuilt as modern HTML from the WordPress public site")
    bullet(pdf, "Gallery cleaned and organised (Most recent / Past events)")
    pdf.ln(1)

    subsection(pdf, "1.2 Forms connected to Supabase")
    body(pdf, "These forms write successfully to the form_submissions table:")
    for form in ("Contact", "Membership", "Sponsorship", "Welfare", "Events"):
        bullet(pdf, form)
    pdf.ln(1)

    subsection(pdf, "1.3 Backups retained")
    bullet(pdf, "Full WordPress .wpress public-site backup (~310 MB)")
    bullet(pdf, "Stored locally under backups/wordpress/")
    pdf.ln(1)

    subsection(pdf, "1.4 Migration data pack prepared")
    body(pdf, "Folder: backups/migration-ready/")
    for name in (
        "gallery_albums.csv",
        "gallery_photos.csv",
        "uploads_inventory.csv",
        "wp_pages.csv",
        "wp_attachments.csv",
        "import_gallery.sql",
        "gallery_static_albums.json",
        "SUMMARY.json and README.md",
    ):
        bullet(pdf, name)
    pdf.ln(1)

    subsection(pdf, "1.5 Supabase foundation")
    bullet(pdf, "Supabase project created and connected")
    bullet(pdf, "Schema migrations prepared (001 to 006)")
    bullet(pdf, "Public forms writing to form_submissions")
    pdf.ln(1)

    subsection(pdf, "1.6 Media copied into the new site")
    bullet(pdf, "53 images in assets/migrated-uploads/")
    bullet(pdf, "24 Gala 2026 preview photos in assets/gallery/gala-2026/")

    # ----- Page 3: Gallery counts -----
    pdf.add_page()
    section_title(pdf, "2. Gallery photo inventory (accurate counts)")

    body(
        pdf,
        "The Event Photos page shows curated albums. Some full photographer "
        "sets remain on external hosting (Pixieset / SmugMug). Counts below "
        "separate what is hosted on the new site from the full external albums.",
    )
    pdf.ln(2)

    subsection(pdf, "2.1 Most recent")
    draw_table(
        pdf,
        ["Album", "On site", "Full album", "Where full set lives"],
        [
            [
                "Taunet Nelel Gala 2026",
                "24 photos (preview)",
                "1,400+ photos",
                "Pixieset (PQ Photography)",
            ]
        ],
        [52, 32, 32, 58],
    )
    pdf.ln(4)

    subsection(pdf, "2.2 Past events")
    draw_table(
        pdf,
        ["Album", "On site", "Full album / notes"],
        [
            [
                "Taunet Nelel Gala 2025",
                "4 photos",
                "Full albums linked on SmugMug (Ian Kigen) - 2 album links",
            ],
            [
                "Annual General Meeting 2025",
                "2 photos",
                "On-site images only (no external full album linked)",
            ],
            [
                "Mr & Miss Taunet 2025",
                "3 photos",
                "Full album linked on Pixieset (Beauty Pageant)",
            ],
            [
                "Volleyball Tournament 2025",
                "2 photos",
                "On-site images only",
            ],
            [
                "Sports Day",
                "3 photos",
                "On-site images only",
            ],
        ],
        [55, 28, 91],
    )
    pdf.ln(5)

    subsection(pdf, "2.3 Totals")
    draw_table(
        pdf,
        ["Metric", "Count"],
        [
            ["Albums on Vercel gallery", "6"],
            ["Photos hosted on the Vercel site", "38"],
            ["Gala 2026 full photographer set", "1,400+ (external Pixieset)"],
            ["Images in migrated-uploads folder", "53"],
        ],
        [100, 74],
    )
    pdf.ln(4)
    body(
        pdf,
        "Note: Leadership / committee portraits were intentionally removed from "
        "Event Photos. Those belong on About / Meet Our Team, not the event gallery.",
        size=9,
    )

    # ----- Not migrated -----
    pdf.add_page()
    section_title(pdf, "3. What has NOT been migrated yet")

    body(
        pdf,
        "The items below are still on the original systems or not yet rebuilt "
        "on Vercel + Supabase.",
    )
    pdf.ln(1)

    items = [
        ("BuddyBoss members portal", "portal.taunetnelel.org - member community"),
        ("Member login / register / dashboard", "Supabase Auth not live yet"),
        ("Member profiles and membership records", "Must be exported from BuddyBoss"),
        ("Full Gala 2026 photo set in our storage", "Only 24-photo preview on site"),
        ("Full Gala 2025 / Pageant sets in our storage", "Still on SmugMug / Pixieset"),
        ("Events calendar from Supabase database", "Still largely static JS content"),
        ("Sponsors loaded from Supabase", "Not yet wired to live table"),
        ("Newsletter subscribers in active use", "Table ready; wiring pending"),
        ("Business directory data", "Not migrated"),
        ("DNS cutover to real domain", "www.taunetnelel.org still on WordPress"),
        ("Decommission WordPress / BuddyBoss", "Only after members area is stable"),
    ]
    draw_table(
        pdf,
        ["Outstanding item", "Current status"],
        [[a, b] for a, b in items],
        [78, 96],
    )

    # ----- Next steps -----
    pdf.add_page()
    section_title(pdf, "4. Recommended next steps")

    body(
        pdf,
        "Suggested sequence for committee approval. Do not cut over DNS until "
        "member login is proven.",
    )
    pdf.ln(2)

    steps = [
        (
            "Step 1 - Member authentication",
            [
                "Wire members/login, register, dashboard to Supabase Auth",
                "Replace the temporary localStorage demo login",
                "Committee test accounts first",
            ],
        ),
        (
            "Step 2 - BuddyBoss member import",
            [
                "Export members from portal.taunetnelel.org",
                "Invite members to set new passwords (do not copy old password hashes)",
                "Backfill profiles (plan, member number, renewals)",
            ],
        ),
        (
            "Step 3 - Finish public data wiring",
            [
                "Events from Supabase",
                "Sponsors from Supabase",
                "Newsletter signups",
            ],
        ),
        (
            "Step 4 - Committee UAT",
            [
                "Test forms, gallery, login, dashboard on Vercel",
                "Mobile and desktop smoke test",
                "Written sign-off before DNS change",
            ],
        ),
        (
            "Step 5 - Domain cutover",
            [
                "Point www.taunetnelel.org to Vercel",
                "Keep WordPress available as rollback for 2-4 weeks",
            ],
        ),
        (
            "Step 6 - Decommission old systems",
            [
                "Retire WordPress public site hosting when stable",
                "Retire BuddyBoss only after members area is fully adopted",
            ],
        ),
    ]

    for title, bullets in steps:
        subsection(pdf, title)
        for b in bullets:
            bullet(pdf, b)
        pdf.ln(1)

    section_title(pdf, "5. Systems reference")
    draw_table(
        pdf,
        ["System", "URL / note"],
        [
            ["New public site (Vercel)", "https://taunetnelel.vercel.app"],
            ["Current public WordPress", "https://www.taunetnelel.org"],
            ["BuddyBoss members portal", "https://portal.taunetnelel.org"],
            ["Legacy ClientClub portal", "https://members.taunetnelel.org (not primary)"],
            ["Supabase project", "Connected; forms active"],
        ],
        [70, 104],
    )
    pdf.ln(6)

    pdf.set_fill_color(*LIGHT)
    pdf.set_draw_color(*BROWN)
    y = pdf.get_y()
    pdf.rect(18, y, pdf.epw, 28, style="DF")
    pdf.set_xy(22, y + 3)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 5, "Committee decision requested", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(22)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    pdf.multi_cell(
        pdf.epw - 8,
        4.5,
        safe(
            "Approve proceeding to Step 1 (Member authentication) and Step 2 "
            "(BuddyBoss member import) before any DNS cutover of www.taunetnelel.org."
        ),
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    build()
