# Video Script (about 60 seconds)

Goal: show **AdaL**, **Glasser**, and **Jev** working in one flow.

---

## Scene 1 — The Hook (0:00–0:08)

**Screen:** two listings side by side. One real. One fake.

**Say:** "One of these rentals is a scam. Can you tell which?"

---

## Scene 2 — AdaL builds it (0:08–0:20)

**Screen:** AdaL in the terminal. Show the prompt. Show files appearing.

**Say:** "I asked AdaL to build a scam detector. It wrote the whole project."

**Show:** the `scam_detector/` folder and the passing tests.

---

## Scene 3 — Glasser brings the data (0:20–0:34)

**Screen:** `python main.py discover`

**Say:** "Glasser is a data buffet. I search for web evidence and see the price first. About a tenth of a cent."

**Screen:** `python main.py scan` and the spend prompt.

---

## Scene 4 — Jev decides (0:34–0:48)

**Screen:** verdicts appear fast, one per line.

**Say:** "Jev answers eleven yes-or-no questions in milliseconds. No text. No hallucinations. Just probabilities."

---

## Scene 5 — The Reveal (0:48–0:58)

**Screen:** `out/report.html`. Green rows. Red rows. The reasons column.

**Say:** "Low risk ones are green. Scams are red, with the reason."

---

## Scene 6 — Close (0:58–1:00)

**Screen:** three names: AdaL, Glasser, Jev.

**Say:** "Built with AdaL, powered by Glasser and Jev."

Tag @adalagent.

---

## Rules

- Hide real phone numbers and emails.
- If you used `--mock`, say so. Never call it Jev.
- Say "risk signal", not "proof".
- Keep every scene short.

---

## Prompt For AdaL's Video Skill

> Make a 60 second screen-recording video from this script. Record the terminal commands from the project folder, add captions, and end with a title card showing AdaL, Glasser and Jev.
