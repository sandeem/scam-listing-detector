"""Jev client. Jev = the fast decision-maker (TypeSafe "System One" model).

Two ways to reach it, the same two the relay supports:

1. Direct TypeSafe key: POST https://api.typesafe.ai/v1/systemone
2. Through Glasser: POST {GLASSER_API_BASE_URL}/v1/runs with provider + endpoint,
   billed from the Glasser balance. Needs GLASSER_API_KEY, JEV_PROVIDER, JEV_ENDPOINT.

Route 2 is what the bootcamp hands out: Jev is available as a Glasser data source.

Docs: https://docs.typesafe.ai/introduction/quickstart
Question types used: noul (probability a statement is true, 0..1).
"""
from __future__ import annotations

import os
import uuid

import requests

DEFAULT_JEV_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_GLASSER_URL = "https://api.glasser.ai"


class JevError(RuntimeError):
    pass


class Jev:
    def __init__(self, api_key: str | None = None):
        # Read env at call time, not import time: main.py loads .env after importing this module.
        self.api_key = api_key or os.getenv("TYPESAFE_API_KEY")
        self.glasser_key = os.getenv("GLASSER_API_KEY")
        self.provider = os.getenv("JEV_PROVIDER")
        self.endpoint = os.getenv("JEV_ENDPOINT")
        self.via_glasser = not self.api_key and bool(
            self.glasser_key and self.provider and self.endpoint)
        if not self.api_key and not self.via_glasser:
            raise JevError(
                "No Jev route configured. Set TYPESAFE_API_KEY, or "
                "GLASSER_API_KEY + JEV_PROVIDER + JEV_ENDPOINT (see .env.example).")

    def ask(self, state: str, questions: dict) -> dict[str, float]:
        """Return {question_name: probability_true}."""
        payload = {"state": state, "model": os.getenv("JEV_MODEL") or "jev-latest", "questions": questions}
        if self.via_glasser:
            base = os.getenv("GLASSER_API_BASE_URL") or DEFAULT_GLASSER_URL
            r = requests.post(
                f"{base}/v1/runs",
                headers={
                    "Authorization": f"Bearer {self.glasser_key}",
                    "Content-Type": "application/json",
                    "idempotency-key": str(uuid.uuid4()),
                },
                json={"provider": self.provider, "endpoint": self.endpoint, "input": payload},
                timeout=60,
            )
        else:
            r = requests.post(
                os.getenv("TYPESAFE_API_URL") or DEFAULT_JEV_URL,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )
        if r.status_code >= 400:
            raise JevError(f"Jev {r.status_code}: {r.text[:400]}")
        body = r.json()
        answers = (body.get("output") or {}).get("answers") or body.get("answers") or {}
        return {name: float(a["noul"]) for name, a in answers.items()}


class MockJev:
    """Offline stand-in so tests and dry runs work with no keys.

    Keyword rules only. It is NOT Jev. Output is labelled MOCK in the report.
    """

    RULES = {
        "pay_before_viewing": ("wire", "western union", "gift card", "deposit before", "zelle", "crypto"),
        "off_platform_contact": ("whatsapp", "telegram", "text only", "gmail.com", "email only"),
        "urgency_pressure": ("act now", "today only", "many applicants", "first come", "hurry", "urgent"),
        "owner_unreachable": ("out of the country", "overseas", "missionary", "abroad", "cannot show", "keys will be mailed"),
        "price_far_below_market": ("far below market", "BELOW_MARKET_FLAG"),
        "search_reports_scam": ("scam", "fraud", "fake listing", "reported"),
        "no_photo": ("none - the ad shows no photo",),
    }

    def ask(self, state: str, questions: dict) -> dict[str, float]:
        low = state.lower()
        out = {}
        for name in questions:
            hits = sum(1 for k in self.RULES.get(name, ()) if k.lower() in low)
            out[name] = min(0.97, 0.05 + 0.45 * hits)
        return out
