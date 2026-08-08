"""Quick public DNS check for Taunet Nelel mail authentication."""

from __future__ import annotations

import json
import sys
import urllib.request

DOMAIN = "taunetnelel.org"

# Windows consoles often cannot print Unicode arrows.
OK = "[OK]"
ACTION = "[ACTION]"


def resolve(name: str, rtype: str = "TXT") -> list[str]:
    url = f"https://dns.google/resolve?name={name}&type={rtype}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    answers = data.get("Answer") or []
    out = []
    for a in answers:
        raw = a.get("data", "")
        if raw.startswith('"') and raw.endswith('"'):
            raw = raw[1:-1]
        out.append(raw.replace('" "', ""))
    return out


def main() -> int:
    print(f"DNS check for {DOMAIN}\n")
    issues = 0

    dmarc = resolve(f"_dmarc.{DOMAIN}")
    print("DMARC (_dmarc):")
    if not dmarc:
        print(f"  (missing)")
        print(f"  {ACTION}: add TXT v=DMARC1; p=none; rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r")
        issues += 1
    for row in dmarc:
        print(f"  {row}")
        if "rua=" not in row:
            print(
                f"  {ACTION}: edit TXT to "
                "v=DMARC1; p=none; rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r"
            )
            issues += 1
        else:
            print(f"  {OK}: rua reporting present")

    print("\nApex SPF:")
    found_spf = False
    for row in resolve(DOMAIN):
        if "v=spf1" in row.lower():
            print(f"  {row}")
            found_spf = True
    if not found_spf:
        print(f"  {ACTION}: missing apex SPF (keep Outlook include)")
        issues += 1
    else:
        print(f"  {OK}: apex SPF present")

    print("\nResend send subdomain SPF:")
    send_spf = resolve(f"send.{DOMAIN}")
    if not send_spf:
        print(f"  {ACTION}: missing send.{DOMAIN} SPF from Resend")
        issues += 1
    for row in send_spf:
        print(f"  {row}")
        if "amazonses.com" in row.lower():
            print(f"  {OK}: Amazon SES include present")

    print("\nResend DKIM (resend._domainkey):")
    dkim = resolve(f"resend._domainkey.{DOMAIN}")
    if dkim:
        print(f"  {OK}: present ({len(dkim[0])} chars)")
    else:
        print(f"  {ACTION}: missing — add from Resend -> Domains")
        issues += 1

    print("\nDone. Full steps: docs/supabase/EMAIL-DELIVERABILITY.md")
    if issues:
        print(f"\n{issues} action(s) remaining (DMARC update is the usual blocker).")
        return 1
    print("\nAll public auth records look good.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
