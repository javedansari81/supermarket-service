# SuperMart Feature Gaps

Tracker for functionality needed to run a supermarket end to end that is missing or incomplete in the current system.

- **Status:** `Open`, `In progress`, `Done`, `Won't do`
- **Priority:** `P1` daily trading, `P2` statutory compliance, `P3` stock and supplier control, `P4` reliability and extras

Last reviewed: 2026-10-25

---

## Summary

| ID | Gap | Area | Priority | Status |
|----|-----|------|----------|--------|
| POS-01 | Line and bill discounts at POS | Billing | P1 | Done (coupon codes) |
| POS-02 | Split payment, cash tendered and change | Billing | P1 | Done |
| POS-03 | Hold / park a bill | Billing | P1 | Done |
| POS-04 | Cashier shifts and cash drawer reconciliation | Billing | P1 | Done |
| POS-05 | Promotions and offers | Billing | P4 | Done (product offers) |
| POS-06 | Customer loyalty points | Customers | P4 | Done |
| POS-07 | Near-expiry clearance discounts | Billing | P3 | Done |
| PUR-01 | GST capture on purchases | Purchases | P2 | Done |
| PUR-02 | Purchase orders | Purchases | P3 | Open |
| PUR-03 | Purchase returns (debit notes) | Purchases | P3 | Open |
| PUR-04 | Supplier payables and payments | Suppliers | P3 | Open |
| INV-01 | Stocktake (physical count) | Inventory | P3 | Open |
| INV-02 | Verify FIFO / FEFO batch selection on sale | Inventory | P3 | Open |
| INV-03 | Wastage / damage report | Inventory | P3 | Open |
| FIN-01 | GST return reports (GSTR-1 / GSTR-3B, HSN-wise) | Reports | P2 | Done |
| FIN-02 | Profit / margin report for a date range | Reports | P2 | Done |
| FIN-03 | Payment-mode report for a date range | Reports | P1 | Done |
| FIN-04 | Export to accounting software (e.g. Tally) | Reports | P4 | Open |
| OPS-01 | Database backup and restore | Operations | P4 | Open |
| OPS-02 | Offline billing | Operations | P4 | Open |
| OPS-03 | Direct thermal printer and cash drawer support | Operations | P4 | Open |
| DOC-01 | Document Customers page | Docs | P4 | Open |
| DOC-02 | Document GSTIN / interstate billing at POS | Docs | P4 | Open |
| DOC-03 | Document product batches | Docs | P4 | Open |

---

## Details

### POS — Billing

**POS-01 Line and bill discounts at POS**
Done as coupon codes, so the cashier can only give discounts the admin has set up: migration `021_coupons.sql` (`coupons`; `sales.coupon_id` / `coupon_code` / `coupon_discount`; `held_bills.coupon_code`); admin `/coupons` endpoints and **Coupons** page; `/sales/coupon-check` preview. A coupon is % off each line (optional maximum ₹) or ₹ off the bill (split across lines by value), with a date range, on/off switch, minimum bill amount, and total and per-customer usage limits (per-customer needs the mobile on the bill; voided bills do not count). One coupon per bill, entered at checkout; the cashier cannot type a free discount %. On each line the coupon is compared with the near-expiry and offer discount and the higher saving applies. A coupon never takes a line below its purchase cost (batch cost, else product purchase price) and skips items with no purchase cost. Held bills keep the coupon code; it is checked again at checkout. The receipt and invoice show the coupon code. Returns refund the discounted price charged.
Not done: coupons limited to chosen products or categories, and a coupon usage report.

**POS-02 Split payment, cash tendered and change**
Done: migration `022_sale_payments.sql` (`sale_payments` with mode, amount, optional reference; `sales.cash_tendered` / `change_given`; `'split'` added to `sales.payment_mode`; existing sales backfilled with one payment row). `POST /sales` takes an optional `payments` list (cash / card / upi, each mode once) that must add up to the bill total, and an optional `cash_tendered` of at least the cash amount; change is worked out on the server. Without `payments` the whole bill is paid by `payment_mode` as before. `payment_mode` is the single mode, or `split` for more than one. Checkout has a **Split payment** option, an optional reference (UPI transaction ID / card last digits) and **Cash Received** with the change shown. The receipt shows each mode, cash received and change. The dashboard payment mix groups by payment mode, so a split bill counts under each of its modes.
Loyalty points as a payment mode are covered under POS-06.
Not done: bill rounding to the nearest rupee, credit / pay later, and split refunds (returns keep a single refund mode).

**POS-03 Hold / park a bill**
Done: held bills are stored server-side (`held_bills`, migration `018_held_bills.sql`; `/held-bills` endpoints). Billing has **Hold Bill** and **Held** (recall / discard). Stock is not reserved; checkout with `held_bill_id` removes the held bill. Limit of 10 per user; cashiers see their own, supervisors and admins see all; discards are audited. Held lines keep their near-expiry and offer details, and the bill keeps its coupon code; discounts are recalculated at checkout.

