"""Generate Taunet Nelel Welfare Association Constitution PDF (2026 Revised Edition)."""

from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = Path(__file__).resolve().parent
SOURCE_FILE = DOCS_DIR / "TAUNET-NELEL-WELFARE-CONSTITUTION-2026.md"
LOGO_FILE = ROOT / "wp-content" / "uploads" / "2025" / "09" / "taunet_nelel_logo-preview.png"
LOGO_ICON_FILE = DOCS_DIR / ".constitution-logo-icon.png"
OUTPUT_FILE = DOCS_DIR / "TAUNET-NELEL-WELFARE-ASSOCIATION-CONSTITUTION-2026.pdf"

BRAND_PRIMARY = (139, 69, 19)
BRAND_ACCENT = (210, 105, 30)
TEXT_DARK = (30, 30, 30)
TEXT_MUTED = (80, 80, 80)

CONTENT_TOP_MARGIN = 34
FRONT_MATTER_TOP_MARGIN = 20
FOOTER_MARGIN = 18
LINE_HEIGHT_BODY = 5.5
LINE_HEIGHT_HEADING = 6.0


def sanitize(text: str) -> str:
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u202f": " ",
        "\u00a0": " ",
        "\u200b": "",
        "\u200c": "",
        "\u200d": "",
        "\ufeff": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return re.sub(r"[ \t]+", " ", text).strip()


class ConstitutionPDF(FPDF):
    def __init__(self) -> None:
        super().__init__()
        self.article_pages: dict[int, int] = {}
        self.article_ys: dict[int, float] = {}
        self.certification_anchor: tuple[int, float] | None = None
        self.content_pages = False

    def header(self) -> None:
        if not self.content_pages or self.page_no() <= 2:
            return

        icon_path = ensure_logo_icon()
        header_y = 8
        icon_w = 12
        icon_h = icon_w * 0.92

        if icon_path.exists():
            self.image(str(icon_path), x=self.l_margin, y=header_y, w=icon_w)

        text_x = self.l_margin + icon_w + 5
        text_w = self.w - self.r_margin - text_x
        self.set_xy(text_x, header_y + 1)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*TEXT_MUTED)
        self.multi_cell(text_w, 4, "Taunet Nelel Welfare Association - Constitution 2026 (Revised Edition)")

        rule_y = header_y + icon_h + 4
        self.set_draw_color(*BRAND_ACCENT)
        self.set_line_width(0.3)
        self.line(self.l_margin, rule_y, self.w - self.r_margin, rule_y)
        self.set_y(CONTENT_TOP_MARGIN - 4)
        self.set_x(self.l_margin)

    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def ensure_logo_icon() -> Path:
    if not LOGO_FILE.exists():
        return LOGO_ICON_FILE
    if not LOGO_ICON_FILE.exists() or LOGO_ICON_FILE.stat().st_mtime < LOGO_FILE.stat().st_mtime:
        from PIL import Image

        img = Image.open(LOGO_FILE).convert("RGBA")
        width, height = img.size
        cropped = img.crop((0, 0, width, int(height * 0.56)))
        cropped.save(LOGO_ICON_FILE)
    return LOGO_ICON_FILE


def begin_content_page(pdf: ConstitutionPDF) -> None:
    pdf.content_pages = True
    pdf.set_top_margin(CONTENT_TOP_MARGIN)
    pdf.set_auto_page_break(auto=True, margin=FOOTER_MARGIN)


def begin_front_matter_page(pdf: ConstitutionPDF) -> None:
    pdf.content_pages = False
    pdf.set_top_margin(FRONT_MATTER_TOP_MARGIN)
    pdf.set_auto_page_break(auto=True, margin=FOOTER_MARGIN)


def write_block(pdf: ConstitutionPDF, text: str, height: float = LINE_HEIGHT_BODY) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(
        pdf.epw,
        height,
        text,
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )


def split_lines(pdf: ConstitutionPDF, text: str, height: float = LINE_HEIGHT_BODY) -> list[str]:
    return pdf.multi_cell(pdf.epw, height, text, dry_run=True, output="LINES")


