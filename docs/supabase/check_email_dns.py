"""Quick public DNS check for Taunet Nelel mail authentication."""

from __future__ import annotations

import json
import urllib.request

DOMAIN = "taunetnelel.org"


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


def main() -> None:
    print(f"DNS check for {DOMAIN}\n")

    dmarc = resolve(f"_dmarc.{DOMAIN}")
    print("DMARC (_dmarc):")
    for row in dmarc or ["(missing)"]:
        print(f"  {row}")
        if "rua=" not in row:
            print("  → ACTION: add rua=mailto:info@taunetnelel.org; fo=1; aspf=r; adkim=r")

    print("\nApex SPF:")
    for row in resolve(DOMAIN):
        if "v=spf1" in row.lower():
            print(f"  {row}")

    print("\nResend send subdomain SPF:")
    send_spf = resolve(f"send.{DOMAIN}")
    for row in send_spf or ["(missing)"]:
        print(f"  {row}")

    print("\nResend DKIM (resend._domainkey):")
    dkim = resolve(f"resend._domainkey.{DOMAIN}")
    if dkim:
        print(f"  present ({len(dkim[0])} chars)")
    else:
        print("  → ACTION: missing — add from Resend → Domains")

    print("\nDone. Full steps: docs/supabase/EMAIL-DELIVERABILITY.md")


if __name__ == "__main__":
    main()
