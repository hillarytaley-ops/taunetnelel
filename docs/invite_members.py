"""
Invite pending members from public.member_imports via Supabase Admin API.

NEVER commit the service_role key. Pass it only via environment variables.

Usage (PowerShell):
  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
  python docs/invite_members.py --limit 5

Then without --limit to invite all pending_invite rows.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.error
import urllib.request
import json

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


def invite(row: dict, redirect_to: str) -> None:
    api(
        "POST",
        "/auth/v1/invite",
        {
            "email": row["email"],
            "data": {
                "full_name": row.get("full_name") or "",
                "plan": row.get("plan") or "basic",
                "member_number": row.get("member_number") or "",
            },
            "redirect_to": redirect_to,
        },
    )
    # handle_new_user trigger marks member_imports as active when Auth user is created



def main() -> None:
    parser = argparse.ArgumentParser(description="Invite Taunet members from member_imports")
    parser.add_argument("--limit", type=int, default=None, help="Invite only N members (test)")
    parser.add_argument(
        "--redirect",
        default="https://taunetnelel.vercel.app/members/auth.html?tab=signin",
        help="Invite email redirect URL",
    )
    parser.add_argument("--delay", type=float, default=0.35, help="Seconds between invites")
    args = parser.parse_args()

    rows = fetch_pending(args.limit)
    print(f"Pending invites to send: {len(rows)}")
    ok = 0
    failed = 0
    for row in rows:
        email = row.get("email")
        try:
            invite(row, args.redirect)
            ok += 1
            print(f"OK  {email}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {email}: {exc}", file=sys.stderr)
        time.sleep(args.delay)

    print(f"Done. ok={ok} failed={failed}")


if __name__ == "__main__":
    main()
