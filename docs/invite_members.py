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

  # First / pending invites only:
  python docs/invite_members.py --limit 5

  # Second broadcast — fresh password links for ALL imported members
  # (use after the reset form was fixed; share MEMBER-PORTAL-INVITE-NOTICE.pdf):
  python docs/invite_members.py --resend-all --limit 20   # test batch first
  python docs/invite_members.py --resend-all              # full list (slow on purpose)

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

_PLACEHOLDER_MARKERS = (
    "paste-",
    "your-service-role",
    "your-api-key",
    "re_paste",
    "xxx",
    "changeme",
)


def _is_placeholder(value: str) -> bool:
    low = value.lower()
    return any(marker in low for marker in _PLACEHOLDER_MARKERS)


def api(method: str, path: str, body: dict | None = None) -> dict | list:
    if not URL or not SERVICE_KEY:
        raise SystemExit(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.\n"
            "PowerShell example:\n"
            '  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"\n'
            '  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # one line, no Enter inside quotes'
        )
    if _is_placeholder(SERVICE_KEY) or not (
        SERVICE_KEY.startswith("eyJ") or SERVICE_KEY.startswith("sb_secret_")
    ):
        raise SystemExit(
            "SUPABASE_SERVICE_ROLE_KEY is still a placeholder.\n"
            "Open Supabase → Project Settings → API Keys → Secret key (sb_secret_...)\n"
            "or Legacy service_role (eyJ...). Paste one line. Do not leave paste-service-role-here."
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


def fetch_all_with_email(limit: int | None) -> list[dict]:
    """All imported members with an email — for second-wave password reset broadcast."""
    query = (
        "/rest/v1/member_imports"
        "?email=not.is.null"
        "&select=id,email,full_name,plan,association_member,welfare_member,member_number,status"
        "&order=member_number.asc"
    )
    if limit:
        query += f"&limit={limit}"
    rows = api("GET", query)
    if not isinstance(rows, list):
        return []
    return [r for r in rows if str(r.get("email") or "").strip()]


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


def _portal_link(payload: dict, redirect_to: str, link_type: str) -> str:
    """
    Build a site link with token_hash so scanners do not burn Supabase /verify URLs.
    Falls back to action_link if hashed_token is missing.
    """
    props = payload.get("properties") or {}
    hashed = payload.get("hashed_token") or props.get("hashed_token") or ""
    origin = "https://taunetnelel.vercel.app"
    try:
        parts = urllib.parse.urlsplit(redirect_to)
        if parts.scheme and parts.netloc:
            origin = f"{parts.scheme}://{parts.netloc}"
    except Exception:  # noqa: BLE001
        pass
    otp_type = "invite" if link_type == "invite" else "recovery"
    if hashed:
        q = urllib.parse.urlencode(
            {"tab": "signin", "type": otp_type, "token_hash": hashed}
        )
        return f"{origin}/members/auth.html?{q}"
    link = _action_link(payload)
    if not link:
        raise RuntimeError(f"generate_link({link_type}) returned no link")
    return _with_redirect(link, redirect_to)


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
    if not isinstance(payload, dict):
        raise RuntimeError(f"generate_link({link_type}) returned unexpected payload")
    return _portal_link(payload, redirect_to, link_type)


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
        "headers": {
            "X-Entity-Ref-ID": f"taunet-invite-{int(time.time())}",
            "List-Id": "<members.taunetnelel.org>",
            "X-Auto-Response-Suppress": "OOF, AutoReply",
        },
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_KEY}",
            "Content-Type": "application/json",
            # Required: urllib has no default UA; Resend/Cloudflare returns 403 error 1010 without it
            "User-Agent": "taunet-invite-members/1.0",
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
        f"Open the link, then tap Continue on the website. "
        f"The link stays usable until you set a password (or until it expires — usually up to 24 hours).\n\n"
        f"IT help (live chat): https://www.taunetnelel.org/help.html\n"
        f"Other questions: info@taunetnelel.org\n"
        f"Taunet Nelel Welfare Association — Victoria, Australia\n"
        f"https://taunetnelel.vercel.app\n"
        f"Portal emails come from members@taunetnelel.org — add that address to Contacts.\n"
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
        f"<p style='font-size:13px;'>Portal IT help: "
        f"<a href='https://www.taunetnelel.org/help.html'>www.taunetnelel.org/help.html</a> "
        f"(live chat — IT replies there). Other questions: "
        f"<a href='mailto:info@taunetnelel.org'>info@taunetnelel.org</a></p>"
        f"<p style='font-size:12px;color:#777;'>Portal emails come from "
        f"<strong>members@taunetnelel.org</strong>. Add that address to Contacts.</p>"
        f"</body></html>"
    )
    return subject, text, html


