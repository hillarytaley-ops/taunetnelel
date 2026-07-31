"""Generate import_members.sql from members_cleaned.csv for Supabase SQL Editor."""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "backups" / "migration-ready" / "members_cleaned.csv"
OUT_PATH = ROOT / "backups" / "migration-ready" / "import_members.sql"


def sql_str(value: str | None) -> str:
    text = (value or "").strip()
    if not text:
        return "null"
    return "'" + text.replace("'", "''") + "'"


def sql_bool(value: str | None) -> str:
    return "true" if str(value or "").strip().lower() in {"true", "1", "yes"} else "false"


def main() -> None:
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    lines: list[str] = [
        "-- Import cleaned association + welfare members into member_imports",
        "-- Run AFTER supabase/migrations/007_member_import_staging.sql",
        "-- Do NOT paste the CSV into SQL Editor — use this file instead.",
        "",
        "delete from public.member_imports;",
        "",
    ]

    batch: list[str] = []
    for index, row in enumerate(rows, start=1):
        values = (
            f"({sql_str(row['member_number'])}, {sql_str(row['full_name'])}, "
            f"{sql_str(row['first_name'])}, {sql_str(row['last_name'])}, "
            f"{sql_str(row['email'])}, {sql_str(row['phone'])}, "
            f"{sql_bool(row['association_member'])}, {sql_bool(row['welfare_member'])}, "
            f"{sql_str(row['plan'])}, {sql_str(row['membership_label'])}, "
            f"{sql_str(row['status'])}, {sql_str(row['source_contact_ids'])}, "
            f"{sql_str(row['tags'])})"
        )
        batch.append(values)
        if len(batch) == 50 or index == len(rows):
            lines.extend(
                [
                    "insert into public.member_imports (",
                    "  member_number, full_name, first_name, last_name, email, phone,",
                    "  association_member, welfare_member, plan, membership_label, status,",
                    "  source_contact_ids, tags",
                    ") values",
                    ",\n".join(batch) + ";",
                    "",
                ]
            )
            batch = []

    lines.append("select * from public.member_import_stats;")
    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(rows)} members, {OUT_PATH.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