def text_height(pdf: ConstitutionPDF, text: str, height: float = LINE_HEIGHT_BODY) -> float:
    return len(split_lines(pdf, text, height)) * height


def content_area_height(pdf: ConstitutionPDF) -> float:
    return pdf.h - FOOTER_MARGIN - (CONTENT_TOP_MARGIN - 4)


def available_height(pdf: ConstitutionPDF) -> float:
    return pdf.h - FOOTER_MARGIN - pdf.get_y()


def start_new_page(pdf: ConstitutionPDF) -> None:
    pdf.add_page()
    pdf.set_y(CONTENT_TOP_MARGIN - 4)


def ensure_block_fits(pdf: ConstitutionPDF, block_height: float) -> None:
    if block_height <= 0:
        return
    if block_height > content_area_height(pdf):
        return
    if pdf.get_y() + block_height > pdf.h - FOOTER_MARGIN:
        start_new_page(pdf)


def set_body_font(pdf: ConstitutionPDF) -> None:
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*TEXT_DARK)


def set_heading_font(pdf: ConstitutionPDF, level: int = 2) -> None:
    pdf.set_font("Helvetica", "B", 10 if level == 3 else 11)
    pdf.set_text_color(*TEXT_DARK)


def measure_heading(pdf: ConstitutionPDF, heading: str, level: int = 2) -> float:
    set_heading_font(pdf, level)
    return text_height(pdf, heading, LINE_HEIGHT_HEADING) + 1


def measure_paragraph(pdf: ConstitutionPDF, text: str) -> float:
    set_body_font(pdf)
    return text_height(pdf, text, LINE_HEIGHT_BODY) + 2


def measure_bullets(pdf: ConstitutionPDF, items: list[str]) -> float:
    set_body_font(pdf)
    total = 2.0
    for item in items:
        total += len(split_lines(pdf, f"  -  {item}", LINE_HEIGHT_BODY)) * LINE_HEIGHT_BODY
    return total


def measure_definition(pdf: ConstitutionPDF, term: str, body: str) -> float:
    return measure_heading(pdf, term, level=3) + measure_paragraph(pdf, body)


def write_paragraph(pdf: ConstitutionPDF, text: str) -> None:
    if not text:
        return
    set_body_font(pdf)
    write_block(pdf, text, LINE_HEIGHT_BODY)
    pdf.ln(2)


def write_heading(pdf: ConstitutionPDF, heading: str, level: int = 2) -> None:
    set_heading_font(pdf, level)
    write_block(pdf, heading, LINE_HEIGHT_HEADING)
    pdf.ln(1)


def write_bullets(pdf: ConstitutionPDF, items: list[str]) -> None:
    if not items:
        return
    set_body_font(pdf)
    for item in items:
        write_block(pdf, f"  -  {item}", LINE_HEIGHT_BODY)
    pdf.ln(2)


def write_definition(pdf: ConstitutionPDF, term: str, body: str) -> None:
    write_heading(pdf, term, level=3)
    write_paragraph(pdf, body)


def build_section_blocks(section: dict) -> list[tuple]:
    blocks: list[tuple] = [("heading", section["heading"], 2)]
    paragraphs = section["paragraphs"]
    index = 0

    while index < len(paragraphs):
        item = paragraphs[index]
        if isinstance(item, tuple) and item[0] == "subheading":
            term = item[1]
            if index + 1 < len(paragraphs) and isinstance(paragraphs[index + 1], str):
                blocks.append(("definition", term, paragraphs[index + 1]))
                index += 2
            else:
                blocks.append(("heading", term, 3))
                index += 1
        else:
            blocks.append(("paragraph", item))
            index += 1

    if section["bullets"]:
        blocks.append(("bullets", section["bullets"]))
    return blocks


def measure_block(pdf: ConstitutionPDF, block: tuple) -> float:
    kind = block[0]
    if kind == "heading":
        return measure_heading(pdf, block[1], block[2])
    if kind == "paragraph":
        return measure_paragraph(pdf, block[1])
    if kind == "definition":
        return measure_definition(pdf, block[1], block[2])
    if kind == "bullets":
        return measure_bullets(pdf, block[1])
    return 0.0