def invite(row: dict, redirect_to: str, *, force_recovery: bool = False) -> str:
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

    if force_recovery:
        link = generate_link("recovery", email, redirect)
        kind = "reset"
        result = "recovery_sent"
    else:
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
    if force_recovery:
        # Second-wave subject so members can tell it apart from the first invite
        subject = "New link: set your Taunet Nelel member password"
        name = (row.get("full_name") or "").strip() or "there"
        text = (
            f"Hello {name},\n\n"
            f"Sorry if the first portal invite did not work. Please use this NEW link "
            f"to choose your password (you should see the Choose a new password form):\n\n"
            f"{link}\n\n"
            f"Ignore the old invite email. IT help: https://www.taunetnelel.org/help.html\n"
            f"Taunet Nelel — Victoria, Australia\n"
        )
        html = (
            "<p>Hello "
            + name
            + ",</p>"
            "<p><strong>Sorry if the first portal invite did not work.</strong> "
            "Please use this <strong>new</strong> link to choose your password. "
            "You should see the <em>Choose a new password</em> form.</p>"
            f'<p style="margin:28px 0;"><a href="{link}" style="background:#8B4513;'
            'color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;'
            'display:inline-block;font-weight:700;">Choose a new password</a></p>'
            f"<p style='font-size:13px;color:#555;word-break:break-all;'>{link}</p>"
            "<p style='font-size:13px;'>Ignore the old invite. IT help: "
            "<a href='https://www.taunetnelel.org/help.html'>www.taunetnelel.org/help.html</a></p>"
        )
    tag = "member_invite" if kind == "set" else "password_reset_rebroadcast"
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
    parser.add_argument(
        "--resend-all",
        action="store_true",
        help="Second broadcast: email a fresh recovery link to all member_imports rows",
    )
    args = parser.parse_args()

    if not RESEND_KEY or _is_placeholder(RESEND_KEY) or not RESEND_KEY.startswith("re_"):
        raise SystemExit(
            "RESEND_API_KEY is missing or still a placeholder.\n"
            "Open Resend → API Keys → create/copy a Sending key starting with re_.\n"
            "Do not leave re_paste-resend-key-here."
        )

    force_recovery = bool(args.resend_all)

    if args.email:
        row = ensure_member_row(args.email.strip(), args.name.strip())
        rows = [row]
        print(f"Single invite for: {row.get('email')} (status={row.get('status')})")
    elif args.resend_all:
        rows = fetch_all_with_email(args.limit)
        print(f"Second-wave password resets to send: {len(rows)}")
        print("Share docs/TAUNET-NELEL-MEMBER-PORTAL-INVITE-NOTICE.pdf on WhatsApp.")
    else:
        rows = fetch_pending(args.limit)
        print(f"Pending invites to send: {len(rows)}")

    ok = 0
    failed = 0
    for row in rows:
        email = row.get("email")
        try:
            result = invite(row, args.redirect, force_recovery=force_recovery)
            ok += 1
            if result == "recovery_sent":
                print(f"OK  {email}  (Resend reset / rebroadcast)")
            else:
                print(f"OK  {email}  (Resend invite email)")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {email}: {exc}", file=sys.stderr)
        time.sleep(args.delay)

    print(f"Done. ok={ok} failed={failed}")
    if (args.email or args.resend_all) and ok:
        print("Expect From: Taunet Nelel <members@taunetnelel.org>")
        print("Check Inbox first, then Spam — mark Not spam if needed.")
        print("Open the link → Choose a new password form → then sign in.")


if __name__ == "__main__":
    main()
