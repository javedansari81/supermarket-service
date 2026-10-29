# SuperMart Online Ordering — Requirements

Requirements for letting customers log in and order online. Living document; extend as decisions are made.

- **Status:** `Open`, `In progress`, `Done`, `Won't do`
- **Phase:** `MVP` first release (login, browse, cart, pickup / cash on delivery), `Full` later releases, `Future` after the website (mobile app)

Last reviewed: 2026-10-28

---

## Decisions

- Customers order from a **website first**; **Android and iOS apps** follow later (ONL-11).
- **One website and one app for all stores**; the customer picks the store. Store subdomains stay for the staff app.
- The POS (billing) is not needed on mobile.
- **Shop address:** `shop.mfmart.co.in/<store>`, where `<store>` is the store's subdomain label (e.g. `demo-store`). Store data API: `/api/v1/shop/stores/{store}/...` (under `stores/` so a store name can never clash with other shop paths); login API: `/api/v1/shop/auth/...`. Both used by the website and the app.
- **No separate signup:** mobile OTP login only; the name is asked after the first login.
- **One login for all stores, data per store:** the login is a `customer_accounts` row (verified mobile). Each store keeps its own `customers` row for that mobile (name on invoices, loyalty points, orders), already there from in-store billing or created at the first order at that store. Switching stores needs no new OTP. A store never sees which other stores the customer uses; "Your stores" (stores with a record) is shown only to the customer, first in the store picker. A store disabling its customer row blocks ordering at that store only.
- **Browsing needs no login**; login is asked at checkout, order history and profile. The cart is kept per store.
- **Online ordering is switched on per store** (`online_ordering_enabled` setting); Demo Store (`SFM001`) is the pilot.
- **Customer website:** separate `supermarket-shop/` app (Vite, React, TypeScript, MUI), mobile-first and installable (PWA), static site on DigitalOcean App Platform.
- **Stock:** online stock shown = on hand − reserved by open orders − safety buffer; reservations do not block in-store billing (staff remove or substitute short items while picking).
- **Orders become sales** when staff complete them, through the same sale code as billing (invoice, GST, loyalty, stock movements). Pricing is split from stock deduction so the cart can be priced without touching stock.

---

## Current state

- **Login is staff only.** `POST /auth/login`, `/auth/refresh`, `/auth/logout` issue JWT tokens for `users` (roles admin, supervisor, cashier). Accounts are created by an admin; there is no self-signup. The UI (`App.tsx`) is a back-office app with every page behind `ProtectedRoute`.
- **Customers cannot log in.** A `Customer` is a mobile number, name, optional GSTIN and loyalty points balance, created when the cashier enters the mobile at billing.
- **No online orders.** `POST /sales` records a completed in-store sale: stock is deducted and the tax invoice is created at once. Payments (cash, card, UPI, points) are recorded by the cashier; there is no payment gateway.

**Reusable:** product catalogue, categories, stock and batches; pricing (`price_lines`, offers, coupons, clearance, GST); loyalty points; invoice creation; audit log; per-store subdomains (`get_store_tenant_id`); JWT and password hashing in `app/core/security.py`.

---

## Summary

| ID | Requirement | Area | Phase | Status |
|----|-------------|------|-------|--------|
| ONL-01 | Customer login by mobile OTP | Auth | MVP | In progress |
| ONL-02 | SMS / WhatsApp OTP provider | Auth | MVP | Open |
| ONL-03 | Public catalogue API | API | MVP | In progress |
| ONL-04 | Customer shopping site | UI | MVP | In progress |
| ONL-05 | Online orders and stock reservation | Orders | MVP | Open |
| ONL-06 | Staff order queue | Orders | MVP | Open |
| ONL-07 | Online payments | Payments | Full | Open |
| ONL-08 | Delivery addresses, area, charges and slots | Delivery | Full | Open |
| ONL-09 | Order notifications | Notifications | Full | Open |
| ONL-10 | Security, legal pages and tests | Operations | MVP | Open |
| ONL-11 | Customer mobile app (Android and iOS) | UI | Future | Open |

---

## Details