def render_block(pdf: ConstitutionPDF, block: tuple) -> None:
    kind = block[0]
    if kind == "heading":
        write_heading(pdf, block[1], block[2])
    elif kind == "paragraph":
        write_paragraph(pdf, block[1])
    elif kind == "definition":
        write_definition(pdf, block[1], block[2])
    elif kind == "bullets":
        write_bullets(pdf, block[1])


def render_section(pdf: ConstitutionPDF, section: dict) -> None:
    blocks = build_section_blocks(section)
    if not blocks:
        return

    block_gap = 1.0
    total_height = sum(measure_block(pdf, block) for block in blocks) + block_gap * max(len(blocks) - 1, 0)
    page_height = content_area_height(pdf)

    if total_height <= page_height:
        ensure_block_fits(pdf, total_height)
        for block in blocks:
            render_block(pdf, block)
            pdf.ln(block_gap)
    else:
        for block in blocks:
            block_height = measure_block(pdf, block)
            ensure_block_fits(pdf, block_height)
            render_block(pdf, block)
            pdf.ln(block_gap)

    pdf.ln(2)


def write_block_centered(pdf: ConstitutionPDF, text: str, height: float = LINE_HEIGHT_BODY) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(
        pdf.epw,
        height,
        text,
        align="C",
        new_x=XPos.LMARGIN,
        new_y=YPos.NEXT,
    )


def add_title_page(pdf: ConstitutionPDF) -> None:
    begin_front_matter_page(pdf)
    pdf.add_page()

    logo_bottom = 24
    if LOGO_FILE.exists():
        logo_w = 58
        logo_h = logo_w * (467 / 534)
        logo_x = (pdf.w - logo_w) / 2
        logo_y = 22
        pdf.image(str(LOGO_FILE), x=logo_x, y=logo_y, w=logo_w)
        logo_bottom = logo_y + logo_h + 12

    pdf.set_y(logo_bottom)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*BRAND_PRIMARY)
    write_block_centered(pdf, "WELFARE ASSOCIATION", 8)
    pdf.ln(1)
    pdf.set_font("Helvetica", "B", 15)
    write_block_centered(pdf, "CONSTITUTION 2026 (REVISED EDITION)", 8)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*TEXT_MUTED)
    write_block_centered(pdf, "Victoria, Australia", 6)
    pdf.ln(10)

    meta = [
        ("Version:", "2026 Revised Edition"),
        ("Status:", "Adopted Constitution (Incorporating Amendments Approved by Members)"),
        ("Organisation:", "Taunet Nelel Welfare Association - Victoria"),
    ]
    for label, value in meta:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*TEXT_DARK)
        write_block_centered(pdf, label, 6)
        pdf.set_font("Helvetica", "", 10)
        write_block_centered(pdf, value, 6)
        pdf.ln(3)

    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*TEXT_DARK)
    write_block_centered(pdf, "Motto:", 6)
    pdf.set_font("Helvetica", "I", 12)
    pdf.set_text_color(*BRAND_ACCENT)
    write_block_centered(pdf, '"Together We Stand, Divided We Fall."', 7)
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*TEXT_DARK)
    write_block_centered(pdf, "Swahili Slogan:", 6)
    pdf.set_font("Helvetica", "I", 12)
    pdf.set_text_color(*BRAND_ACCENT)
    write_block_centered(pdf, "Nichunge Nikuchunge", 7)


def write_toc_entry(
    pdf: ConstitutionPDF,
    label: str,
    page_num: int,
    target_page: int,
    target_y: float,
) -> None:
    link = pdf.add_link(page=target_page, y=target_y)
    line_h = LINE_HEIGHT_BODY
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(0, 51, 153)

    label_width = pdf.get_string_width(label)
    page_text = str(page_num)
    page_width = pdf.get_string_width(page_text)
    gap_width = max(pdf.epw - label_width - page_width - 6, 8)
    dot_width = pdf.get_string_width(".")
    dot_count = max(int(gap_width / dot_width), 3)
    filler = f" {'.' * dot_count} "

    pdf.set_x(pdf.l_margin)
    pdf.cell(pdf.epw, line_h, f"{label}{filler}{page_text}", link=link)
    pdf.ln(line_h + 1.5)


