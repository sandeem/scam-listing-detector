# Plan: What You Need To Do

Deadline: hackathon ends **Oct 11**.

Each step is short. Do them in order.

Steps marked **YOU** need your account or your approval. I cannot do them for you.

---

## Status

**Done:**

- Chrome extension that labels listings while you scroll, plus the local relay.
- Command line: `discover` and `scan`, with an HTML report.
- Keys in `.env`. Jev runs **through Glasser** (`JEV_PROVIDER` + `JEV_ENDPOINT`), because `TYPESAFE_API_KEY` is empty.
- Live runs done: real Jev verdicts, and real Glasser lookups on a scam listing.
- Tests: 20 Node + 13 Python, all passing.
- Verified in a real browser on the demo page and on live Craigslist listings.
- Glasser prices confirmed with `discover`, and the real spend measured (about $0.09 per worrying listing).

**Still to do (needs your account or your face):**

- The video.
- The social post.
- Submitting the form before the deadline.

**Fixed along the way:** the command line could not reach Jev at all (it only knew the direct TypeSafe key), Craigslist photos were misread as "no photo", and the green label said "Looks real" where it should say "Low risk".

---

## Step 1. Accounts and keys (YOU) — 15 min

1. Create your AdaL account. Use code `ADALHACK1MO` for 1 month Pro.
2. Create your Glasser account. Redeem the code from the PDF for $10.
3. Copy your Glasser API key.
4. Create a TypeSafe account. Get early access to Jev. Copy the key from `console.typesafe.ai/keys`.

Early access to Jev may have a waitlist. If you have no key yet, ask in the hackathon Discord now.

Then:

```
cd scam-listing-detector
cp .env.example .env
```

Put both keys in `.env`. Never share `.env`.

---

## Step 2. Install (YOU) — 2 min

```
pip install -r requirements.txt
python -m pytest -q
python main.py scan --mock
```

Open `out/report.html`. You should see 3 green and 3 red rows.

---

## Step 3. Find the Glasser endpoint (YOU + free) — 10 min

Search costs nothing.

```
python main.py discover "web search results for a phone number or email"
```

Pick one cheap endpoint. Serper web search is about $0.0011 per call.

Then **inspect it** in the Glasser console or CLI. Inspect is free. Read:

- The exact input field name.
- The price.

Put these in `.env`:

- `GLASSER_PROVIDER`
- `GLASSER_ENDPOINT`
- `GLASSER_INPUT_TEMPLATE` (fix the field name if it is not `q`)

---

## Step 4. Test Jev alone (YOU) — 5 min

This costs almost nothing and uses no Glasser money.

```
python main.py scan --no-glasser
```

If the verdicts look sensible, Jev works.

If you get an error, tell me the message. I will fix it.

---

## Step 5. One live Glasser test (YOU approve the spend) — 5 min

Test one listing first.

```
python main.py scan --limit 1
```

It asks `Continue? [y/N]` before spending. Cost: about $0.001 to $0.02.

If it fails, send me the error. The likely cause is the response shape.

---

## Step 6. Full run — 5 min

```
python main.py scan
```

Six listings. About 6 Glasser calls. Under $0.15.

Open `out/report.html`.

---

## Step 7. Make it real (optional, YOU) — 30 min

Replace `data/sample_listings.json` with 5 to 10 real public listings.

Keep the same fields: `id, title, city, beds, price, contact, description`.

Use real ones only for a short demo. Hide phone numbers on screen.

Do not call real people scammers. Say "flagged as suspicious".

---

## Step 8. Make the video (YOU + AdaL) — 1 hour

Use `VIDEO_SCRIPT.md`.

Ask AdaL to record and edit it. Use its video skill.

---

## Step 9. Post and submit (YOU) — 10 min

- Post on social media.
- Tag AdaL.
- Show all three tools in the post.

Join the Discord for updates.

---

## If You Are Short On Time

Minimum version, 30 minutes:

1. Step 1.
2. Step 4.
3. Step 8 using `--no-glasser`.

But then Glasser is missing from the video. Keep Step 5 if you can. Glasser is the $100 prize.

---

## Risks

- **No Jev key yet.** Use `--mock` for a dry run. Say clearly in the video it was mock. Do not present mock as Jev.
- **False alarms.** A cheap price is not proof. The report shows reasons.
- **Wrong input field.** Inspect first. Fix the template.
- **Cost.** `--limit` caps calls. The tool asks before spending.
