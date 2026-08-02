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

REPORT_DATE = date(2026, 8, 1)
REPORT_REVISION = "Rev C — password reset & member rebroadcast update"


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
        safe("Migration complete  |  Member access in progress  |  DNS cutover pending"),
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
            "Prepared by: Taunet Nelel IT Team"
        ),
        align="C",
    )
    pdf.ln(4)

    # Summary box
    pdf.set_fill_color(*WHITE)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.6)
    box_y = pdf.get_y()
    pdf.rect(22, box_y, pdf.w - 44, 92, style="DF")
    pdf.set_xy(28, box_y + 4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*BROWN)
    pdf.cell(0, 6, "Executive snapshot (1 August 2026)", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(28)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*DARK)
    snapshot = [
        "Public site + members portal live on Vercel + Supabase",
        "Preview: https://taunetnelel.vercel.app",
        "540 member records imported; committee admin + member dashboard LIVE",
        "Password reset form FIXED (Choose a new password + Continue step)",
        "Resend email live from members@taunetnelel.org (not noreply@)",
        "Second-wave password emails: 100 members sent today (0 failures)",
        "Member notice PDF updated with apology for first-invite dead end",
        "DNS cutover NOT done - www.taunetnelel.org still on WordPress",
        "NEXT: finish remaining password emails + committee UAT + DNS",
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

    # ----- Page 2: Done recently -----
    pdf.add_page()
    section_title(pdf, "1. Progress since last report")

    body(
        pdf,
        "The migration of the public website is complete. Recent work focused on "
        "member login access: fixing the password-reset experience and re-sending "
        "usable password links after the first invite left some members at a dead end.",
    )
    pdf.ln(1)

    subsection(pdf, "1.1 Password reset - FIXED")
    bullet(pdf, "Forgot password emails send via Resend API (reliable path)")
    bullet(pdf, "Members now land on a clear Choose a new password form")
    bullet(
        pdf,
        "New links use a Continue step so email scanners are less likely to burn the link",
    )
    bullet(pdf, "If a link has expired, the same screen offers Email me a fresh reset link")
    bullet(
        pdf,
        "Supabase Email OTP expiration should be set to 86400 seconds (24 hours) "
        "under Authentication > Sign In / Providers > Email",
    )
    pdf.ln(1)

    subsection(pdf, "1.2 Second-wave member emails (in progress)")
    bullet(pdf, "First invite: some members hit sign-in instead of a reset form - we apologise")
    bullet(pdf, "Member notice PDF updated with apology + clear steps (share on WhatsApp)")
    bullet(pdf, "File: docs/TAUNET-NELEL-MEMBER-PORTAL-INVITE-NOTICE.pdf")
    bullet(
        pdf,
        "Today: 100 fresh password emails sent successfully (From: members@taunetnelel.org)",
    )
    bullet(pdf, "Remaining imported members still to receive the second-wave email")
    pdf.ln(1)

    subsection(pdf, "1.3 Site / portal improvements also delivered")
    bullet(pdf, "Mobile navigation improved (public site + admin)")
    bullet(pdf, "Home page Events card shows live upcoming / recent events from Supabase")
    bullet(pdf, "Committee Forgot password available on the Members auth Committee tab")
    bullet(pdf, "Vercel domains prepared for taunetnelel.org / www (cutover not started)")

    # ----- Page 3: Delivered baseline -----
    pdf.add_page()
    section_title(pdf, "2. Already delivered (baseline)")

    subsection(pdf, "2.1 Public website and platform")
    bullet(pdf, "Live clone: https://taunetnelel.vercel.app")
    bullet(pdf, "Public pages, forms, gallery, events, sponsors wired to Supabase")
    bullet(pdf, "WordPress kept online as rollback until after domain cutover")
    pdf.ln(1)

    subsection(pdf, "2.2 Members area")
    bullet(pdf, "Unified Members page: Sign in / Join / Committee tabs")
    bullet(pdf, "Dashboard, announcements, resources, profile save")
    bullet(pdf, "Welfare registration path working")
    bullet(pdf, "BuddyBoss social features intentionally deferred (not required for go-live)")
    pdf.ln(1)

    subsection(pdf, "2.3 Member records")
    draw_table(
        pdf,
        ["Metric", "Count / note"],
        [
            ["Member import rows loaded", "540"],
            ["Association only", "205"],
            ["Welfare only", "22"],
            ["Both association + welfare", "313"],
            ["Earlier Auth invites", "Completed in batches (many already have Auth accounts)"],
            ["Second-wave password emails", "100 sent (1 Aug) - remainder pending"],
        ],
        [90, 84],
    )
    pdf.ln(4)

    subsection(pdf, "2.4 Committee admin")
    bullet(pdf, "Admin portal at /admin/ (PIN + committee email login path)")
    bullet(pdf, "Overview, events, sponsors, gallery, newsletter CSV, announcements")
    bullet(pdf, "Mobile admin navigation improved")

    # ----- Page 4: Remaining -----
    pdf.add_page()
    section_title(pdf, "3. Current systems map")

    draw_table(
        pdf,
        ["System", "URL / status"],
        [
            ["New public site (Vercel)", "https://taunetnelel.vercel.app  - LIVE preview"],
            ["Current public WordPress", "https://www.taunetnelel.org  - still live (DNS not cut over)"],
            ["New members area", "taunetnelel.vercel.app/members/auth.html  - LIVE"],
            ["Committee admin", "taunetnelel.vercel.app/admin/  - LIVE"],
            ["Member password email", "Resend from members@taunetnelel.org  - LIVE"],
            ["BuddyBoss portal (old)", "https://portal.taunetnelel.org  - not the new primary"],
            ["ClientClub / GHL portal", "https://members.taunetnelel.org  - legacy"],
            ["Supabase", "Connected - forms, auth, members, events, sponsors, newsletter"],
        ],
        [62, 112],
    )
    pdf.ln(5)

    section_title(pdf, "4. Remaining before go-live")

    body(
        pdf,
        "Finish these before pointing www.taunetnelel.org at Vercel.",
    )
    pdf.ln(1)

    draw_table(
        pdf,
        ["Item", "Status", "Owner note"],
        [
            [
                "Second-wave password emails",
                "IN PROGRESS",
                "100 done; send remaining members; share invite notice on WhatsApp",
            ],
            [
                "Email deliverability",
                "Watch",
                "Use members@; ask members to mark Not spam; strengthen DMARC when DNS allows",
            ],
            [
                "Committee UAT sign-off",
                "NEXT",
                "Checklist PDF: docs/TAUNET-NELEL-COMMITTEE-UAT-CHECKLIST.pdf",
            ],
            [
                "Online payments",
                "Not done",
                "Membership / welfare / event fees still offline or external for launch",
            ],
            [
                "BuddyBoss social rebuild",
                "Deferred",
                "Not required for go-live",
            ],
            [
                "Marketing newsletter sends",
                "Optional",
                "Signups captured; export CSV when ready",
            ],
            [
                "DNS cutover",
                "Last step",
                "Point www / apex to Vercel after UAT sign-off (guide: GO-LIVE-DNS.md)",
            ],
            [
                "Retire WordPress / old portals",
                "After go-live",
                "Keep 2-4 weeks rollback window",
            ],
        ],
        [48, 28, 98],
    )

    # ----- Page 5: Sequence + decision -----
    pdf.add_page()
    section_title(pdf, "5. Recommended sequence (from here)")

    steps = [
        (
            "Step 1 - Finish member password access (NOW)",
            [
                "Share TAUNET-NELEL-MEMBER-PORTAL-INVITE-NOTICE.pdf on WhatsApp",
                "Send remaining second-wave password emails (same Resend path)",
                "Spot-check: open NEW email > Continue > Choose a new password > sign in",
                "Set Supabase Email OTP expiration to 86400 (24 hours) if not already done",
            ],
        ),
        (
            "Step 2 - Committee UAT sign-off",
            [
                "Complete UAT checklist (admin, events, gallery, business hub, member login)",
                "Confirm ordinary members can sign in and open the dashboard",
                "Written approval before any DNS change",
            ],
        ),
        (
            "Step 3 - Payments decision",
            [
                "Agree payment provider path, or keep bank transfer for launch",
                "Fees already shown on membership / welfare pages",
            ],
        ),
        (
            "Step 4 - Domain cutover",
            [
                "Follow docs/supabase/GO-LIVE-DNS.md",
                "Point www.taunetnelel.org (and apex) to Vercel",
                "Keep Outlook mail MX and Resend DNS records intact",
            ],
        ),
        (
            "Step 5 - Stabilise then decommission",
            [
                "Monitor inbox / spam feedback for 1-2 weeks",
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

    section_title(pdf, "6. Message for members (summary)")
    body(
        pdf,
        "Portal emails come from members@taunetnelel.org. Please ignore the first invite "
        "if it did not show a password form. Use only the NEW password email, open it from "
        "Inbox (not Spam), tap Continue, then Choose a new password. Old website passwords "
        "will not work. Help: info@taunetnelel.org.",
        size=9,
    )
    pdf.ln(3)

    pdf.set_fill_color(*LIGHT)
    pdf.set_draw_color(*BROWN)
    y = pdf.get_y()
    pdf.rect(18, y, pdf.epw, 42, style="DF")
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
            "1) Note progress: password reset fixed; 100 second-wave emails sent; "
            "public site and portal remain on Vercel preview.\n"
            "2) Approve finishing the remaining password emails and WhatsApp notice.\n"
            "3) Approve committee UAT, then DNS cutover only after written sign-off "
            "(www.taunetnelel.org stays on WordPress until then)."
        ),
    )

    pdf.output(str(OUTPUT_FILE))
    print(f"Wrote {OUTPUT_FILE}")

    if LEGACY_OUTPUT.exists():
        LEGACY_OUTPUT.unlink()
        print(f"Removed legacy {LEGACY_OUTPUT.name}")


if __name__ == "__main__":
    build()
