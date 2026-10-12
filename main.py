#!/usr/bin/env python3
"""Scam Listing Detector.

  python main.py discover            # FREE: find Glasser endpoints + prices
  python main.py scan --mock         # offline demo, no keys, no cost
  python main.py scan --no-glasser   # real Jev, no Glasser spend
  python main.py scan                # full flow: Glasser + Jev
"""
from __future__ import annotations

import argparse
import json
import os
import sys

from scam_detector.detector import assess
from scam_detector.glasser_client import Glasser
from scam_detector.jev_client import Jev, MockJev
from scam_detector.report import write_report


def load_env(path: str = ".env") -> None:
    """Tiny .env loader so no extra dependency is needed."""
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def cmd_discover(args) -> int:
    g = Glasser()
    body = g.search(args.query, use_case=args.query, limit=5)
    print(f"{body.get('total', '?')} matches. Showing top {len(body['data'])} (search is free):\n")
    for e in body["data"]:
        price = e["price"]["display"]
        print(f"- {e['provider']} / {e['endpoint']}  v{e['endpoint_version']}")
        print(f"  {e['name']}  |  ${price['amount_usd']} {price['unit']}")
        print(f"  {e['description'][:140]}\n")
    print("Next: inspect the one you want in the Glasser console or CLI (free),")
    print("then set GLASSER_PROVIDER / GLASSER_ENDPOINT / GLASSER_INPUT_TEMPLATE in .env")
    return 0


def cmd_scan(args) -> int:
    listings = json.load(open(args.listings, encoding="utf-8"))[: args.limit]
    jev = MockJev() if args.mock else Jev()
    glasser = None if (args.mock or args.no_glasser) else Glasser()

    if glasser:
        est = len(listings)
        print(f"Up to {est} listing(s) may trigger PAID Glasser lookups (only those that look worrying on a free first pass). Check prices with `discover` first.")
        if not args.yes and input("Continue? [y/N] ").strip().lower() != "y":
            return 1

    results = []
    for item in listings:
        a = assess(item, listings, jev, glasser)
        results.append(a)
        print(f"{a.label:<12} risk {a.risk:.0%}  {item['title']}")

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    write_report(results, args.out, mock=args.mock, glasser_calls=glasser.calls if glasser else 0)
    print(f"\nReport: {args.out}")
    return 0


def main() -> int:
    load_env()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="search Glasser endpoints (free)")
    d.add_argument("query", nargs="?", default="web search results for a phone number or email")
    d.set_defaults(fn=cmd_discover)

    s = sub.add_parser("scan", help="score listings")
    s.add_argument("--listings", default="data/sample_listings.json")
    s.add_argument("--out", default="out/report.html")
    s.add_argument("--limit", type=int, default=10, help="max listings (caps Glasser spend)")
    s.add_argument("--mock", action="store_true", help="offline keyword rules, no keys")
    s.add_argument("--no-glasser", action="store_true", help="skip the paid Glasser step")
    s.add_argument("--yes", action="store_true", help="skip the spend confirmation")
    s.set_defaults(fn=cmd_scan)

    args = p.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
