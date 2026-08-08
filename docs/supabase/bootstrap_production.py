"""
One-shot production bootstrap for Taunet Nelel.

Does (via Supabase service role API — no SQL runner needed for these steps):
  1) Upsert site_admins committee emails
  2) Create Auth accounts for committee emails (or reset if --reset-passwords)
  3) Seed businesses / news / blog from assets/data/business-content.json
  4) Report schema readiness (status column, business_blog, etc.)

You still must paste docs/supabase/APPLY-REMAINING.sql in the SQL Editor once
(for RLS / triggers that the REST API cannot create).

NEVER commit the service_role key.

Usage (PowerShell):
  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
  python docs/supabase/bootstrap_production.py
  python docs/supabase/bootstrap_production.py --reset-passwords
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import string
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _env(name: str) -> str:
    return (
        os.environ.get(name, "")
        .strip()
        .strip('"')
        .strip("'")
        .replace("\r", "")
        .replace("\n", "")
    )


URL = _env("SUPABASE_URL").rstrip("/")
SERVICE_KEY = _env("SUPABASE_SERVICE_ROLE_KEY")

COMMITTEE = [
    ("hillarytaley@gmail.com", "Hillary Taley"),
    ("hillarykaptingei@gmail.com", "Hillary Kaptingei"),
    ("psowey@gmail.com", "Ruto Mangusho"),
    ("alexissams71@gmail.com", "Brian Ngetich"),
    ("rutopsowey@gmail.com", "Ruto Mangusho"),
    ("briankip57@gmail.com", "Webmaster"),
]


def api(method: str, path: str, body: dict | list | None = None, prefer: str = "return=representation"):
    if not URL or not SERVICE_KEY:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    req = urllib.request.Request(
        f"{URL}{path}",
        data=None if body is None else json.dumps(body).encode("utf-8"),
        method=method,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {path}: {detail}") from exc


def gen_password(length: int = 16) -> str:
    # Alphanumeric only — special chars often break copy/paste in the login form
    alphabet = string.ascii_letters + string.digits
    return "Tn" + "".join(secrets.choice(alphabet) for _ in range(max(8, length - 2)))


def upsert_site_admins() -> None:
    rows = [{"email": e.lower(), "full_name": name} for e, name in COMMITTEE]
    api(
        "POST",
        "/rest/v1/site_admins?on_conflict=email",
        rows,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    print(f"OK  site_admins upserted ({len(rows)})")


def list_auth_users() -> dict[str, dict]:
    """Load Auth users across pages (committee emails may not be on page 1)."""
    out: dict[str, dict] = {}
    for page in range(1, 21):
        data = api("GET", f"/auth/v1/admin/users?page={page}&per_page=200")
        users = data.get("users") if isinstance(data, dict) else data
        if not users:
            break
        for user in users:
            email = (user.get("email") or "").lower()
            if email:
                out[email] = user
        if len(users) < 200:
            break
    return out


def find_auth_user(email: str, existing: dict[str, dict] | None = None) -> dict | None:
    email = email.lower().strip()
    if existing and email in existing:
        return existing[email]
    # Direct filter (supported on newer GoTrue)
    try:
        from urllib.parse import urlencode

        data = api("GET", f"/auth/v1/admin/users?{urlencode({'email': email})}")
        users = data.get("users") if isinstance(data, dict) else data
        for user in users or []:
            if (user.get("email") or "").lower() == email:
                return user
    except RuntimeError:
        pass
    return (existing or {}).get(email)


def reset_user_password(user_id: str, email: str, full_name: str, password: str) -> None:
    api(
        "PUT",
        f"/auth/v1/admin/users/{user_id}",
        {
            "password": password,
            "email_confirm": True,
            "ban_duration": "none",
            "user_metadata": {"full_name": full_name},
        },
    )
    try:
        api(
            "POST",
            "/auth/v1/token?grant_type=password",
            {"email": email, "password": password},
        )
    except RuntimeError as exc:
        print(f"WARN could not verify login for {email}: {exc}")


def ensure_committee_auth(reset_passwords: bool) -> list[tuple[str, str]]:
    existing = list_auth_users()
    created: list[tuple[str, str]] = []
    for email, full_name in COMMITTEE:
        password = gen_password()
        user = find_auth_user(email, existing)

        if user:
            if reset_passwords:
                reset_user_password(user["id"], email, full_name, password)
                created.append((email, password))
                print(f"OK  reset password for {email}")
            else:
                print(f"--  Auth user already exists: {email} (pass --reset-passwords to set a new one)")
            continue

        try:
            api(
                "POST",
                "/auth/v1/admin/users",
                {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": full_name, "plan": "basic"},
                },
            )
            created.append((email, password))
            print(f"OK  created Auth user {email}")
        except RuntimeError as exc:
            # Race / pagination miss: user exists — look up and reset instead
            if "email_exists" not in str(exc):
                raise
            existing = list_auth_users()
            user = find_auth_user(email, existing)
            if not user:
                raise RuntimeError(f"email_exists for {email} but user id not found") from exc
            if reset_passwords:
                reset_user_password(user["id"], email, full_name, password)
                created.append((email, password))
                print(f"OK  reset password for existing {email}")
            else:
                print(f"--  Auth user already exists: {email} (pass --reset-passwords to set a new one)")
    return created


def seed_business_content() -> None:
    path = ROOT / "assets" / "data" / "business-content.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    businesses = [
        {
            "id": b["id"],
            "name": b["name"],
            "category": b.get("category"),
            "description": b.get("description"),
            "contact_name": b.get("contactName"),
            "phone": b.get("phone"),
            "email": b.get("email"),
            "website": b.get("website") or None,
            "location": b.get("location"),
            "is_published": True,
        }
        for b in data.get("businesses") or []
    ]
    news = [
        {
            "id": n["id"],
            "title": n["title"],
            "published_date": n.get("date"),
            "summary": n.get("summary"),
            "body": n.get("body"),
            "is_published": True,
        }
        for n in data.get("news") or []
    ]
    blog = [
        {
            "id": b["id"],
            "title": b["title"],
            "published_date": b.get("date"),
            "author": b.get("author") or "Taunet Nelel Team",
            "summary": b.get("summary"),
            "body": b.get("body"),
            "is_published": True,
        }
        for b in data.get("blog") or []
    ]
    if businesses:
        api(
            "POST",
            "/rest/v1/businesses?on_conflict=id",
            businesses,
            prefer="resolution=merge-duplicates,return=minimal",
        )
    if news:
        api(
            "POST",
            "/rest/v1/business_news?on_conflict=id",
            news,
            prefer="resolution=merge-duplicates,return=minimal",
        )
    try:
        if blog:
            api(
                "POST",
                "/rest/v1/business_blog?on_conflict=id",
                blog,
                prefer="resolution=merge-duplicates,return=minimal",
            )
        print(f"OK  business content seeded (biz={len(businesses)} news={len(news)} blog={len(blog)})")
    except RuntimeError as exc:
        print(f"WARN business_blog missing — run APPLY-REMAINING.sql first ({exc})")
        print(f"OK  businesses/news seeded (biz={len(businesses)} news={len(news)})")


def schema_report() -> None:
    print("\nSchema checks:")
    probes = [
        ("form_submissions.status", "/rest/v1/form_submissions?select=status&limit=1"),
        ("site_admins", "/rest/v1/site_admins?select=email&limit=20"),
        ("business_blog", "/rest/v1/business_blog?select=id&limit=1"),
        ("events", "/rest/v1/events?select=id&limit=1"),
        ("gallery_albums", "/rest/v1/gallery_albums?select=id&limit=1"),
        ("announcements", "/rest/v1/announcements?select=id&limit=1"),
    ]
    for label, path in probes:
        try:
            data = api("GET", path)
            n = len(data) if isinstance(data, list) else "?"
            print(f"  OK  {label} (sample rows: {n})")
            if label == "site_admins" and isinstance(data, list):
                for row in data:
                    print(f"      - {row.get('email')}")
        except RuntimeError as exc:
            print(f"  MISSING/FAIL  {label}: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reset-passwords",
        action="store_true",
        help=(
            "Set NEW passwords for existing committee Auth users and print them. "
            "Warning: this immediately invalidates every previous password for those accounts."
        ),
    )
    args = parser.parse_args()

    print("Taunet production bootstrap\n")
    upsert_site_admins()
    passwords = ensure_committee_auth(args.reset_passwords)
    seed_business_content()
    schema_report()

    print("\nNext (required once in Supabase SQL Editor):")
    print("  Paste and run: docs/supabase/APPLY-REMAINING.sql")
    print("Then in Admin → Events/Gallery use Seed buttons if those tables are empty.")
    print("SMTP for ~540 invites: docs/supabase/CUSTOM-SMTP-SETUP.md")

    if passwords:
        print("\n*** SAVE THESE COMMITTEE PASSWORDS NOW (shown once) ***")
        for email, password in passwords:
            print(f"  {email}  →  {password}")
        print("Sign in at /members/auth.html?tab=admin with email + password above.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
