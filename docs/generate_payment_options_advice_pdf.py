"""Generate Taunet Nelel payment options advice PDF."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

DOCS_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-PAYMENT-OPTIONS-ADVICE.pdf"

BROWN = (92, 46, 16)
ACCENT = (196, 98, 28)
DARK = (30, 30, 30)
MUTED = (80, 80, 80)


class AdvicePDF(FPDF):
    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "Taunet Nelel - Website Payment Options Advice", align="L")
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
    )


def write_block(pdf: AdvicePDF, text: str, height: float = 5.5) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, height, safe(text), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def add_section(pdf: AdvicePDF, title: str) -> None:
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*BROWN)
    write_block(pdf, title, 7)
    pdf.set_draw_color(*ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)


def add_body(pdf: AdvicePDF, text: str) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(pdf, text)
    pdf.ln(2)


def add_bullets(pdf: AdvicePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    for item in items:
        write_block(pdf, f"-  {item}")
    pdf.ln(2)


def add_numbered(pdf: AdvicePDF, items: list[str]) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    for i, item in enumerate(items, start=1):
        write_block(pdf, f"{i}.  {item}")
    pdf.ln(2)


def build_pdf() -> None:
    pdf = AdvicePDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_left_margin(16)
    pdf.set_right_margin(16)
    pdf.add_page()

    # Title
    pdf.ln(18)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*BROWN)
    write_block(pdf, "Website Payment Options", 10)
    write_block(pdf, "Advice for Taunet Nelel", 10)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*MUTED)
    write_block(pdf, "Integrating payments without Stripe-style gateways,", 6)
    write_block(pdf, "including GST for membership fees and event bookings", 6)
    pdf.ln(4)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*DARK)
    write_block(
        pdf,
        f"Prepared: {date.today().strftime('%d %B %Y')}\n"
        "Organisation: Taunet Nelel - Victoria\n"
        "Website: www.taunetnelel.org",
        6,
    )

    add_section(pdf, "1. Key point")
    add_body(
        pdf,
        "For a community website like Taunet Nelel (Australia), true card payments "
        "with no third party is not realistic. Banks and card networks always sit "
        "in the middle for debit and credit cards.",
    )
    add_body(
        pdf,
        "What you can do is avoid Stripe-style payment platforms and use "
        "bank-direct methods, or Australian bank/merchant options instead.",
    )

    add_section(pdf, "2. Closest to \"no third party\"")
    add_body(
        pdf,
        "These run through your organisation's bank account, with little or no "
        "payment-platform fee:",
    )
    add_bullets(
        pdf,
        [
            "Bank transfer / EFT - Members pay to your BSB and account number. Best for membership fees and welfare levies.",
            "PayID - Members pay to your PayID (email, mobile, or ABN). Simple and popular in Australia.",
            "In-person cash or cheque - At events or via the committee. Offline only.",
        ],
    )
    add_body(
        pdf,
        "On the website you would show payment details (or email an invoice) and "
        "mark the member as paid after the Treasurer confirms the deposit. That "
        "matches how many welfare and community associations already operate.",
    )

    add_section(pdf, "3. Card payments without Stripe")
    add_body(
        pdf,
        "These still involve a processor or bank, but are not Stripe:",
    )
    add_bullets(
        pdf,
        [
            "Your bank's merchant facility (CBA, NAB, Westpac, ANZ, Bendigo, and similar).",
            "Australian gateways such as Tyro, Windcave, or Ezidebit - still third parties, often better suited to local not-for-profits.",
        ],
    )
    add_body(
        pdf,
        "Important: You cannot safely take raw card numbers on your own website. "
        "PCI DSS rules require a compliant bank or gateway.",
    )

    add_section(pdf, "4. Methods to treat carefully")
    add_bullets(
        pdf,
        [
            "Afterpay, Zip Pay, Klarna - These are third-party Buy Now Pay Later services. They add cost and complexity.",
            "PayPal / Square / Stripe - Convenient, but they are third-party platforms of the type you asked to avoid.",
        ],
    )

    add_section(pdf, "5. GST on association membership fees (Victoria / Australia)")
    add_body(
        pdf,
        "Membership fees can attract GST in Victoria, but only if the association is "
        "registered for GST (or required to be). Victoria follows the same ATO GST "
        "rules as the rest of Australia. There is no separate Victorian GST on membership.",
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "5.1 Quick guide", 6)
    pdf.ln(1)
    add_bullets(
        pdf,
        [
            "Not GST-registered (and not required to register) - No. Do not charge GST on membership fees.",
            "GST-registered - Usually yes. Membership is generally a taxable supply (10% GST).",
            "Endorsed charity + fee meets ATO \"nominal consideration\" tests - Possibly GST-free in limited cases (special rules; get advice).",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "5.2 Why GST often applies when registered", 6)
    pdf.ln(1)
    add_body(
        pdf,
        "The ATO treats a membership fee as payment for the rights and benefits of "
        "membership (even if nothing tangible is handed over). That is normally a "
        "taxable supply once the organisation is GST-registered.",
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "5.3 GST registration threshold (NFPs)", 6)
    pdf.ln(1)
    add_bullets(
        pdf,
        [
            "For many not-for-profits, compulsory GST registration applies when GST turnover is $150,000 or more.",
            "Below that threshold, registration is optional.",
            "Membership fees form part of GST turnover calculations when assessing whether registration is required.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "5.4 Practical steps for Taunet Nelel", 6)
    pdf.ln(1)
    add_numbered(
        pdf,
        [
            "Confirm with the Treasurer or accountant whether Taunet Nelel Incorporated is GST-registered.",
            "If not registered - show membership fees (including welfare membership) without GST.",
            "If registered - include GST in membership fees, or show exclusive price + GST clearly on the website.",
            "Do not assume welfare or community membership is automatically GST-free.",
        ],
    )
    add_body(
        pdf,
        "This is general guidance from ATO principles, not tax advice. Confirm GST "
        "status and membership treatment with Taunet Nelel's accountant or registered "
        "tax agent before publishing fees on the website.",
    )

    add_section(pdf, "6. GST for events and event bookings")
    add_body(
        pdf,
        "Event tickets and bookings are different from membership fees or welfare "
        "contributions. If Taunet Nelel sells tickets (gala, dinner, sports day, "
        "cultural night, etc.), GST may apply depending on whether the organisation "
        "is registered for GST with the ATO.",
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.1 First check: GST registration", 6)
    pdf.ln(1)
    add_bullets(
        pdf,
        [
            "If Taunet Nelel is NOT registered for GST - do not charge GST on tickets. Show ticket prices as GST-free / no GST.",
            "If Taunet Nelel IS registered for GST - ticket sales are usually a taxable supply and GST (10%) generally applies unless a specific ATO exemption applies.",
            "Not-for-profit GST registration threshold in Australia is commonly $150,000 annual turnover (confirm current ATO rules for your entity type).",
            "Committee / Treasurer should confirm GST status with the association's bookkeeper or accountant before publishing ticket prices.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.2 How to show ticket prices on the website", 6)
    pdf.ln(1)
    add_body(
        pdf,
        "Always state clearly whether the price is GST inclusive or GST exclusive:",
    )
    add_bullets(
        pdf,
        [
            "Preferred for public events: GST-inclusive pricing (e.g. \"$80.00 incl. GST\").",
            "If GST exclusive: show base price + GST + total payable (e.g. \"$72.73 + $7.27 GST = $80.00\").",
            "Never leave buyers unsure whether GST is included - this causes booking disputes and accounting errors.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.3 Simple GST calculation (when registered)", 6)
    pdf.ln(1)
    add_bullets(
        pdf,
        [
            "GST-inclusive price: GST amount = Total price x (1/11).",
            "Example: Ticket $110.00 incl. GST -> GST = $10.00; net = $100.00.",
            "GST-exclusive price: GST = Net price x 10%; Total = Net + GST.",
            "Example: Ticket $100.00 + GST $10.00 = $110.00 payable.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.4 Event booking records (what the website should store)", 6)
    pdf.ln(1)
    add_body(
        pdf,
        "For each booking, keep enough detail for Treasurer reconciliation and, if GST-registered, tax invoices:",
    )
    add_bullets(
        pdf,
        [
            "Event name, date, and ticket type (e.g. Adult, Child, Table of 10).",
            "Buyer name, email, phone, and number of tickets.",
            "Unit price, quantity, and total amount paid.",
            "GST amount and whether price is GST inclusive or exclusive (or \"GST not applicable\" if not registered).",
            "Payment reference / invoice number (unique per booking).",
            "Payment method (PayID / EFT) and payment status (Pending / Paid / Refunded).",
            "Date payment was confirmed by Treasurer.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.5 Tax invoices for event bookings", 6)
    pdf.ln(1)
    add_bullets(
        pdf,
        [
            "If GST-registered and the buyer requests a tax invoice (especially businesses or sponsors), issue one that meets ATO requirements.",
            "Typical details: association name, ABN, invoice date/number, buyer details, description of tickets, GST amount, and total.",
            "For PayID/EFT bookings, issue the invoice (or booking confirmation with GST breakdown) after payment is confirmed, or as a payable invoice before payment.",
            "If not GST-registered, do not issue a GST tax invoice; a receipt/confirmation is enough.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.6 Special event situations", 6)
    pdf.ln(1)
    add_bullets(
        pdf,
        [
            "Free tickets / complimentary seats - no payment, no GST charge. Still record for attendance.",
            "Donations separate from tickets - treat donation and ticket as separate amounts if both apply; GST treatment may differ. Get accountant advice.",
            "Sponsorship packages linked to an event - often invoiced separately; GST usually applies if GST-registered.",
            "Refunds - if GST was charged, GST portion is generally adjusted in the refund and accounting records.",
            "Mixed tables (members + guests) - price and GST still follow the published ticket rate unless a clear member discount is set.",
        ],
    )

    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    write_block(pdf, "6.7 Recommended event booking + payment flow", 6)
    pdf.ln(1)
    add_numbered(
        pdf,
        [
            "Publish event with clear ticket price and GST wording (incl. GST / excl. GST / no GST).",
            "Buyer completes booking form (names, ticket qty, contact details).",
            "System creates a booking reference and shows amount due, GST breakdown (if any), and PayID/EFT details.",
            "Buyer pays using the booking reference in the transfer description.",
            "Treasurer confirms funds received and marks booking Paid.",
            "Buyer receives confirmation / receipt (and tax invoice if GST-registered and required).",
            "Event attendance list is generated from paid bookings only (or paid + approved complimentary).",
        ],
    )

    add_body(
        pdf,
        "Note: This document is operational guidance for website and payment design. "
        "It is not tax advice. Confirm GST registration, membership fees, and event-ticket "
        "treatment with Taunet Nelel's accountant or registered tax agent before go-live.",
    )

    add_section(pdf, "7. Practical recommendation for Taunet Nelel")
    add_numbered(
        pdf,
        [
            "Primary: PayID + bank transfer / EFT (no Stripe required).",
            "Confirm GST registration before publishing membership fees or event ticket prices.",
            "For membership and events: always display GST status clearly on the website.",
            "Optional later: One Australian bank merchant facility if you need card payments.",
            "Skip for now: Afterpay, Zip, Klarna, and similar BNPL products.",
        ],
    )

    add_section(pdf, "8. Suggested website flow (membership / welfare - no Stripe)")
    add_numbered(
        pdf,
        [
            "Member submits membership, welfare, or sponsorship form on the website.",
            "System shows PayID and/or BSB + account details, plus a unique reference (e.g. member name or invoice number).",
            "If GST-registered, show membership amount with GST clearly stated.",
            "Member pays via their banking app.",
            "Treasurer confirms the deposit and updates payment status (manually or in Supabase).",
            "Member receives confirmation that their payment is recorded.",
        ],
    )

    add_section(pdf, "9. Summary")
    add_body(
        pdf,
        "Best near-term path: use PayID and EFT as the main online payment methods. "
        "Add an Australian bank merchant facility later only if card payments become essential.",
    )
    add_body(
        pdf,
        "For membership fees: GST applies in Victoria only if the association is "
        "GST-registered (or required to be). If not registered, do not charge GST. "
        "If registered, membership fees usually include GST.",
    )
    add_body(
        pdf,
        "For events and event bookings, decide GST treatment first (registered or not), "
        "show prices clearly, store GST fields on each booking, and issue proper "
        "confirmations or tax invoices when required.",
    )
    add_body(
        pdf,
        "This keeps costs low, avoids Stripe-style platforms, and fits how Taunet Nelel "
        "handles membership, welfare contributions, and community events.",
    )

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_pdf()
    print(f"Created: {OUTPUT_FILE}")