**ONL-01 Customer login by mobile OTP**
Customers log in with their 10-digit mobile number and a one-time code; no password. One login works at every store (see Decisions). Customer tokens are a separate token type from staff tokens (`type: customer`) so they can never reach staff endpoints. Needs: OTP expiry, resend cooldown, limits on attempts per number and per IP.
- **Built (backend):** migration `030_customer_auth.sql` (`customer_accounts`, `customer_otps`, `customer_refresh_tokens`, `online_ordering_enabled` setting); endpoints under `/api/v1/shop/auth`: `otp/request`, `otp/verify`, `refresh`, `logout`, `GET/PUT me`, `GET my-stores`. 6-digit code, only its hash stored; 5-minute expiry, 60-second resend wait, 5 wrong attempts, 5 codes per number and 20 per IP per hour (all in `.env`). Access token 30 minutes; refresh token 60 days, stored hashed, replaced on every refresh, and reuse of an old one ends all the account's sessions. A new account takes the name the stores already have; setting the name fills it on store records without one. Logins are written to the application log and `customer_accounts.last_login` (not the store audit log, as a login belongs to no store).
- **Remaining:** real SMS provider (ONL-02; `OTP_PROVIDER=console` only logs the code for development), Settings toggle for `online_ordering_enabled`, creating the store record at the first order and blocking customers disabled by that store (ONL-05), per-IP limit using the proxy's own client IP header.

**ONL-02 SMS / WhatsApp OTP provider**
Any provider with an OTP API works; Meta or Twilio is not required.
- **DLT registration (India, mandatory):** TRAI requires the business, sender ID (e.g. `MFMART`) and each message template to be registered on a DLT platform. Applies to every provider, Twilio included. Takes days to a couple of weeks — start early.
- **Options:**

| Option | Pros | Cons |
|---|---|---|
| Indian SMS providers (MSG91, Gupshup, Fast2SMS, Exotel) | Usually cheapest for Indian numbers; help with DLT; ready-made OTP APIs | Mainly India |
| Twilio (Verify API) | Mature, global, well documented | Usually costlier in India; DLT still needed |
| Meta (WhatsApp Cloud API) | OTP in WhatsApp; no SMS DLT templates | Customer needs WhatsApp; Meta Business verification and approved templates |
| Firebase Phone Auth | Quickest to set up; free allowance | Login depends on Firebase; less control over sender ID and cost |
| AWS SNS | Fits if already on AWS | Sending only, no OTP verify; DLT still needed |

- **Recommendation:** an Indian provider (e.g. MSG91) as the main channel; WhatsApp OTP later as an option. Put the provider behind a small interface (`send_otp` / `verify_otp`) so it can be switched without changing login code. Compare current per-message rates from two or three providers before choosing.

**ONL-03 Public catalogue API**
Read-only endpoints, no staff login, scoped to the store subdomain: categories, product list and search, product detail, price after offers / clearance, in-stock flag (not exact quantity). Only `active` products. Needs product images (not stored today) and caching.
- **Built (backend):** `app/api/v1/endpoints/shop.py`, no login: `GET /shop/stores` (store picker), `GET /shop/stores/{store}` (name, address, phone, GSTIN, FSSAI licence), `.../categories` (active categories with product counts), `.../products` (search by name or brand, category filter, sort by name or price, pages of up to 100, in-stock first), `.../products/{id}` (with description). Only stores with online ordering on, and only active products with a price. Price = what billing would charge for one unit (one pack, or one kg / L when loose) from the stock sold first: earliest-expiry batch that is not expired, then the better of offer and near-expiry / loose markdown, as in billing. Expired batches are never priced or counted as in stock. Purchase price, barcode and exact stock are never returned. Responses can be cached for 60 seconds.
- **Remaining:** product images (storage in Cloudflare R2, upload on the staff Products page, `image_url` in responses), subtracting stock reserved by open orders and a safety buffer from the in-stock flag (ONL-05), rate limiting of public endpoints (ONL-10).

