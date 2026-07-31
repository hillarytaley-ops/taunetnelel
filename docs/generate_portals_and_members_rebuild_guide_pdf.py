"""Generate Taunet Nelel portals and members rebuild guide PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

DOCS_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-PORTALS-AND-MEMBERS-REBUILD-GUIDE.pdf"

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
        self.cell(0, 8, "Taunet Nelel - Portals and Members Rebuild Guide", align="L")
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


def add_numbered(pdf: GuidePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    for i, item in enumerate(items, start=1):
        write_block(pdf, f"{i}.  {item}")
    pdf.ln(2)


def build_pdf() -> None:
    pdf = GuidePDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_left_margin(16)
    pdf.set_right_margin(16)
    pdf.add_page()

    pdf.ln(14)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BROWN)
    write_block(pdf, "Portals on taunetnelel.org", 9)
    write_block(pdf, "and What \"Rebuild\" Means", 9)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    write_block(pdf, "Public website vs members portal,", 6)
    write_block(pdf, "and migrating members to Vercel + Supabase", 6)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(
        pdf,
        f"Prepared: {date.today().strftime('%d %B %Y')}\n"
        "Public site: https://www.taunetnelel.org/\n"
        "Members portal: https://members.taunetnelel.org/\n"
        "Vercel rebuild: https://taunetnelel.vercel.app/\n"
        "Organisation: Taunet Nelel - Victoria",
        6,
    )

    add_section(pdf, "1. Key finding")
    add_body(
        pdf,
        "Taunet Nelel currently runs on two separate systems, not one WordPress portal:",
    )
    add_bullets(
        pdf,
        [
            "Public website (WordPress) at www.taunetnelel.org - marketing pages and public forms.",
            "Members portal (third-party ClientClub / GoHighLevel-style Client Portal) at members.taunetnelel.org - member login and member-only features.",
        ],
    )
    add_body(
        pdf,
        "JOIN US and LOG IN on the public site both send people to the members portal, "
        "not to WordPress.",
    )

    add_section(pdf, "2. Portal 1 - Public website (WordPress)")
    add_subsection(pdf, "2.1 What it is")
    add_body(
        pdf,
        "URL: https://www.taunetnelel.org/",
    )
    add_body(
        pdf,
        "This is the public marketing UI: Home, About/Team, Events, Gallery, Community "
        "pages, Membership, Welfare, Sponsorship, Privacy, and Terms.",
    )
    add_subsection(pdf, "2.2 Also present on this site")
    add_bullets(
        pdf,
        [
            "Divi contact / enquiry forms",
            "Site search",
            "WhatsApp click-to-chat plugin",
            "JOIN US / LOG IN buttons (these leave WordPress and open the members portal)",
        ],
    )
    add_subsection(pdf, "2.3 Can it migrate with the UI?")
    add_body(
        pdf,
        "Yes. This is what the Vercel static clone already largely covers.",
    )

    add_section(pdf, "3. Portal 2 - Members portal (ClientClub)")
    add_subsection(pdf, "3.1 What it is")
    add_body(
        pdf,
        "URL: https://members.taunetnelel.org/",
    )
    add_body(
        pdf,
        "This is a hosted ClientClub / GoHighLevel-style Client Portal (SPA loaded from "
        "clientclub.net). It is not part of the WordPress install. Observed build metadata "
        "includes Client Portal version around 3.2.x (May 2026) and a \"Kollab\" style "
        "manifest branding.",
    )
    add_subsection(pdf, "3.2 Typical modules for this kind of portal")
    add_bullets(
        pdf,
        [
            "Member login / account",
            "Membership or course-style content",
            "Community / groups",
            "Possibly affiliates, chat, and profile tools",
        ],
    )
    add_body(
        pdf,
        "Exact live modules should be confirmed with the committee (what members actually "
        "use today).",
    )
    add_subsection(pdf, "3.3 Can it migrate with the UI?")
    add_body(
        pdf,
        "Yes, as a rebuild - not as a WordPress export. You cannot dump ClientClub onto "
        "Vercel. You recreate the needed features in the Vercel members/ area plus "
        "Supabase Auth and database tables.",
    )

    add_section(pdf, "4. What \"rebuild\" means")
    add_body(
        pdf,
        "\"Rebuild\" means: you do not move the current members portal over as a package. "
        "You recreate the same member experience on your own stack.",
    )
    add_subsection(pdf, "4.1 Why it cannot just be \"migrated\"")
    add_body(
        pdf,
        "members.taunetnelel.org is not your WordPress site. It is a hosted product "
        "(ClientClub / similar), like renting an app:",
    )
    add_bullets(
        pdf,
        [
            "Login, screens, and data live on their platform.",
            "You mainly get a branded URL pointing at it.",
            "You cannot export that app and drop it onto Vercel.",
        ],
    )
    add_body(
        pdf,
        "So there is nothing to \"lift and shift.\"",
    )

    add_subsection(pdf, "4.2 What rebuild means in practice")
    add_body(
        pdf,
        "You build (or finish) your own members area that does the same jobs:",
    )
    add_bullets(
        pdf,
        [
            "Their login page -> members/login.html + Supabase Auth",
            "Their member home -> members/dashboard.html",
            "Their membership / content / welfare screens -> your membership, resources, welfare, and related pages",
            "Their member database -> Supabase (profiles, auth users, welfare records, etc.)",
        ],
    )
    add_body(
        pdf,
        "After cutover, members stop using ClientClub and start using your site.",
    )

    add_subsection(pdf, "4.3 What rebuild is not")
    add_bullets(
        pdf,
        [
            "Not copying ClientClub's code",
            "Not plugging ClientClub into Vercel",
            "Not a WordPress database dump of that portal",
        ],
    )

    add_subsection(pdf, "4.4 Simple analogy")
    add_bullets(
        pdf,
        [
            "Public site = your house (you can rebuild the rooms on Vercel).",
            "Members portal today = a rented apartment (ClientClub).",
            "Rebuild = build your own apartment next door (Supabase + members/), then move people in and cancel the rental.",
        ],
    )
    add_body(
        pdf,
        "The Vercel project already has the start of that apartment under members/. "
        "\"Rebuild\" means finishing those pages and wiring them to real Supabase login "
        "and data so they replace ClientClub.",
    )

    add_section(pdf, "5. How the Vercel members area maps today")
    add_bullets(
        pdf,
        [
            "Login / join -> members/login.html, members/register.html",
            "Member home -> members/dashboard.html",
            "Events -> members/events.html",
            "Membership plans -> members/membership.html",
            "Resources -> members/resources.html",
            "Welfare -> members/welfare.html",
            "Profile / support -> members/profile.html, members/support.html",
        ],
    )

    add_section(pdf, "6. What is not a separate public portal")
    add_bullets(
        pdf,
        [
            "WordPress admin (/wp-admin, /wp-login.php) - blocked publicly (403); staff-only; not for public migration.",
            "Shop / WooCommerce storefront - theme hints only; no live shop pages found.",
            "Donate portal - the DONATE button currently links to Sponsorship, not a separate donations system.",
        ],
    )

    add_section(pdf, "7. Migration recommendation (with the UI)")
    add_body(pdf, "Recommended approach:")
    add_bullets(
        pdf,
        [
            "Public WordPress pages - Yes, migrate with the UI (already largely on Vercel).",
            "Forms / enquiries / newsletter - Yes, migrate with Supabase tables.",
            "Members portal (members.taunetnelel.org) - Yes, as a rebuild: replace ClientClub with Vercel members/ + Supabase Auth.",
            "ClientClub courses / community / affiliates - Only if still needed; confirm with the committee.",
            "WordPress admin - No public migration; replace with simple admin tools (e.g. business admin / Supabase dashboard).",
        ],
    )

    add_section(pdf, "8. Recommended migration order (step by step)")
    add_body(
        pdf,
        "Migrate in this order. Each phase leaves the live site working, starts with the "
        "lowest-risk pieces, and only touches member logins once the foundations are proven.",
    )

    add_subsection(pdf, "Phase 0 - Foundations (before touching any pages)")
    add_bullets(
        pdf,
        [
            "Create / confirm the Supabase project and apply the database schema (the SQL migrations already in the repo).",
            "Set up the Vercel project with environment variables for the Supabase URL and anon key.",
            "Take a full backup/export of the WordPress site and note current ClientClub member list.",
        ],
    )
    add_body(
        pdf,
        "Why first: everything later depends on the database and hosting being ready, and a "
        "backup protects you if anything goes wrong.",
    )

    add_subsection(pdf, "Phase 1 - Static public pages")
    add_bullets(
        pdf,
        [
            "Home, About/Team, Events, Gallery, Community, Membership, Welfare, Sponsorship, Privacy, Terms.",
            "Close any remaining gaps against the original site (see the Original vs Vercel gap report).",
        ],
    )
    add_body(
        pdf,
        "Why now: zero risk - no logins, no data. This is already largely done on Vercel, so "
        "finishing it is quick and gives a complete public UI to build on.",
    )

    add_subsection(pdf, "Phase 2 - Public forms and enquiries into Supabase")
    add_bullets(
        pdf,
        [
            "Contact / enquiry forms -> Supabase tables (replaces Divi forms).",
            "Newsletter / interest sign-ups -> Supabase table.",
            "Optional: WhatsApp click-to-chat and site search equivalents.",
        ],
    )
    add_body(
        pdf,
        "Why now: forms are the first real data flowing into Supabase, but they need no "
        "member accounts - a safe way to prove the database wiring works.",
    )

    add_subsection(pdf, "Phase 3 - Authentication (Supabase Auth)")
    add_bullets(
        pdf,
        [
            "members/login.html and members/register.html wired to Supabase Auth.",
            "Password reset and basic profile record (profiles table).",
            "Invite / import existing members from the ClientClub list gathered in Phase 0.",
        ],
    )
    add_body(
        pdf,
        "Why now: login is the gateway every member feature depends on. Do it before any "
        "member pages so they all sit behind one working auth system.",
    )

    add_subsection(pdf, "Phase 4 - Core members area")
    add_bullets(
        pdf,
        [
            "members/dashboard.html (member home) and members/profile.html.",
            "Membership records and status (members/membership.html) backed by Supabase tables.",
        ],
    )

    add_subsection(pdf, "Phase 5 - Member features (rebuild of ClientClub)")
    add_bullets(
        pdf,
        [
            "Welfare requests and records (members/welfare.html).",
            "Member events and bookings (members/events.html).",
            "Resources / documents (members/resources.html) using Supabase Storage.",
            "Support (members/support.html).",
            "Only rebuild the ClientClub modules the committee confirms members actually use.",
        ],
    )

    add_subsection(pdf, "Phase 6 - Payments and admin")
    add_bullets(
        pdf,
        [
            "Membership fee and event payment instructions (bank transfer / PayID, per the payment options advice, including GST notes).",
            "Simple admin views for the committee (or use the Supabase dashboard) to manage members, welfare cases, and enquiries.",
        ],
    )
    add_body(
        pdf,
        "Why late: payments and admin depend on membership and events data existing first.",
    )

    add_subsection(pdf, "Phase 7 - Cutover and decommission")
    add_numbered(
        pdf,
        [
            "Run the new site in parallel and have a few committee members test end to end.",
            "Point JOIN US / LOG IN buttons at the new Vercel members area instead of members.taunetnelel.org.",
            "Switch the www.taunetnelel.org domain DNS to the Vercel site.",
            "Monitor for one to two weeks with WordPress and ClientClub still available as fallback.",
            "Cancel ClientClub and retire the WordPress hosting once members are stable on the new system.",
        ],
    )
    add_body(
        pdf,
        "Golden rule: do not cancel WordPress or ClientClub until the replacement phase is "
        "live, tested, and members have successfully logged in on the new system.",
    )

    add_section(pdf, "9. Recommended next step")
    add_numbered(
        pdf,
        [
            "Ask the committee which ClientClub features members actually use today (courses, community feed, files, payments, welfare, etc.).",
            "List only those features as rebuild requirements.",
            "Finish the matching Vercel members pages and connect them to Supabase Auth and data.",
            "Cut over JOIN US / LOG IN from members.taunetnelel.org to the new Vercel members area.",
            "Cancel or pause the ClientClub portal once members are stable on the new system.",
        ],
    )

    add_section(pdf, "10. Bottom line")
    add_body(
        pdf,
        "Migrate the public UI and the members portal together, but treat the members "
        "portal as a ClientClub replacement, not a WordPress migration. Rebuild means "
        "recreating member login and member features on Vercel + Supabase so Taunet Nelel "
        "owns the portal instead of renting it.",
    )

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_pdf()
    print(f"Created: {OUTPUT_FILE}")
