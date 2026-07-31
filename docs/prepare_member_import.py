"""
Clean and merge Taunet Nelel general + welfare member CSVs
into a Supabase-ready import pack.

IMPORTANT:
  General list  = association membership (Standard / basic $50)
  Welfare list  = welfare membership ($300)
  These are NOT mixed. A person can be association-only, welfare-only, or both.
  Appearing on both lists does NOT convert them to welfare-only.

Source files:
  docs/General Member list - Taunet.csv
  docs/WELFARE ADDRESS IST.csv

Outputs:
  backups/migration-ready/members_cleaned.csv
  backups/migration-ready/members_excluded.csv
  backups/migration-ready/members_summary.json
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "backups" / "migration-ready"

GENERAL_CSV = DOCS / "General Member list - Taunet.csv"
WELFARE_CSV = DOCS / "WELFARE ADDRESS IST.csv"

SYSTEM_EMAILS = {
    "welfare@taunetnelel.org",
    "support@tech-away.com.au",
    "appsupport@tech-away.com.au",
    "kip@tech-away.com.au",
    "admin@kcv.org.au",
}

FAKE_EMAIL_DOMAINS = {
    "jarars.com",
    "noomlocs.com",
    "perceint.com",
    "neuraxo.com",
}


def norm_email(value: str | None) -> str:
    email = (value or "").strip().lower().replace(" ", "")
    if email.endswith(".con"):
        email = email[:-4] + ".com"
    return email


def norm_phone(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if re.search(r"[eE]", raw):
        try:
            raw = str(int(float(raw)))
        except ValueError:
            pass
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if digits.startswith("61") and len(digits) >= 11:
        return "+" + digits
    if digits.startswith("0") and len(digits) == 10:
        return "+61" + digits[1:]
    if len(digits) == 9 and digits.startswith("4"):
        return "+61" + digits
    if len(digits) >= 8:
        return "+" + digits
    return digits


def full_name(first: str, last: str, email: str) -> str:
    first = (first or "").strip()
    last = (last or "").strip()
    if "@" in first and not last:
        return first.split("@", 1)[0].replace(".", " ").replace("_", " ").title()
    name = re.sub(r"\s+", " ", f"{first} {last}".strip())
    if not name and email:
        return email.split("@", 1)[0].replace(".", " ").title()
    return name


def is_valid_email(email: str) -> bool:
    if not email or "@" not in email:
        return False
    local, _, domain = email.partition("@")
    return bool(local and domain and "." in domain)


def should_exclude(email: str, name: str) -> str | None:
    if email in SYSTEM_EMAILS:
        return "system_or_org_account"
    domain = email.split("@", 1)[-1]
    if domain in FAKE_EMAIL_DOMAINS:
        return "disposable_or_test_email"
    if name.lower() in {"app admin", "welfare admin", "welfare director", "tech away"}:
        return "system_or_org_account"
    return None


def derive_plan(association: bool, welfare: bool) -> str:
    """Keep membership types distinct; both means both products, not a merge."""
    if association and welfare:
        return "both"
    if welfare:
        return "welfare"
    return "basic"


def load_rows(path: Path, list_type: str) -> list[dict]:
    rows: list[dict] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for raw in csv.DictReader(f):
            email = norm_email(raw.get("Email"))
            first = (raw.get("First Name") or "").strip()
            last = (raw.get("Last Name") or "").strip()
            rows.append(
                {
                    "source_contact_id": (raw.get("Contact Id") or "").strip(),
                    "source_file": path.name,
                    "list_type": list_type,
                    "first_name": first,
                    "last_name": last,
                    "full_name": full_name(first, last, email),
                    "email": email,
                    "phone": norm_phone(raw.get("Phone")),
                    "created_at": (raw.get("Created") or "").strip(),
                    "tags": (raw.get("Tags") or "").strip(),
                }
            )
    return rows


def merge(general: list[dict], welfare: list[dict]) -> tuple[list[dict], list[dict], dict]:
    by_email: dict[str, dict] = {}
    excluded: list[dict] = []

    def upsert(row: dict, is_association: bool, is_welfare: bool) -> None:
        email = row["email"]
        if not is_valid_email(email):
            excluded.append({**row, "exclude_reason": "missing_or_invalid_email"})
            return

        reason = should_exclude(email, row["full_name"])
        if reason:
            excluded.append({**row, "exclude_reason": reason})
            return

        existing = by_email.get(email)
        if not existing:
            by_email[email] = {
                "full_name": row["full_name"],
                "first_name": row["first_name"],
                "last_name": row["last_name"],
                "email": email,
                "phone": row["phone"],
                "association_member": is_association,
                "welfare_member": is_welfare,
                "source_contact_ids": row["source_contact_id"],
                "created_at": row["created_at"],
                "tags": row["tags"],
            }
            return

        if is_association:
            existing["association_member"] = True
        if is_welfare:
            existing["welfare_member"] = True

        if not existing["phone"] and row["phone"]:
            existing["phone"] = row["phone"]
        if len(row["full_name"]) > len(existing["full_name"]):
            existing["full_name"] = row["full_name"]
            existing["first_name"] = row["first_name"]
            existing["last_name"] = row["last_name"]

        ids = existing["source_contact_ids"].split("|") if existing["source_contact_ids"] else []
        if row["source_contact_id"] and row["source_contact_id"] not in ids:
            ids.append(row["source_contact_id"])
            existing["source_contact_ids"] = "|".join(ids)

        if row["tags"]:
            existing_tags = [t.strip() for t in (existing.get("tags") or "").split(",") if t.strip()]
            for tag in row["tags"].split(","):
                tag = tag.strip()
                if tag and tag not in existing_tags:
                    existing_tags.append(tag)
            existing["tags"] = ", ".join(existing_tags)

    for row in general:
        upsert(row, is_association=True, is_welfare=False)
    for row in welfare:
        upsert(row, is_association=False, is_welfare=True)

    members = []
    for email, m in by_email.items():
        m["plan"] = derive_plan(m["association_member"], m["welfare_member"])
        m["membership_label"] = {
            "basic": "Association (Standard)",
            "welfare": "Welfare only",
            "both": "Association + Welfare",
        }[m["plan"]]
        m["status"] = "pending_invite"
        members.append(m)

    members.sort(
        key=lambda r: (
            0 if r["plan"] == "both" else 1 if r["plan"] == "welfare" else 2,
            r["full_name"].lower(),
        )
    )
    for i, m in enumerate(members, start=1):
        m["member_number"] = f"TN-{i:04d}"

    summary = {
        "general_rows": len(general),
        "welfare_rows": len(welfare),
        "unique_importable_members": len(members),
        "association_only": sum(1 for m in members if m["plan"] == "basic"),
        "welfare_only": sum(1 for m in members if m["plan"] == "welfare"),
        "association_and_welfare": sum(1 for m in members if m["plan"] == "both"),
        "association_member_total": sum(1 for m in members if m["association_member"]),
        "welfare_member_total": sum(1 for m in members if m["welfare_member"]),
        "excluded_count": len(excluded),
        "phones_present": sum(1 for m in members if m["phone"]),
        "note": (
            "Association membership (general list) and welfare membership are separate. "
            "People on both lists are marked plan=both — not converted to welfare-only."
        ),
    }
    return members, excluded, summary


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    general = load_rows(GENERAL_CSV, "general_association")
    welfare = load_rows(WELFARE_CSV, "welfare")
    members, excluded, summary = merge(general, welfare)

    member_fields = [
        "member_number",
        "full_name",
        "first_name",
        "last_name",
        "email",
        "phone",
        "association_member",
        "welfare_member",
        "plan",
        "membership_label",
        "status",
        "source_contact_ids",
        "created_at",
        "tags",
    ]
    write_csv(OUT / "members_cleaned.csv", members, member_fields)
    write_csv(
        OUT / "members_excluded.csv",
        excluded,
        member_fields + ["exclude_reason", "source_file", "list_type", "source_contact_id"],
    )
    (OUT / "members_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
