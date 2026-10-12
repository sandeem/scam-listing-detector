# Chrome Extension: Scam Listing Detector

Like the slop detector, but for rentals. Labels appear as you scroll.

Inspired by [jev-slop-detector](https://github.com/SylphAI-Inc/jev-slop-detector).

---

## How It Works

1. The extension watches listing cards on the page.
2. A card scrolls into view. The extension sends its text to a **local relay**.
3. The relay asks **Jev** eleven yes/no questions.
4. If the first pass already looks worrying (25% or more), the relay also asks **Glasser** for outside evidence: property records, a reverse image search, an exact-phrase search, a Maps check, and a web search on the contact. This is optional and paid.
5. A badge appears: `Low risk`, `Suspicious`, or `Likely scam`. High risk also gets a `SCAM?` stamp.

The API keys live only in the relay. The extension never sees them.

The extension only reads the page. It never hides, edits, or clicks anything.

---

## Run It (2 minutes, no keys needed)

```
cd scam-listing-detector
npm run relay
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**. Choose the `extension/` folder.
4. Open `http://127.0.0.1:8790/demo`.
5. Scroll.

Without keys, the relay runs in **MOCK mode**. Badges say `(mock)`. Mock is keyword rules, not Jev.

---

## Go Live (needs your keys)

Copy `.env.example` to `.env`. Fill in:

- `TYPESAFE_API_KEY` for Jev. The badges lose `(mock)`.
- `GLASSER_API_KEY`, `GLASSER_PROVIDER`, `GLASSER_ENDPOINT`, `GLASSER_INPUT_TEMPLATE` for Glasser.

Restart the relay. The popup shows `Jev: live` and `Glasser: on`.

Glasser is only called when the first pass scores 25% or more and a phone or email is found. Each contact is called once, then cached.

---

## Which Sites Work

| Site | Status |
|---|---|
| Demo page (`/demo`) | **Tested.** Works. |
| Craigslist (gallery view) | **Tested** on live San Francisco listings: badges, prices and photos all read correctly. |
| Zillow, Apartments.com, Trulia, Redfin, Zumper, HotPads | Selectors written. **Not tested.** Guesses. |
| Facebook Marketplace | Selector written. **Not tested.** Changes often. Those cards are judged on the card text only, because the background is not allowed to fetch the listing page there. |

Real sites change their markup. If a site shows no badges, edit its selector in `extension/lib/sites.js`.

---

## Popular Sites To Try This On

These show many rentals and homes.

| Site | Good for |
|---|---|
| **Craigslist** (housing) | Most scams happen here. Easy page layout. Best first test. |
| **Facebook Marketplace** | Many scams. Hard to read. |
| **Zillow** | Biggest site. Rentals and sales. |
| **Apartments.com** | Rentals only. |
| **Zumper, HotPads, Trulia, Redfin** | More rentals and sales. |

Be careful on real sites. Read their terms. Do not scrape in bulk. Use the extension on pages you open yourself.

---

## Datasets

Use these to test or tune the detector.

**Closest to scams**

| Source | What it is | Notes |
|---|---|---|
| [aibserban/rent-scam-detection](https://github.com/aibserban/rent-scam-detection) (GitHub) | Rental scam ads. About 16,762 data points. | Closest match. Check the licence and the labels first. |
| [FTC rental scam data](https://www.ftc.gov/news-events/data-visualizations/data-spotlight/2025/12/rental-scams-hit-home-65-million-reported-losses) | Real scam reports. About 65,000 since 2020. | Statistics and patterns, not listing text. Good for the video. |
| [IEEE fake boarding house paper](https://ieeexplore.ieee.org/document/11101391/) | 1,632 real and 1,000 synthetic fake listings. | A paper. The data may not be public. |

**Real listings (normal baseline)**

| Source | What it is |
|---|---|
| [Inside Airbnb](https://insideairbnb.com/get-the-data/) | Free listing data for dozens of cities. |
| [Kaggle: Craigslist San Francisco](https://www.kaggle.com/datasets/thedevastator/scraping-apartments-off-of-craigslist-in-san-fra) | Scraped Craigslist apartments. |
| [Kaggle: Zillow search](https://www.kaggle.com/datasets?search=Zillow) | Many housing datasets. |

**Note:** I found no large, trusted dataset of labeled fake listings. Most are small or synthetic. Treat results as a demo, not a proven detector.

**Live data through Glasser:** Glasser sells Google Shopping, Amazon, Facebook Marketplace and web search endpoints. Search the Glasser catalog for rental or property data. See `PLAN.md`.

---

## Tests

```
npm test
```

20 tests pass, and `python -m pytest -q` adds 13 more. They cover scoring, thresholds, the relay, the Glasser spend rule, the lazy-loaded photo fix, and the two ways to reach Jev.

Run the real-Chrome check (relay and Chrome must be running):

```
node recording/check-extension.mjs
```

It loads the extension, scrolls the demo page, and saves screenshots to `out/`.

---

## Honest Limits

- Verified in a real browser on the demo page and on live Craigslist listings.
- Live Jev and live Glasser are tested. Jev runs **through Glasser** (`JEV_PROVIDER` + `JEV_ENDPOINT`), because no direct TypeSafe key is set.
- The "page median rent" comes from the cards seen so far, and only when at least five priced cards exist. It improves as you scroll.
- Photos are read from `<img>` tags and `srcset`. A site that paints photos only as a CSS background reads as "no photo".
- A badge is a **risk signal**. It is not proof. Never accuse a real person.