**POS-04 Cashier shifts and cash drawer reconciliation**
Done for one shared drawer per store: migration `029_cashier_shifts.sql` (`cashier_shifts`, at most one open per store; `shift_cash_movements`; `sales.shift_id` / `void_shift_id`; `sale_returns.shift_id`); `/shifts` endpoints, Billing shift control and **Shifts** page (supervisors and admins). Anyone opens a shift with an opening float, adds cash in and closes it; only supervisors and admins take cash out (up to the expected cash), see the X report of an open shift and approve differences. Bills, returns and voids are linked to the open shift; a void or return of an older bill counts against the shift open at the time. Expected cash = float + cash on bills − cash refunds (excluding the points part) − cash of voided bills + cash in − cash out. Closing is a blind note-by-note count (₹500 to ₹1); the Z report shows expected, counted and difference, payment modes (collected, refunded, voided, net), bills per cashier and cash in / out, and prints at 80 mm. A difference above the billing setting `shift_variance_limit` (default ₹100) waits for approval with a reason. Billing setting `shift_required` (off by default) blocks billing, returns and voids without an open shift. All shift actions are audited.
Not done: more than one drawer / counter at a time, recount or reopening of a closed shift, and a shift filter in the other reports.

**POS-05 Promotions and offers**
Done for product offers: migration `020_offers.sql` (`offers`, `offer_items`, `sale_items.offer_id`); admin `/offers` endpoints and **Offers** page. An offer has a name, date range, on/off switch and products at % off or ₹ off per unit (per kg for loose items). Running offers apply at billing automatically and the cashier cannot remove them; if a product is in two running offers, the bigger saving wins. Offer price below purchase cost is a warning only. The bill line tag and printed receipt show the offer name; deleted offers keep their name on past bills.
Not done: category-wide offers, buy-X-get-Y, combos, automatic bill-level offers, and an offer / discount report. Coupon codes are covered under POS-01.

**POS-07 Near-expiry clearance discounts**
Done: migration `019_near_expiry_discounts.sql`; `/clearance` endpoints and **Near Expiry** page. Day-based tiers (store default, category or product rule) discount packed batches by batch expiry, with a master on/off switch; loose items get a daily markdown that ends at midnight. Expired stock cannot be billed. The cashier can remove the discount on a bill line. Product expiry edits update opening-stock batches; purchase batch expiry is edited from **Inventory → Batches & expiry**.
On a bill line, near-expiry, offer and coupon discounts are compared in rupees saved and the highest applies (no stacking); `sale_items.discount_source` records which one.

**POS-06 Customer loyalty points**
Done: migration `023_loyalty_points.sql` (`customers.points_balance` / `loyalty_last_activity`; `loyalty_transactions` ledger of earn, redeem, earn_reversal, redeem_refund, adjust and expire; `sales.points_earned` / `points_redeemed`; `sale_returns.points_refunded` / `points_refund_amount` / `points_reversed`; `'points'` added as a payment mode). Admin `GET` / `PUT /settings/loyalty` and a **Loyalty** section in Settings: on/off switch (off by default), points per ₹100, ₹ value of one point, minimum points per redemption, maximum % of a bill paid by points, and expiry days (0 = never). Points are earned at checkout on the part of the bill paid by cash / card / UPI, for bills with a customer mobile. Points are redeemed as a **Points** row in split payment, within the minimum, the bill limit and the customer's balance. The whole balance expires after the set days with no earn or redeem. Returns credit back the share of redeemed points and take back the share of earned points (capped at the current balance); voids reverse both. `GET /customers/{id}/loyalty` gives the balance and history; admin `POST /customers/{id}/loyalty/adjust` adds or removes points (balance cannot go below zero, audited). The Customers page shows balance, history and **Adjust Points**; the receipt shows points earned, redeemed and balance; the dashboard counts points under their payment mode.
Not done: holding earned points until the return window ends (points can be spent before a return, so a take-back may fall short), a points liability report, and an "off" notice on the Customers page while loyalty is switched off.

### PUR — Purchases and suppliers

**PUR-01 GST capture on purchases**
Done: migration `028_purchase_gst.sql` (`purchases.bill_type` / `supplier_gstin` / `is_interstate` / `taxable_amount` / `tax_amount` / `cgst_amount` / `sgst_amount` / `igst_amount` / `round_off`; `purchase_items.rate` / `hsn_code` / `gst_percent` / `taxable_value` / `tax_amount` / CGST / SGST / IGST / `itc_eligible`). Bill type is `gst_invoice` (needs a supplier GSTIN; default when the supplier has one) or `no_gst` (handwritten receipt, bill of supply). Line rates are entered GST-inclusive as printed; GST is back-calculated from the line amount and split CGST + SGST or IGST by the supplier GSTIN's state code against the store's. GST is claimed only on GST bill lines with GST % shown; blank GST % and no-GST bills claim nothing. Cost to stock (`unit_cost`, batch and product purchase price) excludes claimed GST, else is the full rate. `bill_total` (bill grand total) may differ from the line sum by at most ₹1, saved as round-off. Editing the supplier, bill type or bill total recalculates the lines. Earlier purchases are treated as no-GST bills.
Not done: cess, supplier line discounts, reverse charge, and matching against GSTR-2B. ITC totals are reported in GSTR-3B (FIN-01).

