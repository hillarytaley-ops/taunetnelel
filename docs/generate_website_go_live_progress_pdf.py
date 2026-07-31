"""Generate Taunet Nelel website go-live progress PDF for committee presentation.

Supersedes the earlier Website Migration Status Report — migration of the
public site and core platform is complete; this report tracks remaining
work before domain cutover.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-WEBSITE-GO-LIVE-PROGRESS.pdf"
LEGACY_OUTPUT = DOCS_DIR / "TAUNET-NELEL-WEBSITE-MIGRATION-STATUS.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
CREAM = (252, 247, 240)
LIGHT = (248, 243, 236)
DARK = (35, 28, 22)
MUTED = (90, 75, 60)
WHITE = (255, 255, 255)

REPORT_DATE = date(2026, 7, 30)
REPORT_REVISION = "Rev B — evening update"


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
        self.cell(0, 4, "Taunet Nelel  |  Website Go-Live Progress Report", align="L")
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
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BROWN)
    pdf.multi_cell(0, 8, "WEBSITE GO-LIVE\nPROGRESS REPORT", align="C")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(*ACCENT)
    pdf.multi_cell(
        0,
        7,
        safe("Migration complete  |  Remaining work before domain cutover"),
        align="C",
    )
    pdf.ln(5)

    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        0,
        6,
        safe(
            "Prepared for the Taunet Nelel Committee\n"
            f"Report date: {REPORT_DATE.strftime('%d %B %Y')} ({REPORT_REVISION})\n"
            "Organisation: Taunet Nelel Incorporated - Victoria\n"
            "Replaces: Website Migration Status Report (28 July 2026)"
        ),
        align="C",
    )
    pdf.ln(6)

    # Summary box
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.6)
    box_y = pdf.get_y()
    pdf.rect(22, box_y, pdf.w - 44, 78, style="DF")
    pdf.set_xy(28, box_y + 4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 6, "Executive snapshot", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(28)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    snapshot = [
        "WordPress public-site migration is complete on Vercel + Supabase",
        "Live preview: https://taunetnelel.vercel.app",
        "540 member records imported (assoc / welfare / both)",
        "Members auth, dashboard, announcements, resources, profile save - LIVE",
        "Events (10) and sponsors (12) loaded from Supabase",
        "Newsletter signups save to Supabase; Admin can export CSV",
        "DNS cutover NOT done - www.taunetnelel.org still on WordPress",
        "NEXT: Custom SMTP (Resend) so bulk member invites can proceed",
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

    # ----- Page 2: Migration complete -----
    pdf.add_page()
    section_title(pdf, "1. Migration phase - COMPLETE")

    body(
        pdf,
        "The WordPress public website has been rebuilt and connected to the new "
        "platform. The committee can treat the migration itself as finished. "
        "What remains is go-live readiness (custom email, member access at scale, "
        "payments decision, and domain cutover).",
    )
    pdf.ln(1)

    subsection(pdf, "1.1 Public website (Vercel)")
    bullet(pdf, "Live clone: https://taunetnelel.vercel.app")
    bullet(pdf, "Public pages rebuilt as modern HTML from the WordPress public site")
    bullet(pdf, "Gallery curated (Most recent / Past events); leadership photos kept on About")
    bullet(pdf, "Forms (Contact, Membership, Sponsorship, Welfare, Events) save to Supabase")
    bullet(pdf, "Contact newsletter signup writes to newsletter_subscribers")
    pdf.ln(1)

    subsection(pdf, "1.2 Platform foundation (Supabase)")
    bullet(pdf, "Project connected; schema and security migrations applied")
    bullet(
        pdf,
        "Tables in use: form_submissions, profiles, member_imports, events, sponsors, "
        "gallery, newsletter_subscribers, announcements, member_resources",
    )
    bullet(pdf, "Association membership and Welfare membership kept separate in data model")
    pdf.ln(1)

    subsection(pdf, "1.3 Backups retained")
    bullet(pdf, "Full WordPress .wpress public-site backup retained locally")
    bullet(pdf, "Migration data pack under backups/migration-ready/")
    bullet(pdf, "WordPress kept online as rollback until after domain cutover")

    # ----- Page 3: Delivered -----
    pdf.add_page()
    section_title(pdf, "2. Delivered for go-live (current)")

    subsection(pdf, "2.1 Members area")
    bullet(pdf, "Unified Members page: Sign in / Join / Committee tabs")
    bullet(pdf, "Supabase Auth wired for member login and registration")
    bullet(pdf, "Dashboard announcements card (committee can publish from Admin)")
    bullet(pdf, "Member Resources library (handbook, language, culture pages + DB list)")
    bullet(pdf, "Profile edits save to Supabase profiles when signed in")
    bullet(pdf, "Welfare registration path and welfare gate behaviour fixed")
    bullet(pdf, "BuddyBoss social features (feed, groups, forums, chat) intentionally deferred")
    pdf.ln(1)

    subsection(pdf, "2.2 Member records")
    draw_table(
        pdf,
        ["Metric", "Count / note"],
        [
            ["Member import rows loaded", "540"],
            ["Association only", "205"],
            ["Welfare only", "22"],
            ["Both association + welfare", "313"],
            ["Invite emails (test batch)", "5 sent successfully"],
            ["Bulk invites", "Paused - waiting on custom SMTP"],
        ],
        [90, 84],
    )
    pdf.ln(4)

    subsection(pdf, "2.3 Committee admin")
    bullet(pdf, "PIN-secured admin portal at /admin/ (separate from member login)")
    bullet(pdf, "Live overview: enquiries, members (association / welfare filters)")
    bullet(pdf, "Events seed button, sponsors, gallery toggles, newsletter CSV export")
    bullet(pdf, "Announcements publish form for the members dashboard")
    pdf.ln(1)

    subsection(pdf, "2.4 Public / member content from database")
    draw_table(
        pdf,
        ["Item", "Status"],
        [
            ["Published events in Supabase", "Done - 10 events seeded"],
            ["Published sponsors in Supabase", "Done - 12 sponsors"],
            ["Newsletter capture + Admin CSV export", "Done (campaign tool still separate)"],
            ["Announcements + member resources", "Done - seeded and wired on site"],
            ["Gallery", "Curated static albums; Supabase enrich available"],
        ],
        [95, 79],
    )

    # ----- Page 4: Systems + remaining -----
    pdf.add_page()
    section_title(pdf, "3. Current systems map")

    draw_table(
        pdf,
        ["System", "URL / status"],
        [
            ["New public site (Vercel)", "https://taunetnelel.vercel.app  - LIVE preview"],
            ["Current public WordPress", "https://www.taunetnelel.org  - still live (DNS not cut over)"],
            ["New members area", "taunetnelel.vercel.app/members/auth.html  - LIVE"],
            ["Committee admin", "taunetnelel.vercel.app/admin/  - LIVE (PIN)"],
            ["BuddyBoss portal (old)", "https://portal.taunetnelel.org  - not the new primary"],
            ["ClientClub / GHL portal", "https://members.taunetnelel.org  - legacy broadcasts"],
            ["Supabase", "Connected - forms, auth, members, events, sponsors, newsletter"],
        ],
        [62, 112],
    )
    pdf.ln(5)

    section_title(pdf, "4. Remaining before go-live")

    body(
        pdf,
        "These items are intentionally after migration. They should be finished "
        "before pointing www.taunetnelel.org at Vercel.",
    )
    pdf.ln(1)

    draw_table(
        pdf,
        ["Item", "Status", "Owner note"],
        [
            [
                "Custom email / SMTP",
                "NEXT",
                "Resend + Supabase SMTP guide ready; needed before bulk invites",
            ],
            [
                "Bulk member access (~540)",
                "Paused",
                "5 test invites done; batch after SMTP is verified",
            ],
            [
                "Online payments",
                "Not done",
                "Membership / welfare / event fees still offline or external",
            ],
            [
                "BuddyBoss social rebuild",
                "Deferred",
                "Not required for go-live; core portal features already live",
            ],
            [
                "Marketing newsletter sends",
                "Optional",
                "Signups captured; export CSV to Brevo / MailerLite / Resend when ready",
            ],
            [
                "DNS cutover",
                "Last step",
                "Point www.taunetnelel.org to Vercel after UAT sign-off",
            ],
            [
                "Retire WordPress / old portals",
                "After go-live",
                "Keep 2-4 weeks rollback window",
            ],
        ],
        [48, 28, 98],
    )
    pdf.ln(3)
    body(
        pdf,
        "SMTP setup guide for the technical lead: docs/supabase/CUSTOM-SMTP-SETUP.md "
        "(Resend recommended: verify taunetnelel.org DNS, enable Supabase custom SMTP, "
        "raise rate limits, send 1 test invite).",
        size=9,
    )

    # ----- Page 5: Next steps + decision -----
    pdf.add_page()
    section_title(pdf, "5. Recommended sequence to go-live")

    steps = [
        (
            "Step 1 - Custom SMTP (NOW)",
            [
                "Create Resend account and verify taunetnelel.org (DNS records)",
                "Enable Custom SMTP in Supabase Auth (smtp.resend.com:465)",
                "Raise Auth email rate limits; send 1 test invite to a committee inbox",
            ],
        ),
        (
            "Step 2 - Member access at scale",
            [
                "Batch invites (e.g. 50 at a time) or self-register with list emails",
                "Keep association and welfare membership flags correct",
                "Committee smoke-test: sign in, dashboard, announcements, resources, welfare",
            ],
        ),
        (
            "Step 3 - Payments decision",
            [
                "Agree payment provider path (or keep bank transfer for launch)",
                "Document fees on membership / welfare pages (already shown publicly)",
            ],
        ),
        (
            "Step 4 - Committee UAT sign-off",
            [
                "Test forms, gallery, events, sponsors, login, admin on Vercel",
                "Mobile and desktop smoke test",
                "Written approval before DNS change",
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
                "Retire WordPress public hosting when stable",
                "Retire BuddyBoss / ClientClub only after members have adopted the new portal",
            ],
        ),
    ]

    for title, bullets in steps:
        subsection(pdf, title)
        for b in bullets:
            bullet(pdf, b)
        pdf.ln(1)

    section_title(pdf, "6. Gallery note (unchanged)")
    body(
        pdf,
        "Event Photos remains curated on the new site (6 albums / 38 on-site photos). "
        "Gala 2026 full photographer set (1,400+) stays on Pixieset with a 24-photo "
        "preview on the site. Leadership portraits stay on About / Meet Our Team.",
        size=9,
    )
    pdf.ln(3)

    pdf.set_fill_color(*LIGHT)
    pdf.set_draw_color(*BROWN)
    y = pdf.get_y()
    pdf.rect(18, y, pdf.epw, 40, style="DF")
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
            "1) Note that migration and core portal go-live features are complete.\n"
            "2) Approve proceeding immediately to custom SMTP (Resend) and then "
            "bulk member access.\n"
            "3) Confirm DNS cutover only after committee UAT sign-off "
            "(www.taunetnelel.org remains on WordPress until then)."
        ),
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")

    if LEGACY_OUTPUT.exists():
        LEGACY_OUTPUT.unlink()
        print(f"Removed legacy {LEGACY_OUTPUT.name}")


if __name__ == "__main__":
    build()
