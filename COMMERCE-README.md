# Dean's Car Audio commerce milestone

This release adds a complete static Step 4 storefront without replacing the existing homepage or its vehicle Garage/System Planner.

## Live now

- 99 in-store product lines from the photo catalog; all priced on request.
- Best-effort inventory derived from nine wide-angle booth photos. Quantities are conservative minimums visible, not confirmed stock counts. Call Dean's to confirm local price and availability.
- Search, category, and price/name sorting.
- Variant-level product pages, specifications, and verification notes.
- Fitment coverage is empty for this release. No matching record means unknown, never fits.
- Strict partial-coverage rule: missing data is always unknown.
- Versioned guest cart with quantity controls, removal tombstones, cross-tab reconciliation on hosted origins, same-tab file-mode continuity, and current-price rehydration.
- Account-cart adapter/merge contract and Supabase RLS migration, intentionally inactive until authentication is configured. Browser roles can read their own carts but table mutations remain behind the future validated server API.
- Draft 2020-12 schema-enforced imports, source cross-reference checks, source manifest, dry-run import tools, and automated contract tests.

## Not falsely activated

- Dean's inventory or private selling prices.
- Licensed full SEMA Data feed (reseller and brand approval required).
- Customer authentication/account cart API.
- Payment, checkout, tax, shipping, orders, or order history.

Those boundaries are visible in the customer interface. Checkout remains disabled until a server can revalidate price, inventory, compatibility, and payment safely.

## Validation

From this folder, run:

```sh
node tools/validate-commerce-data.mjs
```

Import tools are dry-run by default. They require `--write` and an explicit output path before they change a browser projection. Demo catalog data additionally requires `--allow-demo` and must never be promoted as production.
