"""
Invite pending members from public.member_imports.

ALWAYS sends mail via Resend (generate_link + custom template).
Never uses Supabase /auth/v1/invite mail — that default template often lands in spam.

NEVER commit the service_role key. Pass secrets only via environment variables.

Usage (PowerShell):
  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
  $env:RESEND_API_KEY = "re_..."
  $env:RESEND_FROM = "Taunet Nelel <members@taunetnelel.org>"   # optional
  $env:RESEND_REPLY_TO = "info@taunetnelel.org"                 # optional
  python docs/invite_members.py --limit 5
  python docs/invite_members.py --email someone@example.com
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
RESEND_KEY = _env("RESEND_API_KEY")
RESEND_FROM = _env("RESEND_FROM") or "Taunet Nelel <members@taunetnelel.org>"
RESEND_REPLY_TO = _env("RESEND_REPLY_TO") or "info@taunetnelel.org"


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


def _action_link(payload: dict | list) -> str:
    if not isinstance(payload, dict):
        return ""
    return (
        payload.get("action_link")
        or (payload.get("properties") or {}).get("action_link")
        or ""
    )


def _with_redirect(action_link: str, redirect_to: str) -> str:
    """Ensure verify URL uses our auth page (not bare Site URL)."""
    try:
        parts = urllib.parse.urlsplit(action_link)
        q = urllib.parse.parse_qs(parts.query, keep_blank_values=True)
        q["redirect_to"] = [redirect_to]
        new_query = urllib.parse.urlencode({k: v[0] for k, v in q.items()}, doseq=False)
        return urllib.parse.urlunsplit(
            (parts.scheme, parts.netloc, parts.path, new_query, parts.fragment)
        )
    except Exception:  # noqa: BLE001
        return action_link


def generate_link(link_type: str, email: str, redirect_to: str, data: dict | None = None) -> str:
    body: dict = {
        "type": link_type,
        "email": email,
        "redirect_to": redirect_to,
        "options": {"redirect_to": redirect_to},
    }
    if data:
        body["options"]["data"] = data
    payload = api("POST", "/auth/v1/admin/generate_link", body)
    link = _action_link(payload)  # type: ignore[arg-type]
    if not link:
        raise RuntimeError(f"generate_link({link_type}) returned no action_link")
    return _with_redirect(link, redirect_to)


def send_resend(email: str, subject: str, text: str, html: str, tag: str) -> None:
    if not RESEND_KEY:
        raise SystemExit(
            "RESEND_API_KEY is required. Invites must go through Resend "
            "(Supabase default invite mail often lands in spam)."
        )
    if "noreply@" in RESEND_FROM.lower():
        raise SystemExit(
            "RESEND_FROM must not use noreply@. Use: "
            'Taunet Nelel <members@taunetnelel.org>'
        )
    body = {
        "from": RESEND_FROM,
        "to": [email],
        "subject": subject,
        "html": html,
        "text": text,
        "reply_to": RESEND_REPLY_TO,
        "tags": [{"name": "category", "value": tag}],
        "headers": {"X-Entity-Ref-ID": f"taunet-invite-{int(time.time())}"},
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend {exc.code}: {detail}") from exc


def build_password_mail(action_link: str, full_name: str, kind: str) -> tuple[str, str, str]:
    name = (full_name or "").strip() or "there"
    is_set = kind == "set"
    subject = (
        "Set your Taunet Nelel member password"
        if is_set
        else "Reset your Taunet Nelel member password"
    )
    lead = (
        "Welcome to the Taunet Nelel member portal. Use the button below to set your password."
        if is_set
        else "We received a request to reset the password for your Taunet Nelel member account."
    )
    cta = "Set your password" if is_set else "Choose a new password"
    text = (
        f"Hello {name},\n\n"
        f"{lead}\n\n"
        f"{action_link}\n\n"
        f"This link expires soon and can be used once. "
        f"If you did not request this, you can ignore this email.\n\n"
        f"Questions? info@taunetnelel.org\n"
        f"Taunet Nelel Welfare Association — Victoria, Australia\n"
        f"https://taunetnelel.org\n"
    )
    html = (
        "<!DOCTYPE html><html><body style='font-family:Arial,Helvetica,sans-serif;"
        "line-height:1.55;color:#222;max-width:560px;margin:0 auto;padding:24px;'>"
        f"<p style='margin:0 0 4px;font-size:13px;color:#8B4513;'>Taunet Nelel</p>"
        f"<h1 style='font-size:22px;margin:0 0 16px;'>{cta}</h1>"
        f"<p>Hello {name},</p>"
        f"<p>{lead}</p>"
        f'<p style="margin:28px 0;"><a href="{action_link}" style="background:#8B4513;'
        f'color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;'
        f'display:inline-block;font-weight:700;">{cta}</a></p>'
        f"<p style='font-size:13px;color:#555;word-break:break-all;'>{action_link}</p>"
        f"<p style='font-size:13px;color:#666;'>If you did not request this, ignore this email.</p>"
        f"<p style='font-size:13px;'>Taunet Nelel · Victoria, Australia · "
        f"<a href='mailto:info@taunetnelel.org'>info@taunetnelel.org</a></p>"
        f"</body></html>"
    )
    return subject, text, html


def invite(row: dict, redirect_to: str) -> str:
    """
    Create/invite via generate_link (no Supabase-sent email), then Resend.
    Returns: 'invited' | 'recovery_sent'
    """
    email = row["email"]
    meta = {
        "full_name": row.get("full_name") or "",
        "plan": row.get("plan") or "basic",
        "member_number": row.get("member_number") or "",
    }
    redirect = redirect_to or (
        "https://taunetnelel.vercel.app/members/auth.html?tab=signin&type=recovery"
    )

    try:
        link = generate_link("invite", email, redirect, meta)
        kind = "set"
        result = "invited"
    except RuntimeError as exc:
        detail = str(exc).lower()
        if "email_exists" not in detail and "already been registered" not in detail:
            # Some projects return invite conflict differently — try recovery
            if "already" not in detail and "exists" not in detail:
                raise
        link = generate_link("recovery", email, redirect)
        kind = "reset"
        result = "recovery_sent"

    subject, text, html = build_password_mail(link, row.get("full_name") or "", kind)
    tag = "member_invite" if kind == "set" else "password_reset"
    send_resend(email, subject, text, html, tag)
    return result


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
        default="https://taunetnelel.vercel.app/members/auth.html?tab=signin&type=recovery",
        help="Invite / recovery redirect URL",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds between sends (default 1.0 — slower = better reputation)",
    )
    args = parser.parse_args()

    if not RESEND_KEY:
        raise SystemExit(
            "Set RESEND_API_KEY before inviting. "
            "We no longer send via Supabase default invite mail (spam risk)."
        )

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
                print(f"OK  {email}  (already registered — Resend reset email)")
            else:
                print(f"OK  {email}  (Resend invite email)")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {email}: {exc}", file=sys.stderr)
        time.sleep(args.delay)

    print(f"Done. ok={ok} failed={failed}")
    if args.email and ok:
        print("Expect From: Taunet Nelel <members@taunetnelel.org>")
        print("Check Inbox first, then Spam — mark Not spam if needed.")
        print("Open the link, set a password, then sign in at members/auth.html?tab=signin")


if __name__ == "__main__":
    main()
