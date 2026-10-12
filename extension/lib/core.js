/* Shared logic: runs in the page (global ScamCore) and in the relay (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScamCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // name -> [weight, yes/no question for Jev]. Weights sum to 1.
  const QUESTIONS = {
    pay_before_viewing: [0.20, 'The listing asks for money, a deposit, or gift cards before the renter can see the home.'],
    price_far_below_market: [0.26, 'The rent is far below the stated area median for similar homes.'],
    search_reports_scam: [0.06, 'The web search evidence says this contact, address or listing was reported as a scam or fake.'],
    address_mismatch: [0.07, 'The address in the listing resolves to a different city, state or country than the listing claims.'],
    off_platform_contact: [0.12, 'The poster pushes the renter to leave the platform, for example WhatsApp, Telegram or personal email only.'],
    owner_unreachable: [0.10, 'The owner says they cannot show the home in person, for example they are abroad.'],
    urgency_pressure: [0.08, 'The listing pressures the renter to act fast.'],
    photo_reused: [0.04, 'The listing photos appear in other ads or listings, a sign the photos were taken from somewhere else.'],
    owner_mismatch: [0.02, 'The public property records show a different owner than the person advertising the home.'],
    duplicate_listing: [0.02, 'The same listing text or phone number appears in several cities at once.'],
    no_photo: [0.03, 'The ad shows no photo of the home at all.'],
  };
  const SUSPICIOUS_AT = 0.30;
  const SCAM_AT = 0.55;

  function combine(probs) {
    let risk = 0;
    for (const [n, [w]] of Object.entries(QUESTIONS)) risk += w * (probs[n] || 0);
    return Math.round(risk * 1000) / 1000;
  }

  function classify(risk) {
    if (risk >= SCAM_AT) return { verdict: 'scam', label: 'Likely scam', stamp: true };
    if (risk >= SUSPICIOUS_AT) return { verdict: 'suspicious', label: 'Suspicious', stamp: false };
    return { verdict: 'low', label: 'Low risk', stamp: false };
  }

  function reasons(probs) {
    return Object.entries(probs).filter(([, p]) => p >= 0.5)
      .sort((a, b) => b[1] - a[1]).map(([n]) => QUESTIONS[n][1]);
  }

  // Handles "$1,850", "$1 595", "$1\u202f250" and "CAD 1 595".
  function parsePrice(text) {
    const m = /(?:\$|CAD)\s?([\d][\d\s.,]*\d|\d)/i.exec(text || '');
    if (!m) return null;
    const n = Number(m[1].replace(/[^\d]/g, ''));
    return Number.isFinite(n) && n >= 100 ? n : null;
  }

  function median(nums) {
    const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function extractContacts(text) {
    const t = text || '';
    const emails = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
    const phones = t.match(/\+?\d[\d\s().-]{8,}\d/g) || [];
    return [...emails, ...phones].map((s) => s.trim());
  }

  function htmlToText(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|br|h\d|section)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
  }

  // Containers that hold the real posting text. Cards alone carry almost nothing.
  const BODY_PATTERNS = [
    /id="postingbody"[^>]*>([\s\S]*?)<\/section>/i,
    /data-testid="description"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  function extractListingBody(html, limit = 1500) {
    const src = String(html || '');
    for (const re of BODY_PATTERNS) {
      const m = re.exec(src);
      if (m) return htmlToText(m[1]).slice(0, limit);
    }
    return ''; // unknown page: return nothing rather than feed navigation text to Jev
  }

  return { QUESTIONS, SUSPICIOUS_AT, SCAM_AT, combine, classify, reasons,
           parsePrice, median, extractContacts, htmlToText, extractListingBody };
});