**ONL-04 Customer shopping site**
Separate public app or route group, mobile-first: browse, search, cart, checkout, order history and order status, profile. Not part of the staff dashboard layout. Cart can live in the browser until checkout.
- **Built:** `supermarket-shop/` (Vite, React, TypeScript, MUI 9, React Router), runs on port 3001. Login page (mobile number → 6-digit code with resend countdown → name on first login), account page (name, mobile, "Your stores" with points, log out), home page store picker ("Your stores" first, then all stores). Session tokens are kept in `localStorage` and shared by all tabs; the access token is renewed a minute before it expires and once more on a 401, and tabs take turns renewing (Web Locks) so a single-use refresh token is never sent twice.
- **Remaining:** store pages with product browsing and search (using ONL-03), cart, checkout, order history and status, installable web app (PWA), deployment as a static site on App Platform, legal pages. Consider moving the refresh token to an httpOnly cookie before launch (a token in `localStorage` can be read by any script injected into the page).

**ONL-05 Online orders and stock reservation**
New `orders` / `order_items` tables. Statuses: `placed` → `confirmed` → `packed` → `ready` / `out_for_delivery` → `completed`, plus `cancelled`. Prices, offers, coupons and GST are worked out on the server with the existing pricing code. Stock is reserved when the order is placed, released on cancel, and deducted when the order is completed by turning it into a `Sale` with its invoice and loyalty points. Must stay correct when the same item is sold in-store and online at the same time (row locks on stock).
Fulfilment modes: store pickup and cash on delivery in MVP.

**ONL-06 Staff order queue**
New staff page listing online orders by status: accept / reject, pick and pack (with substitution or item removal), mark ready / out for delivery, complete (creates the sale and invoice), cancel with reason. Role rules to be decided (e.g. cashiers and supervisors can fulfil, admins can cancel paid orders). All actions audited.

**ONL-07 Online payments**
Payment gateway (e.g. Razorpay) for UPI, cards and net banking: create payment, verify the gateway callback (webhook) signature, handle failed and abandoned payments, refunds on cancel or item removal. Gateway reference stored on `sale_payments`. Payment-mode reports must include online payments.

**ONL-08 Delivery addresses, area, charges and slots**
Saved customer addresses; serviceable area (pincodes or distance); delivery charge and free-delivery minimum; minimum order value; delivery time slots with a limit per slot; delivery staff assignment.

**ONL-09 Order notifications**
Tell the customer when the order is confirmed, ready, out for delivery, completed or cancelled (SMS / WhatsApp, using ONL-02 templates). Alert staff to new orders on the order queue page.

**ONL-10 Security, legal pages and tests**
Rate limiting on public and OTP endpoints; CORS for the shopping site origin; no staff data exposed through public APIs. Terms, privacy and refund policy pages (needed by payment gateways). API tests for login, ordering, stock reservation and cancellation.

**ONL-11 Customer mobile app (Android and iOS)**
One app for all stores, built after the website on the same customer API (no app-only endpoints).
- **Technology:** React Native with Expo (TypeScript and React, like the existing UI); one codebase for Android and iOS. Shares the API client and types with the website.
- **Store selection:** the customer picks a store in the app (later by location); the store code is sent with every request, as on the website.
- **Login:** same mobile OTP as the website; Android SMS Retriever API to read the code automatically. Long-lived refresh token kept in secure device storage (Keychain / Keystore).
- **Notifications:** push notifications (Firebase Cloud Messaging, Apple Push Notification service) for order status, cheaper than SMS; needs a device token table.
- **Payments:** Razorpay Android and iOS SDKs; server-side verification as in ONL-07.
- **Store publishing:** Google Play and Apple developer accounts, privacy policy, Play data safety form and App Store privacy labels; store review on every release.
- **Compatibility:** older app versions stay installed, so the customer API must stay backward compatible (version the API, add a minimum supported app version check).

---

## Effort estimate

| Scope | Estimate (one developer) |
|---|---|
| MVP: ONL-01 to ONL-06 and ONL-10, pickup / cash on delivery | 4–6 weeks |
| Full: adds ONL-07 to ONL-09 | 2–3 months total |

Hardest parts: keeping stock correct across in-store and online sales, and payment callbacks and refunds. DLT registration is the likely launch blocker, not coding.

---

## Open questions

- Pickup only, delivery only, or both in the first release?
- Which SMS provider, and is WhatsApp OTP wanted?
- Payment gateway choice, or cash on delivery only at launch?
- Can online prices or offers differ from in-store?
