import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from scam_detector.detector import QUESTIONS, assess, label_for
from scam_detector.glasser_client import fill_template
from scam_detector.jev_client import Jev, MockJev

LISTINGS = json.load(open(pathlib.Path(__file__).resolve().parents[1] / "data/sample_listings.json"))


def test_weights_sum_to_one():
    assert abs(sum(w for w, _ in QUESTIONS.values()) - 1.0) < 1e-9


def test_labels():
    assert label_for(0.1) == "LOW RISK"
    assert label_for(0.4) == "SUSPICIOUS"
    assert label_for(0.8) == "LIKELY SCAM"


def test_fill_template_nested():
    assert fill_template({"q": "{query}", "x": ["a {query}"]}, "hi") == {"q": "hi", "x": ["a hi"]}


def test_real_listings_score_lower_than_scams():
    results = {l["id"]: assess(l, LISTINGS, MockJev()) for l in LISTINGS}
    real = max(results[i].risk for i in ("r1", "r2", "r3"))
    scam = min(results[i].risk for i in ("s1", "s2", "s3"))
    assert real < scam
    assert all(results[i].label == "LOW RISK" for i in ("r1", "r2", "r3"))
    assert all(results[i].label != "LOW RISK" for i in ("s1", "s2", "s3"))


# ---- Step 3: the CLI must match the browser extension ----
import json as _json
import shutil
import subprocess

import pytest

from scam_detector import detector

ROOT = pathlib.Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_cli_questions_and_weights_match_extension():
    out = subprocess.run(
        ["node", "-e", "console.log(JSON.stringify(require('./extension/lib/core.js').QUESTIONS))"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout
    js = _json.loads(out)
    py = {n: w for n, (w, _) in QUESTIONS.items()}
    assert set(js) == set(py)
    for name, (weight, text) in js.items():
        assert abs(weight - py[name]) < 1e-9, name
        assert text == QUESTIONS[name][1], name


def test_eleven_questions():
    assert len(QUESTIONS) == 11
    assert "no_photo" in QUESTIONS


class FakeGlasser:
    def __init__(self):
        self.calls = []

    def run(self, provider, endpoint, input_, **kw):
        self.calls.append(provider)
        return {"output": {"found": "ZZ_FOUND_42"}}


class SpyJev:
    def __init__(self, level):
        self.level, self.states = level, []

    def ask(self, state, questions):
        self.states.append(state)
        return {n: self.level for n in questions}


def _env(monkeypatch):
    for k, v in {
        "GLASSER_PROVIDER": "serper", "GLASSER_ENDPOINT": "/search",
        "PROPERTY_PROVIDER": "rentcast", "PROPERTY_ENDPOINT": "/properties",
        "PHOTO_PROVIDER": "serpapi", "PHOTO_ENDPOINT": "/search?engine=google_lens",
        "DUPLICATE_PROVIDER": "serper", "DUPLICATE_ENDPOINT": "/search",
    }.items():
        monkeypatch.setenv(k, v)


ITEM = {"id": "x", "title": "t", "city": "Austin", "beds": 2, "price": 650, "contact": "a@b.com",
        "description": "A lovely sunny two bedroom apartment near the park with parking. Send deposit now.",
        "address": "9 Risky Avenue, Dallas, TX 75201", "images": ["https://i/x.jpg"]}


def test_clean_listing_makes_no_paid_calls(monkeypatch):
    _env(monkeypatch)
    g = FakeGlasser()
    a = assess(ITEM, [ITEM], SpyJev(0.05), g)
    assert g.calls == [] and a.glasser_used is False


def test_worrying_listing_runs_all_checks_and_jev_sees_evidence(monkeypatch):
    _env(monkeypatch)
    g, jev = FakeGlasser(), SpyJev(0.8)
    a = assess(ITEM, [ITEM], jev, g)
    assert set(g.calls) == {"serper", "rentcast", "serpapi"}
    assert len(jev.states) == 2
    assert "ZZ_FOUND_42" not in jev.states[0] and "ZZ_FOUND_42" in jev.states[1]
    assert a.glasser_used is True


def test_no_photo_is_stated_to_jev():
    item = {**ITEM, "images": []}
    assert "none - the ad shows no photo" in detector.build_state(item, 1800, "")
    assert "1 photo link" in detector.build_state(ITEM, 1800, "")


def test_failed_lookup_does_not_break_scoring(monkeypatch):
    _env(monkeypatch)

    class Boom(FakeGlasser):
        def run(self, *a, **k):
            raise RuntimeError("500")

    a = assess(ITEM, [ITEM], SpyJev(0.8), Boom())
    assert a.label == "LIKELY SCAM"


# ---- Jev must also work through Glasser, which is how the bootcamp hands it out ----
def test_jev_uses_the_glasser_route_when_there_is_no_typesafe_key(monkeypatch):
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    monkeypatch.setenv("GLASSER_API_KEY", "g-key")
    monkeypatch.setenv("JEV_PROVIDER", "typesafe")
    monkeypatch.setenv("JEV_ENDPOINT", "/v1/systemone")
    monkeypatch.setenv("GLASSER_API_BASE_URL", "http://glasser.test")
    seen = {}

    class Resp:
        status_code = 200

        def json(self):
            return {"output": {"answers": {"pay_before_viewing": {"noul": 0.9}}}}

    def fake_post(url, **kw):
        seen["url"], seen["json"], seen["headers"] = url, kw.get("json"), kw.get("headers")
        return Resp()

    monkeypatch.setattr("scam_detector.jev_client.requests.post", fake_post)
    out = Jev().ask("the listing text", {"pay_before_viewing": {"type": "noul", "instructions": "x"}})
    assert out == {"pay_before_viewing": 0.9}
    assert seen["url"] == "http://glasser.test/v1/runs"
    assert seen["json"]["provider"] == "typesafe"
    assert seen["json"]["input"]["state"] == "the listing text"
    assert seen["json"]["input"]["questions"]["pay_before_viewing"]["type"] == "noul"
    assert seen["headers"]["Authorization"] == "Bearer g-key"


def test_jev_prefers_the_direct_typesafe_key_when_it_is_set(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "ts-key")
    monkeypatch.setenv("GLASSER_API_KEY", "g-key")
    monkeypatch.setenv("JEV_PROVIDER", "typesafe")
    monkeypatch.setenv("JEV_ENDPOINT", "/v1/systemone")
    seen = {}

    class Resp:
        status_code = 200

        def json(self):
            return {"answers": {"urgency_pressure": {"noul": 0.4}}}

    def fake_post(url, **kw):
        seen["url"], seen["json"], seen["headers"] = url, kw.get("json"), kw.get("headers")
        return Resp()

    monkeypatch.setattr("scam_detector.jev_client.requests.post", fake_post)
    assert Jev().ask("s", {}) == {"urgency_pressure": 0.4}
    assert "api.typesafe.ai" in seen["url"]
    assert seen["headers"]["Authorization"] == "Bearer ts-key"
    assert "provider" not in seen["json"]


def test_jev_says_which_route_is_missing(monkeypatch):
    for k in ("TYPESAFE_API_KEY", "GLASSER_API_KEY", "JEV_PROVIDER", "JEV_ENDPOINT"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(Exception) as e:
        Jev()
    assert "TYPESAFE_API_KEY" in str(e.value)
