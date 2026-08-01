"""
Invite pending members from public.member_imports via Supabase Admin API.

NEVER commit the service_role key. Pass it only via environment variables.

Usage (PowerShell):
  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
  python docs/invite_members.py --limit 5
  python docs/invite_members.py --email hillarykaptingei@gmail.com

Then without --limit to invite all pending_invite rows.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

def _env(name: str) -> str:
    # PowerShell pastes often leave CR/LF or wrapping quotes in the value
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


def api(method: str, path: str, body: dict | None = None) -> dict | list:
    if not URL or not SERVICE_KEY:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.\n"
            "PowerShell example:\n"
            '  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"\n'
            '  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # one line, no Enter inside quotes'
        )
    if any(ch in SERVICE_KEY for ch in " \t\r\n"):
        raise SystemExit(
            "SUPABASE_SERVICE_ROLE_KEY still contains whitespace. "
            "Re-copy the key as a single line with no spaces or line breaks."
        )

    req = urllib.request.Request(
        f"{URL}{path}",
        data=None if body is None else json.dumps(body).encode("utf-8"),
        method=method,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {path}: {detail}") from exc


def fetch_pending(limit: int | None) -> list[dict]:
    query = (
        "/rest/v1/member_imports"
        "?status=eq.pending_invite"
        "&select=id,email,full_name,plan,association_member,welfare_member,member_number"
        "&order=member_number.asc"
    )
    if limit:
        query += f"&limit={limit}"
    return api("GET", query)  # type: ignore[return-value]


def fetch_by_email(email: str) -> dict | None:
    q = (
        "/rest/v1/member_imports"
        f"?email=ilike.{urllib.parse.quote(email)}"
        "&select=id,email,full_name,plan,association_member,welfare_member,member_number,status"
        "&limit=1"
    )
    rows = api("GET", q)
    if isinstance(rows, list) and rows:
        return rows[0]
    return None


def ensure_member_row(email: str, full_name: str = "") -> dict:
    """Create a pending welfare/association row if this email is missing from imports."""
    existing = fetch_by_email(email)
    if existing:
        return existing
    name = full_name or email.split("@")[0].replace(".", " ").title()
    created = api(
        "POST",
        "/rest/v1/member_imports",
        {
            "email": email.lower().strip(),
            "full_name": name,
            "plan": "both",
            "association_member": True,
            "welfare_member": True,
            "membership_label": "Association + Welfare",
            "status": "pending_invite",
        },
    )
    if isinstance(created, list) and created:
        return created[0]
    if isinstance(created, dict) and created.get("email"):
        return created
    row = fetch_by_email(email)
    if not row:
        raise RuntimeError(f"Could not create member_imports row for {email}")
    return row


def invite(row: dict, redirect_to: str) -> str:
    """
    Invite a new Auth user, or send a recovery email if they already exist.
    Returns: 'invited' | 'recovery_sent'
    """
    email = row["email"]
    try:
        api(
            "POST",
            "/auth/v1/invite",
            {
                "email": email,
                "data": {
                    "full_name": row.get("full_name") or "",
                    "plan": row.get("plan") or "basic",
                    "member_number": row.get("member_number") or "",
                },
                "redirect_to": redirect_to,
            },
        )
        return "invited"
    except RuntimeError as exc:
        detail = str(exc)
        if "email_exists" not in detail and "already been registered" not in detail.lower():
            raise
        # Existing Auth user (e.g. committee bootstrap) — send password reset email
        api(
            "POST",
            "/auth/v1/recover",
            {"email": email},
        )
        return "recovery_sent"


def main() -> None:
    parser = argparse.ArgumentParser(description="Invite Taunet members from member_imports")
    parser.add_argument("--limit", type=int, default=None, help="Invite only N members (test)")
    parser.add_argument(
        "--email",
        default=None,
        help="Invite one email only (creates member_imports row if missing)",
    )
    parser.add_argument(
        "--name",
        default="",
        help="Full name when creating a missing --email row",
    )
    parser.add_argument(
        "--redirect",
        default="https://taunetnelel.vercel.app/members/auth.html?tab=signin",
        help="Invite email redirect URL",
    )
    parser.add_argument("--delay", type=float, default=0.35, help="Seconds between invites")
    args = parser.parse_args()

    if args.email:
        row = ensure_member_row(args.email.strip(), args.name.strip())
        rows = [row]
        print(f"Single invite for: {row.get('email')} (status={row.get('status')})")
    else:
        rows = fetch_pending(args.limit)
        print(f"Pending invites to send: {len(rows)}")

    ok = 0
    failed = 0
    for row in rows:
        email = row.get("email")
        try:
            result = invite(row, args.redirect)
            ok += 1
            if result == "recovery_sent":
                print(f"OK  {email}  (already registered — recovery/reset email sent)")
            else:
                print(f"OK  {email}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {email}: {exc}", file=sys.stderr)
        time.sleep(args.delay)

    print(f"Done. ok={ok} failed={failed}")
    if args.email and ok:
        print("Check inbox + spam for noreply@taunetnelel.org (also Resend → Emails).")
        print("Open the link, set a new password, then sign in at members/auth.html?tab=signin")


if __name__ == "__main__":
    main()