def add_table_of_contents(
    pdf: ConstitutionPDF,
    articles: list[tuple[int, str]],
    article_pages: dict[int, int] | None = None,
    article_ys: dict[int, float] | None = None,
    certification_anchor: tuple[int, float] | None = None,
) -> None:
    begin_front_matter_page(pdf)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*BRAND_PRIMARY)
    write_block(pdf, "TABLE OF CONTENTS", 9)
    pdf.set_draw_color(*BRAND_ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.w - pdf.r_margin, pdf.get_y() + 1)
    pdf.ln(6)

    linked = article_pages is not None and article_ys is not None
    for number, title in articles:
        line = f"Article {number} - {title.title()}"
        ensure_space(pdf, LINE_HEIGHT_BODY + 2)
        if linked and number in article_pages and number in article_ys:
            write_toc_entry(
                pdf,
                line,
                article_pages[number],
                article_pages[number],
                article_ys[number],
            )
        else:
            pdf.set_font("Helvetica", "", 10)
            pdf.set_text_color(*TEXT_DARK)
            write_block(pdf, line, LINE_HEIGHT_BODY)

    pdf.ln(4)
    cert_label = "Certification of This Revised Edition"
    ensure_space(pdf, LINE_HEIGHT_BODY + 2)
    if linked and certification_anchor is not None:
        cert_page, cert_y = certification_anchor
        write_toc_entry(pdf, cert_label, cert_page, cert_page, cert_y)
    else:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*TEXT_DARK)
        write_block(pdf, cert_label, LINE_HEIGHT_BODY)


def ensure_space(pdf: ConstitutionPDF, needed: float = 20) -> None:
    ensure_block_fits(pdf, needed)


def measure_article_header(pdf: ConstitutionPDF, title: str) -> float:
    pdf.set_font("Helvetica", "B", 14)
    article_line = text_height(pdf, "ARTICLE 0", 8)
    pdf.set_font("Helvetica", "B", 12)
    title_line = text_height(pdf, title.upper(), 7)
    return 6 + article_line + title_line + 8


def add_article_header(pdf: ConstitutionPDF, number: int, title: str) -> None:
    ensure_block_fits(pdf, measure_article_header(pdf, title))
    pdf.ln(6)
    anchor_y = pdf.get_y()
    anchor_page = pdf.page_no()
    pdf.article_pages[number] = anchor_page
    pdf.article_ys[number] = anchor_y
    if hasattr(pdf, "set_bookmark"):
        pdf.set_bookmark(
            f"Article {number} - {title.title()}",
            level=0,
            page=anchor_page,
            y=anchor_y,
        )
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*BRAND_PRIMARY)
    write_block(pdf, f"ARTICLE {number}", 8)
    pdf.set_font("Helvetica", "B", 12)
    write_block(pdf, title.upper(), 7)
    pdf.set_draw_color(*BRAND_ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.w - pdf.r_margin, pdf.get_y() + 1)
    pdf.ln(5)


def add_certification_header(pdf: ConstitutionPDF, title: str) -> None:
    pdf.set_font("Helvetica", "B", 14)
    header_height = 6 + text_height(pdf, title, 8) + 8
    ensure_block_fits(pdf, header_height)
    pdf.ln(6)
    anchor_y = pdf.get_y()
    anchor_page = pdf.page_no()
    pdf.certification_anchor = (anchor_page, anchor_y)
    if hasattr(pdf, "set_bookmark"):
        pdf.set_bookmark(title.title(), level=0, page=anchor_page, y=anchor_y)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(*BRAND_PRIMARY)
    write_block(pdf, title, 8)
    pdf.set_draw_color(*BRAND_ACCENT)
    pdf.line(pdf.l_margin, pdf.get_y() + 1, pdf.w - pdf.r_margin, pdf.get_y() + 1)
    pdf.ln(5)


