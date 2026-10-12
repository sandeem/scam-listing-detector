"""Small Glasser client (REST). Glasser = the data buffet.

Flow for every call: search -> (inspect price) -> run.
Docs: https://glasser.ai/docs/api-reference/overview
"""
from __future__ import annotations

import json
import os
import time
import uuid

import requests

BASE_URL = os.getenv("GLASSER_API_BASE_URL", "https://api.glasser.ai")


class GlasserError(RuntimeError):
    pass


class Glasser:
    def __init__(self, api_key: str | None = None, task_id: str | None = None):
        self.api_key = api_key or os.getenv("GLASSER_API_KEY")
        if not self.api_key:
            raise GlasserError("GLASSER_API_KEY is not set (see .env.example).")
        self.task_id = task_id
        self.calls = 0  # paid runs made in this session

    # -- helpers ---------------------------------------------------------
    def _headers(self, extra: dict | None = None) -> dict:
        h = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        h.update(extra or {})
        return h

    def _check(self, r: requests.Response) -> dict:
        try:
            body = r.json()
        except ValueError:
            body = {"raw": r.text}
        if r.status_code >= 400:
            raise GlasserError(f"Glasser {r.status_code}: {json.dumps(body)[:500]}")
        return body

    # -- search (free) ---------------------------------------------------
    def search(self, query: str, use_case: str, limit: int = 5) -> dict:
        payload = {"use_case": use_case, "query": query, "limit": limit}
        if self.task_id:
            payload["task_id"] = self.task_id
        body = self._check(
            requests.post(f"{BASE_URL}/v1/endpoints/search", json=payload,
                          headers=self._headers(), timeout=30)
        )
        self.task_id = body.get("task_id", self.task_id)
        return body

    # -- run (PAID) ------------------------------------------------------
    def run(self, provider: str, endpoint: str, input_: dict,
            endpoint_version: int | None = None, wait_s: int = 60) -> dict:
        payload: dict = {"provider": provider, "endpoint": endpoint, "input": input_}
        if endpoint_version:
            payload["endpoint_version"] = endpoint_version
        if self.task_id:
            payload["task_id"] = self.task_id
        key = str(uuid.uuid4())  # same key on retry = no double charge
        body = self._check(
            requests.post(f"{BASE_URL}/v1/runs", json=payload,
                          headers=self._headers({"idempotency-key": key}), timeout=60)
        )
        self.calls += 1
        # Async endpoints return QUEUED/RUNNING: poll until done.
        run_id = body.get("id") or body.get("run_id")
        deadline = time.time() + wait_s
        while run_id and str(body.get("status", "")).upper() in {"QUEUED", "RUNNING"}:
            if time.time() > deadline:
                raise GlasserError(f"Run {run_id} still running after {wait_s}s")
            time.sleep(2)
            body = self._check(
                requests.get(f"{BASE_URL}/v1/runs/{run_id}", headers=self._headers(), timeout=30)
            )
        return body


def fill_template(template, query: str):
    """Replace the literal string '{query}' anywhere inside a JSON structure."""
    if isinstance(template, str):
        return template.replace("{query}", query)
    if isinstance(template, list):
        return [fill_template(t, query) for t in template]
    if isinstance(template, dict):
        return {k: fill_template(v, query) for k, v in template.items()}
    return template


def to_evidence_text(run_body: dict, limit: int = 2500) -> str:
    """Flatten a provider response into short text Jev can read.

    Provider shapes differ, so keep this generic: dump JSON, then truncate.
    """
    payload = run_body.get("output") or run_body.get("result") or run_body.get("data") or run_body
    text = json.dumps(payload, ensure_ascii=False)
    return text[:limit]
