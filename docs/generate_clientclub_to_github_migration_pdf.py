"""Generate BuddyBoss portal -> GitHub / Vercel / Supabase migration PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

DOCS_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-CLIENTCLUB-TO-GITHUB-MIGRATION.pdf"
# Keep filename stable so existing local links still open; content corrected below.
# Prefer opening this same path after regenerate.

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
DARK = (30, 30, 30)
MUTED = (80, 80, 80)


class GuidePDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(
            0,
            8,
            "Taunet Nelel - BuddyBoss Portal to GitHub / Vercel / Supabase",
            align="L",
        )
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


def write_block(pdf: GuidePDF, text: str, height: float = 5.5) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, height, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def add_section(pdf: GuidePDF, title: str) -> None:
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*BROWN)
    write_block(pdf, title, 7)
    pdf.set_draw_color(*ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)


def add_subsection(pdf: GuidePDF, title: str) -> None:
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, title, 6)
    pdf.ln(1)


def add_body(pdf: GuidePDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(pdf, text)
    pdf.ln(2)


def add_bullets(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    for item in items:
        write_block(pdf, f"-  {item}")
    pdf.ln(2)


def build_pdf() -> None:
    pdf = GuidePDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_left_margin(16)
    pdf.set_right_margin(16)
    pdf.add_page()

    pdf.ln(12)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BROWN)
    write_block(pdf, "BuddyBoss Member Portal", 9)
    write_block(pdf, "Step-by-step Migration to", 9)
    write_block(pdf, "GitHub + Vercel + Supabase", 9)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    write_block(pdf, "Data source: portal.taunetnelel.org (BuddyBoss)", 6)
    write_block(pdf, "Target: GitHub repo members/ + Supabase + Vercel", 6)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(
        pdf,
        f"Prepared: {date.today().strftime('%d %B %Y')}\n"
        "CORRECTED SOURCE: https://portal.taunetnelel.org/\n"
        "Platform: BuddyBoss Platform + BuddyBoss Theme + MemberPress (WordPress)\n"
        "GitHub: https://github.com/hillarytaley-ops/taunetnelel (branch main)\n"
        "Vercel rebuild: https://taunetnelel.vercel.app/\n"
        "Organisation: Taunet Nelel - Victoria",
        6,
    )

    add_section(pdf, "1. Correction - which portal to migrate from")
    add_body(
        pdf,
        "This guide has been corrected. Migration of member data is from "
        "portal.taunetnelel.org, not members.taunetnelel.org.",
    )
    add_bullets(
        pdf,
        [
            "Current / correct source: https://portal.taunetnelel.org/ - Taunet Nelel Member Portal on BuddyBoss (WordPress).",
            "Verified live: BuddyBoss Platform (buddyboss-platform plugin, bp-nouveau), BuddyBoss Theme, MemberPress, BuddyBoss REST API (buddyboss/v1).",
            "Login page title: \"Taunet Nelel Member Portal\" with slogan \"Ongepe tai tugul\".",
            "Legacy / separate URL: https://members.taunetnelel.org/ still resolves to ClientClub / GoHighLevel. Do not use that as the data source for this migration unless the committee confirms leftover data there.",
        ],
    )

    add_section(pdf, "2. What BuddyBoss is doing on portal.taunetnelel.org")
    add_body(
        pdf,
        "BuddyBoss is a WordPress community / membership platform. On the Taunet Nelel "
        "member portal it provides (among other BuddyBoss REST modules observed live):",
    )
    add_bullets(
        pdf,
        [
            "Member login / WordPress accounts (wp-login gated; bp-auth)",
            "Activity feed (posts, comments, favorites)",
            "Groups and group membership",
            "Forums / topics",
            "Documents and media / albums",
            "Friends / connections",
            "Account settings and invites",
            "Memberships via MemberPress (paid / plan membership alongside BuddyBoss)",
        ],
    )
    add_body(
        pdf,
        "Important: BuddyBoss itself cannot be installed \"on\" Supabase. You export "
        "member and content data, then rebuild the features you still need under the "
        "Vercel members/ pages + Supabase Auth and tables.",
    )

    add_section(pdf, "3. What already exists in GitHub")
    add_body(
        pdf,
        "Repo github.com/hillarytaley-ops/taunetnelel (branch main) already has a "
        "members portal skeleton:",
    )
    add_bullets(
        pdf,
        [
            "9 pages under members/: login, register, dashboard, profile, membership, welfare, events, resources, support",
            "Supabase SQL migrations under supabase/migrations/",
            "assets/js/supabase-init.js for connecting the front end to Supabase",
        ],
    )
    add_body(
        pdf,
        "\"Migrating to GitHub\" means finishing this rebuild, importing BuddyBoss / "
        "MemberPress data into Supabase, and cutting DNS / links over - not copying "
        "the BuddyBoss plugin into the repo.",
    )

    add_section(pdf, "4. Step-by-step migration order")

    add_subsection(pdf, "Step 1 - Export data from portal.taunetnelel.org (BuddyBoss)")
    add_body(
        pdf,
        "Log in as WordPress / BuddyBoss admin on portal.taunetnelel.org and export:",
    )
    add_bullets(
        pdf,
        [
            "WordPress users (Users export or a users CSV plugin) - emails, names, roles.",
            "MemberPress members / subscriptions (plans, status, expiry) if used for paid membership.",
            "BuddyBoss profile fields, groups, documents / media you still need (export tools, plugins, or SQL dump of BuddyBoss tables bp_* / bb_* from the portal database).",
            "Keep all exports safe - this is the seed data for Supabase.",
        ],
    )
    add_body(
        pdf,
        "Confirm with the committee which BuddyBoss modules members actually use "
        "(activity, groups, forums, documents, etc.). Only migrate those.",
    )

    add_subsection(pdf, "Step 2 - Apply the database schema to Supabase")
    add_body(
        pdf,
        "Run supabase/migrations/001_initial_schema.sql and "
        "002_fix_security_warnings.sql against your Supabase project (SQL Editor or "
        "supabase db push). Extend the schema only for BuddyBoss features you keep "
        "(e.g. groups, documents, activity) if those tables are not already covered.",
    )

    add_subsection(pdf, "Step 3 - Wire the members pages to Supabase Auth")
    add_body(
        pdf,
        "Connect members/login.html and members/register.html to Supabase Auth via "
        "assets/js/supabase-init.js (sign-in, sign-up, forgot-password). Protect other "
        "members pages so visitors without a session are redirected to login - matching "
        "the gated BuddyBoss portal behaviour.",
    )

    add_subsection(pdf, "Step 4 - Import members from BuddyBoss into Supabase")
    add_body(
        pdf,
        "Use the user / MemberPress exports from Step 1 to create users in Supabase Auth "
        "(dashboard invite or admin API script) and matching rows in profiles / "
        "memberships tables. Members receive a \"set your password\" email - normal when "
        "leaving WordPress passwords behind.",
    )
    add_body(
        pdf,
        "Then import only the confirmed BuddyBoss content (groups, files, etc.) into the "
        "matching Supabase tables / Storage buckets.",
    )

    add_subsection(pdf, "Step 5 - Commit and push to GitHub")
    add_body(
        pdf,
        "Commit finished members pages and config to main and push to origin. Vercel "
        "deploys from this repo, so pushes update taunetnelel.vercel.app. That is the "
        "migration to GitHub: the portal becomes code you own.",
    )

    add_subsection(pdf, "Step 6 - Test in parallel")
    add_body(
        pdf,
        "Leave portal.taunetnelel.org (BuddyBoss) running. Have 2-3 committee members "
        "log in on the Vercel members area and test dashboard, profile, membership, "
        "welfare, and any rebuilt BuddyBoss features. Fix issues before cutover.",
    )

    add_subsection(pdf, "Step 7 - Cut over links and DNS")
    add_bullets(
        pdf,
        [
            "On the public site (www.taunetnelel.org), point JOIN US / LOG IN (and any links to the member portal) at the new Vercel members URLs - or at portal.taunetnelel.org once that subdomain is repointed.",
            "In DNS / Vercel: add portal.taunetnelel.org as a domain on the Vercel project, then change the portal DNS records from the current BuddyBoss WordPress host to Vercel (e.g. cname.vercel-dns.com).",
            "After cutover, portal.taunetnelel.org should open your GitHub-hosted members rebuild, not BuddyBoss.",
        ],
    )

    add_subsection(pdf, "Step 8 - Decommission BuddyBoss hosting")
    add_body(
        pdf,
        "Run 1-2 weeks in parallel. Confirm members log in successfully on the new "
        "system, then cancel or archive the BuddyBoss / WordPress hosting for "
        "portal.taunetnelel.org.",
    )
    add_body(
        pdf,
        "Golden rule: do not cancel BuddyBoss until real members have successfully "
        "logged in on the new portal.",
    )
    add_body(
        pdf,
        "Separately decide what to do with members.taunetnelel.org (ClientClub) - "
        "retire it if unused, after confirming no unique data remains there.",
    )

    add_section(pdf, "5. Who does what")
    add_body(pdf, "Committee / admin access required:")
    add_bullets(
        pdf,
        [
            "Step 1 - Export users, MemberPress, and BuddyBoss data from portal.taunetnelel.org.",
            "Step 2 - Apply / approve Supabase schema (if you hold the project).",
            "Step 7 - Public-site link updates and portal.taunetnelel.org DNS change.",
            "Step 8 - Cancel BuddyBoss / WordPress portal hosting after stable cutover.",
        ],
    )
    add_body(pdf, "Code work in the GitHub repo:")
    add_bullets(
        pdf,
        [
            "Step 3 - Wire login / register / session protection to Supabase Auth.",
            "Step 4 - Import scripts and map BuddyBoss / MemberPress fields to Supabase.",
            "Step 5 - Commit and push for Vercel deploy.",
            "Step 6 - Support parallel testing and fixes.",
        ],
    )

    add_section(pdf, "6. Bottom line")
    add_body(
        pdf,
        "You are currently on BuddyBoss at portal.taunetnelel.org. Migrate member and "
        "needed community data from that portal into Supabase, finish the members/ "
        "rebuild in GitHub, deploy via Vercel, then repoint portal.taunetnelel.org. "
        "Do not treat members.taunetnelel.org (ClientClub) as the primary source unless "
        "the committee confirms leftover data there.",
    )

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))

    # Also write a clearly named copy so the corrected title is easy to find.
    alt = DOCS_DIR / "TAUNET-NELEL-BUDDYBOSS-PORTAL-TO-GITHUB-MIGRATION.pdf"
    pdf.output(str(alt))
    print(f"Also created: {alt}")


if __name__ == "__main__":
    build_pdf()
    print(f"Created: {OUTPUT_FILE}")
