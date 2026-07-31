"""Generate detailed WordPress to Supabase migration plan PDF for Taunet Nelel."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF


OUTPUT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = OUTPUT_DIR / "WORDPRESS-TO-SUPABASE-MIGRATION-PLAN.pdf"


class GuidePDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(
            0,
            8,
            "Taunet Nelel - WordPress to Supabase Migration Plan",
            align="L",
        )
        self.ln(10)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def write_block(pdf: GuidePDF, text: str, height: float = 5.5) -> None:
    # fpdf core fonts are Latin-1; normalize common Unicode punctuation
    safe = (
        text.replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2022", "-")
        .replace("\u2192", "->")
        .replace("\u2500", "-")
        .replace("\u2502", "|")
        .replace("\u250c", "+")
        .replace("\u2510", "+")
        .replace("\u2514", "+")
        .replace("\u2518", "+")
        .replace("\u251c", "+")
        .replace("\u2524", "+")
        .replace("\u252c", "+")
        .replace("\u2534", "+")
        .replace("\u253c", "+")
        .replace("\u25cf", "*")
        .replace("\u2713", "[x]")
        .replace("\u2610", "[ ]")
        .replace("`", "'")
    )
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, height, safe)


def add_title_page(pdf: GuidePDF) -> None:
    pdf.add_page()
    pdf.ln(30)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(30, 30, 30)
    write_block(pdf, "WordPress to Supabase", 11)
    write_block(pdf, "Detailed Migration Plan", 11)
    pdf.ln(6)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(80, 80, 80)
    write_block(pdf, "Taunet Nelel Community Website", 8)
    pdf.ln(10)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(40, 40, 40)
    write_block(pdf, f"Prepared: {date.today().strftime('%d %B %Y')}")
    write_block(pdf, "Source: https://www.taunetnelel.org/")
    write_block(pdf, "Target UI: https://taunetnelel.vercel.app/")
    write_block(pdf, "Target backend: One Supabase project (PostgreSQL + Auth + Storage)")
    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(90, 90, 90)
    write_block(
        pdf,
        "WordPress (MySQL/MariaDB) -> Supabase (PostgreSQL) + static UI on Vercel. "
        "One Supabase project serves both the Vercel clone and the real domain after cutover.",
        5,
    )


def add_section(pdf: GuidePDF, title: str) -> None:
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(139, 69, 19)
    write_block(pdf, title, 7)
    pdf.set_draw_color(210, 105, 30)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(3)


def add_subsection(pdf: GuidePDF, title: str) -> None:
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(40, 40, 40)
    write_block(pdf, title, 6)


def add_body(pdf: GuidePDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    write_block(pdf, text)
    pdf.ln(1.5)


def add_bullets(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    for item in items:
        write_block(pdf, f"- {item}")
    pdf.ln(1.5)


def add_numbered(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    for index, item in enumerate(items, start=1):
        write_block(pdf, f"{index}. {item}")
    pdf.ln(1.5)


def add_checklist(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(30, 30, 30)
    for item in items:
        write_block(pdf, f"[ ] {item}")
    pdf.ln(1.5)


def add_table(pdf: GuidePDF, headers: list[str], rows: list[list[str]], col_widths: list[float] | None = None) -> None:
    if col_widths is None:
        width = pdf.epw / len(headers)
        col_widths = [width] * len(headers)

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(245, 240, 235)
    pdf.set_text_color(30, 30, 30)
    for header, width in zip(headers, col_widths):
        pdf.cell(width, 7, header, border=1, fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 8.5)
    for row in rows:
        # Estimate row height from tallest cell
        line_heights = []
        for value, width in zip(row, col_widths):
            lines = pdf.multi_cell(width, 4.5, value, border=0, dry_run=True, output="LINES")
            line_heights.append(max(1, len(lines)) * 4.5)
        row_h = max(line_heights + [7])

        if pdf.get_y() + row_h > pdf.h - 20:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 9)
            for header, width in zip(headers, col_widths):
                pdf.cell(width, 7, header, border=1, fill=True)
            pdf.ln()
            pdf.set_font("Helvetica", "", 8.5)

        x_start = pdf.l_margin
        y_start = pdf.get_y()
        for value, width in zip(row, col_widths):
            pdf.set_xy(x_start, y_start)
            pdf.multi_cell(width, 4.5, value, border=1)
            x_start += width
        pdf.set_y(y_start + row_h)
    pdf.ln(2)


def add_code_block(pdf: GuidePDF, text: str) -> None:
    pdf.set_fill_color(245, 245, 245)
    pdf.set_font("Courier", "", 8)
    pdf.set_text_color(20, 20, 20)
    for line in text.splitlines():
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(pdf.epw, 4.5, f"  {line}", fill=True)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)


def build_guide() -> None:
    pdf = GuidePDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_left_margin(14)
    pdf.set_right_margin(14)

    add_title_page(pdf)

    # 1 Purpose
    pdf.add_page()
    add_section(pdf, "1. Purpose")
    add_body(
        pdf,
        "Migrate the live Taunet Nelel website off WordPress onto:",
    )
    add_numbered(
        pdf,
        [
            "Frontend: the existing static clone (Vercel / this repo) as the new public UI",
            "Backend: one Supabase project for database, auth, forms, and media metadata",
        ],
    )
    add_body(
        pdf,
        "WordPress stays live until cutover. The Vercel clone and the real domain will "
        "share the same Supabase project when you go live.",
    )

    # 2 Clarification
    add_section(pdf, "2. Important clarification: WordPress vs PostgreSQL")
    add_table(
        pdf,
        ["System", "Database in practice"],
        [
            ["WordPress (taunetnelel.org)", "Almost always MySQL or MariaDB (not PostgreSQL)"],
            ["Supabase", "PostgreSQL (managed)"],
        ],
        [70, 112],
    )
    add_body(
        pdf,
        "Migration path: WordPress + MySQL/MariaDB -> Supabase (PostgreSQL) + static UI on Vercel.",
    )
    add_body(
        pdf,
        "Do not move WordPress tables as a full dump. Extract the content you need and load it "
        "into the Supabase schema already defined in this repository "
        "(supabase/migrations/001_initial_schema.sql).",
    )

    # 3 Architecture
    add_section(pdf, "3. Target architecture")
    add_code_block(
        pdf,
        "WordPress (taunetnelel.org)\n"
        "  MySQL + wp-content/uploads\n"
        "           |\n"
        "           | one-way export / import\n"
        "           v\n"
        "Supabase (one project)\n"
        "  Postgres + Auth + Storage\n"
        "           |\n"
        "     +-----+-----+\n"
        "     v           v\n"
        "Vercel clone   Real domain (after DNS)\n"
        "taunetnelel.vercel.app   www.taunetnelel.org",
    )
    add_body(pdf, "Rules during migration:")
    add_bullets(
        pdf,
        [
            "One Supabase project for both the unreal (Vercel) UI and the real site after cutover",
            "Do not point WordPress at Supabase",
            "Do not couple the clone to WordPress APIs",
            "Migration tooling talks WordPress/MySQL -> Supabase only",
        ],
    )

    # 4 Existing
    add_section(pdf, "4. What already exists in the clone")
    add_subsection(pdf, "4.1 Supabase schema (ready to run)")
    add_table(
        pdf,
        ["Table", "Purpose"],
        [
            ["form_submissions", "Contact, membership, sponsorship, welfare, events, support"],
            ["sponsors", "Sponsorship directory (tiers, logos, contacts)"],
            ["profiles", "Member profile (linked to Supabase Auth)"],
            ["events", "Upcoming / past events"],
            ["newsletter_subscribers", "Newsletter emails"],
            ["gallery_albums", "Gallery album metadata"],
            ["gallery_photos", "Photo rows + storage paths"],
            ["businesses", "Business directory"],
            ["business_news", "Business hub news"],
        ],
        [55, 127],
    )
    add_body(
        pdf,
        "RLS policies are included. Run 002_fix_security_warnings.sql after 001 if not already applied.",
    )

    add_subsection(pdf, "4.2 Clone UI status")
    add_table(
        pdf,
        ["Capability", "Status today"],
        [
            ["Static pages", "Done in HTML"],
            ["Forms -> Supabase", "Wired when config is set; else FormSubmit email"],
            ["Events content", "Still largely in events-phases.js"],
            ["Gallery", "Still largely in gallery-data.js"],
            ["Business directory", "Still largely in business-content.js"],
            ["Member area", "Demo / localStorage - replace with Supabase Auth"],
            ["Sponsors", "Seeded in SQL; page may still be partly static"],
        ],
        [55, 127],
    )

    add_subsection(pdf, "4.3 Live WordPress surface (inventory starting point)")
    add_bullets(
        pdf,
        [
            "Home, About, Events (upcoming + past), Membership, Sponsorship, Gallery",
            "Contact / enquiries, Join / Donate CTAs, Login",
            "Media under wp-content/uploads/",
            "Users / members (WP users or membership plugin)",
            "Forms (Contact Form 7, Gravity, etc.) and stored entries",
            "Business / community listings if present as posts or CPTs",
        ],
    )

    # 5 Principles
    add_section(pdf, "5. Migration principles")
    add_numbered(
        pdf,
        [
            "Content, not WordPress schema - map meaning into Supabase tables",
            "WordPress stays authoritative until cutover - final sync before DNS change",
            "Passwords do not transfer - members reset via Supabase Auth",
            "Media is a separate workstream - files to Storage + paths in DB",
            "Phased go-live - forms and read-only content first; Auth next; DNS last",
            "One Supabase project - Vercel and production share it; mark or clean test rows",
        ],
    )

    # 6 Phases
    pdf.add_page()
    add_section(pdf, "6. Phased plan")

    add_subsection(pdf, "Phase 0 - Access, inventory, backups (Week 0-1)")
    add_body(pdf, "Goals: Safe rollback and a complete list of what to move.")
    add_numbered(
        pdf,
        [
            "Collect access: WordPress admin, hosting, DNS, GitHub, Vercel, Supabase",
            "Full backup: MySQL dump, wp-content/uploads, Tools > Export (WXR), forms/plugins settings",
            "Store backups offline and label with date",
            "Inventory spreadsheet: Content type | WP location | Count | Target table | Owner | Priority",
            "Confirm DB engine (MySQL/MariaDB) and hosting expiry dates",
            "Decide cutover window (low-traffic weekend preferred)",
        ],
    )
    add_body(pdf, "Exit criteria:")
    add_checklist(
        pdf,
        [
            "SQL + uploads + WXR backups verified readable",
            "Inventory signed off by committee lead",
        ],
    )

    add_subsection(pdf, "Phase 1 - Supabase foundation (Week 1)")
    add_body(pdf, "Goals: Empty but production-ready backend shared by clone and future real site.")
    add_numbered(
        pdf,
        [
            "Confirm Supabase project region (prefer Australia-adjacent)",
            "Save DB password and project ref securely",
            "Run 001_initial_schema.sql and 002_fix_security_warnings.sql",
            "Create Storage buckets: media (public), gallery-member (private), private-docs (private)",
            "Prepare Auth: email on; Site URL = Vercel; add production domain later",
            "Fill supabase-config.js with Project URL + anon key only (never service_role in browser)",
            "Deploy to Vercel; submit a test contact form; confirm row in form_submissions",
        ],
    )
    add_body(pdf, "Exit criteria:")
    add_checklist(
        pdf,
        [
            "All tables + RLS present",
            "Test form visible in Table Editor",
            "Storage buckets created",
        ],
    )

    add_subsection(pdf, "Phase 2 - Extract and transform WordPress data (Week 1-2)")
    add_body(pdf, "Goals: Clean CSV/JSON ready for Supabase. Do not import raw wp_* tables.")
    add_body(pdf, "Extraction methods:")
    add_table(
        pdf,
        ["Method", "When to use"],
        [
            ["WordPress XML export", "Pages, posts, basic media URLs"],
            ["MySQL queries / CSV", "Custom post types, users, form entries"],
            ["Manual spreadsheet", "Small sponsor / business lists"],
            ["One-off import script", "Larger galleries or repeated imports"],
        ],
        [55, 127],
    )

    add_body(pdf, "Field mapping highlights:")
    add_bullets(
        pdf,
        [
            "Events -> events (id, title, summary, location, start_at/end_at, image_path, flags)",
            "Sponsors -> sponsors (name, tier, logo_url, contacts, sort_order) - reconcile seed data",
            "Gallery -> gallery_albums + gallery_photos (Storage paths)",
            "Business -> businesses / business_news",
            "Members -> Supabase Auth + profiles (passwords do not transfer)",
            "Form history (optional) -> form_submissions",
            "Static page copy: keep in clone HTML unless you add a CMS later",
        ],
    )
    add_body(pdf, "Media steps: download uploads, dedupe, upload to Storage with clear paths, rewrite URLs, keep redirect map.")
    add_body(pdf, "Exit criteria:")
    add_checklist(
        pdf,
        [
            "Transformed datasets reviewed (sample rows)",
            "Media uploaded for priority albums/events/sponsors",
            "Duplicate sponsor seed reconciled",
        ],
    )

    add_subsection(pdf, "Phase 3 - Load data into Supabase (Week 2)")
    add_body(pdf, "Import order: sponsors -> events -> gallery_albums/photos -> businesses/news -> Auth/profiles -> optional forms.")
    add_numbered(
        pdf,
        [
            "Use Table Editor CSV for small sets; service_role scripts only on a secure machine for bulk loads",
            "Validate counts: WP inventory vs Supabase count(*)",
            "Spot-check 10 random records (text, dates, image URLs)",
            "Freeze WordPress edits during final import, or plan a delta re-import",
        ],
    )
    add_body(pdf, "Exit criteria:")
    add_checklist(
        pdf,
        [
            "Row counts match agreed inventory",
            "Published flags correct",
            "Broken image paths empty for P0 content",
        ],
    )

    add_subsection(pdf, "Phase 4 - Member authentication migration (Week 2-3)")
    add_numbered(
        pdf,
        [
            "Export member emails + profile fields from WP",
            "Create Auth users via Admin API / invite emails (do not copy password hashes)",
            "Backfill profiles (plan, member number, renewals) after handle_new_user trigger",
            "Replace localStorage demo in members.js with Supabase Auth sessions",
            "Email members: new URL, set password / magic link, support contact",
            "Test register, login, logout, reset, profile, welfare-gated pages",
        ],
    )
    add_body(pdf, "Exit criteria:")
    add_checklist(
        pdf,
        [
            "Committee test accounts work end-to-end",
            "At least one real member completes invite flow in UAT",
        ],
    )

    add_subsection(pdf, "Phase 5 - Wire the clone UI to Supabase reads (Week 3)")
    add_numbered(
        pdf,
        [
            "Forms - confirm all data-supabase-form pages write successfully",
            "Events page - load from events table",
            "Sponsorship - load from sponsors",
            "Gallery - albums/photos from Supabase + Storage",
            "Business hub - businesses / business_news",
            "Newsletter - newsletter_subscribers",
            "Optionally keep FormSubmit as backup, then remove when stable",
        ],
    )

    add_subsection(pdf, "Phase 6 - Parallel run / UAT (Week 3-4)")
    add_body(pdf, "Keep WordPress live for the public. Committee UAT only on Vercel.")
    add_checklist(
        pdf,
        [
            "Home / About / Community copy",
            "Events list + enquiry form",
            "Membership + sponsorship forms",
            "Gallery view + download rules",
            "Member login + profile",
            "Business listings",
            "Contact form -> form_submissions",
            "Mailto / phone / social links",
            "Privacy / terms pages",
        ],
    )
    add_body(pdf, "Exit criteria: UAT sign-off; open P0 bugs = 0.")

    add_subsection(pdf, "Phase 7 - Cutover to real domain (Week 4)")
    add_numbered(
        pdf,
        [
            "Final data delta sync from WordPress -> Supabase",
            "Put WordPress in maintenance mode (or freeze publishing)",
            "Add www.taunetnelel.org (and apex) on Vercel",
            "Update DNS; lower TTL to 300s a day before cutover",
            "Add production Site URL + redirects in Supabase Auth",
            "Update hardcoded Vercel URLs in forms/emails to the real domain",
            "Verify HTTPS, forms, login, key pages on real domain",
            "Optional 301 redirects from old WP permalinks",
            "Monitor 48-72 hours",
            "Keep WordPress hosting for 2-4 weeks after cutover",
        ],
    )

    add_subsection(pdf, "Phase 8 - Decommission WordPress (Week 6+)")
    add_numbered(
        pdf,
        [
            "Final WP backup archived permanently",
            "Export remaining form/plugin data",
            "Cancel WP host only after committee confirmation",
            "Document Supabase billing, owners, and recovery contacts",
        ],
    )

    # 7 Same project
    pdf.add_page()
    add_section(pdf, "7. One Supabase project for real + Vercel")
    add_table(
        pdf,
        ["Environment", "URL", "Supabase"],
        [
            ["Unreal / staging UI", "taunetnelel.vercel.app", "Same project"],
            ["Real site (after cutover)", "www.taunetnelel.org", "Same project"],
        ],
        [50, 70, 62],
    )
    add_bullets(
        pdf,
        [
            "Test form submissions on Vercel appear in the same form_submissions table",
            "Mitigate with test+ emails, cleanup, or metadata.source later",
            "Do not delink Vercel from Supabase to go live - add the real domain to Vercel and Auth",
        ],
    )

    # 8 Roles
    add_section(pdf, "8. Roles and responsibilities")
    add_table(
        pdf,
        ["Role", "Responsibilities"],
        [
            ["Project lead", "Timeline, UAT sign-off, cutover decision"],
            ["Content owner", "Inventory accuracy, copy QA"],
            ["Technical", "Exports, imports, schema, UI wiring, DNS"],
            ["Committee tester", "Forms, login, events, gallery checks"],
        ],
        [45, 137],
    )

    # 9 Risks
    add_section(pdf, "9. Risks and mitigations")
    add_table(
        pdf,
        ["Risk", "Mitigation"],
        [
            ["Missing media after cutover", "Full uploads backup; Storage before DNS; URL map"],
            ["Member password friction", "Clear invite email; magic link; help contact"],
            ["SEO / broken old links", "Vercel redirects; map key WP URLs"],
            ["RLS blocking public content", "Test anon reads on Vercel before cutover"],
            ["Editors still updating WP", "Freeze window + final delta import"],
            ["service_role in frontend", "Only anon key in supabase-config.js"],
            ["Mixed test + real form data", "Test naming convention; cleanup query"],
        ],
        [70, 112],
    )

    # 10 Rollback
    add_section(pdf, "10. Rollback plan")
    add_body(pdf, "Before DNS cutover: keep using WordPress; fix Supabase/clone offline.")
    add_body(pdf, "After DNS cutover (within TTL window):")
    add_numbered(
        pdf,
        [
            "Point DNS back to WordPress host",
            "Re-enable WordPress if in maintenance mode",
            "Investigate issues on Vercel URL",
            "Re-attempt cutover only after sign-off",
        ],
    )
    add_body(pdf, "Rollback is primarily DNS/hosting, not deleting the Supabase database.")

    # 11 Timeline
    add_section(pdf, "11. Suggested timeline (4 weeks core)")
    add_table(
        pdf,
        ["Week", "Focus"],
        [
            ["1", "Backups, inventory, Supabase schema, Storage, form smoke test"],
            ["2", "Extract/transform/load events, sponsors, gallery, businesses"],
            ["3", "Auth + profiles; wire UI reads; committee UAT"],
            ["4", "Final sync, DNS cutover, monitor"],
            ["6+", "Archive and decommission WordPress"],
        ],
        [25, 157],
    )

    # 12 Done
    add_section(pdf, "12. Definition of done")
    add_numbered(
        pdf,
        [
            "www.taunetnelel.org serves the clone UI",
            "Public content served from Supabase (or accepted as static HTML)",
            "Forms persist in form_submissions",
            "Members authenticate via Supabase Auth with profiles populated",
            "WordPress is backed up and scheduled for decommission",
            "Phase 7 exit criteria are checked off",
        ],
    )

    # 13 Checklist
    add_section(pdf, "13. Working checklist")
    add_subsection(pdf, "Prep")
    add_checklist(
        pdf,
        [
            "WP admin + hosting + DNS access confirmed",
            "MySQL dump saved and verified",
            "wp-content/uploads downloaded",
            "WXR export saved",
            "Content inventory spreadsheet complete",
        ],
    )
    add_subsection(pdf, "Supabase")
    add_checklist(
        pdf,
        [
            "Project created (AU-near region)",
            "001 + 002 migrations applied",
            "Storage buckets created",
            "Auth URLs configured (Vercel + later production)",
            "supabase-config.js set; test form OK on Vercel",
        ],
    )
    add_subsection(pdf, "Data")
    add_checklist(
        pdf,
        [
            "Events imported",
            "Sponsors reconciled",
            "Gallery albums/photos + media uploaded",
            "Businesses / news imported",
            "Members invited + profiles backfilled",
        ],
    )
    add_subsection(pdf, "UI")
    add_checklist(
        pdf,
        [
            "Forms writing to Supabase",
            "Events page reads Supabase",
            "Sponsorship reads Supabase",
            "Gallery reads Supabase",
            "Member login uses Supabase Auth",
        ],
    )
    add_subsection(pdf, "Cutover")
    add_checklist(
        pdf,
        [
            "UAT signed off",
            "Final delta sync done",
            "Domain on Vercel",
            "DNS updated",
            "Production Auth redirects updated",
            "72h monitoring complete",
            "WP archived / hosting cancelled (later)",
        ],
    )

    # 14 Links
    add_section(pdf, "14. Reference links")
    add_bullets(
        pdf,
        [
            "Live WordPress: https://www.taunetnelel.org/",
            "Clone UI: https://taunetnelel.vercel.app/",
            "Supabase docs: https://supabase.com/docs",
            "Local setup: docs/supabase/SETUP.md",
            "Schema: supabase/migrations/001_initial_schema.sql",
            "Markdown source: docs/migration-guides/WORDPRESS-TO-SUPABASE-MIGRATION-PLAN.md",
        ],
    )

    # 15 Next
    add_section(pdf, "15. Next actions (immediate)")
    add_numbered(
        pdf,
        [
            "Complete Phase 0 backups and inventory against the live site",
            "Confirm MySQL access (phpMyAdmin or host DB tools)",
            "Ensure migrations 001 / 002 are applied on your Supabase project",
            "Connect Vercel clone forms (SETUP.md) and verify one submission",
            "Start Phase 2 with events + sponsors (highest public value, lower risk than full Auth)",
        ],
    )

    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(90, 90, 90)
    write_block(
        pdf,
        "Saved locally: docs/migration-guides/WORDPRESS-TO-SUPABASE-MIGRATION-PLAN.pdf",
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_guide()
    print(f"Created: {OUTPUT_FILE}")
