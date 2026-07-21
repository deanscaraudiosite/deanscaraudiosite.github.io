# SEMA Data production-fitment onboarding

SEMA Data is the recommended production catalog/fitment feed because it distributes manufacturer-authorized ACES application data and PIES product content to approved resellers. The live storefront is already structured around variant-level rules and source releases, but no credentials or manufacturer permissions are present.

## Business prerequisites

1. Apply as a reseller: <https://www.semadata.org/join-resellers>.
2. Request approval for Metra first, then two brands Dean's genuinely buys and carries. The current Launch tier information is at <https://www.semadata.org/news/wed-2026-04-29-0439/sema-data-launch-tier-just-got-better>.
3. Obtain written approval for product content, applications, and asset use from each brand.
4. Request a representative export before automating anything. Audit submodel, body, factory-amplifier, navigation/display, RPO, fitment-note, lifecycle, MAP, and image coverage.
5. Ask Metra and PAC whether they offer a sanctioned supplemental retailer feed for speaker locations/dimensions and OEM-audio qualifiers not present in the SEMA dataset.

Official API documentation: <https://apps.semadata.org/sdapi/v2>

## Security boundary

SEMA/PIMS usernames, passwords, security tokens, and supplier credentials belong only in a protected server job or secret manager. They must never be placed in `catalog.html`, browser JavaScript, Git, screenshots, error output, or analytics. Official API documentation warns against hotlinking assets; approved images should be downloaded by the server importer and served from owned storage.

## Import sequence

1. A scheduled server job downloads an approved brand release.
2. A provider-specific transformer maps ACES/PIES IDs, applications, qualifiers, notes, prices, assets, and revision metadata into the schemas in `schemas/`.
3. Run `node tools/import-catalog.mjs --input normalized-catalog.json` as a dry run.
4. Run `node tools/import-fitment.mjs --input normalized-fitment.json` as a dry run.
5. Review duplicate SKUs, referential integrity, source/license metadata, qualifier gaps, and release hashes.
6. Promote the complete catalog and fitment release atomically. Never mix half of one release with half of another.
7. Re-run compatibility and cart contract tests before publication.

The current public Metra records are deliberately partial. They provide real evidence for a small set of SKUs, but they are not a substitute for approved full-feed access.
