/* Where the listing "cards" are on each site.
 * Only the demo page is verified. Real sites change their markup often, so the
 * selectors below are best-effort starting points: adjust them if a site changes. */
self.ScamSites = {
  cardSelector() {
    const h = location.hostname;
    if (h.endsWith('craigslist.org')) return 'li.cl-static-search-result, li.cl-search-result, .cl-search-result';
    if (h.endsWith('zillow.com')) return 'article[data-test="property-card"]';
    if (h.endsWith('apartments.com')) return 'article.placard';
    if (h.endsWith('trulia.com')) return '[data-testid="property-card"]';
    if (h.endsWith('redfin.com')) return '.HomeCardContainer, .MapHomeCardReact';
    if (h.endsWith('zumper.com')) return '[data-testid="listing-card"]';
    if (h.endsWith('hotpads.com')) return 'article[data-name="listing-card"], [data-testid="listing-card"]';
    if (h.endsWith('facebook.com')) return 'a[href*="/marketplace/item/"]';
    return '[data-listing-card]'; // demo page
  },
};
