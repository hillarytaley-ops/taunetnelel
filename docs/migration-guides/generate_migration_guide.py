"""Generate WordPress+MySQL to Supabase migration guide PDF for Taunet Nelel."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF


OUTPUT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = OUTPUT_DIR / "wordpress-mysql-to-supabase-migration-guide.pdf"


class GuidePDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "Taunet Nelel - WordPress/MySQL to Supabase Migration Guide", align="L")
        self.ln(10)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def add_title_page(pdf: GuidePDF) -> None:
    pdf.add_page()
    pdf.ln(35)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(30, 30, 30)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, 12, "WordPress + MySQL to Supabase\nMigration Guide", align="C")
    pdf.ln(8)
    pdf.set_font("Helvetica", "", 14)
    pdf.set_text_color(80, 80, 80)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, 8, "Taunet Nelel Community Website", align="C")
    pdf.ln(12)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(
        pdf.epw,
        6,
        f"Prepared: {date.today().strftime('%d %B %Y')}\n"
        "Scope: taunetnelel.org (WordPress) -> Supabase (Postgres + Auth + Storage)\n"
        "Repository: taunetnelel (Vercel static rebuild)",
        align="C",
    )


def add_section(pdf: GuidePDF, title: str) -> None:
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(139, 69, 19)
    write_block(pdf, title, 8)
    pdf.set_draw_color(210, 105, 30)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)


def add_subsection(pdf: GuidePDF, title: str) -> None:
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(40, 40, 40)
    write_block(pdf, title, 6)
    pdf.ln(1)


def write_block(pdf: GuidePDF, text: str, height: float = 5.5) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, height, text)


def add_body(pdf: GuidePDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    write_block(pdf, text)
    pdf.ln(2)


def add_bullets(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    for item in items:
        write_block(pdf, f"- {item}")
    pdf.ln(2)


def add_numbered(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    for index, item in enumerate(items, start=1):
        write_block(pdf, f"{index}. {item}")
    pdf.ln(2)


def add_code_block(pdf: GuidePDF, text: str) -> None:
    pdf.set_fill_color(245, 245, 245)
    pdf.set_font("Courier", "", 8.5)
    pdf.set_text_color(20, 20, 20)
    for line in text.splitlines():
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 4.8, f"  {line}", fill=True)
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 10)


def build_guide() -> None:
    pdf = GuidePDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_left_margin(14)
    pdf.set_right_margin(14)

    add_title_page(pdf)

    pdf.add_page()
    add_section(pdf, "1. What This Is")
    add_body(
        pdf,
        "taunetnelel.org runs on WordPress with MySQL. The new site on Vercel is static "
        "and has no real database yet. This guide shows the simple path to move your content, "
        "members, and forms into Supabase (one modern database + login system).",
    )
    add_body(pdf, "End result:")
    add_bullets(
        pdf,
        [
            "Website content stored in Supabase instead of WordPress",
            "Real member login (not browser demo data)",
            "Forms saved in a database (not email only)",
            "Photos and files stored in Supabase Storage",
        ],
    )

    add_section(pdf, "2. Before You Start")
    add_body(pdf, "Get these ready first:")
    add_bullets(
        pdf,
        [
            "WordPress hosting login (to export database and images)",
            "Supabase account (free tier is fine)",
            "GitHub and Vercel access for the taunetnelel site",
        ],
    )
    add_body(pdf, "Back up everything (do not skip):")
    add_numbered(
        pdf,
        [
            "Export the WordPress database as a .sql file from hosting/phpMyAdmin",
            "Download the wp-content/uploads folder (all images)",
            "Export pages from WordPress: Tools > Export",
            "Save copies in Google Drive or an external drive",
        ],
    )

    add_section(pdf, "3. Simple 7-Step Migration")
    add_body(
        pdf,
        "Follow these steps in order. Each step builds on the last.",
    )

    add_subsection(pdf, "Step 1 - Back up WordPress")
    add_body(
        pdf,
        "In your hosting panel, export the MySQL database and download all uploaded images. "
        "Keep the old site running until the new one is tested.",
    )

    add_subsection(pdf, "Step 2 - Create Supabase project")
    add_numbered(
        pdf,
        [
            "Go to supabase.com and create a new project",
            "Pick a region close to Australia",
            "Save your database password safely",
            "Copy the Project URL and API keys from Settings > API",
        ],
    )

    add_subsection(pdf, "Step 3 - Set up your tables")
    add_body(
        pdf,
        "In Supabase, create simple tables for what the site needs:",
    )
    add_bullets(
        pdf,
        [
            "profiles - member names, phone, membership type",
            "events - event title, date, location, image",
            "sponsors - organisation, tier (Platinum/Gold/etc.), logo, contact",
            "gallery_albums and gallery_photos - photo collections",
            "form_submissions - contact, membership, sponsorship enquiries",
            "businesses - business directory listings",
        ],
    )
    add_body(
        pdf,
        "Turn on Row Level Security (RLS) so members can only see their own private data.",
    )

    add_subsection(pdf, "Step 4 - Move content from WordPress")
    add_body(
        pdf,
        "Do not copy WordPress tables directly. Pull out only what you need:",
    )
    add_bullets(
        pdf,
        [
            "Pages and posts -> pages table",
            "Events -> events table",
            "Sponsors -> sponsors table",
            "Gallery images -> upload files, save paths in gallery_photos",
            "Business listings -> businesses table",
        ],
    )
    add_body(
        pdf,
        "A developer can write a one-time import script using the WordPress .sql export. "
        "Start with the most important content: home, about, events, sponsors, gallery.",
    )

    add_subsection(pdf, "Step 5 - Set up member login")
    add_numbered(
        pdf,
        [
            "Enable Email login in Supabase Authentication",
            "Add your site URL (taunetnelel.vercel.app and taunetnelel.org)",
            "Import member emails from WordPress",
            "Ask members to set a new password (WordPress passwords cannot move over directly)",
        ],
    )

    add_subsection(pdf, "Step 6 - Connect the website")
    add_numbered(
        pdf,
        [
            "Add Supabase keys to Vercel environment variables",
            "Update the site code to load events, gallery, and sponsors from Supabase",
            "Replace demo member login with real Supabase login",
            "Point contact and sponsorship forms to save into form_submissions",
            "Upload images to Supabase Storage (or keep on Vercel short-term)",
        ],
    )

    add_subsection(pdf, "Step 7 - Test, go live, then switch off WordPress")
    add_numbered(
        pdf,
        [
            "Test all pages, forms, login, and photo galleries on Vercel",
            "Fix any missing content or broken links",
            "Point taunetnelel.org to the new site",
            "Watch forms and logins for 1-2 weeks",
            "Archive WordPress backup, then cancel old hosting when confident",
        ],
    )

    add_section(pdf, "4. What Moves Where (Quick Map)")
    add_bullets(
        pdf,
        [
            "WordPress pages -> Supabase pages table",
            "WordPress users -> Supabase Auth + profiles",
            "WordPress media -> Supabase Storage",
            "Hardcoded events in the site code -> Supabase events table",
            "Sponsorship page sponsors -> Supabase sponsors table",
            "FormSubmit emails -> Supabase form_submissions table",
        ],
    )

    add_section(pdf, "5. Final Checklist")
    add_bullets(
        pdf,
        [
            "[ ] WordPress backup saved",
            "[ ] Supabase project created",
            "[ ] Content imported and pages look correct",
            "[ ] Member login works",
            "[ ] Forms save to the database",
            "[ ] Gallery images load",
            "[ ] Domain points to new site",
            "[ ] Old WordPress site archived",
        ],
    )

    add_section(pdf, "6. Rough Timeline")
    add_bullets(
        pdf,
        [
            "Week 1: Backups + create Supabase + set up tables",
            "Week 2: Import content and upload images",
            "Week 3: Connect website + member login + forms",
            "Week 4: Test with committee, go live, monitor",
        ],
    )

    add_section(pdf, "7. Helpful Links")
    add_bullets(
        pdf,
        [
            "Supabase: https://supabase.com/docs",
            "Taunet site repo: https://github.com/hillarytaley-ops/taunetnelel",
            "Live rebuild: https://taunetnelel.vercel.app",
        ],
    )

    add_body(
        pdf,
        "Tip: You do not need to move everything on day one. Start with backups, "
        "Supabase setup, and member login. Add events, gallery, and forms next.",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_guide()
    print(f"Created: {OUTPUT_FILE}")