def parse_markdown(source: str) -> tuple[list[tuple[int, str]], list[dict], list[dict]]:
    articles_meta: list[tuple[int, str]] = []
    articles: list[dict] = []
    extras: list[dict] = []

    current_article: dict | None = None
    current_section: dict | None = None
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_lines
        if paragraph_lines and current_section is not None:
            current_section["paragraphs"].append(" ".join(paragraph_lines))
        paragraph_lines = []

    def flush_section() -> None:
        nonlocal current_section
        flush_paragraph()
        if current_section is not None and current_article is not None:
            current_article["sections"].append(current_section)
        current_section = None

    def flush_article() -> None:
        nonlocal current_article
        flush_section()
        if current_article is not None:
            articles.append(current_article)
        current_article = None

    for raw_line in source.splitlines():
        line = sanitize(raw_line)
        if not line:
            flush_paragraph()
            continue

        article_match = re.match(r"^#\s+ARTICLE\s+(\d+)\s+[-–—]\s+(.+)$", line, re.I)
        if article_match:
            flush_article()
            number = int(article_match.group(1))
            title = sanitize(article_match.group(2))
            articles_meta.append((number, title))
            current_article = {"number": number, "title": title, "sections": []}
            continue

        cert_match = re.match(r"^#\s+CERTIFICATION", line, re.I)
        if cert_match:
            flush_article()
            extras.append({"type": "certification", "title": "CERTIFICATION OF THIS REVISED EDITION", "sections": []})
            current_article = extras[-1]
            continue

        subsection_match = re.match(r"^###\s+(.+)$", line)
        if subsection_match and current_section is not None:
            flush_paragraph()
            current_section["paragraphs"].append(("subheading", sanitize(subsection_match.group(1))))
            continue

        section_match = re.match(r"^##\s+(.+)$", line)
        if section_match and current_article is not None:
            flush_section()
            current_section = {"heading": sanitize(section_match.group(1)), "paragraphs": [], "bullets": []}
            continue

        bullet_match = re.match(r"^-\s+(.+)$", line)
        if bullet_match and current_section is not None:
            flush_paragraph()
            current_section["bullets"].append(sanitize(bullet_match.group(1)))
            continue

        if current_section is not None:
            paragraph_lines.append(line)

    flush_article()
    return articles_meta, articles, extras


def render_document(pdf: ConstitutionPDF, articles: list[dict]) -> None:
    begin_content_page(pdf)
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()
    pdf.set_y(CONTENT_TOP_MARGIN - 4)

    for article in articles:
        number = article.get("number")
        title = article.get("title", "")
        if number is not None:
            add_article_header(pdf, number, title)
        else:
            add_certification_header(pdf, title)

        for section in article["sections"]:
            render_section(pdf, section)


def collect_navigation_anchors(
    articles_meta: list[tuple[int, str]],
    articles: list[dict],
    extras: list[dict],
) -> tuple[dict[int, int], dict[int, float], tuple[int, float] | None]:
    probe = ConstitutionPDF()
    probe.set_left_margin(18)
    probe.set_right_margin(18)
    probe.set_auto_page_break(auto=True, margin=FOOTER_MARGIN)

    add_title_page(probe)
    add_table_of_contents(probe, articles_meta)
    render_document(probe, articles + extras)

    return probe.article_pages, probe.article_ys, probe.certification_anchor


def build_pdf() -> None:
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Constitution source not found: {SOURCE_FILE}")

    source = SOURCE_FILE.read_text(encoding="utf-8")
    articles_meta, articles, extras = parse_markdown(source)
    article_pages, article_ys, certification_anchor = collect_navigation_anchors(
        articles_meta,
        articles,
        extras,
    )

    pdf = ConstitutionPDF()
    pdf.set_left_margin(18)
    pdf.set_right_margin(18)
    pdf.set_auto_page_break(auto=True, margin=FOOTER_MARGIN)

    add_title_page(pdf)
    add_table_of_contents(
        pdf,
        articles_meta,
        article_pages=article_pages,
        article_ys=article_ys,
        certification_anchor=certification_anchor,
    )
    render_document(pdf, articles + extras)

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUTPUT_FILE))


if __name__ == "__main__":
    build_pdf()
    print(f"Created: {OUTPUT_FILE}")
