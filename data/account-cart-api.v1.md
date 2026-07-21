# Account cart API contract (version 1)

The live static site uses `dcaGuestCartV1` on the customer's device. Account cart sync is intentionally inactive until authentication and a server endpoint exist. The frontend adapter in `assets/js/commerce/account-cart-adapter.js` expects this same-origin contract.

## Authentication

Every endpoint requires `Authorization: Bearer <user access token>`. The server derives the user ID from the validated token; it must never accept a user ID from the request body. Supplier credentials, Supabase service-role keys, payment secrets, and admin credentials must remain server-side.

## Endpoints

- `GET /api/v1/cart` returns the signed-in user's active cart and server version.
- `POST /api/v1/cart/merge` accepts a validated guest-cart projection and merges by `variantId + vehicleKey + configuration hash`.
- `PATCH /api/v1/cart/lines/:lineId` accepts `{ quantity, expectedVersion }`.
- `DELETE /api/v1/cart/lines/:lineId` accepts `expectedVersion` and an idempotency key.

Mutations require an `Idempotency-Key` header, enforce quantity and line caps, and return `409 Conflict` when `expectedVersion` is stale. The server reprices every SKU from its trusted catalog; browser price and fitment snapshots are display evidence only.

## Sign-in merge rule

The browser sends the complete versioned guest cart once. The server merges it transactionally, caps quantities, rejects archived SKUs, recomputes current compatibility, and returns the canonical account cart. Guest storage is cleared only after a confirmed success. Signing out never copies account-only data into a guest cart without explicit consent.

## Checkout boundary

Checkout is not part of this contract. A later server endpoint must revalidate price, inventory, fitment gates, shipping, and tax before creating a Stripe Checkout Session or PaymentIntent. Raw card data must never pass through this site or its database.
