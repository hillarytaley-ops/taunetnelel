"""
Reset one committee Auth password and verify login works.

Usage (PowerShell):
  $env:SUPABASE_URL = "https://wgecdsdeeirzdvshdfwo.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY = "paste-service-role-here"
  python docs/supabase/reset_admin_password.py hillarytaley@gmail.com
  python docs/supabase/reset_admin_password.py hillarytaley@gmail.com MyNewPass123456
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import string
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")


def _anon_from_config() -> str:
    """Read anon key from assets/js/supabase-config.js so verify matches the website."""
    try:
        cfg = Path(__file__).resolve().parents[2] / "assets" / "js" / "supabase-config.js"
        text = cfg.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = re.search(r"anonKey:\s*'([^']+)'", text)
    return match.group(1) if match else ""


def request(
    method: str,
    path: str,
    body: dict | None = None,
    *,
    key: str | None = None,
    auth_bearer: str | None = None,
):
    if not URL or not SERVICE_KEY:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    use_key = key or SERVICE_KEY
    headers = {
        "apikey": use_key,
        "Authorization": f"Bearer {auth_bearer or use_key}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(
        f"{URL}{path}",
        data=None if body is None else json.dumps(body).encode("utf-8"),
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {path}: {detail}") from exc


def gen_password() -> str:
    # Letters + digits only — easier to copy/paste than symbols
    alphabet = string.ascii_letters + string.digits
    return "Tn" + "".join(secrets.choice(alphabet) for _ in range(14))


def find_user(email: str) -> dict:
    email = email.lower().strip()
    # Prefer filter if supported; fall back to first pages
    try:
        q = urllib.parse.urlencode({"email": email})
        data = request("GET", f"/auth/v1/admin/users?{q}")
        users = data.get("users") if isinstance(data, dict) else data
        for user in users or []:
            if (user.get("email") or "").lower() == email:
                return user
    except RuntimeError:
        pass

    for page in range(1, 6):
        data = request("GET", f"/auth/v1/admin/users?page={page}&per_page=200")
        users = data.get("users") if isinstance(data, dict) else data
        if not users:
            break
        for user in users:
            if (user.get("email") or "").lower() == email:
                return user
    raise SystemExit(f"No Auth user found for {email}. Run bootstrap_production.py first.")


def set_password(user_id: str, password: str) -> None:
    # GoTrue admin update (PUT). Also confirm email so login is not blocked.
    request(
        "PUT",
        f"/auth/v1/admin/users/{user_id}",
        {
            "password": password,
            "email_confirm": True,
            "ban_duration": "none",
        },
    )


def verify_password_login(email: str, password: str) -> None:
    # Prefer the same anon key the website uses (stale service_role-only checks
    # can pass while the browser still fails).
    key = ANON_KEY or _anon_from_config() or SERVICE_KEY
    request(
        "POST",
        "/auth/v1/token?grant_type=password",
        {"email": email, "password": password},
        key=key,
        auth_bearer=key,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("email")
    parser.add_argument("password", nargs="?", help="Optional. Generated if omitted.")
    args = parser.parse_args()

    email = args.email.lower().strip()
    password = args.password or gen_password()
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters.")

    user = find_user(email)
    print(f"Found user id={user.get('id')} email={user.get('email')}")
    set_password(user["id"], password)
    print("Password updated via Admin API.")

    try:
        verify_password_login(email, password)
        print("Verified: password login works.")
    except RuntimeError as exc:
        print(f"WARNING: update returned OK but login verify failed: {exc}")
        print("Check Supabase Auth → Users for this email, or try again.")
        return 1

    print("\nUse these on Committee → Enter with account:")
    print(f"  Email:    {email}")
    print(f"  Password: {password}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
