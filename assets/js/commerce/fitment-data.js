(function () {
  "use strict";

  const metraSource = {
    id: "metra-official-product-pages-2026-07-17",
    name: "Metra official product pages",
    authority: "manufacturer",
    coverage: "partial",
    checkedAt: "2026-07-17",
    notice:
      "Manually curated from the cited official product pages. This is not an exhaustive Metra application feed.",
  };

  window.DCA_FITMENT_DATA = Object.freeze({
    schemaVersion: 1,
    releaseId: "partial-official-fitment-2026-07-20-empty",
    publishedAt: "2026-07-20T12:00:00-07:00",
    coverage: "partial",
    absencePolicy: "unknown",
    notices: {
      noMatch:
        "No matching record means unknown. It must never be interpreted as fits or does not fit.",
      production:
        "Production-wide fitment requires approved SEMA Data and manufacturer datasets plus qualifier coverage.",
    },
    providers: [
      {
        id: "nhtsa-vpic",
        name: "NHTSA vPIC",
        role: "vehicle_identity",
        status: "connected_on_homepage",
        authority: "government",
        url: "https://vpic.nhtsa.dot.gov/api/",
        notice:
          "Supplies vehicle identity only; it does not supply aftermarket car-audio fitment.",
      },
      {
        id: metraSource.id,
        name: metraSource.name,
        role: "current_partial_fitment",
        status: "manual_source_cited_snapshot",
        authority: metraSource.authority,
        coverage: metraSource.coverage,
        url: "https://www.metraonline.com/vehicle-fit-guide",
        notice: metraSource.notice,
      },
      {
        id: "sema-data",
        name: "SEMA Data reseller API",
        role: "recommended_production_feed",
        status: "requires_reseller_and_brand_approval",
        authority: "manufacturer_authorized_exchange",
        url: "https://apps.semadata.org/sdapi/v2",
        notice:
          "The importer and schema are ready for an approved feed, but no SEMA credentials or brand permissions are installed in this static site.",
      },
    ],
    sources: [metraSource],
    // The current catalog release (flea-market-photo-catalog-2026-07-20) is a
    // best-effort photo survey and contains no vehicle-fitment data. The rules
    // array is intentionally empty: every catalog variant resolves to "unknown"
    // until a sanctioned fitment feed (SEMA Data or cited manufacturer pages)
    // is connected. This preserves the strict "absence means unknown" policy.
    rules: [],
  });
})();