**PUR-02 Purchase orders**
Only goods received are recorded. Needs PO create → send → receive (full / partial) against the PO.

**PUR-03 Purchase returns (debit notes)**
No way to return goods to a supplier. Needs debit note with stock reduction and batch reference.

**PUR-04 Supplier payables and payments**
No amount owed, due date or payment record. Needs supplier ledger, payments and outstanding report.

### INV — Inventory

**INV-01 Stocktake (physical count)**
Only one-by-one adjustments exist. Needs count sheets (by location / category), variance review and bulk posting.

**INV-02 Verify FIFO / FEFO batch selection on sale**
Batches exist (`009_product_batches.sql`, `app/core/batches.py`). Confirm sales consume the earliest-expiry batch first and add tests.

**INV-03 Wastage / damage report**
Returns without restock and stock removals are not reported together. Needs a report by reason, product and value.

### FIN — Finance and compliance

**FIN-01 GST return reports**
Done: admin `GET /reports/gst/gstr1` and `/reports/gst/gstr3b?from_date&to_date` (`gst_reports.py`), shown on the admin **GST Returns** page (`/gst-returns`, Insights menu) with a monthly or financial-year quarter picker. IST days; bills by bill date, credit notes by return date, purchases by purchase date; voided bills left out. GSTR-1: B2B (4A), B2C Large (5; inter-state, unregistered, bill above ₹1,00,000), B2C Small by place of supply and rate net of its credit notes (7), nil rated / exempt from 0% lines (8), CDNR and CDNUR (9B), HSN summary for B2B and B2C with UQC (12), documents issued with voided bills as cancelled (13). GSTR-3B: 3.1(a) and 3.1(c) net of credit notes, 3.2 by place of supply, 4 ITC from `itc_eligible` purchase lines, 5 exempt / nil / no-GST purchases, and a 6.1 set-off estimate (IGST credit first; CGST and SGST credit never cross) with credit carried forward. Warnings for a missing store GSTIN and lines without HSN.
Not done: JSON / Excel export for the GST offline tool, splitting nil rated from exempt, amendments of earlier periods, ITC reversals (4B), and cess.

**FIN-02 Profit / margin report for a date range**
Done: billing saves the purchase cost per unit on each sale line (`sale_items.unit_cost`: batch cost, else product cost) and returns copy it (`sale_return_items.unit_cost`), migration `027_sale_item_cost.sql`. Older lines are not backfilled, so profit is reported from that change on. Admin `GET /reports/profit?from_date&to_date&group_by=product|category|day` uses IST days; revenue is `taxable_value` (after all discounts, without GST), returns are taken off on the return date, and revenue from lines without a cost is reported apart as `uncosted_revenue`. The dashboard's gross margin uses the saved cost too. The Reports page has a **Profit** tab with summary cards and a sortable table.
Not done: export, and net profit after expenses (expenses are not recorded).

**FIN-03 Payment-mode report for a date range**
Done: admin `GET /reports/payment-modes?from_date&to_date` uses IST calendar days. Per mode it gives bills, amount collected (from `sale_payments`, so a split bill counts under each of its modes; voided sales excluded), returns and amount refunded (by return date: the `points_refund_amount` part under points, the rest under the return's `refund_mode`), and net. It also gives net per mode for each day. Totals cover Cash + Card + UPI only, since points are not money. The Reports page has a **Payment Modes** tab with a summary table and a net-by-day table.
Not done: export, a filter by cashier (the POS-04 Z report gives bills per cashier for a shift), and IST days in the other date-range reports (they still use UTC dates).

**FIN-04 Export to accounting software**
Needs sales, purchases and returns export in a format accepted by Tally or similar.

### OPS — Operations and reliability

**OPS-01 Database backup and restore**
No backup code in the repository. Needs scheduled backup and a documented restore procedure.

**OPS-02 Offline billing**
Billing stops if the network or server is down. Needs local queueing of sales with sync on reconnect.

**OPS-03 Direct thermal printer and cash drawer support**
Receipts print through the browser print window (`supermarket-ui/src/services/receipt.ts`). Needs ESC/POS printing and drawer kick.

### DOC — User guide mismatches

**DOC-01** `/customers` page is in the sidebar but not in `USER_GUIDE.md`.
**DOC-02** Customer GSTIN and interstate (IGST) billing at checkout are not in section 4.
**DOC-03** Product batches and batch editing (`/products/{id}/batches`) are not documented.
